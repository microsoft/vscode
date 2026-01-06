/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IQuickInputService, IKeyMods, IPickOptions, IQuickPickSeparator, IQuickInputButton, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IExtensionTerminalProfile, ITerminalProfile, ITerminalProfileObject, TerminalSettingPrefix, type ITerminalExecutable } from '../../../../platform/terminal/common/terminal.js';
import { getUriClasses, getColorClass, createColorStyleElement } from './terminalIcon.js';
import { configureTerminalProfileIcon } from './terminalIcons.js';
import * as nls from '../../../../nls.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../common/terminal.js';
import { IQuickPickTerminalObject, ITerminalInstance } from './terminal.js';
import { IPickerQuickAccessItem } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { basename } from '../../../../base/common/path.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';


type DefaultProfileName = string;
export class TerminalProfileQuickpick {
	constructor(
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IThemeService private readonly _themeService: IThemeService,
		@INotificationService private readonly _notificationService: INotificationService
	) { }

	async showAndGetResult(type: 'setDefault' | 'createInstance'): Promise<IQuickPickTerminalObject | DefaultProfileName | undefined> {
		const platformKey = await this._terminalProfileService.getPlatformKey();
		const profilesKey = TerminalSettingPrefix.Profiles + platformKey;
		const result = await this._createAndShow(type);
		const defaultProfileKey = `${TerminalSettingPrefix.DefaultProfile}${platformKey}`;
		if (!result) {
			return;
		}
		if (type === 'setDefault') {
			if ('command' in result.profile) {
				return; // Should never happen
			} else if ('id' in result.profile) {
				// extension contributed profile
				await this._configurationService.updateValue(defaultProfileKey, result.profile.title, ConfigurationTarget.USER);
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
			if ('isAutoDetected' in result.profile) {
				const profilesConfig = await this._configurationService.getValue(profilesKey);
				if (typeof profilesConfig === 'object') {
					const newProfile: ITerminalProfileObject = {
						path: result.profile.path
					};
					if (result.profile.args) {
						newProfile.args = result.profile.args;
					}
					(profilesConfig as { [key: string]: ITerminalProfileObject })[result.profile.profileName] = this._createNewProfileConfig(result.profile);
					await this._configurationService.updateValue(profilesKey, profilesConfig, ConfigurationTarget.USER);
				}
			}
			// Set the default profile
			await this._configurationService.updateValue(defaultProfileKey, result.profileName, ConfigurationTarget.USER);
		} else if (type === 'createInstance') {
			if ('id' in result.profile) {
				return {
					config: {
						extensionIdentifier: result.profile.extensionIdentifier,
						id: result.profile.id,
						title: result.profile.title,
						options: {
							icon: result.profile.icon,
							color: result.profile.color,
						}
					},
					keyMods: result.keyMods
				};
			} else {
				return { config: result.profile, keyMods: result.keyMods };
			}
		}
		// for tests
		return 'profileName' in result.profile ? result.profile.profileName : result.profile.title;
	}

	private async _createAndShow(type: 'setDefault' | 'createInstance'): Promise<IProfileQuickPickItem | undefined> {
		const platformKey = await this._terminalProfileService.getPlatformKey();
		const profiles = this._terminalProfileService.availableProfiles;
		const profilesKey = TerminalSettingPrefix.Profiles + platformKey;
		const defaultProfileName = this._terminalProfileService.getDefaultProfileName();
		let keyMods: IKeyMods | undefined;
		const options: IPickOptions<IProfileQuickPickItem> = {
			placeHolder: type === 'createInstance' ? nls.localize('terminal.integrated.selectProfileToCreate', "Select the terminal profile to create") : nls.localize('terminal.integrated.chooseDefaultProfile', "Select your default terminal profile"),
			onDidTriggerItemButton: async (context) => {
				// Get the user's explicit permission to use a potentially unsafe path
				if (!await this._isProfileSafe(context.item.profile)) {
					return;
				}
				if ('command' in context.item.profile) {
					return;
				}
				if ('id' in context.item.profile) {
					return;
				}
				const configProfiles: { [key: string]: any } = this._configurationService.getValue(TerminalSettingPrefix.Profiles + platformKey);
				const existingProfiles = !!configProfiles ? Object.keys(configProfiles) : [];
				const name = await this._quickInputService.input({
					prompt: nls.localize('enterTerminalProfileName', "Enter terminal profile name"),
					value: context.item.profile.profileName,
					validateInput: async input => {
						if (existingProfiles.includes(input)) {
							return nls.localize('terminalProfileAlreadyExists', "A terminal profile already exists with that name");
						}
						return undefined;
					}
				});
				if (!name) {
					return;
				}
				const newConfigValue: { [key: string]: ITerminalExecutable } = {
					...configProfiles,
					[name]: this._createNewProfileConfig(context.item.profile)
				};
				await this._configurationService.updateValue(profilesKey, newConfigValue, ConfigurationTarget.USER);
			},
			onKeyMods: mods => keyMods = mods
		};

		// Build quick pick items
		const quickPickItems: (IProfileQuickPickItem | IQuickPickSeparator)[] = [];
		const configProfiles = profiles.filter(e => !e.isAutoDetected);
		const autoDetectedProfiles = profiles.filter(e => e.isAutoDetected);

		if (configProfiles.length > 0) {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles', "profiles") });
			quickPickItems.push(...this._sortProfileQuickPickItems(configProfiles.map(e => this._createProfileQuickPickItem(e)), defaultProfileName!));
		}

		quickPickItems.push({ type: 'separator', label: nls.localize('ICreateContributedTerminalProfileOptions', "contributed") });
		const contributedProfiles: IProfileQuickPickItem[] = [];
		for (const contributed of this._terminalProfileService.contributedProfiles) {
			let icon: ThemeIcon | undefined;
			if (typeof contributed.icon === 'string') {
				if (contributed.icon.startsWith('$(')) {
					icon = ThemeIcon.fromString(contributed.icon);
				} else {
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
					color: contributed.color
				},
				profileName: contributed.title,
				iconClasses
			});
		}

		if (contributedProfiles.length > 0) {
			quickPickItems.push(...this._sortProfileQuickPickItems(contributedProfiles, defaultProfileName!));
		}

		if (autoDetectedProfiles.length > 0) {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles.detected', "detected") });
			quickPickItems.push(...this._sortProfileQuickPickItems(autoDetectedProfiles.map(e => this._createProfileQuickPickItem(e)), defaultProfileName!));
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

	private _createNewProfileConfig(profile: ITerminalProfile): ITerminalExecutable {
		const result: ITerminalExecutable = { path: profile.path };
		if (profile.args) {
			result.args = profile.args;
		}
		if (profile.env) {
			result.env = profile.env;
		}
		return result;
	}

	private async _isProfileSafe(profile: ITerminalProfile | IExtensionTerminalProfile): Promise<boolean> {
		const isUnsafePath = 'isUnsafePath' in profile && profile.isUnsafePath;
		const requiresUnsafePath = 'requiresUnsafePath' in profile && profile.requiresUnsafePath;
		if (!isUnsafePath && !requiresUnsafePath) {
			return true;
		}

		// Get the user's explicit permission to use a potentially unsafe path
		return await new Promise<boolean>(r => {
			const unsafePaths = [];
			if (isUnsafePath) {
				unsafePaths.push(profile.path);
			}
			if (requiresUnsafePath) {
				unsafePaths.push(requiresUnsafePath);
			}
			// Notify about unsafe path(s). At the time of writing, multiple unsafe paths isn't
			// possible so the message is optimized for a single path.
			const handle = this._notificationService.prompt(
				Severity.Warning,
				nls.localize('unsafePathWarning', 'This terminal profile uses a potentially unsafe path that can be modified by another user: {0}. Are you sure you want to use it?', `"${unsafePaths.join(',')}"`),
				[{
					label: nls.localize('yes', 'Yes'),
					run: () => r(true)
				}, {
					label: nls.localize('cancel', 'Cancel'),
					run: () => r(false)
				}]
			);
			handle.onDidClose(() => r(false));
		});
	}

	private _createProfileQuickPickItem(profile: ITerminalProfile): IProfileQuickPickItem {
		const buttons: IQuickInputButton[] = [{
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
			if (typeof profile.args === 'string') {
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

	private _sortProfileQuickPickItems(items: IProfileQuickPickItem[], defaultProfileName: string) {
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
}

export interface IProfileQuickPickItem extends IQuickPickItem {
	profile: ITerminalProfile | IExtensionTerminalProfile;
	profileName: string;
	keyMods?: IKeyMods | undefined;
}

export interface ITerminalQuickPickItem extends IPickerQuickAccessItem {
	terminal: ITerminalInstance;
}
