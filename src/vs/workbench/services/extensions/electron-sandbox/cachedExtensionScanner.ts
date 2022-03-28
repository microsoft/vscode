/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import * as errors from 'vs/base/common/errors';
import { FileAccess, Schemas } from 'vs/base/common/network';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { joinPath, originalFSPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { BUILTIN_MANIFEST_CACHE_FILE, MANIFEST_CACHE_FOLDER, USER_MANIFEST_CACHE_FILE, IExtensionDescription, IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/productService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Translations, ILog, ExtensionScanner, ExtensionScannerInput, IExtensionReference, IExtensionResolver } from 'vs/workbench/services/extensions/common/extensionPoints';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

interface IExtensionCacheData {
	input: ExtensionScannerInput;
	result: IExtensionDescription[];
}

let _SystemExtensionsRoot: string | null = null;
function getSystemExtensionsRoot(): string {
	if (!_SystemExtensionsRoot) {
		_SystemExtensionsRoot = path.normalize(path.join(FileAccess.asFileUri('', require).fsPath, '..', 'extensions'));
	}
	return _SystemExtensionsRoot;
}

let _ExtraDevSystemExtensionsRoot: string | null = null;
function getExtraDevSystemExtensionsRoot(): string {
	if (!_ExtraDevSystemExtensionsRoot) {
		_ExtraDevSystemExtensionsRoot = path.normalize(path.join(FileAccess.asFileUri('', require).fsPath, '..', '.build', 'builtInExtensions'));
	}
	return _ExtraDevSystemExtensionsRoot;
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
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService
	) {
		this.scannedExtensions = new Promise<IExtensionDescription[]>((resolve, reject) => {
			this._scannedExtensionsResolve = resolve;
			this._scannedExtensionsReject = reject;
		});
		this.translationConfig = this._readTranslationConfig();
	}

	public async scanSingleExtension(path: string, isBuiltin: boolean, log: ILog): Promise<IExtensionDescription | null> {
		const translations = await this.translationConfig;

		const version = this._productService.version;
		const commit = this._productService.commit;
		const date = this._productService.date;
		const devMode = !this._environmentService.isBuilt;
		const locale = platform.language;
		const targetPlatform = await this._extensionManagementService.getTargetPlatform();
		const input = new ExtensionScannerInput(version, date, commit, locale, devMode, path, isBuiltin, false, targetPlatform, translations);
		return ExtensionScanner.scanSingleExtension(input, log, this._fileService);
	}

	public async startScanningExtensions(log: ILog): Promise<void> {
		try {
			const translations = await this.translationConfig;
			const { system, user, development } = await this._scanInstalledExtensions(log, translations);
			const r = dedupExtensions(system, user, development, log);
			this._scannedExtensionsResolve(r);
		} catch (err) {
			this._scannedExtensionsReject(err);
		}
	}

	private async _validateExtensionsCache(cacheKey: string, input: ExtensionScannerInput): Promise<void> {
		const cacheFolder = path.join(this._environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		const expected = JSON.parse(JSON.stringify(await ExtensionScanner.scanExtensions(input, new NullLogger(), this._fileService)));

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

	private async _scanExtensionsWithCache(cacheKey: string, input: ExtensionScannerInput, log: ILog): Promise<IExtensionDescription[]> {
		if (input.devMode) {
			// Do not cache when running out of sources...
			return ExtensionScanner.scanExtensions(input, log, this._fileService);
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

		const counterLogger = new CounterLogger(log);
		const result = await ExtensionScanner.scanExtensions(input, counterLogger, this._fileService);
		if (counterLogger.errorCnt === 0) {
			// Nothing bad happened => cache the result
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
		log: ILog,
		translations: Translations
	): Promise<{ system: IExtensionDescription[]; user: IExtensionDescription[]; development: IExtensionDescription[] }> {

		const version = this._productService.version;
		const commit = this._productService.commit;
		const date = this._productService.date;
		const devMode = !this._environmentService.isBuilt;
		const locale = platform.language;
		const targetPlatform = await this._extensionManagementService.getTargetPlatform();

		const builtinExtensions = this._scanExtensionsWithCache(
			BUILTIN_MANIFEST_CACHE_FILE,
			new ExtensionScannerInput(version, date, commit, locale, devMode, getSystemExtensionsRoot(), true, false, targetPlatform, translations),
			log
		);

		let finalBuiltinExtensions: Promise<IExtensionDescription[]> = builtinExtensions;

		if (devMode) {
			const builtInExtensions = Promise.resolve<IBuiltInExtension[]>(this._productService.builtInExtensions || []);

			const controlFilePath = joinPath(this._environmentService.userHome, '.vscode-oss-dev', 'extensions', 'control.json').fsPath;
			const controlFile = this._fileService.readFile(URI.file(controlFilePath))
				.then<IBuiltInExtensionControl>(raw => JSON.parse(raw.value.toString()), () => ({} as any));

			const input = new ExtensionScannerInput(version, date, commit, locale, devMode, getExtraDevSystemExtensionsRoot(), true, false, targetPlatform, translations);
			const extraBuiltinExtensions = Promise.all([builtInExtensions, controlFile])
				.then(([builtInExtensions, control]) => new ExtraBuiltInExtensionResolver(builtInExtensions, control))
				.then(resolver => ExtensionScanner.scanExtensions(input, log, this._fileService, resolver));

			finalBuiltinExtensions = ExtensionScanner.mergeBuiltinExtensions(builtinExtensions, extraBuiltinExtensions);
		}

		const userExtensions = (this._scanExtensionsWithCache(
			USER_MANIFEST_CACHE_FILE,
			new ExtensionScannerInput(version, date, commit, locale, devMode, this._environmentService.extensionsPath, false, false, targetPlatform, translations),
			log
		));

		// Always load developed extensions while extensions development
		let developedExtensions: Promise<IExtensionDescription[]> = Promise.resolve([]);
		if (this._environmentService.isExtensionDevelopment && this._environmentService.extensionDevelopmentLocationURI) {
			const extDescsP = this._environmentService.extensionDevelopmentLocationURI.filter(extLoc => extLoc.scheme === Schemas.file).map(extLoc => {
				return ExtensionScanner.scanOneOrMultipleExtensions(
					new ExtensionScannerInput(version, date, commit, locale, devMode, originalFSPath(extLoc), false, true, targetPlatform, translations),
					log,
					this._fileService
				);
			});
			developedExtensions = Promise.all(extDescsP).then((extDescArrays: IExtensionDescription[][]) => {
				let extDesc: IExtensionDescription[] = [];
				for (let eds of extDescArrays) {
					extDesc = extDesc.concat(eds);
				}
				return extDesc;
			});
		}

		return Promise.all([finalBuiltinExtensions, userExtensions, developedExtensions]).then((extensionDescriptions: IExtensionDescription[][]) => {
			const system = extensionDescriptions[0];
			const user = extensionDescriptions[1];
			const development = extensionDescriptions[2];
			return { system, user, development };
		}).then(undefined, err => {
			log.error(`Error scanning installed extensions:`);
			log.error(err);
			return { system: [], user: [], development: [] };
		});
	}
}

interface IBuiltInExtension {
	name: string;
	version: string;
	repo: string;
}

interface IBuiltInExtensionControl {
	[name: string]: 'marketplace' | 'disabled' | string;
}

class ExtraBuiltInExtensionResolver implements IExtensionResolver {

	constructor(private builtInExtensions: IBuiltInExtension[], private control: IBuiltInExtensionControl) { }

	resolveExtensions(): Promise<IExtensionReference[]> {
		const result: IExtensionReference[] = [];

		for (const ext of this.builtInExtensions) {
			const controlState = this.control[ext.name] || 'marketplace';

			switch (controlState) {
				case 'disabled':
					break;
				case 'marketplace':
					result.push({ name: ext.name, path: path.join(getExtraDevSystemExtensionsRoot(), ext.name) });
					break;
				default:
					result.push({ name: ext.name, path: controlState });
					break;
			}
		}

		return Promise.resolve(result);
	}
}

class CounterLogger implements ILog {

	public errorCnt = 0;
	public warnCnt = 0;
	public infoCnt = 0;

	constructor(private readonly _actual: ILog) {
	}

	public error(message: string | Error): void {
		this.errorCnt++;
		this._actual.error(message);
	}

	public warn(message: string): void {
		this.warnCnt++;
		this._actual.warn(message);
	}

	public info(message: string): void {
		this.infoCnt++;
		this._actual.info(message);
	}
}

class NullLogger implements ILog {
	public error(message: string | Error): void {
	}
	public warn(message: string): void {
	}
	public info(message: string): void {
	}
}
