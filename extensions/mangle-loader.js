/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

const fs = require('fs');
const webpack = require('webpack');
const fancyLog = require('fancy-log');
const ansiColors = require('ansi-colors');
const { Mangler } = require('../build/lib/mangleTypeScript');

/**
 * Map of project paths to mangled file contents
 *
 * @type {Map<string, Map<string, { out: string; sourceMap?: string }>>}
 */
const mangleMap = new Map();

/**
 * @param {string} projectPath
 */
function getMangledFileContents(projectPath) {
	let entry = mangleMap.get(projectPath);
	if (!entry) {
		const log = (...data) => fancyLog(ansiColors.blue('[mangler]'), ...data);
		log(`Mangling ${projectPath}`);
		const ts2tsMangler = new Mangler(projectPath, log);
		entry = ts2tsMangler.computeNewFileContents();
		mangleMap.set(projectPath, entry);
	}

	return entry;
}

/**
 * @type {webpack.LoaderDefinitionFunction}
 */
module.exports = async function (source, sourceMap, meta) {
	if (source !== fs.readFileSync(this.resourcePath).toString()) {
		// File content has changed by previous webpack steps.
		// Skip mangling.
		return source;
	}

	const options = this.getOptions();
	const callback = this.async();

	const fileContentsMap = getMangledFileContents(options.configFile);

	const newContents = fileContentsMap.get(this.resourcePath);
	callback(null, newContents?.out ?? source, sourceMap, meta);
};
