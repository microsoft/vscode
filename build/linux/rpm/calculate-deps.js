"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePackageDeps = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const dep_lists_1 = require("./dep-lists");
function generatePackageDeps(files) {
    const dependencies = files.map(file => calculatePackageDeps(file));
    const additionalDepsSet = new Set(dep_lists_1.additionalDeps);
    dependencies.push(additionalDepsSet);
    return dependencies;
}
exports.generatePackageDeps = generatePackageDeps;
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/calculate_package_deps.py.
function calculatePackageDeps(binaryPath) {
    try {
        if (!((0, fs_1.statSync)(binaryPath).mode & fs_1.constants.S_IXUSR)) {
            throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
        }
    }
    catch (e) {
        // The package might not exist. Don't re-throw the error here.
        console.error('Tried to stat ' + binaryPath + ' but failed.');
    }
    const findRequiresResult = (0, child_process_1.spawnSync)('/usr/lib/rpm/find-requires', { input: binaryPath + '\n' });
    if (findRequiresResult.status !== 0) {
        throw new Error(`find-requires failed with exit code ${findRequiresResult.status}.\nstderr: ${findRequiresResult.stderr}`);
    }
    const requires = new Set(findRequiresResult.stdout.toString('utf-8').trimEnd().split('\n'));
    return requires;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsY3VsYXRlLWRlcHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjYWxjdWxhdGUtZGVwcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxpREFBMEM7QUFDMUMsMkJBQXlDO0FBQ3pDLDJDQUE2QztBQUU3QyxTQUFnQixtQkFBbUIsQ0FBQyxLQUFlO0lBQ2xELE1BQU0sWUFBWSxHQUFrQixLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNsRixNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFDLDBCQUFjLENBQUMsQ0FBQztJQUNsRCxZQUFZLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDckMsT0FBTyxZQUFZLENBQUM7QUFDckIsQ0FBQztBQUxELGtEQUtDO0FBRUQsMEhBQTBIO0FBQzFILFNBQVMsb0JBQW9CLENBQUMsVUFBa0I7SUFDL0MsSUFBSTtRQUNILElBQUksQ0FBQyxDQUFDLElBQUEsYUFBUSxFQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksR0FBRyxjQUFTLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDckQsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLFVBQVUsdUNBQXVDLENBQUMsQ0FBQztTQUM3RTtLQUNEO0lBQUMsT0FBTyxDQUFDLEVBQUU7UUFDWCw4REFBOEQ7UUFDOUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsR0FBRyxVQUFVLEdBQUcsY0FBYyxDQUFDLENBQUM7S0FDOUQ7SUFFRCxNQUFNLGtCQUFrQixHQUFHLElBQUEseUJBQVMsRUFBQyw0QkFBNEIsRUFBRSxFQUFFLEtBQUssRUFBRSxVQUFVLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUNqRyxJQUFJLGtCQUFrQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDcEMsTUFBTSxJQUFJLEtBQUssQ0FBQyx1Q0FBdUMsa0JBQWtCLENBQUMsTUFBTSxjQUFjLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7S0FDM0g7SUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzVGLE9BQU8sUUFBUSxDQUFDO0FBQ2pCLENBQUMifQ==