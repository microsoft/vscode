/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as os from 'os';
import * as path from 'path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import * as errors from 'vs/base/common/errors';
import { Schemas } from 'vs/base/common/network';
import * as objects from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { fsPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import * as pfs from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { BUILTIN_MANIFEST_CACHE_FILE, MANIFEST_CACHE_FOLDER, USER_MANIFEST_CACHE_FILE, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import pkg from 'vs/platform/node/package';
import product from 'vs/platform/node/product';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionScanner, ExtensionScannerInput, IExtensionReference, IExtensionResolver, ILog, IRelaxedExtensionDescription, Translations } from 'vs/workbench/services/extensions/node/extensionPoints';

interface IExtensionCacheData {
	input: ExtensionScannerInput;
	result: IExtensionDescription[];
}

let _SystemExtensionsRoot: string | null = null;
function getSystemExtensionsRoot(): string {
	if (!_SystemExtensionsRoot) {
		_SystemExtensionsRoot = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', 'extensions'));
	}
	return _SystemExtensionsRoot;
}

let _ExtraDevSystemExtensionsRoot: string | null = null;
function getExtraDevSystemExtensionsRoot(): string {
	if (!_ExtraDevSystemExtensionsRoot) {
		_ExtraDevSystemExtensionsRoot = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', '.build', 'builtInExtensions'));
	}
	return _ExtraDevSystemExtensionsRoot;
}

export class CachedExtensionScanner {

	public readonly scannedExtensions: Promise<IExtensionDescription[]>;
	private _scannedExtensionsResolve: (result: IExtensionDescription[]) => void;
	private _scannedExtensionsReject: (err: any) => void;

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IExtensionEnablementService private readonly _extensionEnablementService: IExtensionEnablementService,
		@IWindowService private readonly _windowService: IWindowService,
	) {
		this.scannedExtensions = new Promise<IExtensionDescription[]>((resolve, reject) => {
			this._scannedExtensionsResolve = resolve;
			this._scannedExtensionsReject = reject;
		});
	}

	public startScanningExtensions(log: ILog): void {
		CachedExtensionScanner._scanInstalledExtensions(this._windowService, this._notificationService, this._environmentService, this._extensionEnablementService, log)
			.then(({ system, user, development }) => {
				let result = new Map<string, IExtensionDescription>();
				system.forEach((systemExtension) => {
					const extensionKey = ExtensionIdentifier.toKey(systemExtension.identifier);
					const extension = result.get(extensionKey);
					if (extension) {
						log.warn(systemExtension.extensionLocation.fsPath, nls.localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, systemExtension.extensionLocation.fsPath));
					}
					result.set(extensionKey, systemExtension);
				});
				user.forEach((userExtension) => {
					const extensionKey = ExtensionIdentifier.toKey(userExtension.identifier);
					const extension = result.get(extensionKey);
					if (extension) {
						log.warn(userExtension.extensionLocation.fsPath, nls.localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, userExtension.extensionLocation.fsPath));
					}
					result.set(extensionKey, userExtension);
				});
				development.forEach(developedExtension => {
					log.info('', nls.localize('extensionUnderDevelopment', "Loading development extension at {0}", developedExtension.extensionLocation.fsPath));
					const extensionKey = ExtensionIdentifier.toKey(developedExtension.identifier);
					const extension = result.get(extensionKey);
					if (extension) {
						log.warn(developedExtension.extensionLocation.fsPath, nls.localize('overwritingExtension', "Overwriting extension {0} with {1}.", extension.extensionLocation.fsPath, developedExtension.extensionLocation.fsPath));
					}
					result.set(extensionKey, developedExtension);
				});
				let r: IExtensionDescription[] = [];
				result.forEach((value) => r.push(value));
				return r;
			})
			.then(this._scannedExtensionsResolve, this._scannedExtensionsReject);
	}

	private static async _validateExtensionsCache(windowService: IWindowService, notificationService: INotificationService, environmentService: IEnvironmentService, cacheKey: string, input: ExtensionScannerInput): Promise<void> {
		const cacheFolder = path.join(environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		const expected = JSON.parse(JSON.stringify(await ExtensionScanner.scanExtensions(input, new NullLogger())));

		const cacheContents = await this._readExtensionCache(environmentService, cacheKey);
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
			await pfs.del(cacheFile);
		} catch (err) {
			errors.onUnexpectedError(err);
			console.error(err);
		}

		notificationService.prompt(
			Severity.Error,
			nls.localize('extensionCache.invalid', "Extensions have been modified on disk. Please reload the window."),
			[{
				label: nls.localize('reloadWindow', "Reload Window"),
				run: () => windowService.reloadWindow()
			}]
		);
	}

	private static async _readExtensionCache(environmentService: IEnvironmentService, cacheKey: string): Promise<IExtensionCacheData | null> {
		const cacheFolder = path.join(environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		try {
			const cacheRawContents = await pfs.readFile(cacheFile, 'utf8');
			return JSON.parse(cacheRawContents);
		} catch (err) {
			// That's ok...
		}

		return null;
	}

	private static async _writeExtensionCache(environmentService: IEnvironmentService, cacheKey: string, cacheContents: IExtensionCacheData): Promise<void> {
		const cacheFolder = path.join(environmentService.userDataPath, MANIFEST_CACHE_FOLDER);
		const cacheFile = path.join(cacheFolder, cacheKey);

		try {
			await pfs.mkdirp(cacheFolder);
		} catch (err) {
			// That's ok...
		}

		try {
			await pfs.writeFile(cacheFile, JSON.stringify(cacheContents));
		} catch (err) {
			// That's ok...
		}
	}

	private static async _scanExtensionsWithCache(windowService: IWindowService, notificationService: INotificationService, environmentService: IEnvironmentService, cacheKey: string, input: ExtensionScannerInput, log: ILog): Promise<IExtensionDescription[]> {
		if (input.devMode) {
			// Do not cache when running out of sources...
			return ExtensionScanner.scanExtensions(input, log);
		}

		try {
			const folderStat = await pfs.stat(input.absoluteFolderPath);
			input.mtime = folderStat.mtime.getTime();
		} catch (err) {
			// That's ok...
		}

		const cacheContents = await this._readExtensionCache(environmentService, cacheKey);
		if (cacheContents && cacheContents.input && ExtensionScannerInput.equals(cacheContents.input, input)) {
			// Validate the cache asynchronously after 5s
			setTimeout(async () => {
				try {
					await this._validateExtensionsCache(windowService, notificationService, environmentService, cacheKey, input);
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
		const result = await ExtensionScanner.scanExtensions(input, counterLogger);
		if (counterLogger.errorCnt === 0) {
			// Nothing bad happened => cache the result
			const cacheContents: IExtensionCacheData = {
				input: input,
				result: result
			};
			await this._writeExtensionCache(environmentService, cacheKey, cacheContents);
		}

		return result;
	}

	private static _scanInstalledExtensions(windowService: IWindowService, notificationService: INotificationService, environmentService: IEnvironmentService, extensionEnablementService: IExtensionEnablementService, log: ILog): Promise<{ system: IExtensionDescription[], user: IExtensionDescription[], development: IExtensionDescription[] }> {

		const translationConfig: Promise<Translations> = platform.translationsConfigFile
			? pfs.readFile(platform.translationsConfigFile, 'utf8').then((content) => {
				try {
					return JSON.parse(content) as Translations;
				} catch (err) {
					return Object.create(null);
				}
			}, (err) => {
				return Object.create(null);
			})
			: Promise.resolve(Object.create(null));

		return translationConfig.then((translations) => {
			const version = pkg.version;
			const commit = product.commit;
			const devMode = !!process.env['VSCODE_DEV'];
			const locale = platform.locale;

			const builtinExtensions = this._scanExtensionsWithCache(
				windowService,
				notificationService,
				environmentService,
				BUILTIN_MANIFEST_CACHE_FILE,
				new ExtensionScannerInput(version, commit, locale, devMode, getSystemExtensionsRoot(), true, false, translations),
				log
			);

			let finalBuiltinExtensions: Promise<IExtensionDescription[]> = builtinExtensions;

			if (devMode) {
				const builtInExtensionsFilePath = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', 'build', 'builtInExtensions.json'));
				const builtInExtensions = pfs.readFile(builtInExtensionsFilePath, 'utf8')
					.then<IBuiltInExtension[]>(raw => JSON.parse(raw));

				const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');
				const controlFile = pfs.readFile(controlFilePath, 'utf8')
					.then<IBuiltInExtensionControl>(raw => JSON.parse(raw), () => ({} as any));

				const input = new ExtensionScannerInput(version, commit, locale, devMode, getExtraDevSystemExtensionsRoot(), true, false, translations);
				const extraBuiltinExtensions = Promise.all([builtInExtensions, controlFile])
					.then(([builtInExtensions, control]) => new ExtraBuiltInExtensionResolver(builtInExtensions, control))
					.then(resolver => ExtensionScanner.scanExtensions(input, log, resolver));

				finalBuiltinExtensions = ExtensionScanner.mergeBuiltinExtensions(builtinExtensions, extraBuiltinExtensions);
			}

			const userExtensions = (
				extensionEnablementService.allUserExtensionsDisabled || !environmentService.extensionsPath
					? Promise.resolve([])
					: this._scanExtensionsWithCache(
						windowService,
						notificationService,
						environmentService,
						USER_MANIFEST_CACHE_FILE,
						new ExtensionScannerInput(version, commit, locale, devMode, environmentService.extensionsPath, false, false, translations),
						log
					)
			);

			// Always load developed extensions while extensions development
			let developedExtensions: Promise<IExtensionDescription[]> = Promise.resolve([]);
			if (environmentService.isExtensionDevelopment && environmentService.extensionDevelopmentLocationURI && environmentService.extensionDevelopmentLocationURI.scheme === Schemas.file) {
				developedExtensions = ExtensionScanner.scanOneOrMultipleExtensions(
					new ExtensionScannerInput(version, commit, locale, devMode, fsPath(environmentService.extensionDevelopmentLocationURI), false, true, translations), log
				);
			}

			return Promise.all([finalBuiltinExtensions, userExtensions, developedExtensions]).then((extensionDescriptions: IExtensionDescription[][]) => {
				const system = extensionDescriptions[0];
				const user = extensionDescriptions[1];
				const development = extensionDescriptions[2];
				return { system, user, development };
			}).then(undefined, err => {
				log.error('', err);
				return { system: [], user: [], development: [] };
			});
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

	public error(source: string, message: string): void {
		this._actual.error(source, message);
	}

	public warn(source: string, message: string): void {
		this._actual.warn(source, message);
	}

	public info(source: string, message: string): void {
		this._actual.info(source, message);
	}
}

class NullLogger implements ILog {
	public error(source: string, message: string): void {
	}
	public warn(source: string, message: string): void {
	}
	public info(source: string, message: string): void {
	}
}

export class Logger implements ILog {

	private readonly _messageHandler: (severity: Severity, source: string, message: string) => void;

	constructor(
		messageHandler: (severity: Severity, source: string, message: string) => void
	) {
		this._messageHandler = messageHandler;
	}

	public error(source: string, message: string): void {
		this._messageHandler(Severity.Error, source, message);
	}

	public warn(source: string, message: string): void {
		this._messageHandler(Severity.Warning, source, message);
	}

	public info(source: string, message: string): void {
		this._messageHandler(Severity.Info, source, message);
	}
}
