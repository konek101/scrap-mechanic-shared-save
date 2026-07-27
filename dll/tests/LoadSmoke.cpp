// SPDX-License-Identifier: GPL-3.0-only
#include <Windows.h>

#include <chrono>
#include <iostream>
#include <thread>

int main(int argc, char** argv)
{
    if (argc != 2) return 2;
    const HMODULE module = LoadLibraryA(argv[1]);
    if (!module)
    {
        std::cerr << "LoadLibrary failed: " << GetLastError() << "\n";
        return 1;
    }

    // The production loader retains the module for the game process lifetime.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    return 0;
}
