/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

function npmInstallSync(location) {
	const result = cp.spawnSync(npm, ['install'], {
		cwd: location,
		stdio: 'inherit'
	});

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

npmInstallSync('extensions'); // node modules shared by all extensions

const extensions = [
	'vscode-api-tests',
	'vscode-colorize-tests',
	'json',
	'configuration-editing',
	'extension-editing',
	'markdown',
	'typescript',
	'php',
	'javascript',
	'css',
	'html',
	'git',
	'gulp'
];

extensions.forEach(extension => npmInstallSync(`extensions/${extension}`));

function rmDuplicateModulesSync() {

	function fetchModuleIds(basepath) {
		const result = new Map();
		for (const candidate of fs.readdirSync(path.join(basepath, 'node_modules'))) {
			try {
				let raw = fs.readFileSync(path.join(basepath, 'node_modules', candidate, 'package.json'));
				let data = JSON.parse(raw);
				result.set(data._id, path.join(basepath, 'node_modules', candidate));
			} catch (e) {
				if (e.code !== 'ENOENT') {
					throw e;
				}
			}
		}
		return result;
	}

	const duplicates = new Set();
	const baseModules = fetchModuleIds('');

	for (const extension of extensions) {
		const extensionModules = fetchModuleIds(`extensions/${extension}`);
		for (let [key, value] of extensionModules) {
			if (baseModules.has(key)) {
				duplicates.add(value);
			}
		}
	}

	for (let duplicate of duplicates) {
		console.log(`REMOVING duplicate module '${duplicate}'`);
		rimraf.sync(path.join(process.cwd(), duplicate));
	}
}

rmDuplicateModulesSync();
