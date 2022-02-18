"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.bundledDeps = exports.recommendedDeps = exports.additionalDeps = void 0;
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/additional_deps
// Additional dependencies not in the dpkg-shlibdeps output.
exports.additionalDeps = [
    'ca-certificates',
    'fonts-liberation',
    'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
    'libnss3 (>= 3.26)',
    'wget',
    'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
    'xdg-utils (>= 1.0.2)' // OS integration
];
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/manual_recommends
// Dependencies that we can only recommend
// for now since some of the older distros don't support them.
exports.recommendedDeps = [
    'libu2f-udev',
    'libvulkan1' // Move to additionalDeps once support for Trusty and Jessie are dropped.
];
// Based on https://source.chromium.org/chromium/chromium/src/+/refs/tags/98.0.4758.109:chrome/installer/linux/BUILD.gn;l=64-80
// and the Linux Archive build
// Shared library dependencies that we already bundle.
exports.bundledDeps = [
    'libEGL.so',
    'libGLESv2.so',
    'libvulkan.so.1',
    'swiftshader_libEGL.so',
    'swiftshader_libGLESv2.so',
    'libvk_swiftshader.so',
    'libffmpeg.so'
];
