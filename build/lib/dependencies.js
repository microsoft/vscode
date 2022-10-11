"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionDependencies = void 0;
const path = __importStar(require("path"));
const cp = __importStar(require("child_process"));
const _ = __importStar(require("underscore"));
const parseSemver = require('parse-semver');
function asYarnDependency(prefix, tree) {
    let parseResult;
    try {
        parseResult = parseSemver(tree.name);
    }
    catch (err) {
        err.message += `: ${tree.name}`;
        console.warn(`Could not parse semver: ${tree.name}`);
        return null;
    }
    // not an actual dependency in disk
    if (parseResult.version !== parseResult.range) {
        return null;
    }
    const name = parseResult.name;
    const version = parseResult.version;
    const dependencyPath = path.join(prefix, name);
    const children = [];
    for (const child of (tree.children || [])) {
        const dep = asYarnDependency(path.join(prefix, name, 'node_modules'), child);
        if (dep) {
            children.push(dep);
        }
    }
    return { name, version, path: dependencyPath, children };
}
function getYarnProductionDependencies(cwd) {
    const raw = cp.execSync('yarn list --json', { cwd, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, 'inherit'] });
    const match = /^{"type":"tree".*$/m.exec(raw);
    if (!match || match.length !== 1) {
        throw new Error('Could not parse result of `yarn list --json`');
    }
    const trees = JSON.parse(match[0]).data.trees;
    return trees
        .map(tree => asYarnDependency(path.join(cwd, 'node_modules'), tree))
        .filter((dep) => !!dep);
}
function getProductionDependencies(cwd) {
    const result = [];
    const deps = getYarnProductionDependencies(cwd);
    const flatten = (dep) => { result.push({ name: dep.name, version: dep.version, path: dep.path }); dep.children.forEach(flatten); };
    deps.forEach(flatten);
    return _.uniq(result);
}
exports.getProductionDependencies = getProductionDependencies;
if (require.main === module) {
    const root = path.dirname(path.dirname(__dirname));
    console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
