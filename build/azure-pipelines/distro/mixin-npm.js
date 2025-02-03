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
const { dirs } = require('../../npm/dirs');
function log(...args) {
    console.log(`[${new Date().toLocaleTimeString('en', { hour12: false })}]`, '[distro]', ...args);
}
function mixin(mixinPath) {
    if (!fs_1.default.existsSync(`${mixinPath}/node_modules`)) {
        log(`Skipping distro npm dependencies: ${mixinPath} (no node_modules)`);
        return;
    }
    log(`Mixing in distro npm dependencies: ${mixinPath}`);
    const distroPackageJson = JSON.parse(fs_1.default.readFileSync(`${mixinPath}/package.json`, 'utf8'));
    const targetPath = path_1.default.relative('.build/distro/npm', mixinPath);
    for (const dependency of Object.keys(distroPackageJson.dependencies)) {
        fs_1.default.rmSync(`./${targetPath}/node_modules/${dependency}`, { recursive: true, force: true });
        fs_1.default.cpSync(`${mixinPath}/node_modules/${dependency}`, `./${targetPath}/node_modules/${dependency}`, { recursive: true, force: true, dereference: true });
    }
    log(`Mixed in distro npm dependencies: ${mixinPath} ✔︎`);
}
function main() {
    log(`Mixing in distro npm dependencies...`);
    const mixinPaths = dirs.filter(d => /^.build\/distro\/npm/.test(d));
    for (const mixinPath of mixinPaths) {
        mixin(mixinPath);
    }
}
main();
//# sourceMappingURL=mixin-npm.js.map