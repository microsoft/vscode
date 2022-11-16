/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDependencies = void 0;
const child_process_1 = require("child_process");
const path = require("path");
const calculate_deps_1 = require("./debian/calculate-deps");
const calculate_deps_2 = require("./rpm/calculate-deps");
const dep_lists_1 = require("./debian/dep-lists");
const dep_lists_2 = require("./rpm/dep-lists");
const types_1 = require("./debian/types");
const types_2 = require("./rpm/types");
// A flag that can easily be toggled.
// Make sure to compile the build directory after toggling the value.
// If false, we warn about new dependencies if they show up
// while running the prepare package tasks for a release.
// If true, we fail the build if there are new dependencies found during that task.
// The reference dependencies, which one has to update when the new dependencies
// are valid, are in dep-lists.ts
const FAIL_BUILD_FOR_NEW_DEPENDENCIES = true;
// Based on https://source.chromium.org/chromium/chromium/src/+/refs/tags/108.0.5359.40:chrome/installer/linux/BUILD.gn;l=64-80
// and the Linux Archive build
// Shared library dependencies that we already bundle.
const bundledDeps = [
    'libEGL.so',
    'libGLESv2.so',
    'libvulkan.so.1',
    'libvk_swiftshader.so',
    'libffmpeg.so'
];
function getDependencies(packageType, buildDir, applicationName, arch, sysroot) {
    if (packageType === 'deb') {
        if (!(0, types_1.isDebianArchString)(arch)) {
            throw new Error('Invalid Debian arch string ' + arch);
        }
        if (!sysroot) {
            throw new Error('Missing sysroot parameter');
        }
    }
    if (packageType === 'rpm' && !(0, types_2.isRpmArchString)(arch)) {
        throw new Error('Invalid RPM arch string ' + arch);
    }
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
    const dependencies = packageType === 'deb' ?
        (0, calculate_deps_1.generatePackageDeps)(files, arch, sysroot) :
        (0, calculate_deps_2.generatePackageDeps)(files);
    // Merge all the dependencies.
    const mergedDependencies = mergePackageDeps(dependencies);
    // Exclude bundled dependencies and sort
    const sortedDependencies = Array.from(mergedDependencies).filter(dependency => {
        return !bundledDeps.some(bundledDep => dependency.startsWith(bundledDep));
    }).sort();
    const referenceGeneratedDeps = packageType === 'deb' ?
        dep_lists_1.referenceGeneratedDepsByArch[arch] :
        dep_lists_2.referenceGeneratedDepsByArch[arch];
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
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/merge_package_deps.py.
function mergePackageDeps(inputDeps) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwZW5kZW5jaWVzLWdlbmVyYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRlcGVuZGVuY2llcy1nZW5lcmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsWUFBWSxDQUFDOzs7QUFFYixpREFBMEM7QUFDMUMsNkJBQThCO0FBQzlCLDREQUEyRjtBQUMzRix5REFBcUY7QUFDckYsa0RBQXlGO0FBQ3pGLCtDQUFtRjtBQUNuRiwwQ0FBc0U7QUFDdEUsdUNBQTZEO0FBRTdELHFDQUFxQztBQUNyQyxxRUFBcUU7QUFDckUsMkRBQTJEO0FBQzNELHlEQUF5RDtBQUN6RCxtRkFBbUY7QUFDbkYsZ0ZBQWdGO0FBQ2hGLGlDQUFpQztBQUNqQyxNQUFNLCtCQUErQixHQUFZLElBQUksQ0FBQztBQUV0RCwrSEFBK0g7QUFDL0gsOEJBQThCO0FBQzlCLHNEQUFzRDtBQUN0RCxNQUFNLFdBQVcsR0FBRztJQUNuQixXQUFXO0lBQ1gsY0FBYztJQUNkLGdCQUFnQjtJQUNoQix1QkFBdUI7SUFDdkIsMEJBQTBCO0lBQzFCLHNCQUFzQjtJQUN0QixjQUFjO0NBQ2QsQ0FBQztBQUVGLFNBQWdCLGVBQWUsQ0FBQyxXQUEwQixFQUFFLFFBQWdCLEVBQUUsZUFBdUIsRUFBRSxJQUFZLEVBQUUsT0FBZ0I7SUFDcEksSUFBSSxXQUFXLEtBQUssS0FBSyxFQUFFO1FBQzFCLElBQUksQ0FBQyxJQUFBLDBCQUFrQixFQUFDLElBQUksQ0FBQyxFQUFFO1lBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLEdBQUcsSUFBSSxDQUFDLENBQUM7U0FDdEQ7UUFDRCxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1NBQzdDO0tBQ0Q7SUFDRCxJQUFJLFdBQVcsS0FBSyxLQUFLLElBQUksQ0FBQyxJQUFBLHVCQUFlLEVBQUMsSUFBSSxDQUFDLEVBQUU7UUFDcEQsTUFB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