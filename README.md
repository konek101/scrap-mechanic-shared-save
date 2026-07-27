# Scrap Mechanic Shared Save

Coordination and safe snapshot core for sharing a Scrap Mechanic Survival save through Google Drive.

This repository uses the GPL-3.0-only license to integrate the GPL-3.0 `SmSdk` project. It intentionally does **not** redistribute Scrap Mechanic. Native game integration is build-gated and validated against build `24397771`.

## Components

- `worker/`: Cloudflare Worker and D1 schema for Steam-authenticated membership and atomic host leases.
- `helper/`: Windows .NET helper, publishable as `SharedSaveHost.exe`. It exposes authenticated named-pipe IPC and creates validated immutable local snapshots.
- `protocol/`: versioned IPC and HTTP contracts.
- `dll/`: GPL DLL module, initially limited to safe load diagnostics while hooks are researched.

## Safety invariants

- Drive is blob storage only; the Worker is lease authority.
- A snapshot is never committed to the Worker until its immutable object upload succeeds.
- Live SQLite databases are only copied after a game-confirmed save-safe event.
- Leases last 30 seconds and renew every 10 seconds.
- The helper uses a per-launch random secret and an ACL-restricted named pipe.

## Quick start

```powershell
dotnet build helper/SharedSaveHost.csproj
npm --prefix worker install
npm --prefix worker test
```

See `docs/SETUP.md` before deploying. Google OAuth and Steam ticket verification require credentials that must never be committed.
