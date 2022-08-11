/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDependencies = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path = require("path");
const dep_lists_1 = require("./dep-lists");
const manifests = require("../../../cgmanifest.json");
// A flag that can easily be toggled.
// Make sure to compile the build directory after toggling the value.
// If false, we warn about new dependencies if they show up
// while running the Debian prepare package task for a release.
// If true, we fail the build if there are new dependencies found during that task.
// The reference dependencies, which one has to update when the new dependencies
// are valid, are in dep-lists.ts
const FAIL_BUILD_FOR_NEW_DEPENDENCIES = true;
function getDependencies(buildDir, applicationName, arch, sysroot) {
    // Get the files for which we want to find dependencies.
    const nativeModulesPath = path.join(buildDir, 'resources', 'app', 'node_modules.asar.unpacked');
    const findResult = (0, child_process_1.spawnSync)('find', [nativeModulesPath, '-name', '*.node']);
    if (findResult.status) {
        console.error('Error finding files:');
        console.error(findResult.stderr.toString());
        return [];
    }
    const files = findResult.stdout.toString().trimEnd().split('\n');
    const appPath = path.join(buildDir, applicationName);
    files.push(appPath);
    // Add chrome sandbox and crashpad handler.
    files.push(path.join(buildDir, 'chrome-sandbox'));
    files.push(path.join(buildDir, 'chrome_crashpad_handler'));
    // Generate the dependencies.
    const dependencies = files.map((file) => calculatePackageDeps(file, arch, sysroot));
    // Add additional dependencies.
    const additionalDepsSet = new Set(dep_lists_1.additionalDeps);
    dependencies.push(additionalDepsSet);
    // Merge all the dependencies.
    const mergedDependencies = mergePackageDeps(dependencies);
    let sortedDependencies = [];
    for (const dependency of mergedDependencies) {
        sortedDependencies.push(dependency);
    }
    sortedDependencies.sort();
    // Exclude bundled dependencies
    sortedDependencies = sortedDependencies.filter(dependency => {
        return !dep_lists_1.bundledDeps.some(bundledDep => dependency.startsWith(bundledDep));
    });
    const referenceGeneratedDeps = dep_lists_1.referenceGeneratedDepsByArch[arch];
    if (JSON.stringify(sortedDependencies) !== JSON.stringify(referenceGeneratedDeps)) {
        const failMessage = 'The dependencies list has changed.'
            + '\nOld:\n' + referenceGeneratedDeps.join('\n')
            + '\nNew:\n' + sortedDependencies.join('\n');
        if (FAIL_BUILD_FOR_NEW_DEPENDENCIES) {
            throw new Error(failMessage);
        }
        else {
            console.warn(failMessage);
        }
    }
    return sortedDependencies;
}
exports.getDependencies = getDependencies;
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
        default:
            throw new Error('Unsupported architecture ' + arch);
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
    const requires = new Set(depsStr.split(', ').sort());
    return requires;
}
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/merge_package_deps.py.
function mergePackageDeps(inputDeps) {
    // For now, see if directly appending the dependencies helps.
    const requires = new Set();
    for (const depSet of inputDeps) {
        for (const dep of depSet) {
            const trimmedDependency = dep.trim();
            if (trimmedDependency.length && !trimmedDependency.startsWith('#')) {
                requires.add(trimmedDependency);
            }
        }
    }
    return requires;
}
