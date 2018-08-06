/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as pfs from 'vs/base/node/pfs';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { join, normalize, extname } from 'path';
import * as json from 'vs/base/common/json';
import * as types from 'vs/base/common/types';
import { isValidExtensionVersion } from 'vs/platform/extensions/node/extensionValidator';
import * as semver from 'semver';
import { getIdAndVersionFromLocalExtensionId } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { groupByExtension, getGalleryExtensionId, getLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import URI from 'vs/base/common/uri';

const MANIFEST_FILE = 'package.json';

export interface Translations {
	[id: string]: string;
}

namespace Translations {
	export function equals(a: Translations, b: Translations): boolean {
		if (a === b) {
			return true;
		}
		let aKeys = Object.keys(a);
		let bKeys: Set<string> = new Set<string>();
		for (let key of Object.keys(b)) {
			bKeys.add(key);
		}
		if (aKeys.length !== bKeys.size) {
			return false;
		}

		for (let key of aKeys) {
			if (a[key] !== b[key]) {
				return false;
			}
			bKeys.delete(key);
		}
		return bKeys.size === 0;
	}
}

export interface NlsConfiguration {
	readonly devMode: boolean;
	readonly locale: string;
	readonly pseudo: boolean;
	readonly translations: Translations;
}

export interface ILog {
	error(source: string, message: string): void;
	warn(source: string, message: string): void;
	info(source: string, message: string): void;
}

abstract class ExtensionManifestHandler {

	protected readonly _ourVersion: string;
	protected readonly _log: ILog;
	protected readonly _absoluteFolderPath: string;
	protected readonly _isBuiltin: boolean;
	protected readonly _isUnderDevelopment: boolean;
	protected readonly _absoluteManifestPath: string;

	constructor(ourVersion: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean, isUnderDevelopment: boolean) {
		this._ourVersion = ourVersion;
		this._log = log;
		this._absoluteFolderPath = absoluteFolderPath;
		this._isBuiltin = isBuiltin;
		this._isUnderDevelopment = isUnderDevelopment;
		this._absoluteManifestPath = join(absoluteFolderPath, MANIFEST_FILE);
	}
}

class ExtensionManifestParser extends ExtensionManifestHandler {

	public parse(): TPromise<IExtensionDescription> {
		return pfs.readFile(this._absoluteManifestPath).then((manifestContents) => {
			try {
				const manifest = JSON.parse(manifestContents.toString());
				if (manifest.__metadata) {
					manifest.uuid = manifest.__metadata.id;
				}
				delete manifest.__metadata;
				return manifest;
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

	private readonly _nlsConfig: NlsConfiguration;

	constructor(ourVersion: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean, isUnderDevelopment: boolean, nlsConfig: NlsConfiguration) {
		super(ourVersion, log, absoluteFolderPath, isBuiltin, isUnderDevelopment);
		this._nlsConfig = nlsConfig;
	}

	public replaceNLS(extensionDescription: IExtensionDescription): TPromise<IExtensionDescription> {
		interface MessageBag {
			[key: string]: string;
		}

		interface TranslationBundle {
			contents: {
				package: MessageBag;
			};
		}

		interface LocalizedMessages {
			values: MessageBag;
			default: string;
		}

		const reportErrors = (localized: string, errors: json.ParseError[]): void => {
			errors.forEach((error) => {
				this._log.error(this._absoluteFolderPath, nls.localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localized, getParseErrorMessage(error.error)));
			});
		};

		let extension = extname(this._absoluteManifestPath);
		let basename = this._absoluteManifestPath.substr(0, this._absoluteManifestPath.length - extension.length);

		const translationId = `${extensionDescription.publisher}.${extensionDescription.name}`;
		let translationPath = this._nlsConfig.translations[translationId];
		let localizedMessages: TPromise<LocalizedMessages>;
		if (translationPath) {
			localizedMessages = pfs.readFile(translationPath, 'utf8').then<LocalizedMessages, LocalizedMessages>((content) => {
				let errors: json.ParseError[] = [];
				let translationBundle: TranslationBundle = json.parse(content, errors);
				if (errors.length > 0) {
					reportErrors(translationPath, errors);
					return { values: undefined, default: `${basename}.nls.json` };
				} else {
					let values = translationBundle.contents ? translationBundle.contents.package : undefined;
					return { values: values, default: `${basename}.nls.json` };
				}
			}, (error) => {
				return { values: undefined, default: `${basename}.nls.json` };
			});
		} else {
			localizedMessages = pfs.fileExists(basename + '.nls' + extension).then<LocalizedMessages, undefined | LocalizedMessages>(exists => {
				if (!exists) {
					return undefined;
				}
				return ExtensionManifestNLSReplacer.findMessageBundles(this._nlsConfig, basename).then((messageBundle) => {
					if (!messageBundle.localized) {
						return { values: undefined, default: messageBundle.original };
					}
					return pfs.readFile(messageBundle.localized, 'utf8').then(messageBundleContent => {
						let errors: json.ParseError[] = [];
						let messages: MessageBag = json.parse(messageBundleContent, errors);
						if (errors.length > 0) {
							reportErrors(messageBundle.localized, errors);
							return { values: undefined, default: messageBundle.original };
						}
						return { values: messages, default: messageBundle.original };
					}, (err) => {
						return { values: undefined, default: messageBundle.original };
					});
				}, (err) => {
					return undefined;
				});
			});
		}

		return localizedMessages.then((localizedMessages) => {
			if (localizedMessages === undefined) {
				return extensionDescription;
			}
			let errors: json.ParseError[] = [];
			// resolveOriginalMessageBundle returns null if localizedMessages.default === undefined;
			return ExtensionManifestNLSReplacer.resolveOriginalMessageBundle(localizedMessages.default, errors).then((defaults) => {
				if (errors.length > 0) {
					reportErrors(localizedMessages.default, errors);
					return extensionDescription;
				}
				const localized = localizedMessages.values || Object.create(null);
				ExtensionManifestNLSReplacer._replaceNLStrings(this._nlsConfig, extensionDescription, localized, defaults, this._log, this._absoluteFolderPath);
				return extensionDescription;
			});
		}, (err) => {
			return extensionDescription;
		});
	}

	/**
	 * Parses original message bundle, returns null if the original message bundle is null.
	 */
	private static resolveOriginalMessageBundle(originalMessageBundle: string, errors: json.ParseError[]) {
		return new TPromise<{ [key: string]: string; }>((c, e) => {
			if (originalMessageBundle) {
				pfs.readFile(originalMessageBundle).then(originalBundleContent => {
					c(json.parse(originalBundleContent.toString(), errors));
				}, (err) => {
					c(null);
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
	private static findMessageBundles(nlsConfig: NlsConfiguration, basename: string): TPromise<{ localized: string, original: string }> {
		return new TPromise<{ localized: string, original: string }>((c, e) => {
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

			if (nlsConfig.devMode || nlsConfig.pseudo || !nlsConfig.locale) {
				return c({ localized: basename + '.nls.json', original: null });
			}
			loop(basename, nlsConfig.locale);
		});
	}

	/**
	 * This routine makes the following assumptions:
	 * The root element is an object literal
	 */
	private static _replaceNLStrings<T>(nlsConfig: NlsConfiguration, literal: T, messages: { [key: string]: string; }, originalMessages: { [key: string]: string }, log: ILog, messageScope: string): void {
		function processEntry(obj: any, key: string | number, command?: boolean) {
			let value = obj[key];
			if (types.isString(value)) {
				let str = <string>value;
				let length = str.length;
				if (length > 1 && str[0] === '%' && str[length - 1] === '%') {
					let messageKey = str.substr(1, length - 2);
					let message = messages[messageKey];
					// If the messages come from a language pack they might miss some keys
					// Fill them from the original messages.
					if (message === undefined && originalMessages) {
						message = originalMessages[messageKey];
					}
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
			} else if (types.isObject(value)) {
				for (let k in value) {
					if (value.hasOwnProperty(k)) {
						k === 'commands' ? processEntry(value, k, true) : processEntry(value, k, command);
					}
				}
			} else if (types.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					processEntry(value, i, command);
				}
			}
		}

		for (let key in literal) {
			if (literal.hasOwnProperty(key)) {
				processEntry(literal, key);
			}
		}
	}
}

// Relax the readonly properties here, it is the one place where we check and normalize values
export interface IRelaxedExtensionDescription {
	id: string;
	name: string;
	version: string;
	publisher: string;
	isBuiltin: boolean;
	isUnderDevelopment: boolean;
	extensionLocation: URI;
	engines: {
		vscode: string;
	};
	main?: string;
	enableProposedApi?: boolean;
}

class ExtensionManifestValidator extends ExtensionManifestHandler {
	validate(_extensionDescription: IExtensionDescription): IExtensionDescription {
		let extensionDescription = <IRelaxedExtensionDescription>_extensionDescription;
		extensionDescription.isBuiltin = this._isBuiltin;
		extensionDescription.isUnderDevelopment = this._isUnderDevelopment;

		let notices: string[] = [];
		if (!ExtensionManifestValidator.isValidExtensionDescription(this._ourVersion, this._absoluteFolderPath, extensionDescription, notices)) {
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

		extensionDescription.extensionLocation = URI.file(this._absoluteFolderPath);

		return extensionDescription;
	}

	private static isValidExtensionDescription(version: string, extensionFolderPath: string, extensionDescription: IExtensionDescription, notices: string[]): boolean {

		if (!ExtensionManifestValidator.baseIsValidExtensionDescription(extensionFolderPath, extensionDescription, notices)) {
			return false;
		}

		if (!semver.valid(extensionDescription.version)) {
			notices.push(nls.localize('notSemver', "Extension version is not semver compatible."));
			return false;
		}

		return isValidExtensionVersion(version, extensionDescription, notices);
	}

	private static baseIsValidExtensionDescription(extensionFolderPath: string, extensionDescription: IExtensionDescription, notices: string[]): boolean {
		if (!extensionDescription) {
			notices.push(nls.localize('extensionDescription.empty', "Got empty extension description"));
			return false;
		}
		if (typeof extensionDescription.publisher !== 'string') {
			notices.push(nls.localize('extensionDescription.publisher', "property `{0}` is mandatory and must be of type `string`", 'publisher'));
			return false;
		}
		if (typeof extensionDescription.name !== 'string') {
			notices.push(nls.localize('extensionDescription.name', "property `{0}` is mandatory and must be of type `string`", 'name'));
			return false;
		}
		if (typeof extensionDescription.version !== 'string') {
			notices.push(nls.localize('extensionDescription.version', "property `{0}` is mandatory and must be of type `string`", 'version'));
			return false;
		}
		if (!extensionDescription.engines) {
			notices.push(nls.localize('extensionDescription.engines', "property `{0}` is mandatory and must be of type `object`", 'engines'));
			return false;
		}
		if (typeof extensionDescription.engines.vscode !== 'string') {
			notices.push(nls.localize('extensionDescription.engines.vscode', "property `{0}` is mandatory and must be of type `string`", 'engines.vscode'));
			return false;
		}
		if (typeof extensionDescription.extensionDependencies !== 'undefined') {
			if (!ExtensionManifestValidator._isStringArray(extensionDescription.extensionDependencies)) {
				notices.push(nls.localize('extensionDescription.extensionDependencies', "property `{0}` can be omitted or must be of type `string[]`", 'extensionDependencies'));
				return false;
			}
		}
		if (typeof extensionDescription.activationEvents !== 'undefined') {
			if (!ExtensionManifestValidator._isStringArray(extensionDescription.activationEvents)) {
				notices.push(nls.localize('extensionDescription.activationEvents1', "property `{0}` can be omitted or must be of type `string[]`", 'activationEvents'));
				return false;
			}
			if (typeof extensionDescription.main === 'undefined') {
				notices.push(nls.localize('extensionDescription.activationEvents2', "properties `{0}` and `{1}` must both be specified or must both be omitted", 'activationEvents', 'main'));
				return false;
			}
		}
		if (typeof extensionDescription.main !== 'undefined') {
			if (typeof extensionDescription.main !== 'string') {
				notices.push(nls.localize('extensionDescription.main1', "property `{0}` can be omitted or must be of type `string`", 'main'));
				return false;
			} else {
				let normalizedAbsolutePath = join(extensionFolderPath, extensionDescription.main);

				if (normalizedAbsolutePath.indexOf(extensionFolderPath)) {
					notices.push(nls.localize('extensionDescription.main2', "Expected `main` ({0}) to be included inside extension's folder ({1}). This might make the extension non-portable.", normalizedAbsolutePath, extensionFolderPath));
					// not a failure case
				}
			}
			if (typeof extensionDescription.activationEvents === 'undefined') {
				notices.push(nls.localize('extensionDescription.main3', "properties `{0}` and `{1}` must both be specified or must both be omitted", 'activationEvents', 'main'));
				return false;
			}
		}
		return true;
	}

	private static _isStringArray(arr: string[]): boolean {
		if (!Array.isArray(arr)) {
			return false;
		}
		for (let i = 0, len = arr.length; i < len; i++) {
			if (typeof arr[i] !== 'string') {
				return false;
			}
		}
		return true;
	}
}

export class ExtensionScannerInput {

	public mtime: number;

	constructor(
		public readonly ourVersion: string,
		public readonly commit: string,
		public readonly locale: string,
		public readonly devMode: boolean,
		public readonly absoluteFolderPath: string,
		public readonly isBuiltin: boolean,
		public readonly isUnderDevelopment: boolean,
		public readonly tanslations: Translations
	) {
		// Keep empty!! (JSON.parse)
	}

	public static createNLSConfig(input: ExtensionScannerInput): NlsConfiguration {
		return {
			devMode: input.devMode,
			locale: input.locale,
			pseudo: input.locale === 'pseudo',
			translations: input.tanslations
		};
	}

	public static equals(a: ExtensionScannerInput, b: ExtensionScannerInput): boolean {
		return (
			a.ourVersion === b.ourVersion
			&& a.commit === b.commit
			&& a.locale === b.locale
			&& a.devMode === b.devMode
			&& a.absoluteFolderPath === b.absoluteFolderPath
			&& a.isBuiltin === b.isBuiltin
			&& a.isUnderDevelopment === b.isUnderDevelopment
			&& a.mtime === b.mtime
			&& Translations.equals(a.tanslations, b.tanslations)
		);
	}
}

export interface IExtensionReference {
	name: string;
	path: string;
}

export interface IExtensionResolver {
	resolveExtensions(): TPromise<IExtensionReference[]>;
}

class DefaultExtensionResolver implements IExtensionResolver {

	constructor(private root: string) { }

	resolveExtensions(): TPromise<IExtensionReference[]> {
		return pfs.readDirsInDir(this.root)
			.then(folders => folders.map(name => ({ name, path: join(this.root, name) })));
	}
}

export class ExtensionScanner {

	/**
	 * Read the extension defined in `absoluteFolderPath`
	 */
	public static scanExtension(version: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean, isUnderDevelopment: boolean, nlsConfig: NlsConfiguration): TPromise<IExtensionDescription> {
		absoluteFolderPath = normalize(absoluteFolderPath);

		let parser = new ExtensionManifestParser(version, log, absoluteFolderPath, isBuiltin, isUnderDevelopment);
		return parser.parse().then((extensionDescription) => {
			if (extensionDescription === null) {
				return null;
			}

			let nlsReplacer = new ExtensionManifestNLSReplacer(version, log, absoluteFolderPath, isBuiltin, isUnderDevelopment, nlsConfig);
			return nlsReplacer.replaceNLS(extensionDescription);
		}).then((extensionDescription) => {
			if (extensionDescription === null) {
				return null;
			}

			let validator = new ExtensionManifestValidator(version, log, absoluteFolderPath, isBuiltin, isUnderDevelopment);
			return validator.validate(extensionDescription);
		});
	}

	/**
	 * Scan a list of extensions defined in `absoluteFolderPath`
	 */
	public static async scanExtensions(input: ExtensionScannerInput, log: ILog, resolver: IExtensionResolver = null): Promise<IExtensionDescription[]> {
		const absoluteFolderPath = input.absoluteFolderPath;
		const isBuiltin = input.isBuiltin;
		const isUnderDevelopment = input.isUnderDevelopment;

		if (!resolver) {
			resolver = new DefaultExtensionResolver(absoluteFolderPath);
		}

		try {
			let obsolete: { [folderName: string]: boolean; } = {};
			if (!isBuiltin) {
				try {
					const obsoleteFileContents = await pfs.readFile(join(absoluteFolderPath, '.obsolete'), 'utf8');
					obsolete = JSON.parse(obsoleteFileContents);
				} catch (err) {
					// Don't care
				}
			}

			let refs = await resolver.resolveExtensions();

			// Ensure the same extension order
			refs.sort((a, b) => a.name < b.name ? -1 : 1);

			if (!isBuiltin) {
				// TODO: align with extensionsService
				const nonGallery: IExtensionReference[] = [];
				const gallery: IExtensionReference[] = [];

				refs.forEach(ref => {
					if (ref.name.indexOf('.') !== 0) { // Do not consider user extension folder starting with `.`
						const { id, version } = getIdAndVersionFromLocalExtensionId(ref.name);
						if (!id || !version) {
							nonGallery.push(ref);
						} else {
							gallery.push(ref);
						}
					}
				});
				refs = [...nonGallery, ...gallery];
			}

			const nlsConfig = ExtensionScannerInput.createNLSConfig(input);
			let extensionDescriptions = await TPromise.join(refs.map(r => this.scanExtension(input.ourVersion, log, r.path, isBuiltin, isUnderDevelopment, nlsConfig)));
			extensionDescriptions = extensionDescriptions.filter(item => item !== null && !obsolete[getLocalExtensionId(getGalleryExtensionId(item.publisher, item.name), item.version)]);

			if (!isBuiltin) {
				// Filter out outdated extensions
				const byExtension: IExtensionDescription[][] = groupByExtension(extensionDescriptions, e => ({ id: e.id, uuid: e.uuid }));
				extensionDescriptions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);
			}

			extensionDescriptions.sort((a, b) => {
				if (a.extensionLocation.fsPath < b.extensionLocation.fsPath) {
					return -1;
				}
				return 1;
			});
			return extensionDescriptions;
		} catch (err) {
			log.error(absoluteFolderPath, err);
			return [];
		}
	}

	/**
	 * Combination of scanExtension and scanExtensions: If an extension manifest is found at root, we load just this extension,
	 * otherwise we assume the folder contains multiple extensions.
	 */
	public static scanOneOrMultipleExtensions(input: ExtensionScannerInput, log: ILog): TPromise<IExtensionDescription[]> {
		const absoluteFolderPath = input.absoluteFolderPath;
		const isBuiltin = input.isBuiltin;
		const isUnderDevelopment = input.isUnderDevelopment;

		return pfs.fileExists(join(absoluteFolderPath, MANIFEST_FILE)).then((exists) => {
			if (exists) {
				const nlsConfig = ExtensionScannerInput.createNLSConfig(input);
				return this.scanExtension(input.ourVersion, log, absoluteFolderPath, isBuiltin, isUnderDevelopment, nlsConfig).then((extensionDescription) => {
					if (extensionDescription === null) {
						return [];
					}
					return [extensionDescription];
				});
			}
			return this.scanExtensions(input, log);
		}, (err) => {
			log.error(absoluteFolderPath, err);
			return [];
		});
	}
}