/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const semver = require('semver');
const cp = require('child_process');

// { name, version, path }[]
function flattenDependencies(node_modules, tree) {
	const result = [];
	const name = tree.name.replace(/@[^@]+$/, '');

	if (tree.name !== 'root' && !/@[\^~]/.test(tree.name)) {
		const dependencyPath = path.join(node_modules, name);
		const version = tree.name.replace(/^[^@]+@/, '');

		if (semver.valid(version)) {
			result.push({ name, version, path: dependencyPath });
		}
	}

	for (const child of (tree.children || [])) {
		const subNodeModulesPath = name === 'root'
			? node_modules
			: path.join(node_modules, name, 'node_modules');

		result.push(...flattenDependencies(subNodeModulesPath, child));
	}

	return result;
}

function getProductionDependencies(cwd) {
	const raw = cp.execSync('yarn list --json', {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, NODE_ENV: 'production' }
	});

	const match = /^{"type":"tree".*$/m.exec(raw);

	if (!match || match.length !== 1) {
		throw new Error('Could not parse result of `yarn list --json`');
	}

	const trees = JSON.parse(match[0]).data.trees;
	const root = { name: 'root', children: trees };
	const list = flattenDependencies(path.join(cwd, 'node_modules'), root);

	list.sort((a, b) => a.name < b.name ? -1 : 1);
	return list;
}

module.exports.getProductionDependencies = getProductionDependencies;

if (require.main === module) {
	const root = path.dirname(__dirname);
	console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
