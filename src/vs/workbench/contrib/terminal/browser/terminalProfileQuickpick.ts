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
import { hasKey, isString } from '../../../../base/common/types.js';


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
			// Check if workspace and user default profiles differ
			const configInspect = this._configurationService.inspect(defaultProfileKey);
			const userDefault = configInspect.userValue;
			const workspaceDefault = configInspect.workspaceValue;

			// Check if the selected profile is workspace-only
			const profilesInspect = this._configurationService.inspect(profilesKey);
			const workspaceProfileNames = profilesInspect.workspaceValue && typeof profilesInspect.workspaceValue === 'object'
				? Object.keys(profilesInspect.workspaceValue as { [key: string]: unknown })
				: [];
			const userProfileNames = profilesInspect.userValue && typeof profilesInspect.userValue === 'object'
				? Object.keys(profilesInspect.userValue as { [key: string]: unknown })
				: [];
			const workspaceOnlyProfileNames = workspaceProfileNames.filter(name => !userProfileNames.includes(name));
			const isWorkspaceOnlyProfile = workspaceOnlyProfileNames.includes(result.profileName);

			// If workspace and user defaults differ, ask where to apply the change
			// For workspace-only profiles, default to workspace target
			let targets: ConfigurationTarget[] = isWorkspaceOnlyProfile ? [ConfigurationTarget.WORKSPACE] : [ConfigurationTarget.USER];
			if (workspaceDefault !== undefined && (workspaceDefault !== userDefault || workspaceDefault !== result.profileName)) {
				const targetChoice = await this._showTargetPicker();
				if (!targetChoice) {
					return; // User cancelled
				}
				targets = targetChoice;
			}

			// Apply the configuration to selected targets
			for (const target of targets) {
				if (hasKey(result.profile, { id: true })) {
					// extension contributed profile
					await this._configurationService.updateValue(defaultProfileKey, result.profile.title, target);
				} else {
					// For workspace-only profiles, don't copy the profile definition to user settings
					// Only set it as the default in workspace settings
					if (isWorkspaceOnlyProfile && target === ConfigurationTarget.USER) {
						// Skip adding workspace-only profile to user settings
						// Just set the default to reference the workspace profile
						await this._configurationService.updateValue(defaultProfileKey, result.profileName, target);
					} else {
						// Add the profile to settings if necessary
						if (hasKey(result.profile, { profileName: true })) {
							// Get the appropriate configuration based on target
							let profilesConfig: { [key: string]: ITerminalProfileObject };
							if (target === ConfigurationTarget.WORKSPACE) {
								profilesConfig = profilesInspect.workspaceValue || {};
							} else {
								profilesConfig = profilesInspect.userValue || {};
							}

							if (typeof profilesConfig === 'object') {
								// Only add profile definition if it doesn't already exist in the target
								if (!profilesConfig[result.profile.profileName]) {
									const newProfilesConfig = { ...profilesConfig };
									newProfilesConfig[result.profile.profileName] = this._createNewProfileConfig(result.profile);
									await this._configurationService.updateValue(profilesKey, newProfilesConfig, target);
								}
							}
						}
						// Set the default profile
						await this._configurationService.updateValue(defaultProfileKey, result.profileName, target);
					}
				}
			}

			if (hasKey(result.profile, { id: true })) {
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
		} else if (type === 'createInstance') {
			if (hasKey(result.profile, { id: true })) {
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
		return hasKey(result.profile, { profileName: true }) ? result.profile.profileName : result.profile.title;
	}

	private async _showTargetPicker(): Promise<ConfigurationTarget[] | undefined> {
		interface ITargetPickItem extends IQuickPickItem {
			targets: ConfigurationTarget[];
		}

		const items: ITargetPickItem[] = [
			{
				label: nls.localize('terminal.setDefaultProfile.user', "User"),
				detail: nls.localize('terminal.setDefaultProfile.user.detail', "Apply to user settings only"),
				targets: [ConfigurationTarget.USER]
			},
			{
				label: nls.localize('terminal.setDefaultProfile.workspace', "Workspace"),
				detail: nls.localize('terminal.setDefaultProfile.workspace.detail', "Apply to workspace settings (overrides user settings)"),
				targets: [ConfigurationTarget.WORKSPACE]
			},
			{
				label: nls.localize('terminal.setDefaultProfile.both', "Both"),
				detail: nls.localize('terminal.setDefaultProfile.both.detail', "Apply to both user and workspace settings"),
				targets: [ConfigurationTarget.USER, ConfigurationTarget.WORKSPACE]
			}
		];

		const result = await this._quickInputService.pick(items, {
			placeHolder: nls.localize('terminal.setDefaultProfile.selectTarget', "Select where to apply the default profile")
		});

		return result?.targets;
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
				if (hasKey(context.item.profile, { id: true })) {
					return;
				}
				const configProfiles: { [key: string]: ITerminalExecutable | null | undefined } = this._configurationService.getValue(TerminalSettingPrefix.Profiles + platformKey);
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
				const newConfigValue: { [key: string]: ITerminalExecutable | null | undefined } = {
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

		// Inspect workspace configuration to separate user and workspace profiles
		const workspaceProfilesConfig = this._configurationService.inspect(profilesKey);
		const userProfilesConfig = this._configurationService.inspect(profilesKey);

		const workspaceProfileNames = workspaceProfilesConfig.workspaceValue && typeof workspaceProfilesConfig.workspaceValue === 'object'
			? Object.keys(workspaceProfilesConfig.workspaceValue as { [key: string]: unknown })
			: [];

		const userProfileNames = userProfilesConfig.userValue && typeof userProfilesConfig.userValue === 'object'
			? Object.keys(userProfilesConfig.userValue as { [key: string]: unknown })
			: [];

		// Filter profiles: only show workspace profiles if they're NOT already in user profiles
		const workspaceOnlyProfileNames = workspaceProfileNames.filter(name => !userProfileNames.includes(name));

		// User profiles section includes profiles from user config + profiles in both user and workspace
		const userConfigProfiles = configProfiles.filter(e => !workspaceOnlyProfileNames.includes(e.profileName));
		// Workspace section only includes profiles that are ONLY in workspace, not in user
		const workspaceConfigProfiles = configProfiles.filter(e => workspaceOnlyProfileNames.includes(e.profileName));

		if (userConfigProfiles.length > 0) {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles', "profiles") });
			quickPickItems.push(...this._sortProfileQuickPickItems(userConfigProfiles.map(e => this._createProfileQuickPickItem(e)), defaultProfileName!));
		}

		// Add workspace profiles section if any exist (only workspace-only profiles)
		if (workspaceConfigProfiles.length > 0) {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles.workspace', "workspace") });
			quickPickItems.push(...this._sortProfileQuickPickItems(workspaceConfigProfiles.map(e => this._createProfileQuickPickItem(e)), defaultProfileName!));
		}

		quickPickItems.push({ type: 'separator', label: nls.localize('ICreateContributedTerminalProfileOptions', "contributed") });
		const contributedProfiles: IProfileQuickPickItem[] = [];
		for (const contributed of this._terminalProfileService.contributedProfiles) {
			let icon: ThemeIcon | undefined;
			if (isString(contributed.icon)) {
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
		const isUnsafePath = hasKey(profile, { profileName: true }) && profile.isUnsafePath;
		const requiresUnsafePath = hasKey(profile, { profileName: true }) && profile.requiresUnsafePath;
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
