/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRpmDependencies = void 0;
const child_process_1 = require("child_process");
const rpmDependencyScripts_1 = require("./linux-installer/rpm/rpmDependencyScripts");
const path_1 = require("path");
const fs_1 = require("fs");
function getRpmDependencies(buildDir) {
    // Get the files for which we want to find dependencies.
    const findResult = (0, child_process_1.spawnSync)('find', [buildDir, '-name', '*.node']);
    if (findResult.status) {
        console.error('Error finding files:');
        console.error(findResult.stderr.toString());
        return [];
    }
    // Filter the files and add on the Code binary.
    // const files: string[] = findResult.stdout.toString().split('\n').filter((file) => {
    // 	return !file.includes('obj.target') && file.includes('build/Release');
    // });
    const files = findResult.stdout.toString().split('\n');
    const getAppNameProc = (0, child_process_1.spawnSync)('node', ['-p', 'require(\"$APP_ROOT/resources/app/product.json\").applicationName']);
    if (getAppNameProc.status) {
        console.error('Error getting app name:');
        console.error(getAppNameProc.stderr.toString());
        return [];
    }
    const appName = getAppNameProc.stdout.toString();
    const appPath = `${buildDir}/${appName}`;
    files.push(appPath);
    // Generate the dependencies.
    const dependencies = files.map((file) => (0, rpmDependencyScripts_1.calculatePackageDeps)(file));
    // Fetch additional dependencies file.
    const additionalDeps = (0, fs_1.readFileSync)((0, path_1.resolve)(__dirname, 'linux-installer/rpm/additional_deps'));
    const additionalDepsSet = new Set(additionalDeps.toString('utf-8').trim().split('\n'));
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
