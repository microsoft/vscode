function(install_pc_file name pc_data)
    if(NOT DEFINED VCPKG_BUILD_TYPE OR VCPKG_BUILD_TYPE STREQUAL "release")
        configure_file("${CMAKE_CURRENT_LIST_DIR}/openssl.pc.in" "${CURRENT_PACKAGES_DIR}/lib/pkgconfig/${name}.pc" @ONLY)
    endif()
    if(NOT DEFINED VCPKG_BUILD_TYPE OR VCPKG_BUILD_TYPE STREQUAL "debug")
        configure_file("${CMAKE_CURRENT_LIST_DIR}/openssl.pc.in" "${CURRENT_PACKAGES_DIR}/debug/lib/pkgconfig/${name}.pc" @ONLY)
    endif()
endfunction()

install_pc_file(openssl [[
Name: OpenSSL
Description: Secure Sockets Layer and cryptography libraries and tools
Requires: libssl libcrypto
]])

install_pc_file(libssl [[
Name: OpenSSL-libssl
Description: Secure Sockets Layer and cryptography libraries
Libs: -L"${libdir}" -llibssl
Requires: libcrypto
Cflags: -I"${includedir}"
]])

install_pc_file(libcrypto [[
Name: OpenSSL-libcrypto
Description: OpenSSL cryptography library
Libs: -L"${libdir}" -llibcrypto
Libs.private: -lcrypt32 -lws2_32
Cflags: -I"${includedir}"
]])

vcpkg_fixup_pkgconfig()
