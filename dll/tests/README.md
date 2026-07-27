# DLL Smoke Test

Build `SharedSave.dll`, copy it to the separately installed injector's
`Release/DLLModules` directory, then start Scrap Mechanic through Steam.

The only expected effect is one line in
`%LOCALAPPDATA%\SharedSave\SharedSave.dll.log`. Do not enable hooks or use a
personal save during this test. `Install-InjectorSmoke.ps1` verifies the
published injector hash, installs the test-only proxy, launches through Steam,
and waits up to 90 seconds for that line. On success or timeout it closes the
test game process automatically.
