vcpkg_find_acquire_program(JOM)
get_filename_component(JOM_EXE_PATH ${JOM} DIRECTORY)
vcpkg_add_to_path("${PERL_EXE_PATH}")

set(OPENSSL_SHARED no-shared)
if(VCPKG_LIBRARY_LINKAGE STREQUAL "dynamic")
    set(OPENSSL_SHARED shared)
endif()

vcpkg_extract_source_archive_ex(
  OUT_SOURCE_PATH SOURCE_PATH
  ARCHIVE ${ARCHIVE}
  PATCHES
    uwp/EnableUWPSupport.patch
)

vcpkg_find_acquire_program(NASM)
get_filename_component(NASM_EXE_PATH ${NASM} DIRECTORY)
vcpkg_add_to_path(PREPEND "${NASM_EXE_PATH}")

set(CONFIGURE_COMMAND ${PERL} Configure
    enable-static-engine
    enable-capieng
    no-unit-test
    no-ssl2
    no-asm
    no-uplink
    no-tests
    -utf-8
    ${OPENSSL_SHARED}
)

if(VCPKG_TARGET_ARCHITECTURE STREQUAL "x86")
    set(OPENSSL_ARCH VC-WIN32-UWP)
elseif(VCPKG_TARGET_ARCHITECTURE STREQUAL "x64")
    set(OPENSSL_ARCH VC-WIN64A-UWP)
elseif(VCPKG_TARGET_ARCHITECTURE STREQUAL "arm")
    set(OPENSSL_ARCH VC-WIN32-ARM-UWP)
elseif(VCPKG_TARGET_ARCHITECTURE STREQUAL "arm64")
    set(OPENSSL_ARCH VC-WIN64-ARM-UWP)
else()
    message(FATAL_ERROR "Unsupported target architecture: ${VCPKG_TARGET_ARCHITECTURE}")
endif()

set(OPENSSL_MAKEFILE "makefile")

file(REMOVE_RECURSE ${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-rel ${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-dbg)


if(NOT DEFINED VCPKG_BUILD_TYPE OR VCPKG_BUILD_TYPE STREQUAL "release")

    # Copy openssl sources.
    message(STATUS "Copying openssl release source files...")
    file(GLOB OPENSSL_SOURCE_FILES "${SOURCE_PATH}/*")
    foreach(SOURCE_FILE ${OPENSSL_SOURCE_FILES})
        file(COPY ${SOURCE_FILE} DESTINATION "${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-rel")
    endforeach()
    message(STATUS "Copying openssl release source files... done")
    set(SOURCE_PATH_RELEASE "${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-rel")

    set(OPENSSLDIR_RELEASE "${CURRENT_PACKAGES_DIR}")

    message(STATUS "Configure ${TARGET_TRIPLET}-rel")
    vcpkg_execute_required_process(
        COMMAND ${CONFIGURE_COMMAND} ${OPENSSL_ARCH} "--prefix=${OPENSSLDIR_RELEASE}" "--openssldir=${OPENSSLDIR_RELEASE}" -FS
        WORKING_DIRECTORY "${SOURCE_PATH_RELEASE}"
        LOGNAME configure-perl-${TARGET_TRIPLET}-${VCPKG_BUILD_TYPE}-rel
    )
    message(STATUS "Configure ${TARGET_TRIPLET}-rel done")

    message(STATUS "Build ${TARGET_TRIPLET}-rel")
    # Openssl's buildsystem has a race condition which will cause JOM to fail at some point.
    # This is ok; we just do as much work as we can in parallel first, then follow up with a single-threaded build.
    make_directory(${SOURCE_PATH_RELEASE}/inc32/openssl)
    execute_process(
        COMMAND "${JOM}" -k -j ${VCPKG_CONCURRENCY} -f "${OPENSSL_MAKEFILE}" build_libs
        WORKING_DIRECTORY "${SOURCE_PATH_RELEASE}"
        OUTPUT_FILE "${CURRENT_BUILDTREES_DIR}/build-${TARGET_TRIPLET}-rel-0-out.log"
        ERROR_FILE "${CURRENT_BUILDTREES_DIR}/build-${TARGET_TRIPLET}-rel-0-err.log"
    )
    vcpkg_execute_required_process(
        COMMAND nmake -f "${OPENSSL_MAKEFILE}" install_dev
        WORKING_DIRECTORY "${SOURCE_PATH_RELEASE}"
        LOGNAME build-${TARGET_TRIPLET}-rel-1)

    message(STATUS "Build ${TARGET_TRIPLET}-rel done")
endif()


if(NOT DEFINED VCPKG_BUILD_TYPE OR VCPKG_BUILD_TYPE STREQUAL "debug")
    # Copy openssl sources.
    message(STATUS "Copying openssl debug source files...")
    file(GLOB OPENSSL_SOURCE_FILES ${SOURCE_PATH}/*)
    foreach(SOURCE_FILE ${OPENSSL_SOURCE_FILES})
        file(COPY "${SOURCE_FILE}" DESTINATION "${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-dbg")
    endforeach()
    message(STATUS "Copying openssl debug source files... done")
    set(SOURCE_PATH_DEBUG "${CURRENT_BUILDTREES_DIR}/${TARGET_TRIPLET}-dbg")

    set(OPENSSLDIR_DEBUG "${CURRENT_PACKAGES_DIR}/debug")

    message(STATUS "Configure ${TARGET_TRIPLET}-dbg")
    vcpkg_execute_required_process(
        COMMAND ${CONFIGURE_COMMAND} debug-${OPENSSL_ARCH} "--prefix=${OPENSSLDIR_DEBUG}" "--openssldir=${OPENSSLDIR_DEBUG}" -FS
        WORKING_DIRECTORY "${SOURCE_PATH_DEBUG}"
        LOGNAME configure-perl-${TARGET_TRIPLET}-${VCPKG_BUILD_TYPE}-dbg
    )
    message(STATUS "Configure ${TARGET_TRIPLET}-dbg done")

    message(STATUS "Build ${TARGET_TRIPLET}-dbg")
    make_directory("${SOURCE_PATH_DEBUG}/inc32/openssl")
    execute_process(
        COMMAND "${JOM}" -k -j ${VCPKG_CONCURRENCY} -f "${OPENSSL_MAKEFILE}" build_libs
        WORKING_DIRECTORY "${SOURCE_PATH_DEBUG}"
        OUTPUT_FILE "${CURRENT_BUILDTREES_DIR}/build-${TARGET_TRIPLET}-dbg-0-out.log"
        ERROR_FILE "${CURRENT_BUILDTREES_DIR}/build-${TARGET_TRIPLET}-dbg-0-err.log"
    )
    vcpkg_execute_required_process(
        COMMAND nmake -f "${OPENSSL_MAKEFILE}" install_dev
        WORKING_DIRECTORY "${SOURCE_PATH_DEBUG}"
        LOGNAME build-${TARGET_TRIPLET}-dbg-1)

    message(STATUS "Build ${TARGET_TRIPLET}-dbg done")
endif()

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/certs")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/private")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/lib/engines-1_1")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/certs")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/lib/engines-1_1")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/private")
file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/include")

file(REMOVE
    "${CURRENT_PACKAGES_DIR}/bin/openssl.exe"
    "${CURRENT_PACKAGES_DIR}/debug/bin/openssl.exe"
    "${CURRENT_PACKAGES_DIR}/debug/openssl.cnf"
    "${CURRENT_PACKAGES_DIR}/openssl.cnf"
    "${CURRENT_PACKAGES_DIR}/ct_log_list.cnf"
    "${CURRENT_PACKAGES_DIR}/ct_log_list.cnf.dist"
    "${CURRENT_PACKAGES_DIR}/openssl.cnf.dist"
    "${CURRENT_PACKAGES_DIR}/debug/ct_log_list.cnf"
    "${CURRENT_PACKAGES_DIR}/debug/ct_log_list.cnf.dist"
    "${CURRENT_PACKAGES_DIR}/debug/openssl.cnf.dist"
)

if(VCPKG_LIBRARY_LINKAGE STREQUAL static)
    # They should be empty, only the exes deleted above were in these directories
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug/bin/")
    file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/bin/")
endif()

file(READ "${CURRENT_PACKAGES_DIR}/include/openssl/dtls1.h" _contents)
string(REPLACE "<winsock.h>" "<winsock2.h>" _contents "${_contents}")
file(WRITE "${CURRENT_PACKAGES_DIR}/include/openssl/dtls1.h" "${_contents}")

file(READ "${CURRENT_PACKAGES_DIR}/include/openssl/rand.h" _contents)
string(REPLACE "#  include <windows.h>" "#ifndef _WINSOCKAPI_\n#define _WINSOCKAPI_\n#endif\n#  include <windows.h>" _contents "${_contents}")
file(WRITE "${CURRENT_PACKAGES_DIR}/include/openssl/rand.h" "${_contents}")

vcpkg_copy_pdbs()

file(INSTALL "${SOURCE_PATH}/LICENSE" DESTINATION "${CURRENT_PACKAGES_DIR}/share/${PORT}" RENAME copyright)
