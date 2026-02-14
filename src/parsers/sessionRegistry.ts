import type { Session } from "../models/session.js";
import type {
  SessionProvider,
  SessionDiscoveryContext,
  WatchTarget,
} from "./sessionProvider.js";
import { getLogger } from "../logger.js";

const providers: SessionProvider[] = [];

export function registerSessionProvider(provider: SessionProvider): void {
  providers.push(provider);
}

export function clearProviders(): void {
  providers.length = 0;
}

export async function discoverAllSessions(
  ctx: SessionDiscoveryContext,
): Promise<Session[]> {
  const log = getLogger();
  const seen = new Set<string>();
  const sessions: Session[] = [];

  for (const provider of providers) {
    try {
      const found = await provider.discoverSessions(ctx);
      for (const s of found) {
        if (!seen.has(s.sessionId)) {
          seen.add(s.sessionId);
          sessions.push(s);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Session provider "${provider.name}" failed: ${msg}`);
    }
  }

  return sessions;
}

export function collectWatchTargets(
  ctx: SessionDiscoveryContext,
): WatchTarget[] {
  const targets: WatchTarget[] = [];
  for (const provider of providers) {
    if (provider.getWatchTargets) {
      targets.push(...provider.getWatchTargets(ctx));
    }
  }
  return targets;
}
