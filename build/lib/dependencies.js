"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionDependencies = void 0;
const path = require("path");
const cp = require("child_process");
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
    return [...new Set(result)];
}
exports.getProductionDependencies = getProductionDependencies;
if (require.main === module) {
    const root = path.dirname(path.dirname(__dirname));
    console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwZW5kZW5jaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVwZW5kZW5jaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLDZCQUE2QjtBQUM3QixvQ0FBb0M7QUFDcEMsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBaUI1QyxTQUFTLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxJQUFVO0lBQ25ELElBQUksV0FBVyxDQUFDO0lBRWhCLElBQUk7UUFDSCxXQUFXLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNyQztJQUFDLE9BQU8sR0FBRyxFQUFFO1FBQ2IsR0FBRyxDQUFDLE9BQU8sSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNoQyxPQUFPLENBQUMsSUFBSSxDQUFDLDJCQUEyQixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNyRCxPQUFPLElBQUksQ0FBQztLQUNaO0lBRUQsbUNBQW1DO0lBQ25DLElBQUksV0FBVyxDQUFDLE9BQU8sS0FBSyxXQUFXLENBQUMsS0FBSyxFQUFFO1FBQzlDLE9BQU8sSUFBSSxDQUFDO0tBQ1o7SUFFRCxNQUFNLElBQUksR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDO0lBQzlCLE1BQU0sT0FBTyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUM7SUFDcEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDL0MsTUFBTSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBRXBCLEtBQUssTUFBTSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxFQUFFO1FBQzFDLE1BQU0sR0FBRyxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENB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