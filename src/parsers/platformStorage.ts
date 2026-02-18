import * as path from "node:path";
import * as os from "node:os";

/**
 * Return the platform-native VS Code app storage root.
 * This is the "local" VS Code storage, which differs from the
 * vscode-server storage used in SSH-Remote sessions.
 */
export function getPlatformStorageRoot(): string | null {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "Code", "User", "workspaceStorage");
    case "linux":
      return path.join(home, ".config", "Code", "User", "workspaceStorage");
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Code", "User", "workspaceStorage");
    default:
      return null;
  }
}
