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
import { Codicon } from '../../../../base/common/codicons.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { getUriClasses, getColorClass, createColorStyleElement } from './terminalIcon.js';
import { configureTerminalProfileIcon } from './terminalIcons.js';
import * as nls from '../../../../nls.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../common/terminal.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { basename } from '../../../../base/common/path.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { hasKey, isString } from '../../../../base/common/types.js';
import { Event } from '../../../../base/common/event.js';
let TerminalProfileQuickpick = class TerminalProfileQuickpick {
    constructor(_terminalProfileService, _terminalProfileResolverService, _configurationService, _quickInputService, _themeService, _notificationService) {
        this._terminalProfileService = _terminalProfileService;
        this._terminalProfileResolverService = _terminalProfileResolverService;
        this._configurationService = _configurationService;
        this._quickInputService = _quickInputService;
        this._themeService = _themeService;
        this._notificationService = _notificationService;
    }
    async showAndGetResult(type) {
        const platformKey = await this._terminalProfileService.getPlatformKey();
        const profilesKey = "terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */ + platformKey;
        const result = await this._createAndShow(type);
        const defaultProfileKey = `${"terminal.integrated.defaultProfile." /* TerminalSettingPrefix.DefaultProfile */}${platformKey}`;
        if (!result) {
            return;
        }
        if (type === 'setDefault') {
            if (hasKey(result.profile, { id: true })) {
                // extension contributed profile
                await this._configurationService.updateValue(defaultProfileKey, result.profile.title, 2 /* ConfigurationTarget.USER */);
                return {
                    config: {
                        extensionIdentifier: result.profile.extensionIdentifier,
                        id: result.profile.id,
                        title: result.profile.title,
                        options: {
                            color: result.profile.color,
                            icon: result.profile.icon
                        }
                    },
                    keyMods: result.keyMods
                };
            }
            // Add the profile to settings if necessary
            if (hasKey(result.profile, { profileName: true })) {
                const profilesConfig = await this._configurationService.getValue(profilesKey);
                if (typeof profilesConfig === 'object') {
                    const newProfile = {
                        path: result.profile.path
                    };
                    if (result.profile.args) {
                        newProfile.args = result.profile.args;
                    }
                    profilesConfig[result.profile.profileName] = this._createNewProfileConfig(result.profile);
                    await this._configurationService.updateValue(profilesKey, profilesConfig, 2 /* ConfigurationTarget.USER */);
                }
            }
            // Set the default profile
            await this._configurationService.updateValue(defaultProfileKey, result.profileName, 2 /* ConfigurationTarget.USER */);
        }
        else if (type === 'createInstance') {
            if (hasKey(result.profile, { id: true })) {
                const config = {
                    extensionIdentifier: result.profile.extensionIdentifier,
                    id: result.profile.id,
                    title: result.profile.title,
                    options: {
                        icon: result.profile.icon,
                        color: result.profile.color,
                    }
                };
                if (result.profile.titleTemplate !== undefined) {
                    config.titleTemplate = result.profile.titleTemplate;
                }
                return {
                    config,
                    keyMods: result.keyMods
                };
            }
            else {
                return { config: result.profile, keyMods: result.keyMods };
            }
        }
        // for tests
        return hasKey(result.profile, { profileName: true }) ? result.profile.profileName : result.profile.title;
    }
    async _createAndShow(type) {
        const platformKey = await this._terminalProfileService.getPlatformKey();
        const profiles = this._terminalProfileService.availableProfiles;
        const profilesKey = "terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */ + platformKey;
        const defaultProfileName = this._terminalProfileService.getDefaultProfileName();
        let keyMods;
        const options = {
            placeHolder: type === 'createInstance' ? nls.localize('terminal.integrated.selectProfileToCreate', "Select the terminal profile to create") : nls.localize('terminal.integrated.chooseDefaultProfile', "Select your default terminal profile"),
            onDidTriggerItemButton: async (context) => {
                // Get the user's explicit permission to use a potentially unsafe path
                if (!await this._isProfileSafe(context.item.profile)) {
                    return;
                }
                if (hasKey(context.item.profile, { id: true })) {
                    return;
                }
                const configProfiles = this._configurationService.getValue("terminal.integrated.profiles." /* TerminalSettingPrefix.Profiles */ + platformKey);
                const existingProfiles = !!configProfiles ? Object.keys(configProfiles) : [];
                const name = await this._quickInputService.input({
                    prompt: nls.localize('enterTerminalProfileName', "Enter terminal profile name"),
                    value: context.item.profile.profileName,
                    validateInput: async (input) => {
                        if (existingProfiles.includes(input)) {
                            return nls.localize('terminalProfileAlreadyExists', "A terminal profile already exists with that name");
                        }
                        return undefined;
                    }
                });
                if (!name) {
                    return;
                }
                const newConfigValue = {
                    ...configProfiles,
                    [name]: this._createNewProfileConfig(context.item.profile)
                };
                await this._configurationService.updateValue(profilesKey, newConfigValue, 2 /* ConfigurationTarget.USER */);
            },
            onKeyMods: mods => keyMods = mods
        };
        // Build quick pick items
        const quickPickItems = [];
        const configProfiles = profiles.filter(e => !e.isAutoDetected);
        const autoDetectedProfiles = profiles.filter(e => e.isAutoDetected);
        if (configProfiles.length > 0) {
            quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles', "profiles") });
            quickPickItems.push(...this._sortProfileQuickPickItems(configProfiles.map(e => this._createProfileQuickPickItem(e)), defaultProfileName));
        }
        quickPickItems.push({ type: 'separator', label: nls.localize('ICreateContributedTerminalProfileOptions', "contributed") });
        const contributedProfiles = [];
        for (const contributed of this._terminalProfileService.contributedProfiles) {
            let icon;
            if (isString(contributed.icon)) {
                if (contributed.icon.startsWith('$(')) {
                    icon = ThemeIcon.fromString(contributed.icon);
                }
                else {
                    icon = ThemeIcon.fromId(contributed.icon);
                }
            }
            if (!icon || !getIconRegistry().getIcon(icon.id)) {
                icon = this._terminalProfileResolverService.getDefaultIcon();
            }
            const uriClasses = getUriClasses(contributed, this._themeService.getColorTheme().type, true);
            const colorClass = getColorClass(contributed);
            const iconClasses = [];
            if (uriClasses) {
                iconClasses.push(...uriClasses);
            }
            if (colorClass) {
                iconClasses.push(colorClass);
            }
            contributedProfiles.push({
                label: `$(${icon.id}) ${contributed.title}`,
                profile: {
                    extensionIdentifier: contributed.extensionIdentifier,
                    title: contributed.title,
                    icon: contributed.icon,
                    id: contributed.id,
                    color: contributed.color,
                    titleTemplate: contributed.titleTemplate
                },
                profileName: contributed.title,
                iconClasses
            });
        }
        if (contributedProfiles.length > 0) {
            quickPickItems.push(...this._sortProfileQuickPickItems(contributedProfiles, defaultProfileName));
        }
        if (autoDetectedProfiles.length > 0) {
            quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles.detected', "detected") });
            quickPickItems.push(...this._sortProfileQuickPickItems(autoDetectedProfiles.map(e => this._createProfileQuickPickItem(e)), defaultProfileName));
        }
        const colorStyleDisposable = createColorStyleElement(this._themeService.getColorTheme());
        const result = await this._quickInputService.pick(quickPickItems, options);
        colorStyleDisposable.dispose();
        if (!result) {
            return undefined;
        }
        if (!await this._isProfileSafe(result.profile)) {
            return undefined;
        }
        if (keyMods) {
            result.keyMods = keyMods;
        }
        return result;
    }
    _createNewProfileConfig(profile) {
        const result = { path: profile.path };
        if (profile.args) {
            result.args = profile.args;
        }
        if (profile.env) {
            result.env = profile.env;
        }
        return result;
    }
    async _isProfileSafe(profile) {
        const isUnsafePath = hasKey(profile, { profileName: true }) && profile.isUnsafePath;
        const requiresUnsafePath = hasKey(profile, { profileName: true }) && profile.requiresUnsafePath;
        if (!isUnsafePath && !requiresUnsafePath) {
            return true;
        }
        // Get the user's explicit permission to use a potentially unsafe path
        return await new Promise(r => {
            const unsafePaths = [];
            if (isUnsafePath) {
                unsafePaths.push(profile.path);
            }
            if (requiresUnsafePath) {
                unsafePaths.push(requiresUnsafePath);
            }
            // Notify about unsafe path(s). At the time of writing, multiple unsafe paths isn't
            // possible so the message is optimized for a single path.
            const handle = this._notificationService.prompt(Severity.Warning, nls.localize('unsafePathWarning', 'This terminal profile uses a potentially unsafe path that can be modified by another user: {0}. Are you sure you want to use it?', `"${unsafePaths.join(',')}"`), [{
                    label: nls.localize('yes', 'Yes'),
                    run: () => r(true)
                }, {
                    label: nls.localize('cancel', 'Cancel'),
                    run: () => r(false)
                }]);
            Event.once(handle.onDidClose)(() => {
                r(false);
            });
        });
    }
    _createProfileQuickPickItem(profile) {
        const buttons = [{
                iconClass: ThemeIcon.asClassName(configureTerminalProfileIcon),
                tooltip: nls.localize('createQuickLaunchProfile', "Configure Terminal Profile")
            }];
        const icon = (profile.icon && ThemeIcon.isThemeIcon(profile.icon)) ? profile.icon : Codicon.terminal;
        const label = `$(${icon.id}) ${profile.profileName}`;
        const friendlyPath = profile.isFromPath ? basename(profile.path) : profile.path;
        const colorClass = getColorClass(profile);
        const iconClasses = [];
        if (colorClass) {
            iconClasses.push(colorClass);
        }
        if (profile.args) {
            if (isString(profile.args)) {
                return { label, description: `${profile.path} ${profile.args}`, profile, profileName: profile.profileName, buttons, iconClasses };
            }
            const argsString = profile.args.map(e => {
                if (e.includes(' ')) {
                    return `"${e.replace(/"/g, '\\"')}"`; // CodeQL [SM02383] js/incomplete-sanitization This is only used as a label on the UI so this isn't a problem
                }
                return e;
            }).join(' ');
            return { label, description: `${friendlyPath} ${argsString}`, profile, profileName: profile.profileName, buttons, iconClasses };
        }
        return { label, description: friendlyPath, profile, profileName: profile.profileName, buttons, iconClasses };
    }
    _sortProfileQuickPickItems(items, defaultProfileName) {
        return items.sort((a, b) => {
            if (b.profileName === defaultProfileName) {
                return 1;
            }
            if (a.profileName === defaultProfileName) {
                return -1;
            }
            return a.profileName.localeCompare(b.profileName);
        });
    }
};
TerminalProfileQuickpick = __decorate([
    __param(0, ITerminalProfileService),
    __param(1, ITerminalProfileResolverService),
    __param(2, IConfigurationService),
    __param(3, IQuickInputService),
    __param(4, IThemeService),
    __param(5, INotificationService)
], TerminalProfileQuickpick);
export { TerminalProfileQuickpick };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlUXVpY2twaWNrLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsa0JBQWtCLEVBQWtGLE1BQU0sc0RBQXNELENBQUM7QUFFMUssT0FBTyxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUMxRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNsRSxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLCtCQUErQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHakcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFJbEQs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