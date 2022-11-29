/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

const webpack = require('webpack');
const { Mangler } = require('../build/lib/mangleTypeScript');

let map;
/**
 * @param {string} projectPath
 */
function getMangledFileContents(projectPath) {
	if (!map) {
		const ts2tsMangler = new Mangler(projectPath, console.log);
		map = ts2tsMangler.computeNewFileContents();
	}

	return map;
}

/**
 * @type {webpack.LoaderDefinitionFunction}
 */
module.exports = async function (source, sourceMap, meta) {
	const options = this.getOptions();
	const callback = this.async();

	const fileContentsMap = getMangledFileContents(options.configFile);

	const newContents = fileContentsMap.get(this.resourcePath);
	callback(null, newContents ?? source, sourceMap, meta);
};
