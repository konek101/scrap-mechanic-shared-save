# Setup

## Prerequisites

- Windows 10/11 and .NET SDK 8.
- Node 20+.
- A Cloudflare account with Workers and D1 enabled.
- A Steam Web API publisher key stored as the Worker secret `STEAM_WEB_API_KEY`.
- A Google Cloud desktop OAuth client. Store its client ID locally; the helper must protect refresh tokens with Windows DPAPI.

## Worker

1. Run `npm --prefix worker install`.
2. Create a D1 database, put its ID in `worker/wrangler.toml`, then run `npx wrangler d1 execute shared-save --file migrations/0001_initial.sql` from `worker/`.
3. Set `STEAM_WEB_API_KEY` with `wrangler secret put STEAM_WEB_API_KEY`.
4. Deploy with `npm run deploy` from `worker/`.

## Helper

Build a self-contained executable with:

```powershell
dotnet publish helper/SharedSaveHost.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The helper requires a random `--secret`, `--pipe-name`, `--game-pid`, and `--game-exe` from the future DLL launcher. Do not start it as a general local service.

## Integration status

No DLL loader has been selected. Do not test by launching `ScrapMechanic.exe` directly; launch through Steam (`steam://run/387990`). Native hooks, lobby integration, and save-safe signals require research on the exact supported build before they can be enabled.
