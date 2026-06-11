import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHostSession, guestJoin } from "../services/session-service";
import { logger } from "../infra/logger";

const HostSessionSchema = z.object({
  appVersion: z.string(),
  deviceName: z.string().max(100),
  platform: z.enum(["darwin", "win32", "linux"]),
});

const GuestJoinSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/),
  appVersion: z.string(),
  deviceName: z.string().max(100),
  platform: z.enum(["darwin", "win32", "linux"]),
});

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/api/sessions/host", async (request, reply) => {
    const parseResult = HostSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation error",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors,
      });
    }

    const { appVersion, deviceName, platform } = parseResult.data;

    try {
      const result = await createHostSession(deviceName, platform, appVersion);
      const wsUrl = `${process.env.WS_URL ?? "ws://localhost:8080"}/ws`;
      return reply.status(201).send({
        sessionId: result.sessionId,
        code: result.code,
        hostToken: result.hostToken,
        expiresAt: result.expiresAt,
        wsUrl,
      });
    } catch (err) {
      logger.error({ err }, "Failed to create host session");
      return reply.status(500).send({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  });

  fastify.post("/api/sessions/join", async (request, reply) => {
    const parseResult = GuestJoinSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation error",
        code: "VALIDATION_ERROR",
        details: parseResult.error.errors,
      });
    }

    const { code, appVersion, deviceName, platform } = parseResult.data;

    try {
      const result = await guestJoin(code, deviceName, platform, appVersion);
      const wsUrl = `${process.env.WS_URL ?? "ws://localhost:8080"}/ws`;
      return reply.status(200).send({
        sessionId: result.sessionId,
        guestToken: result.guestToken,
        hostDeviceName: result.hostDeviceName,
        wsUrl,
      });
    } catch (err: unknown) {
      const appErr = err as { code?: string; message?: string };
      if (appErr.code === "SESSION_NOT_FOUND") {
        return reply.status(404).send({ error: "Session not found or expired", code: "SESSION_NOT_FOUND" });
      }
      if (appErr.code === "SESSION_CODE_USED") {
        return reply.status(409).send({ error: "Session code already used", code: "SESSION_CODE_USED" });
      }
      if (appErr.code === "SESSION_FULL") {
        return reply.status(409).send({ error: "Session already full", code: "SESSION_FULL" });
      }
      logger.error({ err }, "Failed to join session");
      return reply.status(500).send({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  });
}
