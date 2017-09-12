/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as Platform from 'vs/base/common/platform';
import pfs = require('vs/base/node/pfs');
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { groupBy, values } from 'vs/base/common/collections';
import { join, normalize, extname } from 'path';
import json = require('vs/base/common/json');
import Types = require('vs/base/common/types');
import { isValidExtensionDescription } from 'vs/platform/extensions/node/extensionValidator';
import * as semver from 'semver';
import { getIdAndVersionFromLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';

const MANIFEST_FILE = 'package.json';

const devMode = !!process.env['VSCODE_DEV'];
interface NlsConfiguration {
	locale: string;
	pseudo: boolean;
}
const nlsConfig: NlsConfiguration = {
	locale: Platform.locale,
	pseudo: Platform.locale === 'pseudo'
};

export interface ILog {
	error(source: string, message: string): void;
	warn(source: string, message: string): void;
	info(source: string, message: string): void;
}

abstract class ExtensionManifestHandler {

	protected _ourVersion: string;
	protected _log: ILog;
	protected _absoluteFolderPath: string;
	protected _isBuiltin: boolean;
	protected _absoluteManifestPath: string;

	constructor(ourVersion: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean) {
		this._ourVersion = ourVersion;
		this._log = log;
		this._absoluteFolderPath = absoluteFolderPath;
		this._isBuiltin = isBuiltin;
		this._absoluteManifestPath = join(absoluteFolderPath, MANIFEST_FILE);
	}
}

class ExtensionManifestParser extends ExtensionManifestHandler {

	public parse(): TPromise<IExtensionDescription> {
		return pfs.readFile(this._absoluteManifestPath).then((manifestContents) => {
			try {
				return JSON.parse(manifestContents.toString());
			} catch (e) {
				this._log.error(this._absoluteFolderPath, nls.localize('jsonParseFail', "Failed to parse {0}: {1}.", this._absoluteManifestPath, getParseErrorMessage(e.message)));
			}
			return null;
		}, (err) => {
			if (err.code === 'ENOENT') {
				return null;
			}

			this._log.error(this._absoluteFolderPath, nls.localize('fileReadFail', "Cannot read file {0}: {1}.", this._absoluteManifestPath, err.message));
			return null;
		});
	}
}

class ExtensionManifestNLSReplacer extends ExtensionManifestHandler {

	public replaceNLS(extensionDescription: IExtensionDescription): TPromise<IExtensionDescription> {
		let extension = extname(this._absoluteManifestPath);
		let basename = this._absoluteManifestPath.substr(0, this._absoluteManifestPath.length - extension.length);

		return pfs.fileExists(basename + '.nls' + extension).then(exists => {
			if (!exists) {
				return extensionDescription;
			}
			return ExtensionManifestNLSReplacer.findMessageBundles(basename).then((messageBundle) => {
				if (!messageBundle.localized) {
					return extensionDescription;
				}
				return pfs.readFile(messageBundle.localized).then(messageBundleContent => {
					let errors: json.ParseError[] = [];
					let messages: { [key: string]: string; } = json.parse(messageBundleContent.toString(), errors);

					return ExtensionManifestNLSReplacer.resolveOriginalMessageBundle(messageBundle.original, errors).then(originalMessages => {
						if (errors.length > 0) {
							errors.forEach((error) => {
								this._log.error(this._absoluteFolderPath, nls.localize('jsonsParseFail', "Failed to parse {0} or {1}: {2}.", messageBundle.localized, messageBundle.original, getParseErrorMessage(error.error)));
							});
							return extensionDescription;
						}

						ExtensionManifestNLSReplacer._replaceNLStrings(extensionDescription, messages, originalMessages, this._log, this._absoluteFolderPath);
						return extensionDescription;
					});
				}, (err) => {
					this._log.error(this._absoluteFolderPath, nls.localize('fileReadFail', "Cannot read file {0}: {1}.", messageBundle.localized, err.message));
					return null;
				});
			});
		});
	}

	/**
	 * Parses original message bundle, returns null if the original message bundle is null.
	 */
	private static resolveOriginalMessageBundle(originalMessageBundle: string, errors: json.ParseError[]) {
		return new TPromise<{ [key: string]: string; }>((c, e, p) => {
			if (originalMessageBundle) {
				pfs.readFile(originalMessageBundle).then(originalBundleContent => {
					c(json.parse(originalBundleContent.toString(), errors));
				});
			} else {
				c(null);
			}
		});
	}

	/**
	 * Finds localized message bundle and the original (unlocalized) one.
	 * If the localized file is not present, returns null for the original and marks original as localized.
	 */
	private static findMessageBundles(basename: string): TPromise<{ localized: string, original: string }> {
		return new TPromise<{ localized: string, original: string }>((c, e, p) => {
			function loop(basename: string, locale: string): void {
				let toCheck = `${basename}.nls.${locale}.json`;
				pfs.fileExists(toCheck).then(exists => {
					if (exists) {
						c({ localized: toCheck, original: `${basename}.nls.json` });
					}
					let index = locale.lastIndexOf('-');
					if (index === -1) {
						c({ localized: `${basename}.nls.json`, original: null });
					} else {
						locale = locale.substring(0, index);
						loop(basename, locale);
					}
				});
			}

			if (devMode || nlsConfig.pseudo || !nlsConfig.locale) {
				return c({ localized: basename + '.nls.json', original: null });
			}
			loop(basename, nlsConfig.locale);
		});
	}

	/**
	 * This routine makes the following assumptions:
	 * The root element is an object literal
	 */
	private static _replaceNLStrings<T>(literal: T, messages: { [key: string]: string; }, originalMessages: { [key: string]: string }, log: ILog, messageScope: string): void {
		function processEntry(obj: any, key: string | number, command?: boolean) {
			let value = obj[key];
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
						obj[key] = command && (key === 'title' || key === 'category') && originalMessages ? { value: message, original: originalMessages[messageKey] } : message;
					} else {
						log.warn(messageScope, nls.localize('missingNLSKey', "Couldn't find message for key {0}.", messageKey));
					}
				}
			} else if (Types.isObject(value)) {
				for (let k in value) {
					if (value.hasOwnProperty(k)) {
						k === 'commands' ? processEntry(value, k, true) : processEntry(value, k, command);
					}
				}
			} else if (Types.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					processEntry(value, i, command);
				}
			}
		}

		for (let key in literal) {
			if (literal.hasOwnProperty(key)) {
				processEntry(literal, key);
			}
		};
	}
}

class ExtensionManifestValidator extends ExtensionManifestHandler {
	validate(_extensionDescription: IExtensionDescription): IExtensionDescription {
		// Relax the readonly properties here, it is the one place where we check and normalize values
		interface IRelaxedExtensionDescription {
			id: string;
			name: string;
			version: string;
			publisher: string;
			isBuiltin: boolean;
			extensionFolderPath: string;
			engines: {
				vscode: string;
			};
			main?: string;
			enableProposedApi?: boolean;
		}
		let extensionDescription = <IRelaxedExtensionDescription>_extensionDescription;
		extensionDescription.isBuiltin = this._isBuiltin;

		let notices: string[] = [];
		if (!isValidExtensionDescription(this._ourVersion, this._absoluteFolderPath, extensionDescription, notices)) {
			notices.forEach((error) => {
				this._log.error(this._absoluteFolderPath, error);
			});
			return null;
		}

		// in this case the notices are warnings
		notices.forEach((error) => {
			this._log.warn(this._absoluteFolderPath, error);
		});

		// id := `publisher.name`
		extensionDescription.id = `${extensionDescription.publisher}.${extensionDescription.name}`;

		// main := absolutePath(`main`)
		if (extensionDescription.main) {
			extensionDescription.main = join(this._absoluteFolderPath, extensionDescription.main);
		}

		extensionDescription.extensionFolderPath = this._absoluteFolderPath;

		return extensionDescription;
	}
}

export class ExtensionScanner {

	/**
	 * Read the extension defined in `absoluteFolderPath`
	 */
	public static scanExtension(
		version: string,
		log: ILog,
		absoluteFolderPath: string,
		isBuiltin: boolean
	): TPromise<IExtensionDescription> {
		absoluteFolderPath = normalize(absoluteFolderPath);

		let parser = new ExtensionManifestParser(version, log, absoluteFolderPath, isBuiltin);
		return parser.parse().then((extensionDescription) => {
			if (extensionDescription === null) {
				return null;
			}

			let nlsReplacer = new ExtensionManifestNLSReplacer(version, log, absoluteFolderPath, isBuiltin);
			return nlsReplacer.replaceNLS(extensionDescription);
		}).then((extensionDescription) => {
			if (extensionDescription === null) {
				return null;
			}

			let validator = new ExtensionManifestValidator(version, log, absoluteFolderPath, isBuiltin);
			return validator.validate(extensionDescription);
		});
	}

	/**
	 * Scan a list of extensions defined in `absoluteFolderPath`
	 */
	public static scanExtensions(
		version: string,
		log: ILog,
		absoluteFolderPath: string,
		isBuiltin: boolean
	): TPromise<IExtensionDescription[]> {
		let obsolete = TPromise.as({});

		if (!isBuiltin) {
			obsolete = pfs.readFile(join(absoluteFolderPath, '.obsolete'), 'utf8')
				.then(raw => JSON.parse(raw))
				.then(null, err => ({}));
		}

		return obsolete.then(obsolete => {
			return pfs.readDirsInDir(absoluteFolderPath)
				.then(folders => {
					if (isBuiltin) {
						return folders;
					}

					// TODO: align with extensionsService
					const nonGallery: string[] = [];
					const gallery: { folder: string; id: string; version: string; }[] = [];

					folders.forEach(folder => {
						if (obsolete[folder]) {
							return;
						}

						const { id, version } = getIdAndVersionFromLocalExtensionId(folder);

						if (!id || !version) {
							nonGallery.push(folder);
							return;
						}

						gallery.push({ folder, id, version });
					});

					const byId = values(groupBy(gallery, p => p.id));
					const latest = byId.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0])
						.map(a => a.folder);

					return [...nonGallery, ...latest];
				})
				.then(folders => TPromise.join(folders.map(f => this.scanExtension(version, log, join(absoluteFolderPath, f), isBuiltin))))
				.then(extensionDescriptions => extensionDescriptions.filter(item => item !== null))
				.then(null, err => {
					log.error(absoluteFolderPath, err);
					return [];
				});
		});
	}

	/**
	 * Combination of scanExtension and scanExtensions: If an extension manifest is found at root, we load just this extension,
	 * otherwise we assume the folder contains multiple extensions.
	 */
	public static scanOneOrMultipleExtensions(
		version: string,
		log: ILog,
		absoluteFolderPath: string,
		isBuiltin: boolean
	): TPromise<IExtensionDescription[]> {
		return pfs.fileExists(join(absoluteFolderPath, MANIFEST_FILE)).then((exists) => {
			if (exists) {
				return this.scanExtension(version, log, absoluteFolderPath, isBuiltin).then((extensionDescription) => {
					if (extensionDescription === null) {
						return [];
					}
					return [extensionDescription];
				});
			}
			return this.scanExtensions(version, log, absoluteFolderPath, isBuiltin);
		}, (err) => {
			log.error(absoluteFolderPath, err);
			return [];
		});
	}
}
