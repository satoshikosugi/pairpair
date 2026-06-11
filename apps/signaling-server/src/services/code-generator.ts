import crypto from "crypto";
import type Redis from "ioredis";

const CODE_KEY_PREFIX = "code:";
const CODE_LENGTH = 6;

function generateCode(): string {
  // Generate a 6-digit numeric code
  const min = Math.pow(10, CODE_LENGTH - 1);
  const max = Math.pow(10, CODE_LENGTH) - 1;
  return String(crypto.randomInt(min, max + 1));
}

export async function generateUniqueCode(
  redis: Redis,
  ttlSeconds: number = 600
): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateCode();
    const key = `${CODE_KEY_PREFIX}${code}`;
    // SET NX - only set if not exists
    const result = await redis.set(key, "reserved", "EX", ttlSeconds, "NX");
    if (result === "OK") {
      // Delete the reservation immediately - actual data stored by session service
      await redis.del(key);
      return code;
    }
  }
  throw new Error("Failed to generate unique code after max attempts");
}
