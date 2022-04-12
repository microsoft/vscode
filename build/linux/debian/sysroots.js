"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.sysrootInfo = void 0;
// Based on https://github.com/electron/electron/blob/main/script/sysroots.json,
// which itself is based on https://source.chromium.org/chromium/chromium/src/+/main:build/linux/sysroot_scripts/sysroots.json.
exports.sysrootInfo = {
    'amd64': {
        'Sha1Sum': '7e008cea9eae822d80d55c67fbb5ef4204678e74',
        'SysrootDir': 'debian_sid_amd64-sysroot',
        'Tarball': 'debian_sid_amd64_sysroot.tar.xz'
    },
    'armhf': {
        'Sha1Sum': 'b6f4bb07817bea91b06514a9c1e3832df5a90dbf',
        'SysrootDir': 'debian_sid_arm-sysroot',
        'Tarball': 'debian_sid_arm_sysroot.tar.xz'
    },
    'arm64': {
        'Sha1Sum': '5a56c1ef714154ea5003bcafb16f21b0f8dde023',
        'SysrootDir': 'debian_sid_arm64-sysroot',
        'Tarball': 'debian_sid_arm64_sysroot.tar.xz'
    }
};
