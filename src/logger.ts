import type * as vscode from "vscode";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

let instance: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function initLogger(channel: vscode.LogOutputChannel): void {
  instance = {
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
