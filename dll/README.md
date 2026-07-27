# DLL Integration Boundary

`SharedSave.dll` is a GPL-3.0-only module intended for the separately installed `SM-DLL-Injector` loader. The pinned `SmSdk` submodule is the planned native Scrap Mechanic API dependency.

The first DLL build only writes load diagnostics. It does not install hooks, invoke Steam APIs, modify menus, read saves, or alter game behavior. Native lifecycle work stays disabled until independently validated on build `24397771`.

`SmSdk` is currently opt-in (`-DSHARED_SAVE_BUILD_WITH_SMSDK=ON`) because its ABI layout assertions fail under MSVC 19.44. Those assertions must be resolved against the target game build before linking it into a module.
