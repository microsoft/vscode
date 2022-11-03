/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import * as platform from 'vs/base/common/platform';
import * as performance from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { createURITransformer } from 'vs/workbench/api/node/uriTransformer';
import { IRemoteAgentEnvironmentDTO, IGetEnvironmentDataArguments, IScanExtensionsArguments, IScanSingleExtensionArguments, IGetExtensionHostExitInfoArguments } from 'vs/workbench/services/remote/common/remoteAgentEnvironmentChannel';
import { Schemas } from 'vs/base/common/network';
import { IServerEnvironmentService } from 'vs/server/node/serverEnvironmentService';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ExtensionType, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { transformOutgoingURIs } from 'vs/base/common/uriIpc';
import { ILogService } from 'vs/platform/log/common/log';
import { ContextKeyExpr, ContextKeyDefinedExpr, ContextKeyNotExpr, ContextKeyEqualsExpr, ContextKeyNotEqualsExpr, ContextKeyRegexExpr, IContextKeyExprMapper, ContextKeyExpression, ContextKeyInExpr, ContextKeyGreaterExpr, ContextKeyGreaterEqualsExpr, ContextKeySmallerExpr, ContextKeySmallerEqualsExpr, ContextKeyNotInExpr } from 'vs/platform/contextkey/common/contextkey';
import { listProcesses } from 'vs/base/node/ps';
import { getMachineInfo, collectWorkspaceStats } from 'vs/platform/diagnostics/node/diagnosticsService';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { basename, isAbsolute, join, resolve } from 'vs/base/common/path';
import { ProcessItem } from 'vs/base/common/processes';
import { InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { cwd } from 'vs/base/common/process';
import { ServerConnectionToken, ServerConnectionTokenType } from 'vs/server/node/serverConnectionToken';
import { IExtensionHostStatusService } from 'vs/server/node/extensionHostStatusService';
import { IExtensionsScannerService, toExtensionDescription } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ExtensionManagementCLI } from 'vs/platform/extensionManagement/common/extensionManagementCLI';

export class RemoteAgentEnvironmentChannel implements IServerChannel {

	private static _namePool = 1;

	private readonly whenExtensionsReady: Promise<void>;

	constructor(
		private readonly _connectionToken: ServerConnectionToken,
		private readonly _environmentService: IServerEnvironmentService,
		private readonly _userDataProfilesService: IUserDataProfilesService,
		extensionManagementCLI: ExtensionManagementCLI,
		private readonly _logService: ILogService,
		private readonly _extensionHostStatusService: IExtensionHostStatusService,
		private readonly _extensionsScannerService: IExtensionsScannerService,
	) {
		if (_environmentService.args['install-builtin-extension']) {
			const installOptions: InstallOptions = { isMachineScoped: !!_environmentService.args['do-not-sync'], installPreReleaseVersion: !!_environmentService.args['pre-release'] };
			this.whenExtensionsReady = extensionManagementCLI.installExtensions([], _environmentService.args['install-builtin-extension'], installOptions, !!_environmentService.args['force'])
				.then(null, error => {
					_logService.error(error);
				});
		} else {
			this.whenExtensionsReady = Promise.resolve();
		}

		const extensionsToInstall = _environmentService.args['install-extension'];
		if (extensionsToInstall) {
			const idsOrVSIX = extensionsToInstall.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
			this.whenExtensionsReady
				.then(() => extensionManagementCLI.installExtensions(idsOrVSIX, [], { isMachineScoped: !!_environmentService.args['do-not-sync'], installPreReleaseVersion: !!_environmentService.args['pre-release'] }, !!_environmentService.args['force']))
				.then(null, error => {
					_logService.error(error);
				});
		}
	}

	async call(_: any, command: string, arg?: any): Promise<any> {
		switch (command) {

			case 'getEnvironmentData': {
				const args = <IGetEnvironmentDataArguments>arg;
				const uriTransformer = createURITransformer(args.remoteAuthority);

				let environmentData = await this._getEnvironmentData();
				environmentData = transformOutgoingURIs(environmentData, uriTransformer);

				return environmentData;
			}

			case 'getExtensionHostExitInfo': {
				const args = <IGetExtensionHostExitInfoArguments>arg;
				return this._extensionHostStatusService.getExitInfo(args.reconnectionToken);
			}

			case 'whenExtensionsReady': {
				await this.whenExtensionsReady;
				return;
			}

			case 'scanExtensions': {
				await this.whenExtensionsReady;
				const args = <IScanExtensionsArguments>arg;
				const language = args.language;
				this._logService.trace(`Scanning extensions using UI language: ${language}`);
				const uriTransformer = createURITransformer(args.remoteAuthority);

				const extensionDevelopmentLocations = args.extensionDevelopmentPath && args.extensionDevelopmentPath.map(url => URI.revive(uriTransformer.transformIncoming(url)));
				const extensionDevelopmentPath = extensionDevelopmentLocations ? extensionDevelopmentLocations.filter(url => url.scheme === Schemas.file).map(url => url.fsPath) : undefined;

				let extensions = await this._scanExtensions(language, extensionDevelopmentPath);
				extensions = transformOutgoingURIs(extensions, uriTransformer);

				this._logService.trace('Scanned Extensions', extensions);
				RemoteAgentEnvironmentChannel._massageWhenConditions(extensions);

				return extensions;
			}

			case 'scanSingleExtension': {
				await this.whenExtensionsReady;
				const args = <IScanSingleExtensionArguments>arg;
				const language = args.language;
				const isBuiltin = args.isBuiltin;
				const uriTransformer = createURITransformer(args.remoteAuthority);
				const extensionLocation = URI.revive(uriTransformer.transformIncoming(args.extensionLocation));
				const extensionPath = extensionLocation.scheme === Schemas.file ? extensionLocation.fsPath : null;

				if (!extensionPath) {
					return null;
				}

				let extension = await this._scanSingleExtension(extensionPath, isBuiltin, language);

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
					const uriTransformer = createURITransformer('');
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
		}

		throw new Error(`IPC Command ${command} not found`);
	}

	listen(_: any, event: string, arg: any): Event<any> {
		throw new Error('Not supported');
	}

	private static _massageWhenConditions(extensions: IExtensionDescription[]): void {
		// Massage "when" conditions which mention `resourceScheme`

		interface WhenUser { when?: string }

		interface LocWhenUser { [loc: string]: WhenUser[] }

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
			mapNotIn(key: string, valueKey: string): ContextKeyNotInExpr {
				return ContextKeyNotInExpr.create(key, valueKey);
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
				for (const element of elements) {
					_massageWhenUser(element);
				}
			} else {
				_massageWhenUser(elements);
			}
		};

		const _massageLocWhenUser = (target: LocWhenUser) => {
			for (const loc in target) {
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
			connectionToken: (this._connectionToken.type !== ServerConnectionTokenType.None ? this._connectionToken.value : ''),
			appRoot: URI.file(this._environmentService.appRoot),
			settingsPath: this._environmentService.machineSettingsResource,
			logsPath: URI.file(this._environmentService.logsPath),
			extensionsPath: URI.file(this._environmentService.extensionsPath!),
			extensionHostLogsPath: URI.file(join(this._environmentService.logsPath, `exthost${RemoteAgentEnvironmentChannel._namePool++}`)),
			globalStorageHome: this._userDataProfilesService.defaultProfile.globalStorageHome,
			workspaceStorageHome: this._environmentService.workspaceStorageHome,
			localHistoryHome: this._environmentService.localHistoryHome,
			userHome: this._environmentService.userHome,
			os: platform.OS,
			arch: process.arch,
			marks: performance.getMarks(),
			useHostProxy: !!this._environmentService.args['use-host-proxy']
		};
	}

	private async _scanExtensions(language: string, extensionDevelopmentPath?: string[]): Promise<IExtensionDescription[]> {
		// Ensure that the language packs are available

		const [builtinExtensions, installedExtensions, developedExtensions] = await Promise.all([
			this._scanBuiltinExtensions(language),
			this._scanInstalledExtensions(language),
			this._scanDevelopedExtensions(language, extensionDevelopmentPath)
		]);

		return dedupExtensions(builtinExtensions, installedExtensions, developedExtensions, this._logService);
	}

	private async _scanDevelopedExtensions(language: string, extensionDevelopmentPaths?: string[]): Promise<IExtensionDescription[]> {
		if (extensionDevelopmentPaths) {
			return (await Promise.all(extensionDevelopmentPaths.map(extensionDevelopmentPath => this._extensionsScannerService.scanOneOrMultipleExtensions(URI.file(resolve(extensionDevelopmentPath)), ExtensionType.User, { language }))))
				.flat()
				.map(e => toExtensionDescription(e, true));
		}
		return [];
	}

	private async _scanBuiltinExtensions(language: string): Promise<IExtensionDescription[]> {
		const scannedExtensions = await this._extensionsScannerService.scanSystemExtensions({ language, useCache: true });
		return scannedExtensions.map(e => toExtensionDescription(e, false));
	}

	private async _scanInstalledExtensions(language: string): Promise<IExtensionDescription[]> {
		const scannedExtensions = await this._extensionsScannerService.scanUserExtensions({ language, useCache: true });
		return scannedExtensions.map(e => toExtensionDescription(e, false));
	}

	private async _scanSingleExtension(extensionPath: string, isBuiltin: boolean, language: string): Promise<IExtensionDescription | null> {
		const extensionLocation = URI.file(resolve(extensionPath));
		const type = isBuiltin ? ExtensionType.System : ExtensionType.User;
		const scannedExtension = await this._extensionsScannerService.scanExistingExtension(extensionLocation, type, { language });
		return scannedExtension ? toExtensionDescription(scannedExtension, false) : null;
	}

}
