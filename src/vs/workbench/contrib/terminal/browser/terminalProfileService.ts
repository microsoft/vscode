/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { AutoOpenBarrier } from 'vs/base/common/async';
import { throttle } from 'vs/base/common/decorators';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh, isWeb, isWindows, OperatingSystem, OS } from 'vs/base/common/platform';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITerminalProfile, IExtensionTerminalProfile, TerminalSettingPrefix, TerminalSettingId, ITerminalProfileObject, IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';
import { registerTerminalDefaultProfileConfiguration } from 'vs/platform/terminal/common/terminalPlatformConfiguration';
import { terminalIconsEqual, terminalProfileArgsMatch } from 'vs/platform/terminal/common/terminalProfiles';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { refreshTerminalActions } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { IRegisterContributedProfileArgs, ITerminalProfileProvider, ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

/*
* Links TerminalService with TerminalProfileResolverService
* and keeps the available terminal profiles updated
*/
export class TerminalProfileService implements ITerminalProfileService {
	private _webExtensionContributedProfileContextKey: IContextKey<boolean>;
	private _profilesReadyBarrier: AutoOpenBarrier;
	private _availableProfiles: ITerminalProfile[] | undefined;
	private _contributedProfiles: IExtensionTerminalProfile[] = [];
	private _defaultProfileName?: string;
	private _platformConfigJustRefreshed = false;
	private readonly _profileProviders: Map</*ext id*/string, Map</*provider id*/string, ITerminalProfileProvider>> = new Map();

	private readonly _onDidChangeAvailableProfiles = new Emitter<ITerminalProfile[]>();
	get onDidChangeAvailableProfiles(): Event<ITerminalProfile[]> { return this._onDidChangeAvailableProfiles.event; }

	get profilesReady(): Promise<void> { return this._profilesReadyBarrier.wait().then(() => { }); }
	get availableProfiles(): ITerminalProfile[] {
		if (!this._platformConfigJustRefreshed) {
			this.refreshAvailableProfiles();
		}
		return this._availableProfiles || [];
	}
	get contributedProfiles(): IExtensionTerminalProfile[] {
		return this._contributedProfiles || [];
	}
	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalContributionService private readonly _terminalContributionService: ITerminalContributionService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IRemoteAgentService private _remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService
	) {
		// in web, we don't want to show the dropdown unless there's a web extension
		// that contributes a profile
		this._extensionService.onDidChangeExtensions(() => this.refreshAvailableProfiles());

		this._webExtensionContributedProfileContextKey = TerminalContextKeys.webExtensionContributedProfile.bindTo(this._contextKeyService);
		this._updateWebContextKey();
		// Wait up to 5 seconds for profiles to be ready so it's assured that we know the actual
		// default terminal before launching the first terminal. This isn't expected to ever take
		// this long.
		this._profilesReadyBarrier = new AutoOpenBarrier(20000);
		this.refreshAvailableProfiles();
		this._setupConfigListener();
	}

	private async _setupConfigListener(): Promise<void> {
		const platformKey = await this.getPlatformKey();

		this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalSettingPrefix.DefaultProfile + platformKey) ||
				e.affectsConfiguration(TerminalSettingPrefix.Profiles + platformKey) ||
				e.affectsConfiguration(TerminalSettingId.UseWslProfiles)) {
				if (e.source !== ConfigurationTarget.DEFAULT) {
					// when _refreshPlatformConfig is called within refreshAvailableProfiles
					// on did change configuration is fired. this can lead to an infinite recursion
					this.refreshAvailableProfiles();
					this._platformConfigJustRefreshed = false;
				} else {
					this._platformConfigJustRefreshed = true;
				}
			}
		});
	}

	_serviceBrand: undefined;

	getDefaultProfileName(): string | undefined {
		return this._defaultProfileName;
	}

	@throttle(2000)
	refreshAvailableProfiles(): void {
		this._refreshAvailableProfilesNow();
	}

	protected async _refreshAvailableProfilesNow(): Promise<void> {
		const profiles = await this._detectProfiles(true);
		const profilesChanged = !(equals(profiles, this._availableProfiles, profilesEqual));
		const contributedProfilesChanged = await this._updateContributedProfiles();
		if (profilesChanged || contributedProfilesChanged) {
			this._availableProfiles = profiles;
			this._onDidChangeAvailableProfiles.fire(this._availableProfiles);
			this._profilesReadyBarrier.open();
			this._updateWebContextKey();
			await this._refreshPlatformConfig(this._availableProfiles);
		}
	}

	private async _updateContributedProfiles(): Promise<boolean> {
		const platformKey = await this.getPlatformKey();
		const excludedContributedProfiles: string[] = [];
		const configProfiles: { [key: string]: any } = this._configurationService.getValue(TerminalSettingPrefix.Profiles + platformKey);
		for (const [profileName, value] of Object.entries(configProfiles)) {
			if (value === null) {
				excludedContributedProfiles.push(profileName);
			}
		}
		const filteredContributedProfiles = Array.from(this._terminalContributionService.terminalProfiles.filter(p => !excludedContributedProfiles.includes(p.title)));
		const contributedProfilesChanged = !equals(filteredContributedProfiles, this._contributedProfiles, contributedProfilesEqual);
		this._contributedProfiles = filteredContributedProfiles;
		return contributedProfilesChanged;
	}

	getContributedProfileProvider(extensionIdentifier: string, id: string): ITerminalProfileProvider | undefined {
		const extMap = this._profileProviders.get(extensionIdentifier);
		return extMap?.get(id);
	}

	private async _detectProfiles(includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		const primaryBackend = await this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority);
		if (!primaryBackend) {
			return this._availableProfiles || [];
		}
		const platform = await this.getPlatformKey();
		this._defaultProfileName = this._configurationService.getValue(`${TerminalSettingPrefix.DefaultProfile}${platform}`) ?? undefined;
		return primaryBackend.getProfiles(this._configurationService.getValue(`${TerminalSettingPrefix.Profiles}${platform}`), this._defaultProfileName, includeDetectedProfiles);
	}

	private _updateWebContextKey(): void {
		this._webExtensionContributedProfileContextKey.set(isWeb && this._contributedProfiles.length > 0);
	}

	private async _refreshPlatformConfig(profiles: ITerminalProfile[]) {
		const env = await this._remoteAgentService.getEnvironment();
		registerTerminalDefaultProfileConfiguration({ os: env?.os || OS, profiles }, this._contributedProfiles);
		refreshTerminalActions(profiles);
	}

	async getPlatformKey(): Promise<string> {
		const env = await this._remoteAgentService.getEnvironment();
		if (env) {
			return env.os === OperatingSystem.Windows ? 'windows' : (env.os === OperatingSystem.Macintosh ? 'osx' : 'linux');
		}
		return isWindows ? 'windows' : (isMacintosh ? 'osx' : 'linux');
	}

	registerTerminalProfileProvider(extensionIdentifier: string, id: string, profileProvider: ITerminalProfileProvider): IDisposable {
		let extMap = this._profileProviders.get(extensionIdentifier);
		if (!extMap) {
			extMap = new Map();
			this._profileProviders.set(extensionIdentifier, extMap);
		}
		extMap.set(id, profileProvider);
		return toDisposable(() => this._profileProviders.delete(id));
	}

	async registerContributedProfile(args: IRegisterContributedProfileArgs): Promise<void> {
		const platformKey = await this.getPlatformKey();
		const profilesConfig = await this._configurationService.getValue(`${TerminalSettingPrefix.Profiles}${platformKey}`);
		if (typeof profilesConfig === 'object') {
			const newProfile: IExtensionTerminalProfile = {
				extensionIdentifier: args.extensionIdentifier,
				icon: args.options.icon,
				id: args.id,
				title: args.title,
				color: args.options.color
			};

			(profilesConfig as { [key: string]: ITerminalProfileObject })[args.title] = newProfile;
		}
		await this._configurationService.updateValue(`${TerminalSettingPrefix.Profiles}${platformKey}`, profilesConfig, ConfigurationTarget.USER);
		return;
	}

	async getContributedDefaultProfile(shellLaunchConfig: IShellLaunchConfig): Promise<IExtensionTerminalProfile | undefined> {
		// prevents recursion with the MainThreadTerminalService call to create terminal
		// and defers to the provided launch config when an executable is provided
		if (shellLaunchConfig && !shellLaunchConfig.extHostTerminalId && !('executable' in shellLaunchConfig)) {
			const key = await this.getPlatformKey();
			const defaultProfileName = this._configurationService.getValue(`${TerminalSettingPrefix.DefaultProfile}${key}`);
			const contributedDefaultProfile = this.contributedProfiles.find(p => p.title === defaultProfileName);
			return contributedDefaultProfile;
		}
		return undefined;
	}
}

function profilesEqual(one: ITerminalProfile, other: ITerminalProfile) {
	return one.profileName === other.profileName &&
		terminalProfileArgsMatch(one.args, other.args) &&
		one.color === other.color &&
		terminalIconsEqual(one.icon, other.icon) &&
		one.isAutoDetected === other.isAutoDetected &&
		one.isDefault === other.isDefault &&
		one.overrideName === other.overrideName &&
		one.path === other.path;
}

function contributedProfilesEqual(one: IExtensionTerminalProfile, other: IExtensionTerminalProfile) {
	return one.extensionIdentifier === other.extensionIdentifier &&
		one.color === other.color &&
		one.icon === other.icon &&
		one.id === other.id &&
		one.title === other.title;
}
