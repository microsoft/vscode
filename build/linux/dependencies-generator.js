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
// Based on https://source.chromium.org/chromium/chromium/src/+/refs/tags/114.0.5735.199:chrome/installer/linux/BUILD.gn;l=64-80
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwZW5kZW5jaWVzLWdlbmVyYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRlcGVuZGVuY2llcy1nZW5lcmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsWUFBWSxDQUFDOzs7QUFFYixpREFBMEM7QUFDMUMsNkJBQThCO0FBQzlCLDREQUEyRjtBQUMzRix5REFBcUY7QUFDckYsa0RBQXlGO0FBQ3pGLCtDQUFtRjtBQUNuRiwwQ0FBc0U7QUFDdEUsdUNBQTZEO0FBRTdELHFDQUFxQztBQUNyQyxxRUFBcUU7QUFDckUsMkRBQTJEO0FBQzNELHlEQUF5RDtBQUN6RCxtRkFBbUY7QUFDbkYsZ0ZBQWdGO0FBQ2hGLGlDQUFpQztBQUNqQyxNQUFNLCtCQUErQixHQUFZLElBQUksQ0FBQztBQUV0RCxnSUFBZ0k7QUFDaEksOEJBQThCO0FBQzlCLHNEQUFzRDtBQUN0RCxNQUFNLFdBQVcsR0FBRztJQUNuQixXQUFXO0lBQ1gsY0FBYztJQUNkLGdCQUFnQjtJQUNoQixzQkFBc0I7SUFDdEIsY0FBYztDQUNkLENBQUM7QUFFRixTQUFnQixlQUFlLENBQUMsV0FBMEIsRUFBRSxRQUFnQixFQUFFLGVBQXVCLEVBQUUsSUFBWSxFQUFFLE9BQWdCO0lBQ3BJLElBQUksV0FBVyxLQUFLLEtBQUssRUFBRTtRQUMxQixJQUFJLENBQUMsSUFBQSwwQkFBa0IsRUFBQyxJQUFJLENBQUMsRUFBRTtZQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixHQUFHLElBQUksQ0FBQyxDQUFDO1NBQ3REO1FBQ0QsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLENBQUMsQ0FBQztTQUM3QztLQUNEO0lBQ0QsSUFBSSxXQUFXLEtBQUssS0FBSyxJQUFJLENBQUMsSUFBQSx1QkFBZSxFQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3BELE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLEdB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