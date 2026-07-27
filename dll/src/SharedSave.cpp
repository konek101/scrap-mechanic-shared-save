// SPDX-License-Identifier: GPL-3.0-only
#include <Windows.h>

#include <filesystem>
#include <fstream>
#include <string>

namespace {

DWORD WINAPI ReportLoad(LPVOID)
{
    wchar_t localAppData[MAX_PATH]{};
    const auto length = GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData, MAX_PATH);
    if (length == 0 || length >= MAX_PATH) return 0;

    const auto directory = std::filesystem::path(localAppData) / L"SharedSave";
    std::error_code error;
    std::filesystem::create_directories(directory, error);
    std::ofstream log(directory / L"SharedSave.dll.log", std::ios::app);
    if (log) log << "SharedSave.dll loaded by PID " << GetCurrentProcessId() << "\n";
    return 0;
}

} // namespace

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID)
{
    if (reason != DLL_PROCESS_ATTACH) return TRUE;
    DisableThreadLibraryCalls(module);
    // DllMain performs no game work. The thread exits after reporting the load event.
    const HANDLE thread = CreateThread(nullptr, 0, ReportLoad, nullptr, 0, nullptr);
    if (thread) CloseHandle(thread);
    return TRUE;
}
