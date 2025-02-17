"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePackageDeps = generatePackageDeps;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = __importDefault(require("path"));
const cgmanifest_json_1 = __importDefault(require("../../../cgmanifest.json"));
const dep_lists_1 = require("./dep-lists");
function generatePackageDeps(files, arch, chromiumSysroot, vscodeSysroot) {
    const dependencies = files.map(file => calculatePackageDeps(file, arch, chromiumSysroot, vscodeSysroot));
    const additionalDepsSet = new Set(dep_lists_1.additionalDeps);
    dependencies.push(additionalDepsSet);
    return dependencies;
}
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/calculate_package_deps.py.
function calculatePackageDeps(binaryPath, arch, chromiumSysroot, vscodeSysroot) {
    try {
        if (!((0, fs_1.statSync)(binaryPath).mode & fs_1.constants.S_IXUSR)) {
            throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
        }
    }
    catch (e) {
        // The package might not exist. Don't re-throw the error here.
        console.error('Tried to stat ' + binaryPath + ' but failed.');
    }
    // Get the Chromium dpkg-shlibdeps file.
    const chromiumManifest = cgmanifest_json_1.default.registrations.filter(registration => {
        return registration.component.type === 'git' && registration.component.git.name === 'chromium';
    });
    const dpkgShlibdepsUrl = `https://raw.githubusercontent.com/chromium/chromium/${chromiumManifest[0].version}/third_party/dpkg-shlibdeps/dpkg-shlibdeps.pl`;
    const dpkgShlibdepsScriptLocation = `${(0, os_1.tmpdir)()}/dpkg-shlibdeps.pl`;
    const result = (0, child_process_1.spawnSync)('curl', [dpkgShlibdepsUrl, '-o', dpkgShlibdepsScriptLocation]);
    if (result.status !== 0) {
        throw new Error('Cannot retrieve dpkg-shlibdeps. Stderr:\n' + result.stderr);
    }
    const cmd = [dpkgShlibdepsScriptLocation, '--ignore-weak-undefined'];
    switch (arch) {
        case 'amd64':
            cmd.push(`-l${chromiumSysroot}/usr/lib/x86_64-linux-gnu`, `-l${chromiumSysroot}/lib/x86_64-linux-gnu`, `-l${vscodeSysroot}/usr/lib/x86_64-linux-gnu`, `-l${vscodeSysroot}/lib/x86_64-linux-gnu`);
            break;
        case 'armhf':
            cmd.push(`-l${chromiumSysroot}/usr/lib/arm-linux-gnueabihf`, `-l${chromiumSysroot}/lib/arm-linux-gnueabihf`, `-l${vscodeSysroot}/usr/lib/arm-linux-gnueabihf`, `-l${vscodeSysroot}/lib/arm-linux-gnueabihf`);
            break;
        case 'arm64':
            cmd.push(`-l${chromiumSysroot}/usr/lib/aarch64-linux-gnu`, `-l${chromiumSysroot}/lib/aarch64-linux-gnu`, `-l${vscodeSysroot}/usr/lib/aarch64-linux-gnu`, `-l${vscodeSysroot}/lib/aarch64-linux-gnu`);
            break;
    }
    cmd.push(`-l${chromiumSysroot}/usr/lib`);
    cmd.push(`-L${vscodeSysroot}/debian/libxkbfile1/DEBIAN/shlibs`);
    cmd.push('-O', '-e', path_1.default.resolve(binaryPath));
    const dpkgShlibdepsResult = (0, child_process_1.spawnSync)('perl', cmd, { cwd: chromiumSysroot });
    if (dpkgShlibdepsResult.status !== 0) {
        throw new Error(`dpkg-shlibdeps failed with exit code ${dpkgShlibdepsResult.status}. stderr:\n${dpkgShlibdepsResult.stderr} `);
    }
    const shlibsDependsPrefix = 'shlibs:Depends=';
    const requiresList = dpkgShlibdepsResult.stdout.toString('utf-8').trimEnd().split('\n');
    let depsStr = '';
    for (const line of requiresList) {
        if (line.startsWith(shlibsDependsPrefix)) {
            depsStr = line.substring(shlibsDependsPrefix.length);
        }
    }
    // Refs https://chromium-review.googlesource.com/c/chromium/src/+/3572926
    // Chromium depends on libgcc_s, is from the package libgcc1.  However, in
    // Bullseye, the package was renamed to libgcc-s1.  To avoid adding a dep
    // on the newer package, this hack skips the dep.  This is safe because
    // libgcc-s1 is a dependency of libc6.  This hack can be removed once
    // support for Debian Buster and Ubuntu Bionic are dropped.
    //
    // Remove kerberos native module related dependencies as the versions
    // computed from sysroot will not satisfy the minimum supported distros
    // Refs https://github.com/microsoft/vscode/issues/188881.
    // TODO(deepak1556): remove this workaround in favor of computing the
    // versions from build container for native modules.
    const filteredDeps = depsStr.split(', ').filter(dependency => {
        return !dependency.startsWith('libgcc-s1');
    }).sort();
    const requires = new Set(filteredDeps);
    return requires;
}
//# sourceMappingURL=calculate-deps.js.map