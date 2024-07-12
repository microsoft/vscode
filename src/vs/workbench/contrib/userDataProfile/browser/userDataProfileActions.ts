/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, IMenuService, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IQuickInputService, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { HAS_PROFILES_CONTEXT, IUserDataProfileManagementService, IUserDataProfileService, MANAGE_PROFILES_ACTION_ID, PROFILES_CATEGORY, PROFILES_ENABLEMENT_CONTEXT, ProfilesMenu } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

class CreateTransientProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.createTemporaryProfile';
	static readonly TITLE = localize2('create temporary profile', "Create a Temporary Profile");
	constructor() {
		super({
			id: CreateTransientProfileAction.ID,
			title: CreateTransientProfileAction.TITLE,
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		return accessor.get(IUserDataProfileManagementService).createAndEnterTransientProfile();
	}
}

registerAction2(CreateTransientProfileAction);

export class RenameProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.renameProfile';
	constructor() {
		super({
			id: RenameProfileAction.ID,
			title: localize2('rename profile', "Rename..."),
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
		});
	}

	async run(accessor: ServicesAccessor, profile?: IUserDataProfile) {
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
		const notificationService = accessor.get(INotificationService);

		if (!profile) {
			profile = await this.pickProfile(quickInputService, userDataProfileService, userDataProfilesService);
		}

		if (!profile || profile.isDefault) {
			return;
		}

		const name = await quickInputService.input({
			value: profile.name,
			title: localize('select profile to rename', 'Rename {0}', profile.name),
			validateInput: async (value: string) => {
				if (profile.name !== value && userDataProfilesService.profiles.some(p => p.name === value)) {
					return localize('profileExists', "Profile with name {0} already exists.", value);
				}
				return undefined;
			}
		});
		if (name && name !== profile.name) {
			try {
				await userDataProfileManagementService.updateProfile(profile, { name });
			} catch (error) {
				notificationService.error(error);
			}
		}
	}

	private async pickProfile(quickInputService: IQuickInputService, userDataProfileService: IUserDataProfileService, userDataProfilesService: IUserDataProfilesService): Promise<IUserDataProfile | undefined> {
		const profiles = userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isTransient);
		if (!profiles.length) {
			return undefined;
		}
		const pick = await quickInputService.pick(
			profiles.map(profile => ({
				label: profile.name,
				description: profile.id === userDataProfileService.currentProfile.id ? localize('current', "Current") : undefined,
				profile
			})),
			{
				title: localize('rename specific profile', "Rename Profile..."),
				placeHolder: localize('pick profile to rename', "Select Profile to Rename"),
			});
		return pick?.profile;
	}
}

registerAction2(RenameProfileAction);

registerAction2(class ManageProfilesAction extends Action2 {
	constructor() {
		super({
			id: MANAGE_PROFILES_ACTION_ID,
			title: localize2('mange', "Manage..."),
			category: PROFILES_CATEGORY,
			precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const menuService = accessor.get(IMenuService);
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);

		const menu = menuService.getMenuActions(ProfilesMenu, contextKeyService);
		const actions: IAction[] = [];
		createAndFillInActionBarActions(menu, actions);

		if (actions.length) {
			const picks: QuickPickItem[] = actions.map(action => {
				if (action instanceof Separator) {
					return { type: 'separator' };
				}
				return {
					id: action.id,
					label: `${action.label}${action.checked ? ` $(${Codicon.check.id})` : ''}`,
				};
			});
			const pick = await quickInputService.pick(picks, { canPickMany: false, title: PROFILES_CATEGORY.value });
			if (pick?.id) {
				await commandService.executeCommand(pick.id);
			}
		}
	}
});

// Developer Actions

registerAction2(class CleanupProfilesAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.cleanupProfiles',
			title: localize2('cleanup profile', "Cleanup Profiles"),
			category: Categories.Developer,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		return accessor.get(IUserDataProfilesService).cleanUp();
	}
});

registerAction2(class ResetWorkspacesAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.resetWorkspaces',
			title: localize2('reset workspaces', "Reset Workspace Profiles Associations"),
			category: Categories.Developer,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		return userDataProfilesService.resetWorkspaces();
	}
});
