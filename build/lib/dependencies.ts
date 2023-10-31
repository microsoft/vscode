/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
const parseSemver = require('parse-semver');
const root = fs.realpathSync(path.dirname(path.dirname(__dirname)));

interface Tree {
	readonly name: string;
	readonly children?: Tree[];
}

interface FlatDependency {
	readonly name: string;
	readonly version: string;
	readonly path: string;
}

interface Dependency extends FlatDependency {
	readonly children: Dependency[];
}

function asYarnDependency(prefix: string, tree: Tree): Dependency | null {
	let parseResult;

	try {
		parseResult = parseSemver(tree.name);
	} catch (err) {
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

function getYarnProductionDependencies(folderPath: string): Dependency[] {
	const raw = cp.execSync('yarn list --json', { cwd: folderPath, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, 'inherit'] });
	const match = /^{"type":"tree".*$/m.exec(raw);

	if (!match || match.length !== 1) {
		throw new Error('Could not parse result of `yarn list --json`');
	}

	const trees = JSON.parse(match[0]).data.trees as Tree[];

	return trees
		.map(tree => asYarnDependency(path.join(folderPath, 'node_modules'), tree))
		.filter<Dependency>((dep): dep is Dependency => !!dep);
}

export function getProductionDependencies(folderPath: string): FlatDependency[] {
	const result: FlatDependency[] = [];
	const deps = getYarnProductionDependencies(folderPath);
	const flatten = (dep: Dependency) => { result.push({ name: dep.name, version: dep.version, path: dep.path }); dep.children.forEach(flatten); };
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

if (require.main === module) {
	console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
