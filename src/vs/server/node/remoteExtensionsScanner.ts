/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute, join, resolve } from '../../base/common/path.js';
import * as platform from '../../base/common/platform.js';
import { cwd } from '../../base/common/process.js';
import { URI } from '../../base/common/uri.js';
import * as performance from '../../base/common/performance.js';
import { Event } from '../../base/common/event.js';
import { IURITransformer, transformOutgoingURIs } from '../../base/common/uriIpc.js';
import { IServerChannel } from '../../base/parts/ipc/common/ipc.js';
import { ContextKeyDefinedExpr, ContextKeyEqualsExpr, ContextKeyExpr, ContextKeyExpression, ContextKeyGreaterEqualsExpr, ContextKeyGreaterExpr, ContextKeyInExpr, ContextKeyNotEqualsExpr, ContextKeyNotExpr, ContextKeyNotInExpr, ContextKeyRegexExpr, ContextKeySmallerEqualsExpr, ContextKeySmallerExpr, ContextKeyValue, IContextKeyExprMapper } from '../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryService, IExtensionManagementService, InstallExtensionSummary, InstallOptions } from '../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionManagementCLI } from '../../platform/extensionManagement/common/extensionManagementCLI.js';
import { IExtensionsScannerService, toExtensionDescription } from '../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionType, IExtensionDescription } from '../../platform/extensions/common/extensions.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { dedupExtensions } from '../../workbench/services/extensions/common/extensionsUtil.js';
import { Schemas } from '../../base/common/network.js';
import { IRemoteExtensionsScannerService } from '../../platform/remote/common/remoteExtensionsScanner.js';
import { ILanguagePackService } from '../../platform/languagePacks/common/languagePacks.js';
import { areSameExtensions } from '../../platform/extensionManagement/common/extensionManagementUtil.js';

export class RemoteExtensionsScannerService implements IRemoteExtensionsScannerService {

	readonly _serviceBrand: undefined;

	private readonly _whenBuiltinExtensionsReady = Promise.resolve<InstallExtensionSummary>({ failed: [] });
	private readonly _whenExtensionsReady = Promise.resolve<InstallExtensionSummary>({ failed: [] });

	constructor(
		private readonly _extensionManagementCLI: ExtensionManagementCLI,
		environmentService: IServerEnvironmentService,
		private readonly _userDataProfilesService: IUserDataProfilesService,
		private readonly _extensionsScannerService: IExtensionsScannerService,
		private readonly _logService: ILogService,
		private readonly _extensionGalleryService: IExtensionGalleryService,
		private readonly _languagePackService: ILanguagePackService,
		private readonly _extensionManagementService: IExtensionManagementService,
	) {
		const builtinExtensionsToInstall = environmentService.args['install-builtin-extension'];
		if (builtinExtensionsToInstall) {
			_logService.trace('Installing builtin extensions passed via args...');
			const installOptions: InstallOptions = { isMachineScoped: !!environmentService.args['do-not-sync'], installPreReleaseVersion: !!environmentService.args['pre-release'] };
			performance.mark('code/server/willInstallBuiltinExtensions');
			this._whenExtensionsReady = this._whenBuiltinExtensionsReady = _extensionManagementCLI.installExtensions([], this._asExtensionIdOrVSIX(builtinExtensionsToInstall), installOptions, !!environmentService.args['force'])
				.then(() => {
					performance.mark('code/server/didInstallBuiltinExtensions');
					_logService.trace('Finished installing builtin extensions');
					return { failed: [] };
				}, error => {
					_logService.error(error);
					return { failed: [] };
				});
		}

		const extensionsToInstall = environmentService.args['install-extension'];
		if (extensionsToInstall) {
			_logService.trace('Installing extensions passed via args...');
			const installOptions: InstallOptions = {
				isMachineScoped: !!environmentService.args['do-not-sync'],
				installPreReleaseVersion: !!environmentService.args['pre-release'],
				isApplicationScoped: true // extensions installed during server startup are available to all profiles
			};
			this._whenExtensionsReady = this._whenBuiltinExtensionsReady
				.then(() => _extensionManagementCLI.installExtensions(this._asExtensionIdOrVSIX(extensionsToInstall), [], installOptions, !!environmentService.args['force']))
				.then(async () => {
					_logService.trace('Finished installing extensions');
					return { failed: [] };
				}, async error => {
					_logService.error(error);

					const failed: {
						id: string;
						installOptions: InstallOptions;
					}[] = [];
					const alreadyInstalled = await this._extensionManagementService.getInstalled(ExtensionType.User);

					for (const id of this._asExtensionIdOrVSIX(extensionsToInstall)) {
						if (typeof id === 'string') {
							if (!alreadyInstalled.some(e => areSameExtensions(e.identifier, { id }))) {
								failed.push({ id, installOptions });
							}
						}
					}

					if (!failed.length) {
						_logService.trace(`No extensions to report as failed`);
						return { failed: [] };
					}

					_logService.info(`Relaying the following extensions to install later: ${failed.map(f => f.id).join(', ')}`);
					return { failed };
				});
		}
	}

	private _asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}

	whenExtensionsReady(): Promise<InstallExtensionSummary> {
		return this._whenExtensionsReady;
	}

	async scanExtensions(
		language?: string,
		profileLocation?: URI,
		workspaceExtensionLocations?: URI[],
		extensionDevelopmentLocations?: URI[],
		languagePackId?: string
	): Promise<IExtensionDescription[]> {
		performance.mark('code/server/willScanExtensions');
		this._logService.trace(`Scanning extensions using UI language: ${language}`);

		await this._whenBuiltinExtensionsReady;

		const extensionDevelopmentPaths = extensionDevelopmentLocations ? extensionDevelopmentLocations.filter(url => url.scheme === Schemas.file).map(url => url.fsPath) : undefined;
		profileLocation = profileLocation ?? this._userDataProfilesService.defaultProfile.extensionsResource;

		const extensions = await this._scanExtensions(profileLocation, language ?? platform.language, workspaceExtensionLocations, extensionDevelopmentPaths, languagePackId);

		this._logService.trace('Scanned Extensions', extensions);
		this._massageWhenConditions(extensions);

		performance.mark('code/server/didScanExtensions');
		return extensions;
	}

	private async _scanExtensions(profileLocation: URI, language: string, workspaceInstalledExtensionLocations: URI[] | undefined, extensionDevelopmentPath: string[] | undefined, languagePackId: string | undefined): Promise<IExtensionDescription[]> {
		await this._ensureLanguagePackIsInstalled(language, languagePackId);

		const [builtinExtensions, installedExtensions, workspaceInstalledExtensions, developedExtensions] = await Promise.all([
			this._scanBuiltinExtensions(language),
			this._scanInstalledExtensions(profileLocation, language),
			this._scanWorkspaceInstalledExtensions(language, workspaceInstalledExtensionLocations),
			this._scanDevelopedExtensions(language, extensionDevelopmentPath)
		]);

		return dedupExtensions(builtinExtensions, installedExtensions, workspaceInstalledExtensions, developedExtensions, this._logService);
	}

	private async _scanDevelopedExtensions(language: string, extensionDevelopmentPaths?: string[]): Promise<IExtensionDescription[]> {
		if (extensionDevelopmentPaths) {
			return (await Promise.all(extensionDevelopmentPaths.map(extensionDevelopmentPath => this._extensionsScannerService.scanOneOrMultipleExtensions(URI.file(resolve(extensionDevelopmentPath)), ExtensionType.User, { language }))))
				.flat()
				.map(e => toExtensionDescription(e, true));
		}
		return [];
	}

	private async _scanWorkspaceInstalledExtensions(language: string, workspaceInstalledExtensions?: URI[]): Promise<IExtensionDescription[]> {
		const result: IExtensionDescription[] = [];
		if (workspaceInstalledExtensions?.length) {
			const scannedExtensions = await Promise.all(workspaceInstalledExtensions.map(location => this._extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { language })));
			for (const scannedExtension of scannedExtensions) {
				if (scannedExtension) {
					result.push(toExtensionDescription(scannedExtension, false));
				}
			}
		}
		return result;
	}

	private async _scanBuiltinExtensions(language: string): Promise<IExtensionDescription[]> {
		const scannedExtensions = await this._extensionsScannerService.scanSystemExtensions({ language });
		return scannedExtensions.map(e => toExtensionDescription(e, false));
	}

	private async _scanInstalledExtensions(profileLocation: URI, language: string): Promise<IExtensionDescription[]> {
		const scannedExtensions = await this._extensionsScannerService.scanUserExtensions({ profileLocation, language, useCache: true });
		return scannedExtensions.map(e => toExtensionDescription(e, false));
	}

	private async _ensureLanguagePackIsInstalled(language: string, languagePackId: string | undefined): Promise<void> {
		if (
			// No need to install language packs for the default language
			language === platform.LANGUAGE_DEFAULT ||
			// The extension gallery service needs to be available
			!this._extensionGalleryService.isEnabled()
		) {
			return;
		}

		try {
			const installed = await this._languagePackService.getInstalledLanguages();
			if (installed.find(p => p.id === language)) {
				this._logService.trace(`Language Pack ${language} is already installed. Skipping language pack installation.`);
				return;
			}
		} catch (err) {
			// We tried to see what is installed but failed. We can try installing anyway.
			this._logService.error(err);
		}

		if (!languagePackId) {
			this._logService.trace(`No language pack id provided for language ${language}. Skipping language pack installation.`);
			return;
		}

		this._logService.trace(`Language Pack ${languagePackId} for language ${language} is not installed. It will be installed now.`);
		try {
			await this._extensionManagementCLI.installExtensions([languagePackId], [], { isMachineScoped: true }, true);
		} catch (err) {
			// We tried to install the language pack but failed. We can continue without it thus using the default language.
			this._logService.error(err);
		}
	}

	private _massageWhenConditions(extensions: IExtensionDescription[]): void {
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
			mapEquals(key: string, value: ContextKeyValue): ContextKeyExpression {
				if (key === 'resourceScheme' && typeof value === 'string') {
					return ContextKeyEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
				} else {
					return ContextKeyEqualsExpr.create(key, value);
				}
			}
			mapNotEquals(key: string, value: ContextKeyValue): ContextKeyExpression {
				if (key === 'resourceScheme' && typeof value === 'string') {
					return ContextKeyNotEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
				} else {
					return ContextKeyNotEqualsExpr.create(key, value);
				}
			}
			mapGreater(key: string, value: ContextKeyValue): ContextKeyExpression {
				return ContextKeyGreaterExpr.create(key, value);
			}
			mapGreaterEquals(key: string, value: ContextKeyValue): ContextKeyExpression {
				return ContextKeyGreaterEqualsExpr.create(key, value);
			}
			mapSmaller(key: string, value: ContextKeyValue): ContextKeyExpression {
				return ContextKeySmallerExpr.create(key, value);
			}
			mapSmallerEquals(key: string, value: ContextKeyValue): ContextKeyExpression {
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
}

export class RemoteExtensionsScannerChannel implements IServerChannel {

	constructor(private service: RemoteExtensionsScannerService, private getUriTransformer: (requestContext: any) => IURITransformer) { }

	listen(context: any, event: string): Event<any> {
		throw new Error('Invalid listen');
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (command) {
			case 'whenExtensionsReady': return await this.service.whenExtensionsReady();

			case 'scanExtensions': {
				const language = args[0];
				const profileLocation = args[1] ? URI.revive(uriTransformer.transformIncoming(args[1])) : undefined;
				const workspaceExtensionLocations = Array.isArray(args[2]) ? args[2].map(u => URI.revive(uriTransformer.transformIncoming(u))) : undefined;
				const extensionDevelopmentPath = Array.isArray(args[3]) ? args[3].map(u => URI.revive(uriTransformer.transformIncoming(u))) : undefined;
				const languagePackId: string | undefined = args[4];
				const extensions = await this.service.scanExtensions(
					language,
					profileLocation,
					workspaceExtensionLocations,
					extensionDevelopmentPath,
					languagePackId
				);
				return extensions.map(extension => transformOutgoingURIs(extension, uriTransformer));
			}
		}
		throw new Error('Invalid call');
	}
}
