/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import * as semver from 'semver';
import * as json from 'vs/base/common/json';
import * as arrays from 'vs/base/common/arrays';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import * as types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { getGalleryExtensionId, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { isValidExtensionVersion } from 'vs/platform/extensions/node/extensionValidator';
import { ExtensionIdentifier, ExtensionIdentifierWithVersion, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IFileService, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';

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
	readonly locale: string | undefined;
	readonly pseudo: boolean;
	readonly translations: Translations;
}

export interface ILog {
	error(source: string, message: string): void;
	warn(source: string, message: string): void;
	info(source: string, message: string): void;
}

abstract class ExtensionManifestHandler {

	protected readonly _fileService: IFileService;
	protected readonly _ourVersion: string;
	protected readonly _log: ILog;
	protected readonly _absoluteFolderPath: string;
	protected readonly _isBuiltin: boolean;
	protected readonly _isUnderDevelopment: boolean;
	protected readonly _absoluteManifestPath: string;

	constructor(fileService: IFileService, ourVersion: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean, isUnderDevelopment: boolean) {
		this._fileService = fileService;
		this._ourVersion = ourVersion;
		this._log = log;
		this._absoluteFolderPath = absoluteFolderPath;
		this._isBuiltin = isBuiltin;
		this._isUnderDevelopment = isUnderDevelopment;
		this._absoluteManifestPath = path.join(absoluteFolderPath, MANIFEST_FILE);
	}
}

class ExtensionManifestParser extends ExtensionManifestHandler {

	public parse(): Promise<IExtensionDescription> {
		return this._fileService.resolveContent(URI.file(this._absoluteManifestPath)).then(content => {
			try {
				const manifest = JSON.parse(content.value);
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
			if (FileOperationError.isFileOperationError(err) && err.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return null;
			}

			this._log.error(this._absoluteFolderPath, nls.localize('fileReadFail', "Cannot read file {0}: {1}.", this._absoluteManifestPath, err.message));
			return null;
		});
	}
}

class ExtensionManifestNLSReplacer extends ExtensionManifestHandler {

	private readonly _nlsConfig: NlsConfiguration;

	constructor(fileService: IFileService, ourVersion: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean, isUnderDevelopment: boolean, nlsConfig: NlsConfiguration) {
		super(fileService, ourVersion, log, absoluteFolderPath, isBuiltin, isUnderDevelopment);
		this._nlsConfig = nlsConfig;
	}

	public replaceNLS(extensionDescription: IExtensionDescription): Promise<IExtensionDescription> {
		interface MessageBag {
			[key: string]: string;
		}

		interface TranslationBundle {
			contents: {
				package: MessageBag;
			};
		}

		interface LocalizedMessages {
			values: MessageBag | undefined;
			default: string | null;
		}

		const reportErrors = (localized: string | null, errors: json.ParseError[]): void => {
			errors.forEach((error) => {
				this._log.error(this._absoluteFolderPath, nls.localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localized, getParseErrorMessage(error.error)));
			});
		};

		let extension = path.extname(this._absoluteManifestPath);
		let basename = this._absoluteManifestPath.substr(0, this._absoluteManifestPath.length - extension.length);

		const translationId = `${extensionDescription.publisher}.${extensionDescription.name}`;
		let translationPath = this._nlsConfig.translations[translationId];
		let localizedMessages: Promise<LocalizedMessages | undefined>;
		if (translationPath) {
			localizedMessages = this._fileService.resolveContent(URI.file(translationPath), { encoding: 'utf8' }).then(content => {
				let errors: json.ParseError[] = [];
				let translationBundle: TranslationBundle = json.parse(content.value, errors);
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
			localizedMessages = this._fileService.exists(URI.file(basename + '.nls' + extension)).then<LocalizedMessages | undefined, LocalizedMessages | undefined>(exists => {
				if (!exists) {
					return undefined;
				}
				return ExtensionManifestNLSReplacer.findMessageBundles(this._fileService, this._nlsConfig, basename).then((messageBundle) => {
					if (!messageBundle.localized) {
						return { values: undefined, default: messageBundle.original };
					}
					return this._fileService.resolveContent(URI.file(messageBundle.localized), { encoding: 'utf8' }).then(messageBundleContent => {
						let errors: json.ParseError[] = [];
						let messages: MessageBag = json.parse(messageBundleContent.value, errors);
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
			return ExtensionManifestNLSReplacer.resolveOriginalMessageBundle(this._fileService, localizedMessages.default, errors).then((defaults) => {
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
	private static resolveOriginalMessageBundle(fileService: IFileService, originalMessageBundle: string | null, errors: json.ParseError[]) {
		return new Promise<{ [key: string]: string; } | null>((c, e) => {
			if (originalMessageBundle) {
				fileService.resolveContent(URI.file(originalMessageBundle)).then(originalBundleContent => {
					c(json.parse(originalBundleContent.value, errors));
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
	private static findMessageBundles(fileService: IFileService, nlsConfig: NlsConfiguration, basename: string): Promise<{ localized: string; original: string | null; }> {
		return new Promise<{ localized: string; original: string | null; }>((c, e) => {
			function loop(basename: string, locale: string): void {
				let toCheck = `${basename}.nls.${locale}.json`;
				fileService.exists(URI.file(toCheck)).then(exists => {
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
	private static _replaceNLStrings<T>(nlsConfig: NlsConfiguration, literal: T, messages: { [key: string]: string; }, originalMessages: { [key: string]: string } | null, log: ILog, messageScope: string): void {
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
	uuid?: string;
	identifier: ExtensionIdentifier;
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
	validate(_extensionDescription: IExtensionDescription): IExtensionDescription | null {
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

		// allow publisher to be undefined to make the initial extension authoring experience smoother
		if (!extensionDescription.publisher) {
			extensionDescription.publisher = 'undefined_publisher';
		}

		// id := `publisher.name`
		extensionDescription.id = `${extensionDescription.publisher}.${extensionDescription.name}`;
		extensionDescription.identifier = new ExtensionIdentifier(extensionDescription.id);

		// main := absolutePath(`main`)
		if (extensionDescription.main) {
			extensionDescription.main = path.join(this._absoluteFolderPath, extensionDescription.main);
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
		if (typeof extensionDescription.publisher !== 'undefined' && typeof extensionDescription.publisher !== 'string') {
			notices.push(nls.localize('extensionDescription.publisher', "property publisher must be of type `string`."));
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
				let normalizedAbsolutePath = path.join(extensionFolderPath, extensionDescription.main);

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
		public readonly commit: string | undefined,
		public readonly locale: string | undefined,
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
	resolveExtensions(): Promise<IExtensionReference[]>;
}

class DefaultExtensionResolver implements IExtensionResolver {

	constructor(private root: string, private fileService: IFileService) { }

	resolveExtensions(): Promise<IExtensionReference[]> {
		return this.fileService.resolve(URI.file(this.root)).then(stat => {
			return stat.isDirectory && stat.children ? stat.children.filter(child => child.isDirectory) : [];
		}).then(folders => {
			return folders.map(stat => ({ name: stat.name, path: path.join(this.root, stat.name) }));
		});
	}
}

export class ExtensionScanner {

	/**
	 * Read the extension defined in `absoluteFolderPath`
	 */
	private static scanExtension(fileService: IFileService, version: string, log: ILog, absoluteFolderPath: string, isBuiltin: boolean, isUnderDevelopment: boolean, nlsConfig: NlsConfiguration): Promise<IExtensionDescription | null> {
		absoluteFolderPath = path.normalize(absoluteFolderPath);

		let parser = new ExtensionManifestParser(fileService, version, log, absoluteFolderPath, isBuiltin, isUnderDevelopment);
		return parser.parse().then<IExtensionDescription | null>((extensionDescription) => {
			if (extensionDescription === null) {
				return null;
			}

			let nlsReplacer = new ExtensionManifestNLSReplacer(fileService, version, log, absoluteFolderPath, isBuiltin, isUnderDevelopment, nlsConfig);
			return nlsReplacer.replaceNLS(extensionDescription);
		}).then((extensionDescription) => {
			if (extensionDescription === null) {
				return null;
			}

			let validator = new ExtensionManifestValidator(fileService, version, log, absoluteFolderPath, isBuiltin, isUnderDevelopment);
			return validator.validate(extensionDescription);
		});
	}

	/**
	 * Scan a list of extensions defined in `absoluteFolderPath`
	 */
	public static async scanExtensions(fileService: IFileService, input: ExtensionScannerInput, log: ILog, resolver: IExtensionResolver | null = null): Promise<IExtensionDescription[]> {
		const absoluteFolderPath = input.absoluteFolderPath;
		const isBuiltin = input.isBuiltin;
		const isUnderDevelopment = input.isUnderDevelopment;

		if (!resolver) {
			resolver = new DefaultExtensionResolver(absoluteFolderPath, fileService);
		}

		try {
			let obsolete: { [folderName: string]: boolean; } = {};
			if (!isBuiltin) {
				try {
					const obsoleteFileContents = await fileService.resolveContent(URI.file(path.join(absoluteFolderPath, '.obsolete')), { encoding: 'utf8' });
					obsolete = JSON.parse(obsoleteFileContents.value);
				} catch (err) {
					// Don't care
				}
			}

			let refs = await resolver.resolveExtensions();

			// Ensure the same extension order
			refs.sort((a, b) => a.name < b.name ? -1 : 1);

			if (!isBuiltin) {
				refs = refs.filter(ref => ref.name.indexOf('.') !== 0); // Do not consider user extension folder starting with `.`
			}

			const nlsConfig = ExtensionScannerInput.createNLSConfig(input);
			let _extensionDescriptions = await Promise.all(refs.map(r => this.scanExtension(fileService, input.ourVersion, log, r.path, isBuiltin, isUnderDevelopment, nlsConfig)));
			let extensionDescriptions = arrays.coalesce(_extensionDescriptions);
			extensionDescriptions = extensionDescriptions.filter(item => item !== null && !obsolete[new ExtensionIdentifierWithVersion({ id: getGalleryExtensionId(item.publisher, item.name) }, item.version).key()]);

			if (!isBuiltin) {
				// Filter out outdated extensions
				const byExtension: IExtensionDescription[][] = groupByExtension(extensionDescriptions, e => ({ id: e.identifier.value, uuid: e.uuid }));
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
	public static scanOneOrMultipleExtensions(fileService: IFileService, input: ExtensionScannerInput, log: ILog): Promise<IExtensionDescription[]> {
		const absoluteFolderPath = input.absoluteFolderPath;
		const isBuiltin = input.isBuiltin;
		const isUnderDevelopment = input.isUnderDevelopment;

		return fileService.exists(URI.file(path.join(absoluteFolderPath, MANIFEST_FILE))).then((exists) => {
			if (exists) {
				const nlsConfig = ExtensionScannerInput.createNLSConfig(input);
				return this.scanExtension(fileService, input.ourVersion, log, absoluteFolderPath, isBuiltin, isUnderDevelopment, nlsConfig).then((extensionDescription) => {
					if (extensionDescription === null) {
						return [];
					}
					return [extensionDescription];
				});
			}
			return this.scanExtensions(fileService, input, log);
		}, (err) => {
			log.error(absoluteFolderPath, err);
			return [];
		});
	}

	public static scanSingleExtension(fileService: IFileService, input: ExtensionScannerInput, log: ILog): Promise<IExtensionDescription | null> {
		const absoluteFolderPath = input.absoluteFolderPath;
		const isBuiltin = input.isBuiltin;
		const isUnderDevelopment = input.isUnderDevelopment;
		const nlsConfig = ExtensionScannerInput.createNLSConfig(input);
		return this.scanExtension(fileService, input.ourVersion, log, absoluteFolderPath, isBuiltin, isUnderDevelopment, nlsConfig);
	}

	public static mergeBuiltinExtensions(builtinExtensions: Promise<IExtensionDescription[]>, extraBuiltinExtensions: Promise<IExtensionDescription[]>): Promise<IExtensionDescription[]> {
		return Promise.all([builtinExtensions, extraBuiltinExtensions]).then(([builtinExtensions, extraBuiltinExtensions]) => {
			let resultMap: { [id: string]: IExtensionDescription; } = Object.create(null);
			for (let i = 0, len = builtinExtensions.length; i < len; i++) {
				resultMap[ExtensionIdentifier.toKey(builtinExtensions[i].identifier)] = builtinExtensions[i];
			}
			// Overwrite with extensions found in extra
			for (let i = 0, len = extraBuiltinExtensions.length; i < len; i++) {
				resultMap[ExtensionIdentifier.toKey(extraBuiltinExtensions[i].identifier)] = extraBuiltinExtensions[i];
			}

			let resultArr = Object.keys(resultMap).map((id) => resultMap[id]);
			resultArr.sort((a, b) => {
				const aLastSegment = path.basename(a.extensionLocation.fsPath);
				const bLastSegment = path.basename(b.extensionLocation.fsPath);
				if (aLastSegment < bLastSegment) {
					return -1;
				}
				if (aLastSegment > bLastSegment) {
					return 1;
				}
				return 0;
			});
			return resultArr;
		});
	}
}
