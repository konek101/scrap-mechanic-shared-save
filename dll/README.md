# DLL Integration Boundary

No injection, proxy DLL, or launcher implementation is included yet. Selecting one is a product, compatibility, and legal-distribution decision.

Once a supported loader is chosen, the minimal first integration must only launch `SharedSaveHost.exe` and show its health. It must reject unsupported game builds before installing any hook. World start/join, Steam calls, menu edits, and save lifecycle hooks are intentionally deferred until independently validated on build `24397771`.
