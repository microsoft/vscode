/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import * as errors from 'vs/base/common/errors';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { BUILTIN_MANIFEST_CACHE_FILE, MANIFEST_CACHE_FOLDER, USER_MANIFEST_CACHE_FILE, IExtensionDescription, IRelaxedExtensionDescription, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/productService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionsScannerService, IScannedExtension, NlsConfiguration, toExtensionDescription, Translations } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ILogService } from 'vs/platform/log/common/log';

interface IExtensionCacheData {
	input: ExtensionScannerInput;
	result: IExtensionDescription[];
}

class ExtensionScannerInput {

	public mtime: number | undefined;

	constructor(
		public readonly ourVersion: string,
		public readonly ourProductDate: string | undefined,
		public readonly commit: string | undefined,
		public readonly locale: string | undefined,
		public readonly devMode: boolean,
		public readonly absoluteFolderPath: string,
		public readonly isBuiltin: boolean,
		public readonly isUnderDevelopment: boolean,
		public readonly translations: Translations
	) {
		// Keep empty!! (JSON.parse)
	}

	public static createNLSConfig(input: { devMode: boolean; locale: string | undefined; translations: Translations }): NlsConfiguration {
		return {
			devMode: input.devMode,
			locale: input.locale,
			pseudo: input.locale === 'pseudo',
			translations: input.translations
		};
	}

	public static equals(a: ExtensionScannerInput, b: ExtensionScannerInput): boolean {
		return (
			a.ourVersion === b.ourVersion
			&& a.ourProductDate === b.ourProductDate
			&& a.commit === b.commit
			&& a.locale === b.locale
			&& a.devMode === b.devMode
			&& a.absoluteFolderPath === b.absoluteFolderPath
			&& a.isBuiltin === b.isBuiltin
			&& a.isUnderDevelopment === b.isUnderDevelopment
			&& a.mtime === b.mtime
			&& Translations.equals(a.translations, b.translations)
		);
	}
}

export class CachedExtensionScanner {

	public readonly scannedExtensions: Promise<IExtensionDescription[]>;
	private _scannedExtensionsResolve!: (result: IExtensionDescription[]) => void;
	private _scannedExtensionsReject!: (err: any) => void;
	public readonly translationConfig: Promise<Translations>;

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IHostService private readonly _hostService: IHostService,
		@IProductService private readonly _productService: IProductService,
		@IFileService private readonly _fileService: IFileService,
		@IExtensionsScannerService private readonly _extensionsScannerService: IExtensionsScannerService,
		@ILogService private readonly _logService: ILogService,
	) {
		this.scannedExtensions = new Promise<IExtensionDescription[]>((resolve, reject) => {
			this._scannedExtensionsResolve = resolve;
			this._scannedExtensionsReject = reject;
		});
		this.translationConfig = this._readTranslationConfig();
	}

	public async scanSingleExtension(extensionPath: string, isBuiltin: boolean): Promise<IExtensionDescription | null> {
		const translations = await this.translationConfig;
		const extensionLocation = URI.file(path.resolve(extensionPath));
		const type = isBuiltin ? ExtensionType.System : ExtensionType.User;
		const nlsConfiguration = ExtensionScannerInput.createNLSConfig({ devMode: !this._environmentService.isBuilt, locale: platform.language, translations });
		const scannedExtension = await this._extensionsScannerService.scanExistingExtension(extensionLocation, type, { nlsConfiguration });
		return scannedExtension ? toExtensionDescription(scannedExtension, false) : null;
	}

	public async startScanningExtensions(): Promise<void> {
		try {
			const translations = await this.translationConfig;
			const { system, user, development } = await this._scanInstalledExtensions(translations);
			const r = dedupExtensions(system, user, development, this._logService);
			this._scannedExtensionsResolve(r);
		} catch (err) {
			this._scannedExtensionsReject(err);
		}
	}

	private async _validateExtensionsCache(cacheKey: string, input: ExtensionScannerInput): Promise<void> {
		const cacheFolder = path.join(this._environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		const expected = JSON.parse(JSON.stringify(await this.scanExtensionDescriptions(input.isBuiltin, ExtensionScannerInput.createNLSConfig(input))));

		const cacheContents = await this._readExtensionCache(cacheKey);
		if (!cacheContents) {
			// Cache has been deleted by someone else, which is perfectly fine...
			return;
		}
		const actual = cacheContents.result;

		if (objects.equals(expected, actual)) {
			// Cache is valid and running with it is perfectly fine...
			return;
		}

		try {
			await this._fileService.del(URI.file(cacheFile));
		} catch (err) {
			errors.onUnexpectedError(err);
			console.error(err);
		}

		this._notificationService.prompt(
			Severity.Error,
			nls.localize('extensionCache.invalid', "Extensions have been modified on disk. Please reload the window."),
			[{
				label: nls.localize('reloadWindow', "Reload Window"),
				run: () => this._hostService.reload()
			}]
		);
	}

	private async _readExtensionCache(cacheKey: string): Promise<IExtensionCacheData | null> {
		const cacheFolder = path.join(this._environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		try {
			const cacheRawContents = await this._fileService.readFile(URI.file(cacheFile));
			return JSON.parse(cacheRawContents.value.toString());
		} catch (err) {
			// That's ok...
		}

		return null;
	}

	private async _writeExtensionCache(cacheKey: string, cacheContents: IExtensionCacheData): Promise<void> {
		const cacheFolder = path.join(this._environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		try {
			await this._fileService.createFolder(URI.file(cacheFolder));
		} catch (err) {
			// That's ok...
		}

		try {
			await this._fileService.writeFile(URI.file(cacheFile), VSBuffer.fromString(JSON.stringify(cacheContents)));
		} catch (err) {
			// That's ok...
		}
	}

	private async _scanExtensionsWithCache(cacheKey: string, input: ExtensionScannerInput): Promise<IExtensionDescription[]> {
		if (input.devMode) {
			// Do not cache when running out of sources...
			return this.scanExtensionDescriptions(input.isBuiltin, ExtensionScannerInput.createNLSConfig(input));
		}

		try {
			const folderStat = await this._fileService.stat(URI.file(input.absoluteFolderPath));
			if (typeof folderStat.mtime === 'number') {
				input.mtime = folderStat.mtime;
			}
		} catch (err) {
			// That's ok...
		}

		const cacheContents = await this._readExtensionCache(cacheKey);
		if (cacheContents && cacheContents.input && ExtensionScannerInput.equals(cacheContents.input, input)) {
			// Validate the cache asynchronously after 5s
			setTimeout(async () => {
				try {
					await this._validateExtensionsCache(cacheKey, input);
				} catch (err) {
					errors.onUnexpectedError(err);
				}
			}, 5000);
			return cacheContents.result.map((extensionDescription) => {
				// revive URI object
				(<IRelaxedExtensionDescription>extensionDescription).extensionLocation = URI.revive(extensionDescription.extensionLocation);
				return extensionDescription;
			});
		}

		const result: IExtensionDescription[] = [];
		let canCache = true;
		const scannedExtensions = await this.scanExtensions(input.isBuiltin, ExtensionScannerInput.createNLSConfig(input), true);
		for (const scannedExtension of scannedExtensions) {
			if (scannedExtension.isValid) {
				result.push(toExtensionDescription(scannedExtension, input.isUnderDevelopment));
			} else {
				// Do not cache if any of the extensions are not valid
				canCache = false;
			}
		}
		if (canCache) {
			const cacheContents: IExtensionCacheData = {
				input: input,
				result: result
			};
			await this._writeExtensionCache(cacheKey, cacheContents);
		}

		return result;
	}

	private async _readTranslationConfig(): Promise<Translations> {
		if (platform.translationsConfigFile) {
			try {
				const content = await this._fileService.readFile(URI.file(platform.translationsConfigFile));
				return JSON.parse(content.value.toString()) as Translations;
			} catch (err) {
				// no problemo
			}
		}
		return Object.create(null);
	}

	private async _scanInstalledExtensions(
		translations: Translations
	): Promise<{ system: IExtensionDescription[]; user: IExtensionDescription[]; development: IExtensionDescription[] }> {

		const version = this._productService.version;
		const commit = this._productService.commit;
		const date = this._productService.date;
		const devMode = !this._environmentService.isBuilt;
		const locale = platform.language;

		const builtinExtensions = this._scanExtensionsWithCache(
			BUILTIN_MANIFEST_CACHE_FILE,
			new ExtensionScannerInput(version, date, commit, locale, devMode, this._extensionsScannerService.systemExtensionsLocation.path, true, false, translations),
		);

		const userExtensions = this._scanExtensionsWithCache(
			USER_MANIFEST_CACHE_FILE,
			new ExtensionScannerInput(version, date, commit, locale, devMode, this._extensionsScannerService.userExtensionsLocation.path, false, false, translations),
		);

		// Always load developed extensions while extensions development
		const nlsConfiguration = ExtensionScannerInput.createNLSConfig(ExtensionScannerInput.createNLSConfig({ devMode, locale, translations }));
		const developedExtensions = this._extensionsScannerService.scanExtensionsUnderDevelopment({ nlsConfiguration })
			.then(scannedExtensions => scannedExtensions.map(e => toExtensionDescription(e, true)));

		return Promise.all([builtinExtensions, userExtensions, developedExtensions]).then((extensionDescriptions: IExtensionDescription[][]) => {
			const system = extensionDescriptions[0];
			const user = extensionDescriptions[1];
			const development = extensionDescriptions[2];
			return { system, user, development };
		}).then(undefined, err => {
			this._logService.error(`Error scanning installed extensions:`);
			this._logService.error(err);
			return { system: [], user: [], development: [] };
		});
	}

	private async scanExtensionDescriptions(isBuiltin: boolean, nlsConfiguration: NlsConfiguration): Promise<IExtensionDescription[]> {
		const scannedExtensions = await this.scanExtensions(isBuiltin, nlsConfiguration, false);
		return scannedExtensions.map(e => toExtensionDescription(e, false));
	}

	private async scanExtensions(isBuiltin: boolean, nlsConfiguration: NlsConfiguration, includeInvalid: boolean): Promise<IScannedExtension[]> {
		return isBuiltin ? this._extensionsScannerService.scanSystemExtensions({ nlsConfiguration, checkControlFile: true, includeInvalid })
			: this._extensionsScannerService.scanUserExtensions({ nlsConfiguration, includeInvalid });
	}

}
