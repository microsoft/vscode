/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IsDevelopmentContext } from 'vs/platform/contextkey/common/contextkeys';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkbenchStateContext } from 'vs/workbench/common/contextkeys';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IUserDataProfileManagementService, ManageProfilesSubMenu, PROFILES_CATEGORY, PROFILES_TTILE } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

const CONTEXT_CURRENT_PROFILE = new RawContextKey<string>('currentUserDataProfile', '');

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly currentProfileContext: IContextKey<string>;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IStatusbarService private readonly statusBarService: IStatusbarService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.currentProfileContext = CONTEXT_CURRENT_PROFILE.bindTo(contextKeyService);
		this.currentProfileContext.set(this.userDataProfilesService.currentProfile.id);

		this.updateStatus();
		this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => this.updateStatus()));

		this.registerActions();
	}

	private registerActions(): void {
		this.registerManageProfilesSubMenu();

		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));
	}

	private registerManageProfilesSubMenu(): void {
		const that = this;
		const when = ContextKeyExpr.and(IsDevelopmentContext, WorkbenchStateContext.notEqualsTo('empty'));
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, <ISubmenuItem>{
			get title() { return localize('manageProfiles', "{0} ({1})", PROFILES_TTILE.value, that.userDataProfilesService.currentProfile.name); },
			submenu: ManageProfilesSubMenu,
			group: '5_profiles',
			when,
			order: 3
		});
		MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, <ISubmenuItem>{
			title: PROFILES_TTILE,
			submenu: ManageProfilesSubMenu,
			group: '5_profiles',
			when,
			order: 3
		});
		MenuRegistry.appendMenuItem(MenuId.AccountsContext, <ISubmenuItem>{
			get title() { return localize('manageProfiles', "{0} ({1})", PROFILES_TTILE.value, that.userDataProfilesService.currentProfile.name); },
			submenu: ManageProfilesSubMenu,
			group: '1_profiles',
			when,
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
				const when = ContextKeyExpr.and(IsDevelopmentContext, WorkbenchStateContext.notEqualsTo('empty'));
				super({
					id: `workbench.profiles.actions.profileEntry.${profile.id}`,
					title: profile.name,
					toggled: ContextKeyExpr.equals(CONTEXT_CURRENT_PROFILE.key, profile.id),
					precondition: ContextKeyExpr.notEquals(CONTEXT_CURRENT_PROFILE.key, profile.id),
					menu: [
						{
							id: ManageProfilesSubMenu,
							group: '0_profiles',
							when,
						}
					]
				});
			}
			async run(accessor: ServicesAccessor) {
				return that.userDataProfileManagementService.switchProfile(profile);
			}
		});
	}

	private async updateStatus(): Promise<void> {
		const profiles = await this.userDataProfilesService.getAllProfiles();
		if (profiles.length > 1 && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			this.statusBarService.addEntry({
				name: this.userDataProfilesService.currentProfile.name!,
				command: 'workbench.profiles.actions.switchProfile',
				ariaLabel: localize('currentProfile', "Current Settings Profile is {0}", this.userDataProfilesService.currentProfile.name),
				text: `${PROFILES_CATEGORY}: ${this.userDataProfilesService.currentProfile.name!}`,
			}, 'status.userDataProfile', StatusbarAlignment.LEFT, 1);
		}
	}
}
