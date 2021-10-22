/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import * as performance from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { createRemoteURITransformer } from 'vs/server/remoteUriTransformer';
import { IRemoteAgentEnvironmentDTO, IGetEnvironmentDataArguments, IScanExtensionsArguments, IScanSingleExtensionArguments } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';
import * as nls from 'vs/nls';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IServerEnvironmentService } from 'vs/server/serverEnvironmentService';
import { ExtensionScanner, ExtensionScannerInput, IExtensionResolver, IExtensionReference } from 'vs/workbench/services/extensions/node/extensionPoints';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { transformOutgoingURIs } from 'vs/base/common/uriIpc';
import { ILogService } from 'vs/platform/log/common/log';
import { getNLSConfiguration, InternalNLSConfiguration } from 'vs/server/remoteLanguagePacks';
import { ContextKeyExpr, ContextKeyDefinedExpr, ContextKeyNotExpr, ContextKeyEqualsExpr, ContextKeyNotEqualsExpr, ContextKeyRegexExpr, IContextKeyExprMapper, ContextKeyExpression, ContextKeyInExpr, ContextKeyGreaterExpr, ContextKeyGreaterEqualsExpr, ContextKeySmallerExpr, ContextKeySmallerEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { listProcesses } from 'vs/base/node/ps';
import { getMachineInfo, collectWorkspaceStats } from 'vs/platform/diagnostics/node/diagnosticsService';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { basename, isAbsolute, join, normalize } from 'vs/base/common/path';
import { ProcessItem } from 'vs/base/common/processes';
import { ILog, Translations } from 'vs/workbench/services/extensions/common/extensionPoints';
import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { IBuiltInExtension } from 'vs/base/common/product';
import { IExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { cwd } from 'vs/base/common/process';
import { IRemoteTelemetryService } from 'vs/server/remoteTelemetryService';
import { Promises } from 'vs/base/node/pfs';
import { IProductService } from 'vs/platform/product/common/productService';

let _SystemExtensionsRoot: string | null = null;
function getSystemExtensionsRoot(): string {
	if (!_SystemExtensionsRoot) {
		_SystemExtensionsRoot = normalize(join(FileAccess.asFileUri('', require).fsPath, '..', 'extensions'));
	}
	return _SystemExtensionsRoot;
}
let _ExtraDevSystemExtensionsRoot: string | null = null;
function getExtraDevSystemExtensionsRoot(): string {
	if (!_ExtraDevSystemExtensionsRoot) {
		_ExtraDevSystemExtensionsRoot = normalize(join(FileAccess.asFileUri('', require).fsPath, '..', '.build', 'builtInExtensions'));
	}
	return _ExtraDevSystemExtensionsRoot;
}

export class RemoteAgentEnvironmentChannel implements IServerChannel {

	private static _namePool = 1;
	private readonly _logger: ILog;

	private readonly whenExtensionsReady: Promise<void>;

	constructor(
		private readonly _connectionToken: string,
		private readonly environmentService: IServerEnvironmentService,
		extensionManagementCLIService: IExtensionManagementCLIService,
		private readonly logService: ILogService,
		private readonly telemetryService: IRemoteTelemetryService,
		private readonly telemetryAppender: ITelemetryAppender | null,
		private readonly productService: IProductService
	) {
		this._logger = new class implements ILog {
			public error(source: string, message: string): void {
				logService.error(source, message);
			}
			public warn(source: string, message: string): void {
				logService.warn(source, message);
			}
			public info(source: string, message: string): void {
				logService.info(source, message);
			}
		};

		if (environmentService.args['install-builtin-extension']) {
			this.whenExtensionsReady = extensionManagementCLIService.installExtensions([], environmentService.args['install-builtin-extension'], !!environmentService.args['do-not-sync'], !!environmentService.args['force'])
				.then(null, error => {
					logService.error(error);
				});
		} else {
			this.whenExtensionsReady = Promise.resolve();
		}

		const extensionsToInstall = environmentService.args['install-extension'];
		if (extensionsToInstall) {
			const idsOrVSIX = extensionsToInstall.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
			this.whenExtensionsReady
				.then(() => extensionManagementCLIService.installExtensions(idsOrVSIX, [], !!environmentService.args['do-not-sync'], !!environmentService.args['force']))
				.then(null, error => {
					logService.error(error);
				});
		}
	}

	async call(_: any, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'disableTelemetry': {
				this.telemetryService.permanentlyDisableTelemetry();
				return;
			}

			case 'getEnvironmentData': {
				const args = <IGetEnvironmentDataArguments>arg;
				const uriTransformer = createRemoteURITransformer(args.remoteAuthority);

				let environmentData = await this._getEnvironmentData();
				environmentData = transformOutgoingURIs(environmentData, uriTransformer);

				return environmentData;
			}

			case 'whenExtensionsReady': {
				await this.whenExtensionsReady;
				return;
			}

			case 'scanExtensions': {
				await this.whenExtensionsReady;
				const args = <IScanExtensionsArguments>arg;
				const language = args.language;
				this.logService.trace(`Scanning extensions using UI language: ${language}`);
				const uriTransformer = createRemoteURITransformer(args.remoteAuthority);

				const extensionDevelopmentLocations = args.extensionDevelopmentPath && args.extensionDevelopmentPath.map(url => URI.revive(uriTransformer.transformIncoming(url)));
				const extensionDevelopmentPath = extensionDevelopmentLocations ? extensionDevelopmentLocations.filter(url => url.scheme === Schemas.file).map(url => url.fsPath) : undefined;

				let extensions = await this._scanExtensions(language, extensionDevelopmentPath);
				extensions = transformOutgoingURIs(extensions, uriTransformer);

				this.logService.trace('Scanned Extensions', extensions);
				RemoteAgentEnvironmentChannel._massageWhenConditions(extensions);

				return extensions;
			}

			case 'scanSingleExtension': {
				await this.whenExtensionsReady;
				const args = <IScanSingleExtensionArguments>arg;
				const language = args.language;
				const isBuiltin = args.isBuiltin;
				const uriTransformer = createRemoteURITransformer(args.remoteAuthority);
				const extensionLocation = URI.revive(uriTransformer.transformIncoming(args.extensionLocation));
				const extensionPath = extensionLocation.scheme === Schemas.file ? extensionLocation.fsPath : null;

				if (!extensionPath) {
					return null;
				}

				const translations = await this._getTranslations(language);
				let extension = await this._scanSingleExtension(extensionPath, isBuiltin, language, translations);

				if (!extension) {
					return null;
				}

				extension = transformOutgoingURIs(extension, uriTransformer);

				RemoteAgentEnvironmentChannel._massageWhenConditions([extension]);

				return extension;
			}

			case 'getDiagnosticInfo': {
				const options = <IDiagnosticInfoOptions>arg;
				const diagnosticInfo: IDiagnosticInfo = {
					machineInfo: getMachineInfo()
				};

				const processesPromise: Promise<ProcessItem | void> = options.includeProcesses ? listProcesses(process.pid) : Promise.resolve();

				let workspaceMetadataPromises: Promise<void>[] = [];
				const workspaceMetadata: { [key: string]: any } = {};
				if (options.folders) {
					// only incoming paths are transformed, so remote authority is unneeded.
					const uriTransformer = createRemoteURITransformer('');
					const folderPaths = options.folders
						.map(folder => URI.revive(uriTransformer.transformIncoming(folder)))
						.filter(uri => uri.scheme === 'file');

					workspaceMetadataPromises = folderPaths.map(folder => {
						return collectWorkspaceStats(folder.fsPath, ['node_modules', '.git'])
							.then(stats => {
								workspaceMetadata[basename(folder.fsPath)] = stats;
							});
					});
				}

				return Promise.all([processesPromise, ...workspaceMetadataPromises]).then(([processes, _]) => {
					diagnosticInfo.processes = processes || undefined;
					diagnosticInfo.workspaceMetadata = options.folders ? workspaceMetadata : undefined;
					return diagnosticInfo;
				});
			}

			case 'logTelemetry': {
				const { eventName, data } = arg;
				// Logging is done directly to the appender instead of through the telemetry service
				// as the data sent from the client has already had common properties added to it and
				// has already been sent to the telemetry output channel
				if (this.telemetryAppender) {
					return this.telemetryAppender.log(eventName, data);
				}

				return Promise.resolve();
			}

			case 'flushTelemetry': {
				if (this.telemetryAppender) {
					return this.telemetryAppender.flush();
				}

				return Promise.resolve();
			}
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: any, event: string, arg: any): Event<any> {
		throw new Error('Not supported');
	}

	private static _massageWhenConditions(extensions: IExtensionDescription[]): void {
		// Massage "when" conditions which mention `resourceScheme`

		interface WhenUser { when?: string; }

		interface LocWhenUser { [loc: string]: WhenUser[]; }

		const _mapResourceSchemeValue = (value: string, isRegex: boolean): string => {
			// console.log(`_mapResourceSchemeValue: ${value}, ${isRegex}`);
			return value.replace(/file/g, 'vscode-remote');
		};

		const _mapResourceRegExpValue = (value: RegExp): RegExp => {
			let flags = '';
			flags += value.global ? 'g' : '';
			flags += value.ignoreCase ? 'i' : '';
			flags += value.multiline ? 'm' : '';
			return new RegExp(_mapResourceSchemeValue(value.source, true), flags);
		};

		const _exprKeyMapper = new class implements IContextKeyExprMapper {
			mapDefined(key: string): ContextKeyExpression {
				return ContextKeyDefinedExpr.create(key);
			}
			mapNot(key: string): ContextKeyExpression {
				return ContextKeyNotExpr.create(key);
			}
			mapEquals(key: string, value: any): ContextKeyExpression {
				if (key === 'resourceScheme' && typeof value === 'string') {
					return ContextKeyEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
				} else {
					return ContextKeyEqualsExpr.create(key, value);
				}
			}
			mapNotEquals(key: string, value: any): ContextKeyExpression {
				if (key === 'resourceScheme' && typeof value === 'string') {
					return ContextKeyNotEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
				} else {
					return ContextKeyNotEqualsExpr.create(key, value);
				}
			}
			mapGreater(key: string, value: any): ContextKeyExpression {
				return ContextKeyGreaterExpr.create(key, value);
			}
			mapGreaterEquals(key: string, value: any): ContextKeyExpression {
				return ContextKeyGreaterEqualsExpr.create(key, value);
			}
			mapSmaller(key: string, value: any): ContextKeyExpression {
				return ContextKeySmallerExpr.create(key, value);
			}
			mapSmallerEquals(key: string, value: any): ContextKeyExpression {
				return ContextKeySmallerEqualsExpr.create(key, value);
			}
			mapRegex(key: string, regexp: RegExp | null): ContextKeyRegexExpr {
				if (key === 'resourceScheme' && regexp) {
					return ContextKeyRegexExpr.create(key, _mapResourceRegExpValue(regexp));
				} else {
					return ContextKeyRegexExpr.create(key, regexp);
				}
			}
			mapIn(key: string, valueKey: string): ContextKeyInExpr {
				return ContextKeyInExpr.create(key, valueKey);
			}
		};

		const _massageWhenUser = (element: WhenUser) => {
			if (!element || !element.when || !/resourceScheme/.test(element.when)) {
				return;
			}

			const expr = ContextKeyExpr.deserialize(element.when);
			if (!expr) {
				return;
			}

			const massaged = expr.map(_exprKeyMapper);
			element.when = massaged.serialize();
		};

		const _massageWhenUserArr = (elements: WhenUser[] | WhenUser) => {
			if (Array.isArray(elements)) {
				for (let element of elements) {
					_massageWhenUser(element);
				}
			} else {
				_massageWhenUser(elements);
			}
		};

		const _massageLocWhenUser = (target: LocWhenUser) => {
			for (let loc in target) {
				_massageWhenUserArr(target[loc]);
			}
		};

		extensions.forEach((extension) => {
			if (extension.contributes) {
				if (extension.contributes.menus) {
					_massageLocWhenUser(<LocWhenUser>extension.contributes.menus);
				}
				if (extension.contributes.keybindings) {
					_massageWhenUserArr(<WhenUser | WhenUser[]>extension.contributes.keybindings);
				}
				if (extension.contributes.views) {
					_massageLocWhenUser(<LocWhenUser>extension.contributes.views);
				}
			}
		});
	}

	private async _getEnvironmentData(): Promise<IRemoteAgentEnvironmentDTO> {
		return {
			pid: process.pid,
			connectionToken: this._connectionToken,
			appRoot: URI.file(this.environmentService.appRoot),
			settingsPath: this.environmentService.machineSettingsResource,
			logsPath: URI.file(this.environmentService.logsPath),
			extensionsPath: URI.file(this.environmentService.extensionsPath!),
			extensionHostLogsPath: URI.file(join(this.environmentService.logsPath, `exthost${RemoteAgentEnvironmentChannel._namePool++}`)),
			globalStorageHome: this.environmentService.globalStorageHome,
			workspaceStorageHome: this.environmentService.workspaceStorageHome,
			userHome: this.environmentService.userHome,
			os: platform.OS,
			arch: process.arch,
			marks: performance.getMarks(),
			useHostProxy: (this.environmentService.args['use-host-proxy'] !== undefined)
		};
	}

	private async _getTranslations(language: string): Promise<Translations> {
		const config = await getNLSConfiguration(language, this.environmentService.userDataPath);
		if (InternalNLSConfiguration.is(config)) {
			try {
				const content = await Promises.readFile(config._translationsConfigFile, 'utf8');
				return JSON.parse(content);
			} catch (err) {
				return Object.create(null);
			}
		} else {
			return Object.create(null);
		}
	}

	private async _scanExtensions(language: string, extensionDevelopmentPath?: string[]): Promise<IExtensionDescription[]> {
		// Ensure that the language packs are available
		const translations = await this._getTranslations(language);

		const [builtinExtensions, installedExtensions, developedExtensions] = await Promise.all([
			this._scanBuiltinExtensions(language, translations),
			this._scanInstalledExtensions(language, translations),
			this._scanDevelopedExtensions(language, translations, extensionDevelopmentPath)
		]);

		let result = new Map<string, IExtensionDescription>();

		builtinExtensions.forEach((builtinExtension) => {
			if (!builtinExtension) {
				return;
			}
			result.set(ExtensionIdentifier.toKey(builtinExtension.identifier), builtinExtension);
		});

		installedExtensions.forEach((installedExtension) => {
			if (!installedExtension) {
				return;
			}
			if (result.has(ExtensionIdentifier.toKey(installedExtension.identifier))) {
				console.warn(nls.localize('overwritingExtension', "Overwriting extension {0} with {1}.", result.get(ExtensionIdentifier.toKey(installedExtension.identifier))!.extensionLocation.fsPath, installedExtension.extensionLocation.fsPath));
			}
			result.set(ExtensionIdentifier.toKey(installedExtension.identifier), installedExtension);
		});

		developedExtensions.forEach((developedExtension) => {
			if (!developedExtension) {
				return;
			}
			result.set(ExtensionIdentifier.toKey(developedExtension.identifier), developedExtension);
		});

		const r: IExtensionDescription[] = [];
		result.forEach((v) => r.push(v));
		return r;
	}

	private _scanDevelopedExtensions(language: string, translations: Translations, extensionDevelopmentPaths?: string[]): Promise<IExtensionDescription[]> {

		if (extensionDevelopmentPaths) {

			const extDescsP = extensionDevelopmentPaths.map(extDevPath => {
				return ExtensionScanner.scanOneOrMultipleExtensions(
					new ExtensionScannerInput(
						this.productService.version,
						this.productService.date,
						this.productService.commit,
						language,
						true, // dev mode
						extDevPath,
						false, // isBuiltin
						true, // isUnderDevelopment
						translations // translations
					), this._logger
				);
			});

			return Promise.all(extDescsP).then((extDescArrays: IExtensionDescription[][]) => {
				let extDesc: IExtensionDescription[] = [];
				for (let eds of extDescArrays) {
					extDesc = extDesc.concat(eds);
				}
				return extDesc;
			});
		}
		return Promise.resolve([]);
	}

	private _scanBuiltinExtensions(language: string, translations: Translations): Promise<IExtensionDescription[]> {
		const version = this.productService.version;
		const commit = this.productService.commit;
		const date = this.productService.date;
		const devMode = !!process.env['VSCODE_DEV'];

		const input = new ExtensionScannerInput(version, date, commit, language, devMode, getSystemExtensionsRoot(), true, false, translations);
		const builtinExtensions = ExtensionScanner.scanExtensions(input, this._logger);
		let finalBuiltinExtensions: Promise<IExtensionDescription[]> = builtinExtensions;

		if (devMode) {

			class ExtraBuiltInExtensionResolver implements IExtensionResolver {
				constructor(private builtInExtensions: IBuiltInExtension[]) { }
				resolveExtensions(): Promise<IExtensionReference[]> {
					return Promise.resolve(this.builtInExtensions.map((ext) => {
						return { name: ext.name, path: join(getExtraDevSystemExtensionsRoot(), ext.name) };
					}));
				}
			}

			const builtInExtensions = Promise.resolve(this.productService.builtInExtensions || []);

			const input = new ExtensionScannerInput(version, date, commit, language, devMode, getExtraDevSystemExtensionsRoot(), true, false, {});
			const extraBuiltinExtensions = builtInExtensions
				.then((builtInExtensions) => new ExtraBuiltInExtensionResolver(builtInExtensions))
				.then(resolver => ExtensionScanner.scanExtensions(input, this._logger, resolver));

			finalBuiltinExtensions = ExtensionScanner.mergeBuiltinExtensions(builtinExtensions, extraBuiltinExtensions);
		}

		return finalBuiltinExtensions;
	}

	private _scanInstalledExtensions(language: string, translations: Translations): Promise<IExtensionDescription[]> {
		const devMode = !!process.env['VSCODE_DEV'];
		const input = new ExtensionScannerInput(
			this.productService.version,
			this.productService.date,
			this.productService.commit,
			language,
			devMode,
			this.environmentService.extensionsPath!,
			false, // isBuiltin
			false, // isUnderDevelopment
			translations
		);

		return ExtensionScanner.scanExtensions(input, this._logger);
	}

	private _scanSingleExtension(extensionPath: string, isBuiltin: boolean, language: string, translations: Translations): Promise<IExtensionDescription | null> {
		const devMode = !!process.env['VSCODE_DEV'];
		const input = new ExtensionScannerInput(
			this.productService.version,
			this.productService.date,
			this.productService.commit,
			language,
			devMode,
			extensionPath,
			isBuiltin,
			false, // isUnderDevelopment
			translations
		);
		return ExtensionScanner.scanSingleExtension(input, this._logger);
	}
}
