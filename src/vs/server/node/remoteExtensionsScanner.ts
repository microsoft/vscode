/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute, join, resolve } from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import { cwd } from 'vs/base/common/process';
import { URI } from 'vs/base/common/uri';
import * as performance from 'vs/base/common/performance';
import { Event } from 'vs/base/common/event';
import { IURITransformer, transformOutgoingURIs } from 'vs/base/common/uriIpc';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ContextKeyDefinedExpr, ContextKeyEqualsExpr, ContextKeyExpr, ContextKeyExpression, ContextKeyGreaterEqualsExpr, ContextKeyGreaterExpr, ContextKeyInExpr, ContextKeyNotEqualsExpr, ContextKeyNotExpr, ContextKeyNotInExpr, ContextKeyRegexExpr, ContextKeySmallerEqualsExpr, ContextKeySmallerExpr, IContextKeyExprMapper } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionGalleryService, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementCLI } from 'vs/platform/extensionManagement/common/extensionManagementCLI';
import { IExtensionsScannerService, toExtensionDescription } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionType, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IServerEnvironmentService } from 'vs/server/node/serverEnvironmentService';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { Schemas } from 'vs/base/common/network';
import { IRemoteExtensionsScannerService } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';

export class RemoteExtensionsScannerService implements IRemoteExtensionsScannerService {

	readonly _serviceBrand: undefined;

	private readonly _whenBuiltinExtensionsReady = Promise.resolve();
	private readonly _whenExtensionsReady = Promise.resolve();

	constructor(
		private readonly _extensionManagementCLI: ExtensionManagementCLI,
		environmentService: IServerEnvironmentService,
		private readonly _userDataProfilesService: IUserDataProfilesService,
		private readonly _extensionsScannerService: IExtensionsScannerService,
		private readonly _logService: ILogService,
		private readonly _extensionGalleryService: IExtensionGalleryService,
		private readonly _languagePackService: ILanguagePackService
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
				}, error => {
					_logService.error(error);
				});
		}

		const extensionsToInstall = environmentService.args['install-extension'];
		if (extensionsToInstall) {
			_logService.trace('Installing extensions passed via args...');
			this._whenExtensionsReady = this._whenBuiltinExtensionsReady
				.then(() => _extensionManagementCLI.installExtensions(this._asExtensionIdOrVSIX(extensionsToInstall), [], {
					isMachineScoped: !!environmentService.args['do-not-sync'],
					installPreReleaseVersion: !!environmentService.args['pre-release'],
					isApplicationScoped: true // extensions installed during server startup are available to all profiles
				}, !!environmentService.args['force']))
				.then(() => {
					_logService.trace('Finished installing extensions');
				}, error => {
					_logService.error(error);
				});
		}
	}

	private _asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}

	whenExtensionsReady(): Promise<void> {
		return this._whenExtensionsReady;
	}

	async scanExtensions(language?: string, profileLocation?: URI, extensionDevelopmentLocations?: URI[], languagePackId?: string): Promise<IExtensionDescription[]> {
		performance.mark('code/server/willScanExtensions');
		this._logService.trace(`Scanning extensions using UI language: ${language}`);

		await this._whenBuiltinExtensionsReady;

		const extensionDevelopmentPaths = extensionDevelopmentLocations ? extensionDevelopmentLocations.filter(url => url.scheme === Schemas.file).map(url => url.fsPath) : undefined;
		profileLocation = profileLocation ?? this._userDataProfilesService.defaultProfile.extensionsResource;

		const extensions = await this._scanExtensions(profileLocation, language ?? platform.language, extensionDevelopmentPaths, languagePackId);

		this._logService.trace('Scanned Extensions', extensions);
		this._massageWhenConditions(extensions);

		performance.mark('code/server/didScanExtensions');
		return extensions;
	}

	async scanSingleExtension(extensionLocation: URI, isBuiltin: boolean, language?: string): Promise<IExtensionDescription | null> {
		await this._whenBuiltinExtensionsReady;

		const extensionPath = extensionLocation.scheme === Schemas.file ? extensionLocation.fsPath : null;

		if (!extensionPath) {
			return null;
		}

		const extension = await this._scanSingleExtension(extensionPath, isBuiltin, language ?? platform.language);

		if (!extension) {
			return null;
		}

		this._massageWhenConditions([extension]);

		return extension;
	}

	private async _scanExtensions(profileLocation: URI, language: string, extensionDevelopmentPath: string[] | undefined, languagePackId: string | undefined): Promise<IExtensionDescription[]> {
		await this._ensureLanguagePackIsInstalled(language, languagePackId);

		const [builtinExtensions, installedExtensions, developedExtensions] = await Promise.all([
			this._scanBuiltinExtensions(language),
			this._scanInstalledExtensions(profileLocation, language),
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

	private async _scanInstalledExtensions(profileLocation: URI, language: string): Promise<IExtensionDescription[]> {
		const scannedExtensions = await this._extensionsScannerService.scanUserExtensions({ profileLocation, language, useCache: true });
		return scannedExtensions.map(e => toExtensionDescription(e, false));
	}

	private async _scanSingleExtension(extensionPath: string, isBuiltin: boolean, language: string): Promise<IExtensionDescription | null> {
		const extensionLocation = URI.file(resolve(extensionPath));
		const type = isBuiltin ? ExtensionType.System : ExtensionType.User;
		const scannedExtension = await this._extensionsScannerService.scanExistingExtension(extensionLocation, type, { language });
		return scannedExtension ? toExtensionDescription(scannedExtension, false) : null;
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
}

export class RemoteExtensionsScannerChannel implements IServerChannel {

	constructor(private service: RemoteExtensionsScannerService, private getUriTransformer: (requestContext: any) => IURITransformer) { }

	listen(context: any, event: string): Event<any> {
		throw new Error('Invalid listen');
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (command) {
			case 'whenExtensionsReady': return this.service.whenExtensionsReady();
			case 'scanExtensions': {
				const language = args[0];
				const profileLocation = args[1] ? URI.revive(uriTransformer.transformIncoming(args[1])) : undefined;
				const extensionDevelopmentPath = Array.isArray(args[2]) ? args[2].map(u => URI.revive(uriTransformer.transformIncoming(u))) : undefined;
				const languagePackId: string | undefined = args[3];
				const extensions = await this.service.scanExtensions(language, profileLocation, extensionDevelopmentPath, languagePackId);
				return extensions.map(extension => transformOutgoingURIs(extension, uriTransformer));
			}
			case 'scanSingleExtension': {
				const extension = await this.service.scanSingleExtension(URI.revive(uriTransformer.transformIncoming(args[0])), args[1], args[2]);
				return extension ? transformOutgoingURIs(extension, uriTransformer) : null;
			}
		}
		throw new Error('Invalid call');
	}
}
