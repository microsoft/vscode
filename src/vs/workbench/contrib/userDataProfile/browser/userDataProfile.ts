/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IUserDataProfile, IUserDataProfilesService, PROFILES_ENABLEMENT_CONFIG } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IUserDataProfileManagementService, IUserDataProfileService, ManageProfilesSubMenu, PROFILES_CATEGORY, PROFILES_ENABLEMENT_CONTEXT, PROFILES_TTILE } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

const CONTEXT_CURRENT_PROFILE = new RawContextKey<string>('currentUserDataProfile', '');

export const userDataProfilesIcon = registerIcon('settingsProfiles-icon', Codicon.settings, localize('settingsProfilesIcon', 'Icon for Settings Profiles.'));

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly currentProfileContext: IContextKey<string>;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IStatusbarService private readonly statusBarService: IStatusbarService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.registerConfiguration();

		this.currentProfileContext = CONTEXT_CURRENT_PROFILE.bindTo(contextKeyService);
		this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => this.currentProfileContext.set(this.userDataProfileService.currentProfile.id)));

		this.updateStatus();
		this._register(Event.any(this.workspaceContextService.onDidChangeWorkbenchState, this.userDataProfileService.onDidChangeCurrentProfile, this.userDataProfilesService.onDidChangeProfiles)(() => this.updateStatus()));

		this.registerActions();
	}

	private registerConfiguration(): void {
		if (this.productService.quality !== 'stable') {
			Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
				...workbenchConfigurationNodeBase,
				'properties': {
					[PROFILES_ENABLEMENT_CONFIG]: {
						'type': 'boolean',
						'default': false,
						'description': localize('workbench.experimental.settingsProfiles.enabled', "Controls whether to enable the Settings Profiles preview feature."),
						scope: ConfigurationScope.APPLICATION,
						ignoreSync: true
					}
				}
			});
		}
	}

	private registerActions(): void {
		this.registerManageProfilesSubMenu();

		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));
	}

	private registerManageProfilesSubMenu(): void {
		const that = this;
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, <ISubmenuItem>{
			get title() { return localize('manageProfiles', "{0} ({1})", PROFILES_TTILE.value, that.userDataProfileService.currentProfile.name); },
			submenu: ManageProfilesSubMenu,
			group: '5_profiles',
			when: PROFILES_ENABLEMENT_CONTEXT,
			order: 3
		});
		MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, <ISubmenuItem>{
			title: PROFILES_TTILE,
			submenu: ManageProfilesSubMenu,
			group: '5_profiles',
			when: PROFILES_ENABLEMENT_CONTEXT,
			order: 3
		});
		MenuRegistry.appendMenuItem(MenuId.AccountsContext, <ISubmenuItem>{
			get title() { return localize('manageProfiles', "{0} ({1})", PROFILES_TTILE.value, that.userDataProfileService.currentProfile.name); },
			submenu: ManageProfilesSubMenu,
			group: '1_profiles',
			when: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	private readonly profilesDisposable = this._register(new MutableDisposable<DisposableStore>());
	private registerProfilesActions(): void {
		this.profilesDisposable.value = new DisposableStore();
		for (const profile of this.userDataProfilesService.profiles) {
			this.profilesDisposable.value.add(this.registerProfileEntryAction(profile));
		}
	}

	private registerProfileEntryAction(profile: IUserDataProfile): IDisposable {
		const that = this;
		return registerAction2(class ProfileEntryAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.profileEntry.${profile.id}`,
					title: profile.name,
					toggled: ContextKeyExpr.equals(CONTEXT_CURRENT_PROFILE.key, profile.id),
					menu: [
						{
							id: ManageProfilesSubMenu,
							group: '0_profiles',
							when: PROFILES_ENABLEMENT_CONTEXT,
						}
					]
				});
			}
			async run(accessor: ServicesAccessor) {
				if (that.userDataProfileService.currentProfile.id !== profile.id) {
					return that.userDataProfileManagementService.switchProfile(profile);
				}
			}
		});
	}

	private profileStatusAccessor: IStatusbarEntryAccessor | undefined;
	private updateStatus(): void {
		if (this.userDataProfilesService.profiles.length > 1) {
			const statusBarEntry: IStatusbarEntry = {
				name: PROFILES_CATEGORY,
				command: 'workbench.profiles.actions.switchProfile',
				ariaLabel: localize('currentProfile', "Current Settings Profile is {0}", this.userDataProfileService.currentProfile.name),
				text: `$(${userDataProfilesIcon.id}) ${this.userDataProfileService.currentProfile.name!}`,
				tooltip: localize('profileTooltip', "{0}: {1}", PROFILES_CATEGORY, this.userDataProfileService.currentProfile.name),
				color: themeColorFromId(STATUS_BAR_SETTINGS_PROFILE_FOREGROUND),
				backgroundColor: themeColorFromId(STATUS_BAR_SETTINGS_PROFILE_BACKGROUND)
			};
			if (this.profileStatusAccessor) {
				this.profileStatusAccessor.update(statusBarEntry);
			} else {
				this.profileStatusAccessor = this.statusBarService.addEntry(statusBarEntry, 'status.userDataProfile', StatusbarAlignment.LEFT, Number.MAX_VALUE - 1);
			}
		} else {
			if (this.profileStatusAccessor) {
				this.profileStatusAccessor.dispose();
				this.profileStatusAccessor = undefined;
			}
		}
	}
}

const STATUS_BAR_SETTINGS_PROFILE_FOREGROUND = registerColor('statusBarItem.settingsProfilesForeground', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: null
}, localize('statusBarItemSettingsProfileForeground', "Foreground color for the settings profile entry on the status bar."));

const STATUS_BAR_SETTINGS_PROFILE_BACKGROUND = registerColor('statusBarItem.settingsProfilesBackground', {
	dark: null,
	light: null,
	hcDark: null,
	hcLight: null
}, localize('statusBarItemSettingsProfileBackground', "Background color for the settings profile entry on the status bar."));
