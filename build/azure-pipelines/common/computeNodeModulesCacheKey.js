"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const { dirs } = require('../../npm/dirs');
const ROOT = path_1.default.join(__dirname, '../../../');
const shasum = crypto_1.default.createHash('sha256');
shasum.update(fs_1.default.readFileSync(path_1.default.join(ROOT, 'build/.cachesalt')));
shasum.update(fs_1.default.readFileSync(path_1.default.join(ROOT, '.npmrc')));
shasum.update(fs_1.default.readFileSync(path_1.default.join(ROOT, 'build', '.npmrc')));
shasum.update(fs_1.default.readFileSync(path_1.default.join(ROOT, 'remote', '.npmrc')));
// Add `package.json` and `package-lock.json` files
for (const dir of dirs) {
    const packageJsonPath = path_1.default.join(ROOT, dir, 'package.json');
    const packageJson = JSON.parse(fs_1.default.readFileSync(packageJsonPath).toString());
    const relevantPackageJsonSections = {
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies,
        optionalDependencies: packageJson.optionalDependencies,
        resolutions: packageJson.resolutions,
        distro: packageJson.distro
    };
    shasum.update(JSON.stringify(relevantPackageJsonSections));
    const packageLockPath = path_1.default.join(ROOT, dir, 'package-lock.json');
    shasum.update(fs_1.default.readFileSync(packageLockPath));
}
// Add any other command line arguments
for (let i = 2; i < process.argv.length; i++) {
    shasum.update(process.argv[i]);
}
process.stdout.write(shasum.digest('hex'));
//# sourceMappingURL=computeNodeModulesCacheKey.js.map