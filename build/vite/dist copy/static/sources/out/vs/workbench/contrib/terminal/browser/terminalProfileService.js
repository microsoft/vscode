/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as arrays from '../../../../base/common/arrays.js';
import * as objects from '../../../../base/common/objects.js';
import { AutoOpenBarrier } from '../../../../base/common/async.js';
import { throttle } from '../../../../base/common/decorators.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, isWindows, OS } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { registerTerminalDefaultProfileConfiguration } from '../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { terminalIconsEqual, terminalProfileArgsMatch } from '../../../../platform/terminal/common/terminalProfiles.js';
import { ITerminalInstanceService } from './terminal.js';
import { refreshTerminalActions } from './terminalActions.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { ITerminalContributionService } from '../common/terminalExtensionPoints.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { hasKey, isString } from '../../../../base/common/types.js';
/*
 * Links TerminalService with TerminalProfileResolverService
 * and keeps the available terminal profiles updated
 */
let TerminalProfileService = class TerminalProfileService extends Disposable {
    get onDidChangeAvailableProfiles() { return this._onDidChangeAvailableProfiles.event; }
    get profilesReady() { return this._profilesReadyPromise; }
    get availableProfiles() {
        if (!this._platformConfigJustRefreshed) {
            this.refreshAvailableProfiles();
        }
        return this._availableProfiles || [];
    }
    get contributedProfiles() {
        const userConfiguredProfileNames = this._availableProfiles?.map(p => p.profileName) || [];
        // Allow a user defined profile to override an extension contributed profile with the same name
        return this._contributedProfiles?.filter(p => !userConfiguredProfileNames.includes(p.title)) || [];
    }
    constructor(_contextKeyService, _configurationService, _terminalContributionService, _extensionService, _remoteAgentService, _environmentService, _terminalInstanceService) {
        super();
        this._contextKeyService = _contextKeyService;
        this._configurationService = _configurationService;
        this._terminalContributionService = _terminalContributionService;
        this._extensionService = _extensionService;
        this._remoteAgentService = _remoteAgentService;
        this._environmentService = _environmentService;
        this._terminalInstanceService = _terminalInstanceService;
        this._contributedProfiles = [];
        this._platformConfigJustRefreshed = false;
        this._refreshTerminalActionsDisposable = this._register(new MutableDisposable());
        this._profileProviders = new Map();
        this._onDidChangeAvailableProfiles = this._register(new Emitter());
        // in web, we don't want to show the dropdown unless there's a web extension
        // that contributes a profile
        this._register(this._extensionService.onDidChangeExtensions(() => this.refreshAvailableProfiles()));
        this._webExtensionContributedProfileContextKey = TerminalContextKeys.webExtensionContributedProfile.bindTo(this._contextKeyService);
        this._updateWebContextKey();
        this._profilesReadyPromise = this._remoteAgentService.getEnvironment()
            .then(() => {
            // Wait up to 20 seconds for profiles to be ready so it's assured that we know the actual
            // default terminal before launching the first terminal. This isn't expected to ever take
            // this long.
            this._profilesReadyBarrier = new AutoOpenBarrier(20000);
            return this._profilesReadyBarrier.wait().then(() => { });
        });
        this.refreshAvailableProfiles();
        this._setupConfigListener();
    }
    async _setupConfigListener() {
        const platformKey = await this.getPlatformKey();
        this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration("terminal.integrated.automationProfile." /* TerminalSettingPrefix.AutomationProfile */ + platformKey) ||
                e.affectsConfiguration("terminal.integrated.defaultProfile." /* TerminalSettingPrefix.DefaultProfile */ + platformKey) ||
                e.affectsConfiguration("terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */ + platformKey) ||
                e.affectsConfiguration("terminal.integrated.useWslProfiles" /* TerminalSettingId.UseWslProfiles */)) {
                if (e.source !== 7 /* ConfigurationTarget.DEFAULT */) {
                    // when _refreshPlatformConfig is called within refreshAvailableProfiles
                    // on did change configuration is fired. this can lead to an infinite recursion
                    this.refreshAvailableProfiles();
                    this._platformConfigJustRefreshed = false;
                }
                else {
                    this._platformConfigJustRefreshed = true;
                }
            }
        }));
    }
    getDefaultProfileName() {
        return this._defaultProfileName;
    }
    getDefaultProfile(os) {
        let defaultProfileName;
        if (os) {
            defaultProfileName = this._configurationService.getValue(`${"terminal.integrated.defaultProfile." /* TerminalSettingPrefix.DefaultProfile */}${this._getOsKey(os)}`);
            if (!defaultProfileName || !isString(defaultProfileName)) {
                return undefined;
            }
        }
        else {
            defaultProfileName = this._defaultProfileName;
        }
        if (!defaultProfileName) {
            return undefined;
        }
        // IMPORTANT: Only allow the default profile name to find non-auto detected profiles as
        // to avoid unsafe path profiles being picked up.
        return this.availableProfiles.find(e => e.profileName === defaultProfileName && !e.isAutoDetected);
    }
    _getOsKey(os) {
        switch (os) {
            case 3 /* OperatingSystem.Linux */: return 'linux';
            case 2 /* OperatingSystem.Macintosh */: return 'osx';
            case 1 /* OperatingSystem.Windows */: return 'windows';
        }
    }
    refreshAvailableProfiles() {
        this._refreshAvailableProfilesNow();
    }
    async _refreshAvailableProfilesNow() {
        // Profiles
        const profiles = await this._detectProfiles(true);
        const profilesChanged = !arrays.equals(profiles, this._availableProfiles, profilesEqual);
        // Contributed profiles
        const contributedProfilesChanged = await this._updateContributedProfiles();
        // Automation profiles
        const platform = await this.getPlatformKey();
        const automationProfile = this._configurationService.getValue(`${"terminal.integrated.automationProfile." /* TerminalSettingPrefix.AutomationProfile */}${platform}`);
        const automationProfileChanged = !objects.equals(automationProfile, this._automationProfile);
        // Update
        if (profilesChanged || contributedProfilesChanged || automationProfileChanged) {
            this._availableProfiles = profiles;
            this._automationProfile = automationProfile;
            this._onDidChangeAvailableProfiles.fire(this._availableProfiles);
            this._profilesReadyBarrier.open();
            this._updateWebContextKey();
            await this._refreshPlatformConfig(this._availableProfiles);
        }
    }
    async _updateContributedProfiles() {
        const platformKey = await this.getPlatformKey();
        const excludedContributedProfiles = [];
        const configProfiles = this._configurationService.getValue("terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */ + platformKey);
        for (const [profileName, value] of Object.entries(configProfiles)) {
            if (value === null) {
                excludedContributedProfiles.push(profileName);
            }
        }
        const filteredContributedProfiles = Array.from(this._terminalContributionService.terminalProfiles.filter(p => !excludedContributedProfiles.includes(p.title)));
        const contributedProfilesChanged = !arrays.equals(filteredContributedProfiles, this._contributedProfiles, contributedProfilesEqual);
        this._contributedProfiles = filteredContributedProfiles;
        return contributedProfilesChanged;
    }
    getContributedProfileProvider(extensionIdentifier, id) {
        const extMap = this._profileProviders.get(extensionIdentifier);
        return extMap?.get(id);
    }
    async _detectProfiles(includeDetectedProfiles) {
        const primaryBackend = await this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority);
        if (!primaryBackend) {
            return this._availableProfiles || [];
        }
        const platform = await this.getPlatformKey();
        this._defaultProfileName = this._configurationService.getValue(`${"terminal.integrated.defaultProfile." /* TerminalSettingPrefix.DefaultProfile */}${platform}`) ?? undefined;
        return primaryBackend.getProfiles(this._configurationService.getValue(`${"terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */}${platform}`), this._defaultProfileName, includeDetectedProfiles);
    }
    _updateWebContextKey() {
        this._webExtensionContributedProfileContextKey.set(isWeb && this._contributedProfiles.length > 0);
    }
    async _refreshPlatformConfig(profiles) {
        const env = await this._remoteAgentService.getEnvironment();
        registerTerminalDefaultProfileConfiguration({ os: env?.os || OS, profiles }, this._contributedProfiles);
        this._refreshTerminalActionsDisposable.value = refreshTerminalActions(profiles);
    }
    async getPlatformKey() {
        const env = await this._remoteAgentService.getEnvironment();
        if (env) {
            return env.os === 1 /* OperatingSystem.Windows */ ? 'windows' : (env.os === 2 /* OperatingSystem.Macintosh */ ? 'osx' : 'linux');
        }
        return isWindows ? 'windows' : (isMacintosh ? 'osx' : 'linux');
    }
    registerTerminalProfileProvider(extensionIdentifier, id, profileProvider) {
        let extMap = this._profileProviders.get(extensionIdentifier);
        if (!extMap) {
            extMap = new Map();
            this._profileProviders.set(extensionIdentifier, extMap);
        }
        extMap.set(id, profileProvider);
        return toDisposable(() => this._profileProviders.delete(id));
    }
    async registerContributedProfile(args) {
        const platformKey = await this.getPlatformKey();
        const profilesConfig = await this._configurationService.getValue(`${"terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */}${platformKey}`);
        if (typeof profilesConfig === 'object') {
            const newProfile = {
                extensionIdentifier: args.extensionIdentifier,
                icon: args.options.icon,
                id: args.id,
                title: args.title,
                color: args.options.color,
                titleTemplate: args.titleTemplate
            };
            profilesConfig[args.title] = newProfile;
        }
        await this._configurationService.updateValue(`${"terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */}${platformKey}`, profilesConfig, 2 /* ConfigurationTarget.USER */);
        return;
    }
    async getContributedDefaultProfile(shellLaunchConfig) {
        // prevents recursion with the MainThreadTerminalService call to create terminal
        // and defers to the provided launch config when an executable is provided
        if (shellLaunchConfig && !shellLaunchConfig.extHostTerminalId && !hasKey(shellLaunchConfig, { executable: true })) {
            const key = await this.getPlatformKey();
            const defaultProfileName = this._configurationService.getValue(`${"terminal.integrated.defaultProfile." /* TerminalSettingPrefix.DefaultProfile */}${key}`);
            const contributedDefaultProfile = this.contributedProfiles.find(p => p.title === defaultProfileName);
            return contributedDefaultProfile;
        }
        return undefined;
    }
};
__decorate([
    throttle(2000)
], TerminalProfileService.prototype, "refreshAvailableProfiles", null);
TerminalProfileService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IConfigurationService),
    __param(2, ITerminalContributionService),
    __param(3, IExtensionService),
    __param(4, IRemoteAgentService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, ITerminalInstanceService)
], TerminalProfileService);
export { TerminalProfileService };
function profilesEqual(one, other) {
    return one.profileName === other.profileName &&
        terminalProfileArgsMatch(one.args, other.args) &&
        one.color === other.color &&
        terminalIconsEqual(one.icon, other.icon) &&
        one.isAutoDetected === other.isAutoDetected &&
        one.isDefault === other.isDefault &&
        one.overrideName === other.overrideName &&
        one.path === other.path;
}
function contributedProfilesEqual(one, other) {
    return one.extensionIdentifier === other.extensionIdentifier &&
        one.color === other.color &&
        one.icon === other.icon &&
        one.id === other.id &&
        one.title === other.title &&
        one.titleTemplate === other.titleTemplate;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9maWxlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoSCxPQUFPLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQW1CLEVBQUUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pHLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV2RyxPQUFPLEVBQUUsMkNBQTJDLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNwSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDekQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFOUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFD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