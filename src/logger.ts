import type * as vscode from "vscode";

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

let instance: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function initLogger(channel: vscode.LogOutputChannel): void {
  const envLevel = (process.env.AGENT_LENS_LOG_LEVEL ?? "").toLowerCase();
  const envDebug = process.env.AGENT_LENS_DEBUG === "1";
  const debugEnabled = envDebug || envLevel === "debug" || envLevel === "trace";

  instance = {
    debug(message: string) {
      if (!debugEnabled) return;
      channel.debug(message);
    },
    info(message: string) {
      channel.info(message);
    },
    warn(message: string) {
      channel.warn(message);
    },
    error(message: string) {
      channel.error(message);
    },
  };
}

export function getLogger(): Logger {
  return instance;
}
