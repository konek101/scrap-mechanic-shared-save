add_library(SharedSave SHARED src/SharedSave.cpp)
target_compile_definitions(SharedSave PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX UNICODE _UNICODE)
if(SHARED_SAVE_BUILD_WITH_SMSDK)
    target_link_libraries(SharedSave PRIVATE SMSDK)
endif()
set_target_properties(SharedSave PROPERTIES OUTPUT_NAME "SharedSave")

add_executable(SharedSaveLoadSmoke tests/LoadSmoke.cpp)
add_test(NAME SharedSaveLoadSmoke COMMAND SharedSaveLoadSmoke $<TARGET_FILE:SharedSave>)
