/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { ThrottledDelayer } from 'vs/base/common/async';
import * as objects from 'vs/base/common/objects';
import { VSBuffer } from 'vs/base/common/buffer';
import { IStringDictionary } from 'vs/base/common/collections';
import { getErrorMessage } from 'vs/base/common/errors';
import { getNodeType, parse, ParseError } from 'vs/base/common/json';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import { basename, isEqual, joinPath } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import Severity from 'vs/base/common/severity';
import { isEmptyObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductVersion, Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getExtensionId, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, ExtensionIdentifier, IExtensionManifest, TargetPlatform, IExtensionIdentifier, IRelaxedExtensionManifest, UNDEFINED_PUBLISHER, IExtensionDescription, BUILTIN_MANIFEST_CACHE_FILE, USER_MANIFEST_CACHE_FILE, ExtensionIdentifierMap, parseEnabledApiProposalNames } from 'vs/platform/extensions/common/extensions';
import { validateExtensionManifest } from 'vs/platform/extensions/common/extensionValidator';
import { FileOperationResult, IFileService, toFileOperationResult } from 'vs/platform/files/common/files';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { Emitter, Event } from 'vs/base/common/event';
import { revive } from 'vs/base/common/marshalling';
import { ExtensionsProfileScanningError, ExtensionsProfileScanningErrorCode, IExtensionsProfileScannerService, IProfileExtensionsScanOptions, IScannedProfileExtension } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';

export type IScannedExtensionManifest = IRelaxedExtensionManifest & { __metadata?: Metadata };

interface IRelaxedScannedExtension {
	type: ExtensionType;
	isBuiltin: boolean;
	identifier: IExtensionIdentifier;
	manifest: IRelaxedExtensionManifest;
	location: URI;
	targetPlatform: TargetPlatform;
	publisherDisplayName?: string;
	metadata: Metadata | undefined;
	isValid: boolean;
	validations: readonly [Severity, string][];
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
		const aKeys = Object.keys(a);
		const bKeys: Set<string> = new Set<string>();
		for (const key of Object.keys(b)) {
			bKeys.add(key);
		}
		if (aKeys.length !== bKeys.size) {
			return false;
		}

		for (const key of aKeys) {
			if (a[key] !== b[key]) {
				return false;
			}
			bKeys.delete(key);
		}
		return bKeys.size === 0;
	}
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
	readonly profileLocation?: URI;
	readonly includeInvalid?: boolean;
	readonly includeAllVersions?: boolean;
	readonly includeUninstalled?: boolean;
	readonly checkControlFile?: boolean;
	readonly language?: string;
	readonly useCache?: boolean;
	readonly productVersion?: IProductVersion;
};

export const IExtensionsScannerService = createDecorator<IExtensionsScannerService>('IExtensionsScannerService');
export interface IExtensionsScannerService {
	readonly _serviceBrand: undefined;

	readonly systemExtensionsLocation: URI;
	readonly userExtensionsLocation: URI;
	readonly onDidChangeCache: Event<ExtensionType>;

	getTargetPlatform(): Promise<TargetPlatform>;

	scanAllExtensions(systemScanOptions: ScanOptions, userScanOptions: ScanOptions, includeExtensionsUnderDev: boolean): Promise<IScannedExtension[]>;
	scanSystemExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanUserExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanExtensionsUnderDevelopment(scanOptions: ScanOptions, existingExtensions: IScannedExtension[]): Promise<IScannedExtension[]>;
	scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension | null>;
	scanOneOrMultipleExtensions(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension[]>;
	scanMultipleExtensions(extensionLocations: URI[], extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension[]>;

	scanMetadata(extensionLocation: URI): Promise<Metadata | undefined>;
	updateMetadata(extensionLocation: URI, metadata: Partial<Metadata>): Promise<void>;
	initializeDefaultProfileExtensions(): Promise<void>;
}

export abstract class AbstractExtensionsScannerService extends Disposable implements IExtensionsScannerService {

	readonly _serviceBrand: undefined;

	protected abstract getTranslations(language: string): Promise<Translations>;

	private readonly _onDidChangeCache = this._register(new Emitter<ExtensionType>());
	readonly onDidChangeCache = this._onDidChangeCache.event;

	private readonly obsoleteFile = joinPath(this.userExtensionsLocation, '.obsolete');
	private readonly systemExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, this.currentProfile, this.obsoleteFile));
	private readonly userExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, this.currentProfile, this.obsoleteFile));
	private readonly extensionsScanner = this._register(this.instantiationService.createInstance(ExtensionsScanner, this.obsoleteFile));

	constructor(
		readonly systemExtensionsLocation: URI,
		readonly userExtensionsLocation: URI,
		private readonly extensionsControlLocation: URI,
		private readonly currentProfile: IUserDataProfile,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService protected readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IFileService protected readonly fileService: IFileService,
		@ILogService protected readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.systemExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(ExtensionType.System)));
		this._register(this.userExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(ExtensionType.User)));
	}

	private _targetPlatformPromise: Promise<TargetPlatform> | undefined;
	getTargetPlatform(): Promise<TargetPlatform> {
		if (!this._targetPlatformPromise) {
			this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
		}
		return this._targetPlatformPromise;
	}

	async scanAllExtensions(systemScanOptions: ScanOptions, userScanOptions: ScanOptions, includeExtensionsUnderDev: boolean): Promise<IScannedExtension[]> {
		const [system, user] = await Promise.all([
			this.scanSystemExtensions(systemScanOptions),
			this.scanUserExtensions(userScanOptions),
		]);
		const development = includeExtensionsUnderDev ? await this.scanExtensionsUnderDevelopment(systemScanOptions, [...system, ...user]) : [];
		return this.dedupExtensions(system, user, development, await this.getTargetPlatform(), true);
	}

	async scanSystemExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const promises: Promise<IRelaxedScannedExtension[]>[] = [];
		promises.push(this.scanDefaultSystemExtensions(!!scanOptions.useCache, scanOptions.language));
		promises.push(this.scanDevSystemExtensions(scanOptions.language, !!scanOptions.checkControlFile));
		const [defaultSystemExtensions, devSystemExtensions] = await Promise.all(promises);
		return this.applyScanOptions([...defaultSystemExtensions, ...devSystemExtensions], ExtensionType.System, scanOptions, false);
	}

	async scanUserExtensions(scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const location = scanOptions.profileLocation ?? this.userExtensionsLocation;
		this.logService.trace('Started scanning user extensions', location);
		const profileScanOptions: IProfileExtensionsScanOptions | undefined = this.uriIdentityService.extUri.isEqual(scanOptions.profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource) ? { bailOutWhenFileNotFound: true } : undefined;
		const extensionsScannerInput = await this.createExtensionScannerInput(location, !!scanOptions.profileLocation, ExtensionType.User, !scanOptions.includeUninstalled, scanOptions.language, true, profileScanOptions, scanOptions.productVersion ?? this.getProductVersion());
		const extensionsScanner = scanOptions.useCache && !extensionsScannerInput.devMode && extensionsScannerInput.excludeObsolete ? this.userExtensionsCachedScanner : this.extensionsScanner;
		let extensions: IRelaxedScannedExtension[];
		try {
			extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
		} catch (error) {
			if (error instanceof ExtensionsProfileScanningError && error.code === ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND) {
				await this.doInitializeDefaultProfileExtensions();
				extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
			} else {
				throw error;
			}
		}
		extensions = await this.applyScanOptions(extensions, ExtensionType.User, scanOptions, true);
		this.logService.trace('Scanned user extensions:', extensions.length);
		return extensions;
	}

	async scanExtensionsUnderDevelopment(scanOptions: ScanOptions, existingExtensions: IScannedExtension[]): Promise<IScannedExtension[]> {
		if (this.environmentService.isExtensionDevelopment && this.environmentService.extensionDevelopmentLocationURI) {
			const extensions = (await Promise.all(this.environmentService.extensionDevelopmentLocationURI.filter(extLoc => extLoc.scheme === Schemas.file)
				.map(async extensionDevelopmentLocationURI => {
					const input = await this.createExtensionScannerInput(extensionDevelopmentLocationURI, false, ExtensionType.User, true, scanOptions.language, false /* do not validate */, undefined, scanOptions.productVersion ?? this.getProductVersion());
					const extensions = await this.extensionsScanner.scanOneOrMultipleExtensions(input);
					return extensions.map(extension => {
						// Override the extension type from the existing extensions
						extension.type = existingExtensions.find(e => areSameExtensions(e.identifier, extension.identifier))?.type ?? extension.type;
						// Validate the extension
						return this.extensionsScanner.validate(extension, input);
					});
				})))
				.flat();
			return this.applyScanOptions(extensions, 'development', scanOptions, true);
		}
		return [];
	}

	async scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension | null> {
		const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, true, scanOptions.language, true, undefined, scanOptions.productVersion ?? this.getProductVersion());
		const extension = await this.extensionsScanner.scanExtension(extensionsScannerInput);
		if (!extension) {
			return null;
		}
		if (!scanOptions.includeInvalid && !extension.isValid) {
			return null;
		}
		return extension;
	}

	async scanOneOrMultipleExtensions(extensionLocation: URI, extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, true, scanOptions.language, true, undefined, scanOptions.productVersion ?? this.getProductVersion());
		const extensions = await this.extensionsScanner.scanOneOrMultipleExtensions(extensionsScannerInput);
		return this.applyScanOptions(extensions, extensionType, scanOptions, true);
	}

	async scanMultipleExtensions(extensionLocations: URI[], extensionType: ExtensionType, scanOptions: ScanOptions): Promise<IScannedExtension[]> {
		const extensions: IRelaxedScannedExtension[] = [];
		await Promise.all(extensionLocations.map(async extensionLocation => {
			const scannedExtensions = await this.scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions);
			extensions.push(...scannedExtensions);
		}));
		return this.applyScanOptions(extensions, extensionType, scanOptions, true);
	}

	async scanMetadata(extensionLocation: URI): Promise<Metadata | undefined> {
		const manifestLocation = joinPath(extensionLocation, 'package.json');
		const content = (await this.fileService.readFile(manifestLocation)).value.toString();
		const manifest: IScannedExtensionManifest = JSON.parse(content);
		return manifest.__metadata;
	}

	async updateMetadata(extensionLocation: URI, metaData: Partial<Metadata>): Promise<void> {
		const manifestLocation = joinPath(extensionLocation, 'package.json');
		const content = (await this.fileService.readFile(manifestLocation)).value.toString();
		const manifest: IScannedExtensionManifest = JSON.parse(content);

		// unset if false
		if (metaData.isMachineScoped === false) {
			delete metaData.isMachineScoped;
		}
		if (metaData.isBuiltin === false) {
			delete metaData.isBuiltin;
		}
		manifest.__metadata = { ...manifest.__metadata, ...metaData };

		await this.fileService.writeFile(joinPath(extensionLocation, 'package.json'), VSBuffer.fromString(JSON.stringify(manifest, null, '\t')));
	}

	async initializeDefaultProfileExtensions(): Promise<void> {
		try {
			await this.extensionsProfileScannerService.scanProfileExtensions(this.userDataProfilesService.defaultProfile.extensionsResource, { bailOutWhenFileNotFound: true });
		} catch (error) {
			if (error instanceof ExtensionsProfileScanningError && error.code === ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND) {
				await this.doInitializeDefaultProfileExtensions();
			} else {
				throw error;
			}
		}
	}

	private initializeDefaultProfileExtensionsPromise: Promise<void> | undefined = undefined;
	private async doInitializeDefaultProfileExtensions(): Promise<void> {
		if (!this.initializeDefaultProfileExtensionsPromise) {
			this.initializeDefaultProfileExtensionsPromise = (async () => {
				try {
					this.logService.info('Started initializing default profile extensions in extensions installation folder.', this.userExtensionsLocation.toString());
					const userExtensions = await this.scanUserExtensions({ includeInvalid: true });
					if (userExtensions.length) {
						await this.extensionsProfileScannerService.addExtensionsToProfile(userExtensions.map(e => [e, e.metadata]), this.userDataProfilesService.defaultProfile.extensionsResource);
					} else {
						try {
							await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify([])));
						} catch (error) {
							if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
								this.logService.warn('Failed to create default profile extensions manifest in extensions installation folder.', this.userExtensionsLocation.toString(), getErrorMessage(error));
							}
						}
					}
					this.logService.info('Completed initializing default profile extensions in extensions installation folder.', this.userExtensionsLocation.toString());
				} catch (error) {
					this.logService.error(error);
				} finally {
					this.initializeDefaultProfileExtensionsPromise = undefined;
				}
			})();
		}
		return this.initializeDefaultProfileExtensionsPromise;
	}

	private async applyScanOptions(extensions: IRelaxedScannedExtension[], type: ExtensionType | 'development', scanOptions: ScanOptions, pickLatest: boolean): Promise<IRelaxedScannedExtension[]> {
		if (!scanOptions.includeAllVersions) {
			extensions = this.dedupExtensions(type === ExtensionType.System ? extensions : undefined, type === ExtensionType.User ? extensions : undefined, type === 'development' ? extensions : undefined, await this.getTargetPlatform(), pickLatest);
		}
		if (!scanOptions.includeInvalid) {
			extensions = extensions.filter(extension => extension.isValid);
		}
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

	private dedupExtensions(system: IScannedExtension[] | undefined, user: IScannedExtension[] | undefined, development: IScannedExtension[] | undefined, targetPlatform: TargetPlatform, pickLatest: boolean): IScannedExtension[] {
		const pick = (existing: IScannedExtension, extension: IScannedExtension, isDevelopment: boolean): boolean => {
			if (existing.isValid && !extension.isValid) {
				return false;
			}
			if (existing.isValid === extension.isValid) {
				if (pickLatest && semver.gt(existing.manifest.version, extension.manifest.version)) {
					this.logService.debug(`Skipping extension ${extension.location.path} with lower version ${extension.manifest.version} in favour of ${existing.location.path} with version ${existing.manifest.version}`);
					return false;
				}
				if (semver.eq(existing.manifest.version, extension.manifest.version)) {
					if (existing.type === ExtensionType.System) {
						this.logService.debug(`Skipping extension ${extension.location.path} in favour of system extension ${existing.location.path} with same version`);
						return false;
					}
					if (existing.targetPlatform === targetPlatform) {
						this.logService.debug(`Skipping extension ${extension.location.path} from different target platform ${extension.targetPlatform}`);
						return false;
					}
				}
			}
			if (isDevelopment) {
				this.logService.warn(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
			} else {
				this.logService.debug(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
			}
			return true;
		};
		const result = new ExtensionIdentifierMap<IScannedExtension>();
		system?.forEach((extension) => {
			const existing = result.get(extension.identifier.id);
			if (!existing || pick(existing, extension, false)) {
				result.set(extension.identifier.id, extension);
			}
		});
		user?.forEach((extension) => {
			const existing = result.get(extension.identifier.id);
			if (!existing && system && extension.type === ExtensionType.System) {
				this.logService.debug(`Skipping obsolete system extension ${extension.location.path}.`);
				return;
			}
			if (!existing || pick(existing, extension, false)) {
				result.set(extension.identifier.id, extension);
			}
		});
		development?.forEach(extension => {
			const existing = result.get(extension.identifier.id);
			if (!existing || pick(existing, extension, true)) {
				result.set(extension.identifier.id, extension);
			}
			result.set(extension.identifier.id, extension);
		});
		return [...result.values()];
	}

	private async scanDefaultSystemExtensions(useCache: boolean, language: string | undefined): Promise<IRelaxedScannedExtension[]> {
		this.logService.trace('Started scanning system extensions');
		const extensionsScannerInput = await this.createExtensionScannerInput(this.systemExtensionsLocation, false, ExtensionType.System, true, language, true, undefined, this.getProductVersion());
		const extensionsScanner = useCache && !extensionsScannerInput.devMode ? this.systemExtensionsCachedScanner : this.extensionsScanner;
		const result = await extensionsScanner.scanExtensions(extensionsScannerInput);
		this.logService.trace('Scanned system extensions:', result.length);
		return result;
	}

	private async scanDevSystemExtensions(language: string | undefined, checkControlFile: boolean): Promise<IRelaxedScannedExtension[]> {
		const devSystemExtensionsList = this.environmentService.isBuilt ? [] : this.productService.builtInExtensions;
		if (!devSystemExtensionsList?.length) {
			return [];
		}

		this.logService.trace('Started scanning dev system extensions');
		const builtinExtensionControl = checkControlFile ? await this.getBuiltInExtensionControl() : {};
		const devSystemExtensionsLocations: URI[] = [];
		const devSystemExtensionsLocation = URI.file(path.normalize(path.join(FileAccess.asFileUri('').fsPath, '..', '.build', 'builtInExtensions')));
		for (const extension of devSystemExtensionsList) {
			const controlState = builtinExtensionControl[extension.name] || 'marketplace';
			switch (controlState) {
				case 'disabled':
					break;
				case 'marketplace':
					devSystemExtensionsLocations.push(joinPath(devSystemExtensionsLocation, extension.name));
					break;
				default:
					devSystemExtensionsLocations.push(URI.file(controlState));
					break;
			}
		}
		const result = await Promise.all(devSystemExtensionsLocations.map(async location => this.extensionsScanner.scanExtension((await this.createExtensionScannerInput(location, false, ExtensionType.System, true, language, true, undefined, this.getProductVersion())))));
		this.logService.trace('Scanned dev system extensions:', result.length);
		return coalesce(result);
	}

	private async getBuiltInExtensionControl(): Promise<IBuiltInExtensionControl> {
		try {
			const content = await this.fileService.readFile(this.extensionsControlLocation);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return {};
		}
	}

	private async createExtensionScannerInput(location: URI, profile: boolean, type: ExtensionType, excludeObsolete: boolean, language: string | undefined, validate: boolean, profileScanOptions: IProfileExtensionsScanOptions | undefined, productVersion: IProductVersion): Promise<ExtensionScannerInput> {
		const translations = await this.getTranslations(language ?? platform.language);
		const mtime = await this.getMtime(location);
		const applicationExtensionsLocation = profile && !this.uriIdentityService.extUri.isEqual(location, this.userDataProfilesService.defaultProfile.extensionsResource) ? this.userDataProfilesService.defaultProfile.extensionsResource : undefined;
		const applicationExtensionsLocationMtime = applicationExtensionsLocation ? await this.getMtime(applicationExtensionsLocation) : undefined;
		return new ExtensionScannerInput(
			location,
			mtime,
			applicationExtensionsLocation,
			applicationExtensionsLocationMtime,
			profile,
			profileScanOptions,
			type,
			excludeObsolete,
			validate,
			productVersion.version,
			productVersion.date,
			this.productService.commit,
			!this.environmentService.isBuilt,
			language,
			translations,
		);
	}

	private async getMtime(location: URI): Promise<number | undefined> {
		try {
			const stat = await this.fileService.stat(location);
			if (typeof stat.mtime === 'number') {
				return stat.mtime;
			}
		} catch (err) {
			// That's ok...
		}
		return undefined;
	}

	private getProductVersion(): IProductVersion {
		return {
			version: this.productService.version,
			date: this.productService.date,
		};
	}

}

export class ExtensionScannerInput {

	constructor(
		public readonly location: URI,
		public readonly mtime: number | undefined,
		public readonly applicationExtensionslocation: URI | undefined,
		public readonly applicationExtensionslocationMtime: number | undefined,
		public readonly profile: boolean,
		public readonly profileScanOptions: IProfileExtensionsScanOptions | undefined,
		public readonly type: ExtensionType,
		public readonly excludeObsolete: boolean,
		public readonly validate: boolean,
		public readonly productVersion: string,
		public readonly productDate: string | undefined,
		public readonly productCommit: string | undefined,
		public readonly devMode: boolean,
		public readonly language: string | undefined,
		public readonly translations: Translations
	) {
		// Keep empty!! (JSON.parse)
	}

	public static createNlsConfiguration(input: ExtensionScannerInput): NlsConfiguration {
		return {
			language: input.language,
			pseudo: input.language === 'pseudo',
			devMode: input.devMode,
			translations: input.translations
		};
	}

	public static equals(a: ExtensionScannerInput, b: ExtensionScannerInput): boolean {
		return (
			isEqual(a.location, b.location)
			&& a.mtime === b.mtime
			&& isEqual(a.applicationExtensionslocation, b.applicationExtensionslocation)
			&& a.applicationExtensionslocationMtime === b.applicationExtensionslocationMtime
			&& a.profile === b.profile
			&& objects.equals(a.profileScanOptions, b.profileScanOptions)
			&& a.type === b.type
			&& a.excludeObsolete === b.excludeObsolete
			&& a.validate === b.validate
			&& a.productVersion === b.productVersion
			&& a.productDate === b.productDate
			&& a.productCommit === b.productCommit
			&& a.devMode === b.devMode
			&& a.language === b.language
			&& Translations.equals(a.translations, b.translations)
		);
	}
}

type NlsConfiguration = {
	language: string | undefined;
	pseudo: boolean;
	devMode: boolean;
	translations: Translations;
};

class ExtensionsScanner extends Disposable {

	private readonly extensionsEnabledWithApiProposalVersion: string[];

	constructor(
		private readonly obsoleteFile: URI,
		@IExtensionsProfileScannerService protected readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@IFileService protected readonly fileService: IFileService,
		@IProductService productService: IProductService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService protected readonly logService: ILogService
	) {
		super();
		this.extensionsEnabledWithApiProposalVersion = productService.extensionsEnabledWithApiProposalVersion?.map(id => id.toLowerCase()) ?? [];
	}

	async scanExtensions(input: ExtensionScannerInput): Promise<IRelaxedScannedExtension[]> {
		const extensions = input.profile ? await this.scanExtensionsFromProfile(input) : await this.scanExtensionsFromLocation(input);
		let obsolete: IStringDictionary<boolean> = {};
		if (input.excludeObsolete && input.type === ExtensionType.User) {
			try {
				const raw = (await this.fileService.readFile(this.obsoleteFile)).value.toString();
				obsolete = JSON.parse(raw);
			} catch (error) { /* ignore */ }
		}
		return isEmptyObject(obsolete) ? extensions : extensions.filter(e => !obsolete[ExtensionKey.create(e).toString()]);
	}

	private async scanExtensionsFromLocation(input: ExtensionScannerInput): Promise<IRelaxedScannedExtension[]> {
		const stat = await this.fileService.resolve(input.location);
		if (!stat.children?.length) {
			return [];
		}
		const extensions = await Promise.all<IRelaxedScannedExtension | null>(
			stat.children.map(async c => {
				if (!c.isDirectory) {
					return null;
				}
				// Do not consider user extension folder starting with `.`
				if (input.type === ExtensionType.User && basename(c.resource).indexOf('.') === 0) {
					return null;
				}
				const extensionScannerInput = new ExtensionScannerInput(c.resource, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.excludeObsolete, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
				return this.scanExtension(extensionScannerInput);
			}));
		return coalesce(extensions)
			// Sort: Make sure extensions are in the same order always. Helps cache invalidation even if the order changes.
			.sort((a, b) => a.location.path < b.location.path ? -1 : 1);
	}

	private async scanExtensionsFromProfile(input: ExtensionScannerInput): Promise<IRelaxedScannedExtension[]> {
		let profileExtensions = await this.scanExtensionsFromProfileResource(input.location, () => true, input);
		if (input.applicationExtensionslocation && !this.uriIdentityService.extUri.isEqual(input.location, input.applicationExtensionslocation)) {
			profileExtensions = profileExtensions.filter(e => !e.metadata?.isApplicationScoped);
			const applicationExtensions = await this.scanExtensionsFromProfileResource(input.applicationExtensionslocation, (e) => !!e.metadata?.isBuiltin || !!e.metadata?.isApplicationScoped, input);
			profileExtensions.push(...applicationExtensions);
		}
		return profileExtensions;
	}

	private async scanExtensionsFromProfileResource(profileResource: URI, filter: (extensionInfo: IScannedProfileExtension) => boolean, input: ExtensionScannerInput): Promise<IRelaxedScannedExtension[]> {
		const scannedProfileExtensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileResource, input.profileScanOptions);
		if (!scannedProfileExtensions.length) {
			return [];
		}
		const extensions = await Promise.all<IRelaxedScannedExtension | null>(
			scannedProfileExtensions.map(async extensionInfo => {
				if (filter(extensionInfo)) {
					const extensionScannerInput = new ExtensionScannerInput(extensionInfo.location, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.excludeObsolete, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
					return this.scanExtension(extensionScannerInput, extensionInfo.metadata);
				}
				return null;
			}));
		return coalesce(extensions);
	}

	async scanOneOrMultipleExtensions(input: ExtensionScannerInput): Promise<IRelaxedScannedExtension[]> {
		try {
			if (await this.fileService.exists(joinPath(input.location, 'package.json'))) {
				const extension = await this.scanExtension(input);
				return extension ? [extension] : [];
			} else {
				return await this.scanExtensions(input);
			}
		} catch (error) {
			this.logService.error(`Error scanning extensions at ${input.location.path}:`, getErrorMessage(error));
			return [];
		}
	}

	async scanExtension(input: ExtensionScannerInput, metadata?: Metadata): Promise<IRelaxedScannedExtension | null> {
		try {
			let manifest = await this.scanExtensionManifest(input.location);
			if (manifest) {
				// allow publisher to be undefined to make the initial extension authoring experience smoother
				if (!manifest.publisher) {
					manifest.publisher = UNDEFINED_PUBLISHER;
				}
				metadata = metadata ?? manifest.__metadata;
				delete manifest.__metadata;
				const id = getGalleryExtensionId(manifest.publisher, manifest.name);
				const identifier = metadata?.id ? { id, uuid: metadata.id } : { id };
				const type = metadata?.isSystem ? ExtensionType.System : input.type;
				const isBuiltin = type === ExtensionType.System || !!metadata?.isBuiltin;
				manifest = await this.translateManifest(input.location, manifest, ExtensionScannerInput.createNlsConfiguration(input));
				let extension: IRelaxedScannedExtension = {
					type,
					identifier,
					manifest,
					location: input.location,
					isBuiltin,
					targetPlatform: metadata?.targetPlatform ?? TargetPlatform.UNDEFINED,
					publisherDisplayName: metadata?.publisherDisplayName,
					metadata,
					isValid: true,
					validations: []
				};
				if (input.validate) {
					extension = this.validate(extension, input);
				}
				if (manifest.enabledApiProposals && (!this.environmentService.isBuilt || this.extensionsEnabledWithApiProposalVersion.includes(id.toLowerCase()))) {
					manifest.originalEnabledApiProposals = manifest.enabledApiProposals;
					manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
				}
				return extension;
			}
		} catch (e) {
			if (input.type !== ExtensionType.System) {
				this.logService.error(e);
			}
		}
		return null;
	}

	validate(extension: IRelaxedScannedExtension, input: ExtensionScannerInput): IRelaxedScannedExtension {
		let isValid = true;
		const validateApiVersion = this.environmentService.isBuilt && this.extensionsEnabledWithApiProposalVersion.includes(extension.identifier.id.toLowerCase());
		const validations = validateExtensionManifest(input.productVersion, input.productDate, input.location, extension.manifest, extension.isBuiltin, validateApiVersion);
		for (const [severity, message] of validations) {
			if (severity === Severity.Error) {
				isValid = false;
				this.logService.error(this.formatMessage(input.location, message));
			}
		}
		extension.isValid = isValid;
		extension.validations = validations;
		return extension;
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
			this.logService.error(this.formatMessage(extensionLocation, localize('jsonParseInvalidType', "Invalid manifest file {0}: Not a JSON object.", manifestLocation.path)));
			return null;
		}
		return manifest;
	}

	private async translateManifest(extensionLocation: URI, extensionManifest: IExtensionManifest, nlsConfiguration: NlsConfiguration): Promise<IExtensionManifest> {
		const localizedMessages = await this.getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration);
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
				return localizeManifest(this.logService, extensionManifest, localized, defaults);
			} catch (error) {
				/*Ignore Error*/
			}
		}
		return extensionManifest;
	}

	private async getLocalizedMessages(extensionLocation: URI, extensionManifest: IExtensionManifest, nlsConfiguration: NlsConfiguration): Promise<LocalizedMessages | undefined> {
		const defaultPackageNLS = joinPath(extensionLocation, 'package.nls.json');
		const reportErrors = (localized: URI | null, errors: ParseError[]): void => {
			errors.forEach((error) => {
				this.logService.error(this.formatMessage(extensionLocation, localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localized?.path, getParseErrorMessage(error.error))));
			});
		};
		const reportInvalidFormat = (localized: URI | null): void => {
			this.logService.error(this.formatMessage(extensionLocation, localize('jsonInvalidFormat', "Invalid format {0}: JSON object expected.", localized?.path)));
		};

		const translationId = `${extensionManifest.publisher}.${extensionManifest.name}`;
		const translationPath = nlsConfiguration.translations[translationId];

		if (translationPath) {
			try {
				const translationResource = URI.file(translationPath);
				const content = (await this.fileService.readFile(translationResource)).value.toString();
				const errors: ParseError[] = [];
				const translationBundle: TranslationBundle = parse(content, errors);
				if (errors.length > 0) {
					reportErrors(translationResource, errors);
					return { values: undefined, default: defaultPackageNLS };
				} else if (getNodeType(translationBundle) !== 'object') {
					reportInvalidFormat(translationResource);
					return { values: undefined, default: defaultPackageNLS };
				} else {
					const values = translationBundle.contents ? translationBundle.contents.package : undefined;
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
				messageBundle = await this.findMessageBundles(extensionLocation, nlsConfiguration);
			} catch (error) {
				return undefined;
			}
			if (!messageBundle.localized) {
				return { values: undefined, default: messageBundle.original };
			}
			try {
				const messageBundleContent = (await this.fileService.readFile(messageBundle.localized)).value.toString();
				const errors: ParseError[] = [];
				const messages: MessageBag = parse(messageBundleContent, errors);
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
	private async resolveOriginalMessageBundle(originalMessageBundle: URI | null, errors: ParseError[]): Promise<{ [key: string]: string } | undefined> {
		if (originalMessageBundle) {
			try {
				const originalBundleContent = (await this.fileService.readFile(originalMessageBundle)).value.toString();
				return parse(originalBundleContent, errors);
			} catch (error) {
				/* Ignore Error */
			}
		}
		return;
	}

	/**
	 * Finds localized message bundle and the original (unlocalized) one.
	 * If the localized file is not present, returns null for the original and marks original as localized.
	 */
	private findMessageBundles(extensionLocation: URI, nlsConfiguration: NlsConfiguration): Promise<{ localized: URI; original: URI | null }> {
		return new Promise<{ localized: URI; original: URI | null }>((c, e) => {
			const loop = (locale: string): void => {
				const toCheck = joinPath(extensionLocation, `package.nls.${locale}.json`);
				this.fileService.exists(toCheck).then(exists => {
					if (exists) {
						c({ localized: toCheck, original: joinPath(extensionLocation, 'package.nls.json') });
					}
					const index = locale.lastIndexOf('-');
					if (index === -1) {
						c({ localized: joinPath(extensionLocation, 'package.nls.json'), original: null });
					} else {
						locale = locale.substring(0, index);
						loop(locale);
					}
				});
			};
			if (nlsConfiguration.devMode || nlsConfiguration.pseudo || !nlsConfiguration.language) {
				return c({ localized: joinPath(extensionLocation, 'package.nls.json'), original: null });
			}
			loop(nlsConfiguration.language);
		});
	}

	private formatMessage(extensionLocation: URI, message: string): string {
		return `[${extensionLocation.path}]: ${message}`;
	}

}

interface IExtensionCacheData {
	input: ExtensionScannerInput;
	result: IRelaxedScannedExtension[];
}

class CachedExtensionsScanner extends ExtensionsScanner {

	private input: ExtensionScannerInput | undefined;
	private readonly cacheValidatorThrottler: ThrottledDelayer<void> = this._register(new ThrottledDelayer(3000));

	private readonly _onDidChangeCache = this._register(new Emitter<void>());
	readonly onDidChangeCache = this._onDidChangeCache.event;

	constructor(
		private readonly currentProfile: IUserDataProfile,
		obsoleteFile: URI,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService
	) {
		super(obsoleteFile, extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService);
	}

	override async scanExtensions(input: ExtensionScannerInput): Promise<IRelaxedScannedExtension[]> {
		const cacheFile = this.getCacheFile(input);
		const cacheContents = await this.readExtensionCache(cacheFile);
		this.input = input;
		if (cacheContents && cacheContents.input && ExtensionScannerInput.equals(cacheContents.input, this.input)) {
			this.logService.debug('Using cached extensions scan result', input.type === ExtensionType.System ? 'system' : 'user', input.location.toString());
			this.cacheValidatorThrottler.trigger(() => this.validateCache());
			return cacheContents.result.map((extension) => {
				// revive URI object
				extension.location = URI.revive(extension.location);
				return extension;
			});
		}
		const result = await super.scanExtensions(input);
		await this.writeExtensionCache(cacheFile, { input, result });
		return result;
	}

	private async readExtensionCache(cacheFile: URI): Promise<IExtensionCacheData | null> {
		try {
			const cacheRawContents = await this.fileService.readFile(cacheFile);
			const extensionCacheData: IExtensionCacheData = JSON.parse(cacheRawContents.value.toString());
			return { result: extensionCacheData.result, input: revive(extensionCacheData.input) };
		} catch (error) {
			this.logService.debug('Error while reading the extension cache file:', cacheFile.path, getErrorMessage(error));
		}
		return null;
	}

	private async writeExtensionCache(cacheFile: URI, cacheContents: IExtensionCacheData): Promise<void> {
		try {
			await this.fileService.writeFile(cacheFile, VSBuffer.fromString(JSON.stringify(cacheContents)));
		} catch (error) {
			this.logService.debug('Error while writing the extension cache file:', cacheFile.path, getErrorMessage(error));
		}
	}

	private async validateCache(): Promise<void> {
		if (!this.input) {
			// Input has been unset by the time we get here, so skip validation
			return;
		}

		const cacheFile = this.getCacheFile(this.input);
		const cacheContents = await this.readExtensionCache(cacheFile);
		if (!cacheContents) {
			// Cache has been deleted by someone else, which is perfectly fine...
			return;
		}

		const actual = cacheContents.result;
		const expected = JSON.parse(JSON.stringify(await super.scanExtensions(this.input)));
		if (objects.equals(expected, actual)) {
			// Cache is valid and running with it is perfectly fine...
			return;
		}

		try {
			this.logService.info('Invalidating Cache', actual, expected);
			// Cache is invalid, delete it
			await this.fileService.del(cacheFile);
			this._onDidChangeCache.fire();
		} catch (error) {
			this.logService.error(error);
		}
	}

	private getCacheFile(input: ExtensionScannerInput): URI {
		const profile = this.getProfile(input);
		return this.uriIdentityService.extUri.joinPath(profile.cacheHome, input.type === ExtensionType.System ? BUILTIN_MANIFEST_CACHE_FILE : USER_MANIFEST_CACHE_FILE);
	}

	private getProfile(input: ExtensionScannerInput): IUserDataProfile {
		if (input.type === ExtensionType.System) {
			return this.userDataProfilesService.defaultProfile;
		}
		if (!input.profile) {
			return this.userDataProfilesService.defaultProfile;
		}
		if (this.uriIdentityService.extUri.isEqual(input.location, this.currentProfile.extensionsResource)) {
			return this.currentProfile;
		}
		return this.userDataProfilesService.profiles.find(p => this.uriIdentityService.extUri.isEqual(input.location, p.extensionsResource)) ?? this.currentProfile;
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
		publisherDisplayName: extension.publisherDisplayName,
		...extension.manifest,
	};
}

export class NativeExtensionsScannerService extends AbstractExtensionsScannerService implements IExtensionsScannerService {

	private readonly translationsPromise: Promise<Translations>;

	constructor(
		systemExtensionsLocation: URI,
		userExtensionsLocation: URI,
		userHome: URI,
		currentProfile: IUserDataProfile,
		userDataProfilesService: IUserDataProfilesService,
		extensionsProfileScannerService: IExtensionsProfileScannerService,
		fileService: IFileService,
		logService: ILogService,
		environmentService: IEnvironmentService,
		productService: IProductService,
		uriIdentityService: IUriIdentityService,
		instantiationService: IInstantiationService,
	) {
		super(
			systemExtensionsLocation,
			userExtensionsLocation,
			joinPath(userHome, '.vscode-oss-dev', 'extensions', 'control.json'),
			currentProfile,
			userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService);
		this.translationsPromise = (async () => {
			if (platform.translationsConfigFile) {
				try {
					const content = await this.fileService.readFile(URI.file(platform.translationsConfigFile));
					return JSON.parse(content.value.toString());
				} catch (err) { /* Ignore Error */ }
			}
			return Object.create(null);
		})();
	}

	protected getTranslations(language: string): Promise<Translations> {
		return this.translationsPromise;
	}

}
