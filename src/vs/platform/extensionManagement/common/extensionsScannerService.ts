/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { VSBuffer } from 'vs/base/common/buffer';
import { IStringDictionary } from 'vs/base/common/collections';
import { getErrorMessage } from 'vs/base/common/errors';
import { getNodeType, parse, ParseError } from 'vs/base/common/json';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import { basename, isEqualOrParent, joinPath } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import Severity from 'vs/base/common/severity';
import { isArray, isObject, isString } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { computeTargetPlatform, ExtensionKey, getExtensionId, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, ExtensionIdentifier, IExtensionManifest, TargetPlatform, IExtensionIdentifier, IRelaxedExtensionManifest, UNDEFINED_PUBLISHER, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { validateExtensionManifest } from 'vs/platform/extensions/common/extensionValidator';
import { FileOperationResult, IFileService, toFileOperationResult } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';

type IScannedExtensionManifest = IRelaxedExtensionManifest & { __metadata?: Metadata };

interface IRelaxedScannedExtension {
	type: ExtensionType;
	isBuiltin: boolean;
	identifier: IExtensionIdentifier;
	manifest: IRelaxedExtensionManifest;
	location: URI;
	targetPlatform: TargetPlatform;
	metadata: Metadata | undefined;
	isValid: boolean;
	validations: readonly { readonly severity: Severity; readonly message: string }[];
}

export type IScannedExtension = Readonly<IRelaxedScannedExtension> & { manifest: IExtensionManifest };

export interface Translations {
	[id: string]: string;
}

export namespace Translations {
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

interface MessageBag {
	[key: string]: string | { message: string; comment: string[] };
}

interface TranslationBundle {
	contents: {
		package: MessageBag;
	};
}

interface LocalizedMessages {
	values: MessageBag | undefined;
	default: URI | null;
}

interface IBuiltInExtensionControl {
	[name: string]: 'marketplace' | 'disabled' | string;
}

export type ScanOptions = {
	readonly includeInvalid?: boolean;
	readonly nlsConfiguration?: NlsConfiguration;
	readonly includeAllVersions?: boolean;
	readonly includeUninstalled?: boolean;
	readonly checkControlFile?: boolean;
};

export const INativeExtensionsScannerService = createDecorator<INativeExtensionsScannerService>('INativeExtensionsScannerService');
export interface INativeExtensionsScannerService {
	readonly _serviceBrand: undefined;

	readonly systemExtensionsLocation: URI;
	readonly userExtensionsLocation: URI;

	getTargetPlatform(): Promise<TargetPlatform>;

	scanAllExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanSystemExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanUserExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanExtensionsUnderDevelopment(scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension | null>;
	scanOneOrMultipleExtensions(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension[]>;

	updateMetadata(extensionLocation: URI, metadata: Partial<Metadata>): Promise<void>;
}

export class NativeExtensionsScannerService extends Disposable implements INativeExtensionsScannerService {

	readonly _serviceBrand: undefined;

	readonly systemExtensionsLocation: URI;
	readonly userExtensionsLocation: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this.systemExtensionsLocation = URI.file(environmentService.builtinExtensionsPath);
		this.userExtensionsLocation = URI.file(environmentService.extensionsPath);
	}

	private _targetPlatformPromise: Promise<TargetPlatform> | undefined;
	getTargetPlatform(): Promise<TargetPlatform> {
		if (!this._targetPlatformPromise) {
			this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
		}
		return this._targetPlatformPromise;
	}

	async scanAllExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const [system, user, development] = await Promise.all([
			this.scanSystemExtensions(scanOptions),
			this.scanUserExtensions(scanOptions),
			this.scanExtensionsUnderDevelopment(scanOptions),
		]);
		return this.dedupExtensions([...system, ...user, ...development], await this.getTargetPlatform(), true);
	}

	async scanSystemExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const promises: Promise<IRelaxedScannedExtension[]>[] = [];
		promises.push(this.scanDefaultSystemExtensions());
		promises.push(this.scanDevSystemExtensions(scanOptions));
		try {
			const [defaultSystemExtensions, devSystemExtensions] = await Promise.all(promises);
			return this.applyScanOptions([...defaultSystemExtensions, ...devSystemExtensions], scanOptions, false);
		} catch (error) {
			throw this.joinErrors(error);
		}
	}

	async scanUserExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		this.logService.trace('Started scanning user extensions');
		let extensions: IRelaxedScannedExtension[];
		if (scanOptions.includeUninstalled) {
			extensions = await this.scanFromUserExtensionsLocation();
		} else {
			let [uninstalled, scannedExtensions] = await Promise.all([this.getUninstalledExtensions(), this.scanFromUserExtensionsLocation()]);
			extensions = scannedExtensions.filter(e => !uninstalled[ExtensionKey.create(e).toString()]);
		}
		extensions = await this.applyScanOptions(extensions, scanOptions, true);
		this.logService.trace('Scanned user extensions:', extensions.length);
		return extensions;
	}

	async scanExtensionsUnderDevelopment(scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		if (this.environmentService.isExtensionDevelopment && this.environmentService.extensionDevelopmentLocationURI) {
			const extensions = (await Promise.all(this.environmentService.extensionDevelopmentLocationURI.filter(extLoc => extLoc.scheme === Schemas.file)
				.map(async extensionDevelopmentLocationURI => await this.doScanOneOrMultipleExtensions(extensionDevelopmentLocationURI, ExtensionType.User))))
				.flat();
			return this.applyScanOptions(extensions, scanOptions, true);
		}
		return [];
	}

	async scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension | null> {
		const extension = await this.scanExtension(extensionLocation, extensionType);
		if (!extension) {
			return null;
		}
		if (!scanOptions.includeInvalid && !extension.isValid) {
			return null;
		}
		extension.manifest = await this.localizeManifest(extension.location, extension.manifest, scanOptions.nlsConfiguration);
		return extension;
	}

	async scanOneOrMultipleExtensions(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const extensions = await this.doScanOneOrMultipleExtensions(extensionLocation, extensionType);
		return this.applyScanOptions(extensions, scanOptions, true);
	}

	async updateMetadata(extensionLocation: URI, metaData: Partial<Metadata>): Promise<void> {
		const manifest = await this.scanExtensionManifest(extensionLocation);
		if (!manifest) {
			throw new Error(localize('cannot read', "Cannot read the extension manifest from {0}", extensionLocation.path));
		}
		// unset if false
		metaData.isMachineScoped = metaData.isMachineScoped || undefined;
		metaData.isBuiltin = metaData.isBuiltin || undefined;
		metaData.installedTimestamp = metaData.installedTimestamp || undefined;
		manifest.__metadata = { ...manifest.__metadata, ...metaData };
		await this.fileService.writeFile(joinPath(extensionLocation, 'package.json'), VSBuffer.fromString(JSON.stringify(manifest, null, '\t')));
	}

	private async applyScanOptions(extensions: IRelaxedScannedExtension[], scanOptions: ScanOptions, pickLatest: boolean): Promise<IRelaxedScannedExtension[]> {
		if (!scanOptions.includeAllVersions) {
			extensions = this.dedupExtensions(extensions, await this.getTargetPlatform(), pickLatest);
		}
		if (!scanOptions.includeInvalid) {
			extensions = extensions.filter(extension => extension.isValid);
		}
		extensions = await this.localizeExtensions(extensions, scanOptions.nlsConfiguration);
		return extensions.sort((a, b) => {
			const aLastSegment = path.basename(a.location.fsPath);
			const bLastSegment = path.basename(b.location.fsPath);
			if (aLastSegment < bLastSegment) {
				return -1;
			}
			if (aLastSegment > bLastSegment) {
				return 1;
			}
			return 0;
		});
	}

	private async doScanOneOrMultipleExtensions(extensionLocation: URI, extensionType: ExtensionType): Promise<IScannedExtension[]> {
		try {
			if (await this.fileService.exists(joinPath(extensionLocation, 'package.json'))) {
				const extension = await this.scanExtension(extensionLocation, extensionType);
				return extension ? [extension] : [];
			} else {
				return await this.scanExtensionsInLocation(extensionLocation, extensionType);
			}
		} catch (error) {
			this.logService.error(`Error scanning extensions at ${extensionLocation.path}:`, getErrorMessage(error));
			return [];
		}
	}

	private async scanExtensionsInLocation(location: URI, preferredType: ExtensionType): Promise<IRelaxedScannedExtension[]> {
		const stat = await this.fileService.resolve(location);
		if (stat.children) {
			const extensions = await Promise.all<IRelaxedScannedExtension | null>(
				stat.children.filter(c => c.isDirectory)
					.map(async c => {
						if (isEqualOrParent(c.resource, this.userExtensionsLocation) && basename(c.resource).indexOf('.') === 0) { // Do not consider user extension folder starting with `.`
							return null;
						}
						return this.scanExtension(c.resource, preferredType);
					}));
			return coalesce(extensions);
		}
		return [];
	}

	private async scanDefaultSystemExtensions(): Promise<IRelaxedScannedExtension[]> {
		this.logService.trace('Started scanning system extensions');
		const result = await this.scanExtensionsInLocation(this.systemExtensionsLocation, ExtensionType.System);
		this.logService.trace('Scanned system extensions:', result.length);
		return result;
	}

	private async scanDevSystemExtensions(scanOptions: ScanOptions): Promise<IRelaxedScannedExtension[]> {
		const devSystemExtensionsList = this.environmentService.isBuilt ? [] : this.productService.builtInExtensions;
		if (!devSystemExtensionsList?.length) {
			return [];
		}

		this.logService.trace('Started scanning dev system extensions');
		const builtinExtensionControl = scanOptions.checkControlFile ? await this.getBuiltInExtensionControl() : {};
		const devSystemExtensionsLocations: URI[] = [];
		for (const extension of devSystemExtensionsList) {
			const controlState = builtinExtensionControl[extension.name] || 'marketplace';
			switch (controlState) {
				case 'disabled':
					break;
				case 'marketplace':
					devSystemExtensionsLocations.push(joinPath(this.devSystemExtensionsLocation, extension.name));
					break;
				default:
					devSystemExtensionsLocations.push(URI.file(controlState));
					break;
			}
		}
		const result = await Promise.all(devSystemExtensionsLocations.map(location => this.scanExtension(location, ExtensionType.System)));
		this.logService.trace('Scanned dev system extensions:', result.length);
		return coalesce(result);
	}

	private async getBuiltInExtensionControl(): Promise<IBuiltInExtensionControl> {
		try {
			const content = await this.fileService.readFile(joinPath(this.environmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json'));
			return JSON.parse(content.value.toString());
		} catch (error) {
			return {};
		}
	}

	private async scanFromUserExtensionsLocation(): Promise<IRelaxedScannedExtension[]> {
		return this.scanExtensionsInLocation(this.userExtensionsLocation, ExtensionType.User);
	}

	private dedupExtensions(extensions: IRelaxedScannedExtension[], targetPlatform: TargetPlatform, pickLatest: boolean): IRelaxedScannedExtension[] {
		const result = new Map<string, IRelaxedScannedExtension>();
		for (const extension of extensions) {
			const extensionKey = ExtensionIdentifier.toKey(extension.identifier.id);
			const existing = result.get(extensionKey);
			if (existing) {
				if (existing.isValid && !extension.isValid) {
					continue;
				}
				if (existing.isValid === extension.isValid) {
					if (pickLatest && semver.gt(existing.manifest.version, extension.manifest.version)) {
						this.logService.debug(`Skipping extension ${extension.location.fsPath} with lower version ${extension.manifest.version}.`);
						continue;
					}
					if (semver.eq(existing.manifest.version, extension.manifest.version) && existing.targetPlatform === targetPlatform) {
						this.logService.debug(`Skipping extension ${extension.location.fsPath} from different target platform ${extension.targetPlatform}`);
						continue;
					}
				}
				if (existing.type === ExtensionType.System) {
					this.logService.debug(`Overwriting system extension ${existing.location.fsPath} with ${extension.location.fsPath}.`);
				} else {
					this.logService.warn(`Overwriting user extension ${existing.location.fsPath} with ${extension.location.fsPath}.`);
				}
			}
			result.set(extensionKey, extension);
		}
		return [...result.values()];
	}

	private joinErrors(errorOrErrors: (Error | string) | (Array<Error | string>)): Error {
		const errors = Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors];
		if (errors.length === 1) {
			return errors[0] instanceof Error ? <Error>errors[0] : new Error(<string>errors[0]);
		}
		return errors.reduce<Error>((previousValue: Error, currentValue: Error | string) => {
			return new Error(`${previousValue.message}${previousValue.message ? ',' : ''}${currentValue instanceof Error ? currentValue.message : currentValue}`);
		}, new Error(''));
	}

	private _devSystemExtensionsLocation: URI | null = null;
	private get devSystemExtensionsLocation(): URI {
		if (!this._devSystemExtensionsLocation) {
			this._devSystemExtensionsLocation = URI.file(path.normalize(path.join(FileAccess.asFileUri('', require).fsPath, '..', '.build', 'builtInExtensions')));
		}
		return this._devSystemExtensionsLocation;
	}

	private async getUninstalledExtensions(): Promise<IStringDictionary<boolean>> {
		try {
			const raw = (await this.fileService.readFile(joinPath(this.userExtensionsLocation, '.obsolete'))).value.toString();
			return JSON.parse(raw);
		} catch (error) {
			/* Ignore */
		}
		return {};
	}

	private async scanExtension(extensionLocation: URI, preferredType: ExtensionType): Promise<IRelaxedScannedExtension | null> {
		try {
			const manifest = await this.scanExtensionManifest(extensionLocation);
			if (manifest) {
				// allow publisher to be undefined to make the initial extension authoring experience smoother
				if (!manifest.publisher) {
					manifest.publisher = UNDEFINED_PUBLISHER;
				}
				const identifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
				const metadata = manifest.__metadata;
				delete manifest.__metadata;
				const type = metadata?.isSystem ? ExtensionType.System : preferredType;
				const isBuiltin = type === ExtensionType.System || !!metadata?.isBuiltin;
				const validations = validateExtensionManifest(this.productService.version, this.productService.date, extensionLocation, manifest, isBuiltin);
				let isValid = true;
				for (const validation of validations) {
					if (validation.severity === Severity.Error) {
						isValid = false;
						this.logService.error(this.formatMessage(extensionLocation, validation.message));
					}
				}
				return {
					type,
					identifier,
					manifest,
					location: extensionLocation,
					isBuiltin,
					targetPlatform: metadata?.targetPlatform ?? TargetPlatform.UNDEFINED,
					metadata,
					isValid,
					validations
				};
			}
		} catch (e) {
			if (preferredType !== ExtensionType.System) {
				this.logService.error(e);
			}
		}
		return null;
	}

	private async scanExtensionManifest(extensionLocation: URI): Promise<IScannedExtensionManifest | null> {
		const manifestLocation = joinPath(extensionLocation, 'package.json');
		let content;
		try {
			content = (await this.fileService.readFile(manifestLocation)).value.toString();
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(this.formatMessage(extensionLocation, localize('fileReadFail', "Cannot read file {0}: {1}.", manifestLocation.path, error.message)));
			}
			return null;
		}
		let manifest: IScannedExtensionManifest;
		try {
			manifest = JSON.parse(content);
		} catch (err) {
			// invalid JSON, let's get good errors
			const errors: ParseError[] = [];
			parse(content, errors);
			for (const e of errors) {
				this.logService.error(this.formatMessage(extensionLocation, localize('jsonParseFail', "Failed to parse {0}: [{1}, {2}] {3}.", manifestLocation.path, e.offset, e.length, getParseErrorMessage(e.error))));
			}
			return null;
		}
		if (getNodeType(manifest) !== 'object') {
			this.logService.error(this.formatMessage(extensionLocation, localize('jsonParseInvalidType', "Invalid manifest file {0}: Not an JSON object.", manifestLocation.path)));
			return null;
		}
		return manifest;
	}

	private async localizeExtensions(extensions: IRelaxedScannedExtension[], nlsConfig?: NlsConfiguration): Promise<IRelaxedScannedExtension[]> {
		await Promise.all(extensions.map(async extension => {
			try {
				extension.manifest = await this.localizeManifest(extension.location, extension.manifest, nlsConfig);
			} catch (error) {
				/* Ignore Error */
			}
		}));
		return extensions;
	}

	private async localizeManifest(extensionLocation: URI, extensionManifest: IExtensionManifest, nlsConfig?: NlsConfiguration): Promise<IExtensionManifest> {
		const localizedMessages = await this.getLocalizedMessages(extensionLocation, extensionManifest, nlsConfig);
		if (localizedMessages) {
			try {
				const errors: ParseError[] = [];
				// resolveOriginalMessageBundle returns null if localizedMessages.default === undefined;
				const defaults = await this.resolveOriginalMessageBundle(localizedMessages.default, errors);
				if (errors.length > 0) {
					errors.forEach((error) => {
						this.logService.error(this.formatMessage(extensionLocation, localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localizedMessages.default?.path, getParseErrorMessage(error.error))));
					});
					return extensionManifest;
				} else if (getNodeType(localizedMessages) !== 'object') {
					this.logService.error(this.formatMessage(extensionLocation, localize('jsonInvalidFormat', "Invalid format {0}: JSON object expected.", localizedMessages.default?.path)));
					return extensionManifest;
				}
				const localized = localizedMessages.values || Object.create(null);
				this.replaceNLStrings(!!nlsConfig?.pseudo, extensionManifest, localized, defaults, extensionLocation);
			} catch (error) {
				/*Ignore Error*/
			}
		}
		return extensionManifest;
	}

	private async getLocalizedMessages(extensionLocation: URI, extensionManifest: IExtensionManifest, nlsConfig?: NlsConfiguration): Promise<LocalizedMessages | undefined> {
		const defaultPackageNLS = joinPath(extensionLocation, 'package.nls.json');
		if (!nlsConfig) {
			return { values: undefined, default: defaultPackageNLS };
		}

		const reportErrors = (localized: URI | null, errors: ParseError[]): void => {
			errors.forEach((error) => {
				this.logService.error(this.formatMessage(extensionLocation, localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localized?.path, getParseErrorMessage(error.error))));
			});
		};
		const reportInvalidFormat = (localized: URI | null): void => {
			this.logService.error(this.formatMessage(extensionLocation, localize('jsonInvalidFormat', "Invalid format {0}: JSON object expected.", localized?.path)));
		};

		const translationId = `${extensionManifest.publisher}.${extensionManifest.name}`;
		const translationPath = nlsConfig.translations[translationId];

		if (translationPath) {
			try {
				const translationResource = URI.file(translationPath);
				const content = (await this.fileService.readFile(translationResource)).value.toString();
				let errors: ParseError[] = [];
				let translationBundle: TranslationBundle = parse(content, errors);
				if (errors.length > 0) {
					reportErrors(translationResource, errors);
					return { values: undefined, default: defaultPackageNLS };
				} else if (getNodeType(translationBundle) !== 'object') {
					reportInvalidFormat(translationResource);
					return { values: undefined, default: defaultPackageNLS };
				} else {
					let values = translationBundle.contents ? translationBundle.contents.package : undefined;
					return { values: values, default: defaultPackageNLS };
				}
			} catch (error) {
				return { values: undefined, default: defaultPackageNLS };
			}
		} else {
			const exists = await this.fileService.exists(defaultPackageNLS);
			if (!exists) {
				return undefined;
			}
			let messageBundle;
			try {
				messageBundle = await this.findMessageBundles(nlsConfig, extensionLocation);
			} catch (error) {
				return undefined;
			}
			if (!messageBundle.localized) {
				return { values: undefined, default: messageBundle.original };
			}
			try {
				const messageBundleContent = (await this.fileService.readFile(messageBundle.localized)).value.toString();
				let errors: ParseError[] = [];
				let messages: MessageBag = parse(messageBundleContent, errors);
				if (errors.length > 0) {
					reportErrors(messageBundle.localized, errors);
					return { values: undefined, default: messageBundle.original };
				} else if (getNodeType(messages) !== 'object') {
					reportInvalidFormat(messageBundle.localized);
					return { values: undefined, default: messageBundle.original };
				}
				return { values: messages, default: messageBundle.original };
			} catch (error) {
				return { values: undefined, default: messageBundle.original };
			}
		}
	}

	/**
	 * Parses original message bundle, returns null if the original message bundle is null.
	 */
	private async resolveOriginalMessageBundle(originalMessageBundle: URI | null, errors: ParseError[]): Promise<{ [key: string]: string } | null> {
		if (originalMessageBundle) {
			try {
				const originalBundleContent = (await this.fileService.readFile(originalMessageBundle)).value.toString();
				return parse(originalBundleContent, errors);
			} catch (error) {
				/* Ignore Error */
				return null;
			}
		} else {
			return null;
		}
	}

	/**
	 * Finds localized message bundle and the original (unlocalized) one.
	 * If the localized file is not present, returns null for the original and marks original as localized.
	 */
	private findMessageBundles(nlsConfig: NlsConfiguration, extensionLocation: URI): Promise<{ localized: URI; original: URI | null }> {
		return new Promise<{ localized: URI; original: URI | null }>((c, e) => {
			const loop = (locale: string): void => {
				let toCheck = joinPath(extensionLocation, `package.nls.${locale}.json`);
				this.fileService.exists(toCheck).then(exists => {
					if (exists) {
						c({ localized: toCheck, original: joinPath(extensionLocation, 'package.nls.json') });
					}
					let index = locale.lastIndexOf('-');
					if (index === -1) {
						c({ localized: joinPath(extensionLocation, 'package.nls.json'), original: null });
					} else {
						locale = locale.substring(0, index);
						loop(locale);
					}
				});
			};
			if (nlsConfig.devMode || nlsConfig.pseudo || !nlsConfig.locale) {
				return c({ localized: joinPath(extensionLocation, 'package.nls.json'), original: null });
			}
			loop(nlsConfig.locale);
		});
	}

	/**
	 * This routine makes the following assumptions:
	 * The root element is an object literal
	 */
	private replaceNLStrings<T extends object>(pseudo: boolean, literal: T, messages: MessageBag, originalMessages: MessageBag | null, extensionLocation: URI): void {
		const processEntry = (obj: any, key: string | number, command?: boolean) => {
			const value = obj[key];
			if (isString(value)) {
				const str = <string>value;
				const length = str.length;
				if (length > 1 && str[0] === '%' && str[length - 1] === '%') {
					const messageKey = str.substr(1, length - 2);
					let translated = messages[messageKey];
					// If the messages come from a language pack they might miss some keys
					// Fill them from the original messages.
					if (translated === undefined && originalMessages) {
						translated = originalMessages[messageKey];
					}
					let message: string | undefined = typeof translated === 'string' ? translated : (typeof translated?.message === 'string' ? translated.message : undefined);
					if (message !== undefined) {
						if (pseudo) {
							// FF3B and FF3D is the Unicode zenkaku representation for [ and ]
							message = '\uFF3B' + message.replace(/[aouei]/g, '$&$&') + '\uFF3D';
						}
						obj[key] = command && (key === 'title' || key === 'category') && originalMessages ? { value: message, original: originalMessages[messageKey] } : message;
					} else {
						this.logService.warn(this.formatMessage(extensionLocation, localize('missingNLSKey', "Couldn't find message for key {0}.", messageKey)));
					}
				}
			} else if (isObject(value)) {
				for (let k in value) {
					if (value.hasOwnProperty(k)) {
						k === 'commands' ? processEntry(value, k, true) : processEntry(value, k, command);
					}
				}
			} else if (isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					processEntry(value, i, command);
				}
			}
		};

		for (let key in literal) {
			if (literal.hasOwnProperty(key)) {
				processEntry(literal, key);
			}
		}
	}

	private formatMessage(extensionLocation: URI, message: string): string {
		return `[${extensionLocation.path}]: ${message}`;
	}
}

export function toExtensionDescription(extension: IScannedExtension, isUnderDevelopment: boolean): IExtensionDescription {
	const id = getExtensionId(extension.manifest.publisher, extension.manifest.name);
	return {
		id,
		identifier: new ExtensionIdentifier(id),
		isBuiltin: extension.type === ExtensionType.System,
		isUserBuiltin: extension.type === ExtensionType.User && extension.isBuiltin,
		isUnderDevelopment,
		extensionLocation: extension.location,
		uuid: extension.identifier.uuid,
		targetPlatform: extension.targetPlatform,
		...extension.manifest,
	};
}

registerSingleton(INativeExtensionsScannerService, NativeExtensionsScannerService);
