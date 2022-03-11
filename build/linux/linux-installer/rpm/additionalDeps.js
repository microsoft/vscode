"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.additionalDeps = void 0;
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/additional_deps
// Additional dependencies not in the rpm find-requires output.
exports.additionalDeps = [
    'ca-certificates',
    'libgtk-3.so.0()(64bit)',
    'libnss3.so(NSS_3.22)(64bit)',
    'libssl3.so(NSS_3.28)(64bit)',
    'rpmlib(FileDigests) <= 4.6.0-1',
    'libvulkan.so.1()(64bit)',
    'libcurl.so.4()(64bit)',
    'xdg-utils' // OS integration
];
