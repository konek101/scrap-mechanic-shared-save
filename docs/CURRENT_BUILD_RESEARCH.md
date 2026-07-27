# Current Build Research

Captured 2026-07-27. All native offsets below are valid only for this exact executable.

- Steam app: `387990`
- Steam build: `24417028`
- File version: `1.0.2.870`
- SHA-256: `2e37f62fab66fef238a6215342747b10c878d67c4fc69f13b792a2062a678a9a`
- PDB identity: `20961640-A9D1-497A-94BA-4C14498FD3B8`, age `1`

## Confirmed anchors

These are string/RTTI anchors, not verified hook addresses. Resolve cross-references again after every update.

| Area | Anchor | Virtual address |
| --- | --- | --- |
| Survival menu | `$GAME_DATA/Gui/Layouts/GameModeMenu/SurvivalModeMenu.layout` | `0x1414BE598` |
| Menu class | `SurvivalModeMenu` RTTI | near menu layout reference |
| Host path | `Hosting game` | `0x1414C2BC8` |
| Join path | `Joining game...` | `0x1415C7568` |
| Accepted join | `Join request accepted` | `0x1415C76A0` |
| Save control | `pauseSaving` / `resumeSaving` | `0x1415C95A8` / `0x1415C95B8` |
| Shutdown | `SERVER_SHUTDOWN` | `0x1415E8640` |
| Shutdown completion | `successfully shutdown` | `0x141745860` |

## Script lifecycle evidence

- `Survival/Scripts/game/SurvivalGame.lua`: `server_onCreate` creates or restores the overworld; `server_onPlayerJoined` handles player restoration; `server_onUnload` calls `TileStorageManager.Sv_Save()`.
- `Data/Scripts/game/managers/TileStorageManager.lua`: `Sv_Save` persists dirty tiles and the automatic pass runs every ten ticks.
- `Survival/Scripts/game/scriptableObjects/WarehouseDestruction.lua`: pauses saving, flushes tiles, then resumes saving. This is a useful safe-save ordering reference, not a proof that the SQLite transaction completed.

## Next native research

1. Use offline xrefs from the anchors to identify enclosing functions and callers.
2. Trace the `bSaveSuccess` xref to confirm a database commit boundary.
3. Trace host/join anchors to distinguish Scrap Mechanic session flow from Steam callbacks.
4. Instrument only the matching executable hash and log observations before enabling any behavior.

Do not use fixed offsets across a Steam update.
