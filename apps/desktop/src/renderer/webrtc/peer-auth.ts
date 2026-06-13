import {
  ExpectedAuthResult,
  getOpaqueConfig,
  KE1,
  KE2,
  KE3,
  OpaqueClient,
  OpaqueID,
  OpaqueServer,
  RegistrationRecord,
} from "@cloudflare/opaque-ts";
import type { ControlMessage } from "@pairpair/shared";
import { dataChannelManager } from "./data-channel";

type AuthSuccessHandler = () => void;
type AuthFailureHandler = (reason: string) => void;
type AuthRequiredHandler = () => void;

const config = getOpaqueConfig(OpaqueID.OPAQUE_P256);
const CREDENTIAL_ID = "pairpair-session";
const SERVER_ID = "PairPair Host";
const CONTEXT_PREFIX = "PairPair P2P authentication";

class HostPeerAuthenticator {
  private code = "";
  private server: OpaqueServer | null = null;
  private record: RegistrationRecord | null = null;
  private expected: ExpectedAuthResult | null = null;
  private attempts = 0;
  private successHandler: AuthSuccessHandler | null = null;
  private failureHandler: AuthFailureHandler | null = null;

  async prepare(code: string, passphrase: string): Promise<void> {
    this.reset();
    this.code = code;
    if (!passphrase) return;

    const server = new OpaqueServer(
      config,
      config.prng.random(config.constants.Nseed),
      await config.ake.generateAuthKeyPair(),
      SERVER_ID,
    );
    const registrationClient = new OpaqueClient(config);
    const request = await registrationClient.registerInit(passphrase);
    if (request instanceof Error) throw request;
    const response = await server.registerInit(request, CREDENTIAL_ID);
    if (response instanceof Error) throw response;
    const result = await registrationClient.registerFinish(response, SERVER_ID);
    if (result instanceof Error) throw result;

    this.server = server;
    this.record = result.record;
  }

  start(onSuccess: AuthSuccessHandler, onFailure: AuthFailureHandler): void {
    console.info("[PairPair][Auth] host start");
    this.successHandler = onSuccess;
    this.failureHandler = onFailure;
    dataChannelManager.onControl(this.handleMessage);
  }

  private handleMessage = (message: ControlMessage): void => {
    void this.handleMessageAsync(message);
  };

  private async handleMessageAsync(message: ControlMessage): Promise<void> {
    try {
      if (message.type === "auth.hello") {
        if (message.code !== this.code) {
          this.fail("invalid_code");
          return;
        }
        if (!this.server || !this.record) {
          this.succeed();
          return;
        }
        dataChannelManager.sendControl({ type: "auth.required" });
        return;
      }

      if (message.type === "auth.ke1" && this.server && this.record) {
        this.attempts += 1;
        if (this.attempts > 5) {
          this.fail("invalid_passphrase");
          return;
        }
        const result = await this.server.authInit(
          KE1.deserialize(config, message.payload),
          this.record,
          CREDENTIAL_ID,
          undefined,
          `${CONTEXT_PREFIX}:${this.code}`,
        );
        if (result instanceof Error) {
          this.fail("protocol_error");
          return;
        }
        this.expected = result.expected;
        dataChannelManager.sendControl({ type: "auth.ke2", payload: result.ke2.serialize() });
        return;
      }

      if (message.type === "auth.ke3" && this.server && this.expected) {
        const result = this.server.authFinish(KE3.deserialize(config, message.payload), this.expected);
        if (result instanceof Error) {
          this.fail("invalid_passphrase");
          return;
        }
        this.succeed();
      }
    } catch {
      this.fail("protocol_error");
    }
  }

  private succeed(): void {
    console.info("[PairPair][Auth] host success");
    dataChannelManager.sendControl({ type: "auth.result", success: true });
    const handler = this.successHandler;
    this.stop();
    handler?.();
  }

  private fail(reason: "invalid_code" | "invalid_passphrase" | "protocol_error"): void {
    console.warn("[PairPair][Auth] host fail", { reason });
    dataChannelManager.sendControl({ type: "auth.result", success: false, reason });
    const handler = this.failureHandler;
    this.stop();
    handler?.(reason);
  }

  stop(): void {
    dataChannelManager.offControl(this.handleMessage);
    this.successHandler = null;
    this.failureHandler = null;
    this.expected = null;
    this.attempts = 0;
  }

  reset(): void {
    this.stop();
    this.code = "";
    this.server = null;
    this.record = null;
  }
}

class GuestPeerAuthenticator {
  private client: OpaqueClient | null = null;
  private code = "";
  private helloHandler: (() => void) | null = null;
  private requiredHandler: AuthRequiredHandler | null = null;
  private successHandler: AuthSuccessHandler | null = null;
  private failureHandler: AuthFailureHandler | null = null;

  start(
    code: string,
    onRequired: AuthRequiredHandler,
    onSuccess: AuthSuccessHandler,
    onFailure: AuthFailureHandler,
  ): void {
    console.info("[PairPair][Auth] guest start", {
      codeLength: code.length,
    });
    this.stop();
    this.code = code;
    this.requiredHandler = onRequired;
    this.successHandler = onSuccess;
    this.failureHandler = onFailure;
    dataChannelManager.onControl(this.handleMessage);
    this.helloHandler = () => {
      if (this.helloHandler) dataChannelManager.offControlOpen(this.helloHandler);
      this.helloHandler = null;
      console.info("[PairPair][Auth] guest send hello");
      dataChannelManager.sendControl({ type: "auth.hello", code });
    };
    dataChannelManager.onControlOpen(this.helloHandler);
  }

  async submitPassphrase(passphrase: string): Promise<void> {
    console.info("[PairPair][Auth] guest submit passphrase", {
      length: passphrase.length,
    });
    this.client = new OpaqueClient(config);
    const ke1 = await this.client.authInit(passphrase);
    if (ke1 instanceof Error) throw ke1;
    dataChannelManager.sendControl({ type: "auth.ke1", payload: ke1.serialize() });
  }

  private handleMessage = (message: ControlMessage): void => {
    void this.handleMessageAsync(message);
  };

  private async handleMessageAsync(message: ControlMessage): Promise<void> {
    try {
      if (message.type === "auth.required") {
        console.info("[PairPair][Auth] guest auth.required");
        this.requiredHandler?.();
        return;
      }
      if (message.type === "auth.ke2" && this.client) {
        console.info("[PairPair][Auth] guest auth.ke2");
        const result = await this.client.authFinish(
          KE2.deserialize(config, message.payload),
          SERVER_ID,
          undefined,
          `${CONTEXT_PREFIX}:${this.code}`,
        );
        if (result instanceof Error) {
          this.failureHandler?.("invalid_passphrase");
          return;
        }
        dataChannelManager.sendControl({ type: "auth.ke3", payload: result.ke3.serialize() });
        return;
      }
      if (message.type === "auth.result") {
        if (message.success) {
          console.info("[PairPair][Auth] guest success");
          const handler = this.successHandler;
          this.stop();
          handler?.();
        } else {
          console.warn("[PairPair][Auth] guest fail", {
            reason: message.reason ?? "protocol_error",
          });
          this.failureHandler?.(message.reason ?? "protocol_error");
        }
      }
    } catch {
      this.failureHandler?.("protocol_error");
    }
  }

  stop(): void {
    dataChannelManager.offControl(this.handleMessage);
    if (this.helloHandler) dataChannelManager.offControlOpen(this.helloHandler);
    this.client = null;
    this.code = "";
    this.helloHandler = null;
    this.requiredHandler = null;
    this.successHandler = null;
    this.failureHandler = null;
  }
}

export const hostPeerAuthenticator = new HostPeerAuthenticator();
export const guestPeerAuthenticator = new GuestPeerAuthenticator();
