/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const es = require('event-stream');
const rename = require('gulp-rename');
const vfs = require('vinyl-fs');
const ext = require('./extensions');
const util = require('gulp-util');

const root = path.dirname(path.dirname(__dirname));
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const builtInExtensions = require('../builtInExtensions.json');
const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');

function getExtensionPath(extension) {
	return path.join(root, '.build', 'builtInExtensions', extension.name);
}

function isUpToDate(extension) {
	const packagePath = path.join(getExtensionPath(extension), 'package.json');

	if (!fs.existsSync(packagePath)) {
		return false;
	}

	const packageContents = fs.readFileSync(packagePath, { encoding: 'utf8' });

	try {
		const diskVersion = JSON.parse(packageContents).version;
		return (diskVersion === extension.version);
	} catch (err) {
		return false;
	}
}

function syncMarketplaceExtension(extension) {
	if (isUpToDate(extension)) {
		util.log(util.colors.blue('[marketplace]'), `${extension.name}@${extension.version}`, util.colors.green('✔︎'));
		return es.readArray([]);
	}

	rimraf.sync(getExtensionPath(extension));

	return ext.fromMarketplace(extension.name, extension.version)
		.pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`))
		.pipe(vfs.dest('.build/builtInExtensions'))
		.on('end', () => util.log(util.colors.blue('[marketplace]'), extension.name, util.colors.green('✔︎')));
}

function syncExtension(extension, controlState) {
	switch (controlState) {
		case 'disabled':
			util.log(util.colors.blue('[disabled]'), util.colors.gray(extension.name));
			return es.readArray([]);

		case 'marketplace':
			return syncMarketplaceExtension(extension);

		default:
			if (!fs.existsSync(controlState)) {
				util.log(util.colors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but that path does not exist.`));
				return es.readArray([]);

			} else if (!fs.existsSync(path.join(controlState, 'package.json'))) {
				util.log(util.colors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but there is no 'package.json' file in that directory.`));
				return es.readArray([]);
			}

			util.log(util.colors.blue('[local]'), `${extension.name}: ${util.colors.cyan(controlState)}`, util.colors.green('✔︎'));
			return es.readArray([]);
	}
}

function readControlFile() {
	try {
		return JSON.parse(fs.readFileSync(controlFilePath, 'utf8'));
	} catch (err) {
		return {};
	}
}

function writeControlFile(control) {
	mkdirp.sync(path.dirname(controlFilePath));
	fs.writeFileSync(controlFilePath, JSON.stringify(control, null, 2));
}

function main() {
	util.log('Syncronizing built-in extensions...');
	util.log(`You can manage built-in extensions with the ${util.colors.cyan('--builtin')} flag`);

	const control = readControlFile();
	const streams = [];

	for (const extension of builtInExtensions) {
		let controlState = control[extension.name] || 'marketplace';
		control[extension.name] = controlState;

		streams.push(syncExtension(extension, controlState));
	}

	writeControlFile(control);

	es.merge(streams)
		.on('error', err => {
			console.error(err);
			process.exit(1);
		})
		.on('end', () => {
			process.exit(0);
		});
}

main();
