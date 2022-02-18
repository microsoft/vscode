"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergePackageDeps = exports.calculatePackageDeps = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/calculate_package_deps.py
function calculatePackageDeps(binaryPath) {
    if (((0, fs_1.statSync)(binaryPath).mode & 0o111) === 0) {
        throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
    }
    const findRequiresResult = (0, child_process_1.spawnSync)('/usr/lib/rpm/find-requires', [], { input: binaryPath + '\n' });
    if (findRequiresResult.status !== 0) {
        throw new Error(`find-requires failed with exit code ${findRequiresResult.status}.\nstderr: ${findRequiresResult.stderr}`);
    }
    const requires = new Set(findRequiresResult.stdout.toString('utf-8').trimEnd().split('\n'));
    // we only need to use provides to check for newer dependencies
    // const provides = readFileSync('dist_package_provides.json');
    // const jsonProvides = JSON.parse(provides.toString('utf-8'));
    return requires;
}
exports.calculatePackageDeps = calculatePackageDeps;
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/merge_package_deps.py
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
exports.mergePackageDeps = mergePackageDeps;
