"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionDependencies = void 0;
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const parseSemver = require('parse-semver');
const root = fs.realpathSync(path.dirname(path.dirname(__dirname)));
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
function getYarnProductionDependencies(folderPath) {
    const raw = cp.execSync('yarn list --json', { cwd: folderPath, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, 'inherit'] });
    const match = /^{"type":"tree".*$/m.exec(raw);
    if (!match || match.length !== 1) {
        throw new Error('Could not parse result of `yarn list --json`');
    }
    const trees = JSON.parse(match[0]).data.trees;
    return trees
        .map(tree => asYarnDependency(path.join(folderPath, 'node_modules'), tree))
        .filter((dep) => !!dep);
}
function getProductionDependencies(folderPath) {
    const result = [];
    const deps = getYarnProductionDependencies(folderPath);
    const flatten = (dep) => { result.push({ name: dep.name, version: dep.version, path: dep.path }); dep.children.forEach(flatten); };
    deps.forEach(flatten);
    // Account for distro npm dependencies
    const realFolderPath = fs.realpathSync(folderPath);
    const relativeFolderPath = path.relative(root, realFolderPath);
    const distroPackageJsonPath = `${root}/.build/distro/npm/${relativeFolderPath}/package.json`;
    if (fs.existsSync(distroPackageJsonPath)) {
        const distroPackageJson = JSON.parse(fs.readFileSync(distroPackageJsonPath, 'utf8'));
        const distroDependencyNames = Object.keys(distroPackageJson.dependencies ?? {});
        for (const name of distroDependencyNames) {
            result.push({
                name,
                version: distroPackageJson.dependencies[name],
                path: path.join(realFolderPath, 'node_modules', name)
            });
        }
    }
    return [...new Set(result)];
}
exports.getProductionDependencies = getProductionDependencies;
if (require.main === module) {
    console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwZW5kZW5jaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVwZW5kZW5jaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0Isb0NBQW9DO0FBQ3BDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUM1QyxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFpQnBFLFNBQVMsZ0JBQWdCLENBQUMsTUFBYyxFQUFFLElBQVU7SUFDbkQsSUFBSSxXQUFXLENBQUM7SUFFaEIsSUFBSTtRQUNILFdBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3JDO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDYixHQUFHLENBQUMsT0FBTyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2hDLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkJBQTJCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sSUFBSSxDQUFDO0tBQ1o7SUFFRCxtQ0FBbUM7SUFDbkMsSUFBSSxXQUFXLENBQUMsT0FBTyxLQUFLLFdBQVcsQ0FBQyxLQUFLLEVBQUU7UUFDOUMsT0FBTyxJQUFJLENBQUM7S0FDWjtJQUVELE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUM7SUFDOUIsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQztJQUNwQyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMvQyxNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUM7SUFFcEIsS0FBSyxNQUFNLEtBQUssSUFBSSxD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