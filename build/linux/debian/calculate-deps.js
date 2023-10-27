"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePackageDeps = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path = require("path");
const manifests = require("../../../cgmanifest.json");
const dep_lists_1 = require("./dep-lists");
function generatePackageDeps(files, arch, sysroot) {
    const dependencies = files.map(file => calculatePackageDeps(file, arch, sysroot));
    const additionalDepsSet = new Set(dep_lists_1.additionalDeps);
    dependencies.push(additionalDepsSet);
    return dependencies;
}
exports.generatePackageDeps = generatePackageDeps;
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/calculate_package_deps.py.
function calculatePackageDeps(binaryPath, arch, sysroot) {
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
    const chromiumManifest = manifests.registrations.filter(registration => {
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
            cmd.push(`-l${sysroot}/usr/lib/x86_64-linux-gnu`, `-l${sysroot}/lib/x86_64-linux-gnu`);
            break;
        case 'armhf':
            cmd.push(`-l${sysroot}/usr/lib/arm-linux-gnueabihf`, `-l${sysroot}/lib/arm-linux-gnueabihf`);
            break;
        case 'arm64':
            cmd.push(`-l${sysroot}/usr/lib/aarch64-linux-gnu`, `-l${sysroot}/lib/aarch64-linux-gnu`);
            break;
    }
    cmd.push(`-l${sysroot}/usr/lib`);
    cmd.push('-O', '-e', path.resolve(binaryPath));
    const dpkgShlibdepsResult = (0, child_process_1.spawnSync)('perl', cmd, { cwd: sysroot });
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
        return !dependency.startsWith('libgcc-s1') &&
            !dependency.startsWith('libgssapi-krb5-2') &&
            !dependency.startsWith('libkrb5-3');
    }).sort();
    const requires = new Set(filteredDeps);
    return requires;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsY3VsYXRlLWRlcHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjYWxjdWxhdGUtZGVwcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxpREFBMEM7QUFDMUMsMkJBQXlDO0FBQ3pDLDJCQUE0QjtBQUM1Qiw2QkFBOEI7QUFDOUIsc0RBQXNEO0FBQ3RELDJDQUE2QztBQUc3QyxTQUFnQixtQkFBbUIsQ0FBQyxLQUFlLEVBQUUsSUFBc0IsRUFBRSxPQUFlO0lBQzNGLE1BQU0sWUFBWSxHQUFrQixLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2pHLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsMEJBQWMsQ0FBQyxDQUFDO0lBQ2xELFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNyQyxPQUFPLFlBQVksQ0FBQztBQUNyQixDQUFDO0FBTEQsa0RBS0M7QUFFRCw2SEFBNkg7QUFDN0gsU0FBUyxvQkFBb0IsQ0FBQyxVQUFrQixFQUFFLElBQXNCLEVBQUUsT0FBZTtJQUN4RixJQUFJLENBQUM7UUFDSixJQUFJLENBQUMsQ0FBQyxJQUFBLGFBQVEsRUFBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLEdBQUcsY0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDdEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLFVBQVUsdUNBQXVDLENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0YsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWiw4REFBOEQ7UUFDOUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxVQUFVLEdBQUcsY0FBYyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELHdDQUF3QztJQUN4QyxNQUFNLGdCQUFnQixHQUFHLFNB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