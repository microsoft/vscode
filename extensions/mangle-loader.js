/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

const fs = require('fs');
const webpack = require('webpack');
const fancyLog = require('fancy-log');
const ansiColors = require('ansi-colors');
const { Mangler } = require('../build/lib/mangle/index');

/**
 * Map of project paths to mangled file contents
 *
 * @type {Map<string, Promise<Map<string, { out: string; sourceMap?: string }>>>}
 */
const mangleMap = new Map();

const sequentializer = Promise.resolve();

/**
 * @param {string} projectPath
 */
function getMangledFileContents(projectPath) {
	let entry = mangleMap.get(projectPath);
	if (!entry) {
		const log = (...data) => fancyLog(ansiColors.blue('[mangler]'), ...data);
		log(`Mangling ${projectPath}`);
		const ts2tsMangler = new Mangler(projectPath, log, { mangleExports: true, manglePrivateFields: true });
		const mangleTask = () => {
			return ts2tsMangler.computeNewFileContents().finally(() => {
				ts2tsMangler.dispose();
			});
		};
		entry = sequentializer.then(mangleTask, mangleTask);
		mangleMap.set(projectPath, entry);
	}

	return entry;
}

/**
 * @type {webpack.LoaderDefinitionFunction}
 */
module.exports = async function (source, sourceMap, meta) {
	if (this.mode !== 'production') {
		// Only enable mangling in production builds
		return source;
	}

	const options = this.getOptions();
	if (options.disabled) {
		// Dynamically disabled
		return source;
	}

	if (source !== fs.readFileSync(this.resourcePath).toString()) {
		// File content has changed by previous webpack steps.
		// Skip mangling.
		return source;
	}

	const callback = this.async();

	const fileContentsMap = await getMangledFileContents(options.configFile);

	const newContents = fileContentsMap.get(this.resourcePath);
	callback(null, newContents?.out ?? source, sourceMap, meta);
};
