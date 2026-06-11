const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const currentLevel: LogLevel = "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLevel);
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog("debug")) console.debug(`[PairPair] ${message}`, ...args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog("info")) console.info(`[PairPair] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(`[PairPair] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (shouldLog("error")) console.error(`[PairPair] ${message}`, ...args);
  },
};
