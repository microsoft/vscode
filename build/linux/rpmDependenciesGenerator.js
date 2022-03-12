/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRpmDependencies = void 0;
const child_process_1 = require("child_process");
const rpmDependencyScripts_1 = require("./linux-installer/rpm/rpmDependencyScripts");
const additionalDeps_1 = require("./linux-installer/rpm/additionalDeps");
function getRpmDependencies(buildDir, applicationName) {
    // Get the files for which we want to find dependencies.
    const findResult = (0, child_process_1.spawnSync)('find', [buildDir, '-name', '*.node']);
    if (findResult.status) {
        console.error('Error finding files:');
        console.error(findResult.stderr.toString());
        return [];
    }
    const files = findResult.stdout.toString().trimEnd().split('\n');
    const appPath = `${buildDir}/${applicationName}`;
    files.push(appPath);
    // Generate the dependencies.
    const dependencies = files.map((file) => (0, rpmDependencyScripts_1.calculatePackageDeps)(file));
    // Add additional dependencies.
    const additionalDepsSet = new Set(additionalDeps_1.additionalDeps);
    dependencies.push(additionalDepsSet);
    // Merge all the dependencies.
    const mergedDependencies = (0, rpmDependencyScripts_1.mergePackageDeps)(dependencies);
    const sortedDependencies = [];
    for (const dependency of mergedDependencies) {
        sortedDependencies.push(dependency);
    }
    sortedDependencies.sort();
    return sortedDependencies;
}
exports.getRpmDependencies = getRpmDependencies;
