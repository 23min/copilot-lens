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

export function initLogger(channel: vscode.OutputChannel): void {
  instance = {
    info(message: string) {
      channel.appendLine(`[INFO]  ${message}`);
    },
    warn(message: string) {
      channel.appendLine(`[WARN]  ${message}`);
    },
    error(message: string) {
      channel.appendLine(`[ERROR] ${message}`);
    },
  };
}

export function getLogger(): Logger {
  return instance;
}
