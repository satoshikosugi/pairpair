import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { WebSocketServer } from "ws";
import { healthRoutes } from "./routes/health";
import { sessionRoutes } from "./routes/sessions";
import { handleSignalingConnection } from "./ws/signaling";
import { sessionStore } from "./infra/redis";
import { logger } from "./infra/logger";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  // Create Fastify instance
  const fastify = Fastify({
    logger: false, // Use pino directly
    trustProxy: true,
  });

  // CORS - allow Electron app (file:// and custom protocol)
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (Electron) and localhost
      if (!origin || origin.startsWith("http://localhost") || origin === "file://") {
        callback(null, true);
      } else {
        callback(null, true); // Allow all in dev; restrict in prod
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 10,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: "Too many requests",
      code: "RATE_LIMIT_EXCEEDED",
    }),
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(sessionRoutes);

  // WebSocket server
  const wss = new WebSocketServer({ server: fastify.server, path: "/ws" });

  wss.on("connection", (ws) => {
    logger.debug("New WebSocket connection");
    handleSignalingConnection(ws);
  });

  wss.on("error", (err) => {
    logger.error({ err }, "WebSocket server error");
  });

  // Start server
  await fastify.ready();
  await fastify.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "PairPair Signaling Server started");

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    wss.close();
    await fastify.close();
    sessionStore.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((err) => {
  logger.error({ err }, "Unhandled error");
  process.exit(1);
});
