import type { ControlMessage, InputEvent } from "@pairpair/shared";

type ControlMessageHandler = (message: ControlMessage) => void;
type InputMessageHandler = (message: InputEvent) => void;
type SessionEndedHandler = () => void;

export class DataChannelManager {
  private controlChannel: RTCDataChannel | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private inputReliableChannel: RTCDataChannel | null = null;
  private controlHandlers: ControlMessageHandler[] = [];
  private inputHandlers: InputMessageHandler[] = [];
  private sessionEndedHandlers: SessionEndedHandler[] = [];

  setupAsHost(pc: RTCPeerConnection): void {
    this.controlChannel = pc.createDataChannel("control", { ordered: true });
    this.inputChannel = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
    this.inputReliableChannel = pc.createDataChannel("inputReliable", { ordered: true });

    this.setupControlChannel(this.controlChannel);
    this.setupInputChannel(this.inputChannel);
    this.setupInputChannel(this.inputReliableChannel);
  }

  setupAsGuest(pc: RTCPeerConnection): void {
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "control") {
        this.controlChannel = channel;
        this.setupControlChannel(channel);
      } else if (channel.label === "input") {
        this.inputChannel = channel;
        this.setupInputChannel(channel);
      } else if (channel.label === "inputReliable") {
        this.inputReliableChannel = channel;
        this.setupInputChannel(channel);
      }
    };
  }

  private setupControlChannel(channel: RTCDataChannel): void {
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as ControlMessage;
        if (message.type === "session.ended") {
          this.sessionEndedHandlers.forEach((h) => h());
        }
        this.controlHandlers.forEach((h) => h(message));
      } catch {
        console.warn("Failed to parse control message");
      }
    };

    channel.onclose = () => {
      this.sessionEndedHandlers.forEach((h) => h());
    };
  }

  private setupInputChannel(channel: RTCDataChannel): void {
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as InputEvent;
        this.inputHandlers.forEach((h) => h(message));
      } catch {
        console.warn("Failed to parse input message");
      }
    };
  }

  sendControl(message: ControlMessage): void {
    if (this.controlChannel?.readyState === "open") {
      this.controlChannel.send(JSON.stringify(message));
    }
  }

  sendInput(event: InputEvent): void {
    const unreliableTypes = new Set(["mouse.move", "mouse.wheel"]);
    const isUnreliable = unreliableTypes.has(event.type);
    const channel = isUnreliable ? this.inputChannel : this.inputReliableChannel;

    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(event));
    }
  }

  onControl(handler: ControlMessageHandler): void {
    this.controlHandlers.push(handler);
  }

  onInput(handler: InputMessageHandler): void {
    this.inputHandlers.push(handler);
  }

  offInput(handler: InputMessageHandler): void {
    this.inputHandlers = this.inputHandlers.filter((h) => h !== handler);
  }

  onSessionEnded(handler: SessionEndedHandler): void {
    this.sessionEndedHandlers.push(handler);
  }

  close(): void {
    this.controlChannel?.close();
    this.inputChannel?.close();
    this.inputReliableChannel?.close();
    this.sessionEndedHandlers = [];
  }

  get isReady(): boolean {
    return (
      this.controlChannel?.readyState === "open" &&
      this.inputChannel?.readyState === "open" &&
      this.inputReliableChannel?.readyState === "open"
    );
  }
}

export const dataChannelManager = new DataChannelManager();
