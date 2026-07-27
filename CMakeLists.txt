cmake_minimum_required(VERSION 3.24)
project(SharedSave LANGUAGES CXX)
enable_testing()

if(NOT WIN32 OR NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "SharedSave supports only 64-bit Windows")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(SHARED_SAVE_BUILD_WITH_SMSDK "Build against SmSdk after ABI validation" OFF)
if(SHARED_SAVE_BUILD_WITH_SMSDK)
    add_subdirectory(third_party/SmSdk EXCLUDE_FROM_ALL)
endif()
add_subdirectory(dll)
