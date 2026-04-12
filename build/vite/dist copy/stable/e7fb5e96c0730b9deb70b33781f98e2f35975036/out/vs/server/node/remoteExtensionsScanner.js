/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isAbsolute, join, resolve } from '../../base/common/path.js';
import * as platform from '../../base/common/platform.js';
import { cwd } from '../../base/common/process.js';
import { URI } from '../../base/common/uri.js';
import * as performance from '../../base/common/performance.js';
import { transformOutgoingURIs } from '../../base/common/uriIpc.js';
import { ContextKeyDefinedExpr, ContextKeyEqualsExpr, ContextKeyExpr, ContextKeyGreaterEqualsExpr, ContextKeyGreaterExpr, ContextKeyInExpr, ContextKeyNotEqualsExpr, ContextKeyNotExpr, ContextKeyNotInExpr, ContextKeyRegexExpr, ContextKeySmallerEqualsExpr, ContextKeySmallerExpr } from '../../platform/contextkey/common/contextkey.js';
import { toExtensionDescription } from '../../platform/extensionManagement/common/extensionsScannerService.js';
import { dedupExtensions } from '../../workbench/services/extensions/common/extensionsUtil.js';
import { Schemas } from '../../base/common/network.js';
import { areSameExtensions } from '../../platform/extensionManagement/common/extensionManagementUtil.js';
export class RemoteExtensionsScannerService {
    constructor(_extensionManagementCLI, environmentService, _userDataProfilesService, _extensionsScannerService, _logService, _extensionGalleryService, _languagePackService, _extensionManagementService) {
        this._extensionManagementCLI = _extensionManagementCLI;
        this._userDataProfilesService = _userDataProfilesService;
        this._extensionsScannerService = _extensionsScannerService;
        this._logService = _logService;
        this._extensionGalleryService = _extensionGalleryService;
        this._languagePackService = _languagePackService;
        this._extensionManagementService = _extensionManagementService;
        this._whenBuiltinExtensionsReady = Promise.resolve({ failed: [] });
        this._whenExtensionsReady = Promise.resolve({ failed: [] });
        const builtinExtensionsToInstall = environmentService.args['install-builtin-extension'];
        if (builtinExtensionsToInstall) {
            _logService.trace('Installing builtin extensions passed via args...');
            const installOptions = { isMachineScoped: !!environmentService.args['do-not-sync'], installPreReleaseVersion: !!environmentService.args['pre-release'] };
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
            const installOptions = {
                isMachineScoped: !!environmentService.args['do-not-sync'],
                installPreReleaseVersion: !!environmentService.args['pre-release'],
                isApplicationScoped: true // extensions installed during server startup are available to all profiles
            };
            this._whenExtensionsReady = this._whenBuiltinExtensionsReady
                .then(() => _extensionManagementCLI.installExtensions(this._asExtensionIdOrVSIX(extensionsToInstall), [], installOptions, !!environmentService.args['force']))
                .then(async () => {
                _logService.trace('Finished installing extensions');
                return { failed: [] };
            }, async (error) => {
                _logService.error(error);
                const failed = [];
                const alreadyInstalled = await this._extensionManagementService.getInstalled(1 /* ExtensionType.User */);
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
    _asExtensionIdOrVSIX(inputs) {
        return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
    }
    whenExtensionsReady() {
        return this._whenExtensionsReady;
    }
    async scanExtensions(language, profileLocation, workspaceExtensionLocations, extensionDevelopmentLocations, languagePackId) {
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
    async _scanExtensions(profileLocation, language, workspaceInstalledExtensionLocations, extensionDevelopmentPath, languagePackId) {
        await this._ensureLanguagePackIsInstalled(language, languagePackId);
        const [builtinExtensions, installedExtensions, workspaceInstalledExtensions, developedExtensions] = await Promise.all([
            this._scanBuiltinExtensions(language),
            this._scanInstalledExtensions(profileLocation, language),
            this._scanWorkspaceInstalledExtensions(language, workspaceInstalledExtensionLocations),
            this._scanDevelopedExtensions(language, extensionDevelopmentPath)
        ]);
        return dedupExtensions(builtinExtensions, installedExtensions, workspaceInstalledExtensions, developedExtensions, this._logService);
    }
    async _scanDevelopedExtensions(language, extensionDevelopmentPaths) {
        if (extensionDevelopmentPaths) {
            return (await Promise.all(extensionDevelopmentPaths.map(extensionDevelopmentPath => this._extensionsScannerService.scanOneOrMultipleExtensions(URI.file(resolve(extensionDevelopmentPath)), 1 /* ExtensionType.User */, { language }))))
                .flat()
                .map(e => toExtensionDescription(e, true));
        }
        return [];
    }
    async _scanWorkspaceInstalledExtensions(language, workspaceInstalledExtensions) {
        const result = [];
        if (workspaceInstalledExtensions?.length) {
            const scannedExtensions = await Promise.all(workspaceInstalledExtensions.map(location => this._extensionsScannerService.scanExistingExtension(location, 1 /* ExtensionType.User */, { language })));
            for (const scannedExtension of scannedExtensions) {
                if (scannedExtension) {
                    result.push(toExtensionDescription(scannedExtension, false));
                }
            }
        }
        return result;
    }
    async _scanBuiltinExtensions(language) {
        const scannedExtensions = await this._extensionsScannerService.scanSystemExtensions({ language });
        return scannedExtensions.map(e => toExtensionDescription(e, false));
    }
    async _scanInstalledExtensions(profileLocation, language) {
        const scannedExtensions = await this._extensionsScannerService.scanUserExtensions({ profileLocation, language, useCache: true });
        return scannedExtensions.map(e => toExtensionDescription(e, false));
    }
    async _ensureLanguagePackIsInstalled(language, languagePackId) {
        if (
        // No need to install language packs for the default language
        language === platform.LANGUAGE_DEFAULT ||
            // The extension gallery service needs to be available
            !this._extensionGalleryService.isEnabled()) {
            return;
        }
        try {
            const installed = await this._languagePackService.getInstalledLanguages();
            if (installed.find(p => p.id === language)) {
                this._logService.trace(`Language Pack ${language} is already installed. Skipping language pack installation.`);
                return;
            }
        }
        catch (err) {
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
        }
        catch (err) {
            // We tried to install the language pack but failed. We can continue without it thus using the default language.
            this._logService.error(err);
        }
    }
    _massageWhenConditions(extensions) {
        // Massage "when" conditions which mention `resourceScheme`
        const _mapResourceSchemeValue = (value, isRegex) => {
            // console.log(`_mapResourceSchemeValue: ${value}, ${isRegex}`);
            return value.replace(/file/g, 'vscode-remote');
        };
        const _mapResourceRegExpValue = (value) => {
            let flags = '';
            flags += value.global ? 'g' : '';
            flags += value.ignoreCase ? 'i' : '';
            flags += value.multiline ? 'm' : '';
            return new RegExp(_mapResourceSchemeValue(value.source, true), flags);
        };
        const _exprKeyMapper = new class {
            mapDefined(key) {
                return ContextKeyDefinedExpr.create(key);
            }
            mapNot(key) {
                return ContextKeyNotExpr.create(key);
            }
            mapEquals(key, value) {
                if (key === 'resourceScheme' && typeof value === 'string') {
                    return ContextKeyEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
                }
                else {
                    return ContextKeyEqualsExpr.create(key, value);
                }
            }
            mapNotEquals(key, value) {
                if (key === 'resourceScheme' && typeof value === 'string') {
                    return ContextKeyNotEqualsExpr.create(key, _mapResourceSchemeValue(value, false));
                }
                else {
                    return ContextKeyNotEqualsExpr.create(key, value);
                }
            }
            mapGreater(key, value) {
                return ContextKeyGreaterExpr.create(key, value);
            }
            mapGreaterEquals(key, value) {
                return ContextKeyGreaterEqualsExpr.create(key, value);
            }
            mapSmaller(key, value) {
                return ContextKeySmallerExpr.create(key, value);
            }
            mapSmallerEquals(key, value) {
                return ContextKeySmallerEqualsExpr.create(key, value);
            }
            mapRegex(key, regexp) {
                if (key === 'resourceScheme' && regexp) {
                    return ContextKeyRegexExpr.create(key, _mapResourceRegExpValue(regexp));
                }
                else {
                    return ContextKeyRegexExpr.create(key, regexp);
                }
            }
            mapIn(key, valueKey) {
                return ContextKeyInExpr.create(key, valueKey);
            }
            mapNotIn(key, valueKey) {
                return ContextKeyNotInExpr.create(key, valueKey);
            }
        };
        const _massageWhenUser = (element) => {
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
        const _massageWhenUserArr = (elements) => {
            if (Array.isArray(elements)) {
                for (const element of elements) {
                    _massageWhenUser(element);
                }
            }
            else {
                _massageWhenUser(elements);
            }
        };
        const _massageLocWhenUser = (target) => {
            for (const loc in target) {
                _massageWhenUserArr(target[loc]);
            }
        };
        extensions.forEach((extension) => {
            if (extension.contributes) {
                if (extension.contributes.menus) {
                    _massageLocWhenUser(extension.contributes.menus);
                }
                if (extension.contributes.keybindings) {
                    _massageWhenUserArr(extension.contributes.keybindings);
                }
                if (extension.contributes.views) {
                    _massageLocWhenUser(extension.contributes.views);
                }
            }
        });
    }
}
export class RemoteExtensionsScannerChannel {
    constructor(service, getUriTransformer) {
        this.service = service;
        this.getUriTransformer = getUriTransformer;
    }
    listen(context, event) {
        throw new Error('Invalid listen');
    }
    async call(context, command, args) {
        const uriTransformer = this.getUriTransformer(context);
        switch (command) {
            case 'whenExtensionsReady': return await this.service.whenExtensionsReady();
            case 'scanExtensions': {
                const language = args[0];
                const profileLocation = args[1] ? URI.revive(uriTransformer.transformIncoming(args[1])) : undefined;
                const workspaceExtensionLocations = Array.isArray(args[2]) ? args[2].map(u => URI.revive(uriTransformer.transformIncoming(u))) : undefined;
                const extensionDevelopmentPath = Array.isArray(args[3]) ? args[3].map(u => URI.revive(uriTransformer.transformIncoming(u))) : undefined;
                const languagePackId = args[4];
                const extensions = await this.service.scanExtensions(language, profileLocation, workspaceExtensionLocations, extensionDevelopmentPath, languagePackId);
                return extensions.map(extension => transformOutgoingURIs(extension, uriTransformer));
            }
        }
        throw new Error('Invalid call');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXJ2ZXIvbm9kZS9yZW1vdGVFeHRlbnNpb25zU2Nhbm5lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN0RSxPQUFPLEtBQUssUUFBUSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0MsT0FBTyxLQUFLLFdBQVcsTUFBTSxrQ0FBa0MsQ0FBQztBQUVoRSxPQUFPLEVBQW1CLHFCQUFxQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG9CQUFvQixFQUFFLGNBQWMsRUFBd0IsMkJBQTJCLEVBQUUscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQUUsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUscUJBQXFCLEVBQTBDLE1BQU0sZ0RBQWdELENBQUM7QUFHM1ksT0FBTyxFQUE2QixzQkFBc0IsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBSzFJLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMvRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFFekcsTUFBTSxPQUFPLDhCQUE4QjtJQU8xQyxZQUNrQix1QkFBK0MsRUFDaEUsa0JBQTZDLEVBQzVCLHdCQUFrRCxFQUNsRCx5QkFB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