/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import pfs = require('vs/base/node/pfs');
import {IPluginDescription} from 'vs/platform/plugins/common/plugins';
import {TPromise} from 'vs/base/common/winjs.base';
import {groupBy, values} from 'vs/base/common/collections';
import paths = require('vs/base/common/paths');
import json = require('vs/base/common/json');
import {IPluginsMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {isValidPluginDescription} from 'vs/platform/plugins/node/pluginVersionValidator';
import * as semver from 'semver';

const MANIFEST_FILE = 'package.json';

export class PluginScanner {

	/**
	 * Scan the plugin defined in `absoluteFolderPath`
	 */
	public static scanPlugin(
		version: string,
		collector: IPluginsMessageCollector,
		absoluteFolderPath:string,
		isBuiltin:boolean
	) : TPromise<IPluginDescription>
	{
		absoluteFolderPath = paths.normalize(absoluteFolderPath);
		let builder = collector.scopeTo(absoluteFolderPath);
		let absoluteManifestPath = paths.join(absoluteFolderPath, MANIFEST_FILE);

		return pfs.readFile(absoluteManifestPath).then((manifestContents) => {
			let errors: string[] = [];
			let pluginDescFromFile: IPluginDescription = json.parse(manifestContents.toString(), errors);
			if (errors.length > 0) {
				errors.forEach((error) => {
					builder.error('Failed to parse ' + absoluteManifestPath + ': ' + error);
				});
				return null;
			}
			// This is a workaround to enable Salsa and avoid TS extension loading
			// for JavaScript (see https://github.com/Microsoft/vscode/issues/2225)
			if (pluginDescFromFile.name === 'typescript' && pluginDescFromFile.publisher === 'vscode' && (!!process.env['CODE_TSJS'] || !!process.env['VSCODE_TSJS'])) {
				pluginDescFromFile.activationEvents = pluginDescFromFile.activationEvents || [];
				if (pluginDescFromFile.activationEvents.indexOf('onLanguage:javascript') === -1) {
					pluginDescFromFile.activationEvents.push('onLanguage:javascript');
				}
				if (pluginDescFromFile.activationEvents.indexOf('onLanguage:javascriptreact') === -1) {
					pluginDescFromFile.activationEvents.push('onLanguage:javascriptreact');
				}
			}
			return pluginDescFromFile;
		}).then((pluginDescFromFile) => {
			if (pluginDescFromFile === null) {
				return null;
			}

			pluginDescFromFile.isBuiltin = isBuiltin;

			let notices: string[] = [];
			if (!isValidPluginDescription(version, absoluteFolderPath, pluginDescFromFile, notices)) {
				notices.forEach((error) => {
					builder.error(error);
				});
				return null;
			}

			// in this case the notices are warnings
			notices.forEach((error) => {
				builder.warn(error);
			});

			// id := `publisher.name`
			pluginDescFromFile.id = `${ pluginDescFromFile.publisher }.${ pluginDescFromFile.name }`;

			// main := absolutePath(`main`)
			if (pluginDescFromFile.main) {
				pluginDescFromFile.main = paths.normalize(paths.join(absoluteFolderPath, pluginDescFromFile.main));
			}

			pluginDescFromFile.extensionFolderPath = absoluteFolderPath;

			return pluginDescFromFile;
		}, (err) => {
			builder.error('Cannot read file ' + absoluteManifestPath + ': ' + err.message);
			return null;
		});
	}

	/**
	 * Scan a list of extensions defined in `absoluteFolderPath`
	 */
	public static scanPlugins(
		version: string,
		collector: IPluginsMessageCollector,
		absoluteFolderPath:string,
		isBuiltin:boolean
	) : TPromise<IPluginDescription[]>
	{
		let obsolete = TPromise.as({});

		if (!isBuiltin) {
			obsolete = pfs.readFile(paths.join(absoluteFolderPath, '.obsolete'), 'utf8')
				.then(raw => JSON.parse(raw))
				.then(null, err => ({}));
		}

		return obsolete.then(obsolete => {
			return pfs.readDirsInDir(absoluteFolderPath)
				.then(folders => TPromise.join(folders.map(f => this.scanPlugin(version, collector, paths.join(absoluteFolderPath, f), isBuiltin))))
				.then(plugins => plugins.filter(item => item !== null))
				// TODO: align with extensionsService
				.then(plugins => plugins.filter(p => !obsolete[`${ p.publisher }.${ p.name }-${ p.version }`]))
				.then(plugins => {
					const pluginsById = values(groupBy(plugins, p => p.id));
					return pluginsById.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);
				})
				.then(null, err => {
					collector.error(absoluteFolderPath, err);
					return [];
				});
		});
	}

	/**
	 * Combination of scanPlugin and scanPlugins: If a plugin manifest is found at root, we load just this plugin, otherwise we assume
	 * the folder contains multiple extensions.
	 */
	public static scanOneOrMultiplePlugins(
		version: string,
		collector: IPluginsMessageCollector,
		absoluteFolderPath:string,
		isBuiltin:boolean
	) : TPromise<IPluginDescription[]>
	{
		return pfs.fileExists(paths.join(absoluteFolderPath, MANIFEST_FILE)).then((exists) => {
			if (exists) {
				return this.scanPlugin(version, collector, absoluteFolderPath, isBuiltin).then((pluginDescription) => {
					if (pluginDescription === null) {
						return [];
					}
					return [pluginDescription];
				});
			}
			return this.scanPlugins(version, collector, absoluteFolderPath, isBuiltin);
		}, (err) => {
			collector.error(absoluteFolderPath, err);
			return [];
		});
	}
}