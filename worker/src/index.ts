export interface Env {
  DB: D1Database;
  STEAM_WEB_API_KEY: string;
}

type Session = { steamId: string };
type World = { id: string; name: string; owner_steam_id: string; latest_snapshot_json: string | null };
type Lease = { host_steam_id: string; lobby_id: string | null; expires_at_ms: number };

const APP_ID = "387990";
const LEASE_MS = 30_000;
const SESSION_MS = 15 * 60_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);
const now = () => Date.now();
const iso = () => new Date().toISOString();

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

async function authenticate(request: Request, env: Env): Promise<Session | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const tokenHash = await sha256(header.slice(7));
  const row = await env.DB.prepare("SELECT steam_id, expires_at_ms FROM sessions WHERE token_hash = ?")
    .bind(tokenHash).first<{ steam_id: string; expires_at_ms: number }>();
  if (!row || row.expires_at_ms <= now()) return null;
  return { steamId: row.steam_id };
}

async function memberRole(env: Env, worldId: string, steamId: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT role FROM members WHERE world_id = ? AND steam_id = ?")
    .bind(worldId, steamId).first<{ role: string }>();
  return row?.role ?? null;
}

async function steamIdFromTicket(ticket: string, key: string): Promise<string | null> {
  const url = new URL("https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/");
  url.searchParams.set("key", key);
  url.searchParams.set("appid", APP_ID);
  url.searchParams.set("ticket", ticket);
  const response = await fetch(url);
  if (!response.ok) return null;
  const parsed = await response.json() as { response?: { params?: { result?: string; steamid?: string } } };
  const params = parsed.response?.params;
  return params?.result === "OK" && /^7656119\d{10}$/.test(params.steamid ?? "") ? params.steamid! : null;
}

async function requireWorld(env: Env, id: string): Promise<World | null> {
  return env.DB.prepare("SELECT id, name, owner_steam_id, latest_snapshot_json FROM worlds WHERE id = ?")
    .bind(id).first<World>();
}

async function validLease(env: Env, worldId: string): Promise<Lease | null> {
  return env.DB.prepare("SELECT host_steam_id, lobby_id, expires_at_ms FROM leases WHERE world_id = ? AND expires_at_ms > ?")
    .bind(worldId, now()).first<Lease>();
}

async function createSession(request: Request, env: Env): Promise<Response> {
  if (!env.STEAM_WEB_API_KEY) return fail("Steam authentication is not configured", 503);
  const input = await body(request);
  if (typeof input?.steamTicket !== "string" || input.steamTicket.length > 16_384) return fail("invalid steamTicket", 400);
  const steamId = await steamIdFromTicket(input.steamTicket, env.STEAM_WEB_API_KEY);
  if (!steamId) return fail("Steam ticket rejected", 401);
  const raw = token();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at_ms <= ?").bind(now()).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, steam_id, expires_at_ms) VALUES (?, ?, ?)")
    .bind(await sha256(raw), steamId, now() + SESSION_MS).run();
  return json({ token: raw, expiresAt: new Date(now() + SESSION_MS).toISOString(), steamId });
}

async function createWorld(request: Request, env: Env, session: Session): Promise<Response> {
  const input = await body(request);
  if (typeof input?.name !== "string" || input.name.trim().length < 1 || input.name.length > 80) return fail("invalid name", 400);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO worlds (id, name, owner_steam_id, created_at) VALUES (?, ?, ?, ?)").bind(id, input.name.trim(), session.steamId, iso()),
    env.DB.prepare("INSERT INTO members (world_id, steam_id, role) VALUES (?, ?, 'owner')").bind(id, session.steamId)
  ]);
  return json({ worldId: id }, 201);
}

async function status(env: Env, worldId: string, session: Session): Promise<Response> {
  const world = await requireWorld(env, worldId);
  if (!world) return fail("world not found", 404);
  if (!await memberRole(env, worldId, session.steamId)) return fail("not a member", 403);
  return json({ worldId, name: world.name, lease: await validLease(env, worldId), latestSnapshot: world.latest_snapshot_json ? JSON.parse(world.latest_snapshot_json) : null });
}

async function updateMember(request: Request, env: Env, worldId: string, session: Session): Promise<Response> {
  if (await memberRole(env, worldId, session.steamId) !== "owner") return fail("owner required", 403);
  const input = await body(request);
  if (typeof input?.steamId !== "string" || !/^7656119\d{10}$/.test(input.steamId) || !["owner", "member"].includes(String(input.role))) return fail("invalid member", 400);
  const email = typeof input.googleEmail === "string" ? input.googleEmail : null;
  await env.DB.prepare("INSERT INTO members (world_id, steam_id, role, google_email) VALUES (?, ?, ?, ?) ON CONFLICT(world_id, steam_id) DO UPDATE SET role = excluded.role, google_email = excluded.google_email")
    .bind(worldId, input.steamId, input.role, email).run();
  return json({ ok: true });
}

async function claim(env: Env, worldId: string, session: Session): Promise<Response> {
  if (!await memberRole(env, worldId, session.steamId)) return fail("not a member", 403);
  const raw = token(); const expiry = now() + LEASE_MS;
  const result = await env.DB.prepare("INSERT INTO leases (world_id, host_steam_id, token_hash, expires_at_ms, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(world_id) DO UPDATE SET host_steam_id = excluded.host_steam_id, lobby_id = NULL, token_hash = excluded.token_hash, expires_at_ms = excluded.expires_at_ms, updated_at = excluded.updated_at WHERE leases.expires_at_ms <= ?")
    .bind(worldId, session.steamId, await sha256(raw), expiry, iso(), now()).run();
  if (result.meta.changes !== 1) return fail("active host lease", 409);
  return json({ leaseToken: raw, expiresAt: new Date(expiry).toISOString() });
}

async function leaseAction(request: Request, env: Env, worldId: string, session: Session, release: boolean): Promise<Response> {
  const input = await body(request);
  if (typeof input?.leaseToken !== "string") return fail("leaseToken required", 400);
  const tokenHash = await sha256(input.leaseToken);
  const query = release
    ? "DELETE FROM leases WHERE world_id = ? AND host_steam_id = ? AND token_hash = ?"
    : "UPDATE leases SET lobby_id = ?, expires_at_ms = ?, updated_at = ? WHERE world_id = ? AND host_steam_id = ? AND token_hash = ? AND expires_at_ms > ?";
  const args = release ? [worldId, session.steamId, tokenHash] : [typeof input.lobbyId === "string" ? input.lobbyId : null, now() + LEASE_MS, iso(), worldId, session.steamId, tokenHash, now()];
  const result = await env.DB.prepare(query).bind(...args).run();
  if (result.meta.changes !== 1) return fail("lease lost", 409);
  return json({ ok: true, expiresAt: release ? null : new Date(now() + LEASE_MS).toISOString() });
}

async function commitSnapshot(request: Request, env: Env, worldId: string, session: Session): Promise<Response> {
  const input = await body(request);
  if (typeof input?.leaseToken !== "string" || typeof input.snapshot !== "object" || input.snapshot === null) return fail("leaseToken and snapshot required", 400);
  const snapshot = input.snapshot as Record<string, unknown>;
  if (snapshot.worldId !== worldId || snapshot.sourceSteamId !== session.steamId || typeof snapshot.driveFileId !== "string" || typeof snapshot.sha256 !== "string") return fail("invalid snapshot", 400);
  const result = await env.DB.prepare("UPDATE worlds SET latest_snapshot_json = ? WHERE id = ? AND EXISTS (SELECT 1 FROM leases WHERE world_id = ? AND host_steam_id = ? AND token_hash = ? AND expires_at_ms > ?)")
    .bind(JSON.stringify(snapshot), worldId, worldId, session.steamId, await sha256(input.leaseToken), now()).run();
  return result.meta.changes === 1 ? json({ ok: true }) : fail("lease lost", 409);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url); const segments = url.pathname.split("/").filter(Boolean);
    if (request.method === "POST" && url.pathname === "/v1/sessions") return createSession(request, env);
    if (segments[0] !== "v1" || segments[1] !== "worlds") return fail("not found", 404);
    const session = await authenticate(request, env); if (!session) return fail("unauthorized", 401);
    if (request.method === "POST" && segments.length === 2) return createWorld(request, env, session);
    const worldId = segments[2]; if (!worldId || !await requireWorld(env, worldId)) return fail("world not found", 404);
    if (request.method === "GET" && segments[3] === "status") return status(env, worldId, session);
    if (request.method === "POST" && segments[3] === "members") return updateMember(request, env, worldId, session);
    if (request.method === "POST" && segments[3] === "lease" && segments[4] === "claim") return claim(env, worldId, session);
    if (request.method === "POST" && segments[3] === "lease" && segments[4] === "renew") return leaseAction(request, env, worldId, session, false);
    if (request.method === "POST" && segments[3] === "lease" && segments[4] === "release") return leaseAction(request, env, worldId, session, true);
    if (request.method === "POST" && segments[3] === "snapshots") return commitSnapshot(request, env, worldId, session);
    return fail("not found", 404);
  }
} satisfies ExportedHandler<Env>;
