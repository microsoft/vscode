/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const buildMap: { [name: string]: string[] } = {};
const buildMapKeys: { [name: string]: string[] } = {};
const entryPoints: { [entryPoint: string]: string[] } = {};

export interface ILocalizeInfo {
	key: string;
	comment: string[];
}

export function localize(data: ILocalizeInfo | string, message: string, ...args: (string | number | boolean | undefined | null)[]): string {
	throw new Error(`Not supported at build time!`);
}

/**
 * Invoked by the loader at build-time
 */
export function load(name: string, req: AMDLoader.IRelativeRequire, load: AMDLoader.IPluginLoadCallback, config: AMDLoader.IConfigurationOptions): void {
	if (!name || name.length === 0) {
		load({ localize });
	} else {
		req([name + '.nls', name + '.nls.keys'], function (messages: string[], keys: string[]) {
			buildMap[name] = messages;
			buildMapKeys[name] = keys;
			load(messages);
		});
	}
}

/**
 * Invoked by the loader at build-time
 */
export function write(pluginName: string, moduleName: string, write: AMDLoader.IPluginWriteCallback): void {
	const entryPoint = write.getEntryPoint();

	entryPoints[entryPoint] = entryPoints[entryPoint] || [];
	entryPoints[entryPoint].push(moduleName);

	if (moduleName !== entryPoint) {
		write.asModule(pluginName + '!' + moduleName, 'define([\'vs/nls\', \'vs/nls!' + entryPoint + '\'], function(nls, data) { return nls.create("' + moduleName + '", data); });');
	}
}

/**
 * Invoked by the loader at build-time
 */
export function writeFile(pluginName: string, moduleName: string, req: AMDLoader.IRelativeRequire, write: AMDLoader.IPluginWriteFileCallback, config: AMDLoader.IConfigurationOptions): void {
	if (entryPoints.hasOwnProperty(moduleName)) {
		const fileName = req.toUrl(moduleName + '.nls.js');
		const contents = [
			'/*---------------------------------------------------------',
			' * Copyright (c) Microsoft Corporation. All rights reserved.',
			' *--------------------------------------------------------*/'
		],
			entries = entryPoints[moduleName];

		const data: { [moduleName: string]: string[] } = {};
		for (let i = 0; i < entries.length; i++) {
			data[entries[i]] = buildMap[entries[i]];
		}

		contents.push('define("' + moduleName + '.nls", ' + JSON.stringify(data, null, '\t') + ');');
		write(fileName, contents.join('\r\n'));
	}
}

/**
 * Invoked by the loader at build-time
 */
export function finishBuild(write: AMDLoader.IPluginWriteFileCallback): void {
	write('nls.metadata.json', JSON.stringify({
		keys: buildMapKeys,
		messages: buildMap,
		bundles: entryPoints
	}, null, '\t'));
}
