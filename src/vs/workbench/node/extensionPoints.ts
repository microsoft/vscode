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
import Types = require('vs/base/common/types');
import {IPluginsMessageCollector, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {isValidPluginDescription} from 'vs/platform/plugins/node/pluginVersionValidator';
import * as semver from 'semver';

const MANIFEST_FILE = 'package.json';

const devMode = !!process.env['VSCODE_DEV'];
interface NlsConfiguration {
	locale: string;
	pseudo: boolean;
}
const nlsConfig = function(): NlsConfiguration {
	if (process.env['VSCODE_NLS_CONFIG']) {
		try {
			return JSON.parse(process.env['VSCODE_NLS_CONFIG']);
		} catch (err) {
			return {
				locale: undefined,
				pseudo: false
			};
		}
	}
}();

export class PluginScanner {

	private static findMessageBundle(basename: string): TPromise<string> {
		return new TPromise<string>((c ,e, p) => {
			function loop(basename: string, locale: string): void {
				let toCheck = `${basename}.nls.${locale}.json`;
				pfs.fileExists(toCheck).then(exists => {
					if (exists) {
						c(toCheck);
					}
					let index = locale.lastIndexOf('-');
					if (index === -1) {
						c(`${basename}.nls.json`);
					} else {
						locale = locale.substring(0, index);
						loop(basename, locale);
					}
				});
			}

			if (devMode || nlsConfig.pseudo || !nlsConfig.locale) {
				return c(basename + '.nls.json');
			}
			loop(basename, nlsConfig.locale);
		});
	}

	/**
	 * This routine make the following assumptions:
	 * The root element is a object literal
	 * Strings to replace are one values of a key. So for example string[] are ignored.
	 * This is done to speed things up.
	 */
	private static replaceStrings<T>(literal: T, messages: { [key: string]: string; }, builder: IMessageCollector): void {
		Object.keys(literal).forEach(key => {
			if (literal.hasOwnProperty(key)) {
				let value = literal[key];
				if (Types.isString(value)) {
					let str = <string>value;
					let length = str.length;
					if (length > 1 && str[0] === '%' && str[length - 1] === '%') {
						let messageKey = str.substr(1, length - 2);
						let message = messages[messageKey];
						if (message) {
							if (nlsConfig.pseudo) {
								// FF3B and FF3D is the Unicode zenkaku representation for [ and ]
								message = '\uFF3B' + message.replace(/[aouei]/g, '$&$&') + '\uFF3D';
							}
							literal[key] = message;
						} else {
							builder.warn(`Couldn't find message for key ${messageKey}.`);
						}
					}
				} else if (Types.isObject(value)) {
					PluginScanner.replaceStrings(value, messages, builder);
				} else if (Types.isArray(value)) {
					(<any[]>value).forEach(element => {
						if (Types.isObject(element)) {
							PluginScanner.replaceStrings(element, messages, builder);
						}
					});
				}
			}
		});
		return;
	}

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

			let extension = paths.extname(absoluteManifestPath);
			let basename = absoluteManifestPath.substr(0, absoluteManifestPath.length - extension.length);
			return pfs.fileExists(basename + '.nls' + extension).then(exists => {
				if (!exists) {
					return pluginDescFromFile;
				}
				return PluginScanner.findMessageBundle(basename).then(messageBundle => {
					if (!messageBundle) {
						return pluginDescFromFile;
					}
					return pfs.readFile(messageBundle).then(messageBundleContent => {
						let errors: string[] = [];
						let messages: { [key: string]: string; } = json.parse(messageBundleContent.toString(), errors);
						if (errors.length > 0) {
							errors.forEach((error) => {
								builder.error('Failed to parse ' + messageBundle + ': ' + error);
							});
							return pluginDescFromFile;
						}
						PluginScanner.replaceStrings(pluginDescFromFile, messages, builder);
						return pluginDescFromFile;
					});
				});
			});
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