/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { localize } from 'vs/nls';
import { Action2, IMenuService, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { QuickPickItem, IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { asJson, asText, IRequestService } from 'vs/platform/request/common/request';
import { IUserDataProfileTemplate, isUserDataProfileTemplate, IUserDataProfileManagementService, IUserDataProfileImportExportService, PROFILES_CATEGORY, PROFILE_EXTENSION, PROFILE_FILTER, ManageProfilesSubMenu, IUserDataProfileService, PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { compare } from 'vs/base/common/strings';
import { Codicon } from 'vs/base/common/codicons';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IAction, Separator } from 'vs/base/common/actions';

class CreateFromCurrentProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.createFromCurrentProfile';
	static readonly TITLE = {
		value: localize('save profile as', "Create from Current Settings Profile..."),
		original: 'Create from Current Profile...'
	};
	constructor() {
		super({
			id: CreateFromCurrentProfileAction.ID,
			title: CreateFromCurrentProfileAction.TITLE,
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const name = await quickInputService.input({
			placeHolder: localize('name', "Profile name"),
			title: localize('save profile as', "Create from Current Settings Profile..."),
			validateInput: async (value: string) => {
				if (userDataProfilesService.profiles.some(p => p.name === value)) {
					return localize('profileExists', "Settings Profile with name {0} already exists.", value);
				}
				return undefined;
			}
		});
		if (name) {
			try {
				await userDataProfileManagementService.createAndEnterProfile(name, undefined, true);
			} catch (error) {
				notificationService.error(error);
			}
		}
	}
}
registerAction2(CreateFromCurrentProfileAction);

class CreateEmptyProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.createEmptyProfile';
	static readonly TITLE = {
		value: localize('create empty profile', "Create an Empty Settings Profile..."),
		original: 'Create an Empty Settings Profile...'
	};
	constructor() {
		super({
			id: CreateEmptyProfileAction.ID,
			title: CreateEmptyProfileAction.TITLE,
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
		const notificationService = accessor.get(INotificationService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const name = await quickInputService.input({
			placeHolder: localize('name', "Profile name"),
			title: localize('create and enter empty profile', "Create an Empty Profile..."),
			validateInput: async (value: string) => {
				if (userDataProfilesService.profiles.some(p => p.name === value)) {
					return localize('profileExists', "Settings Profile with name {0} already exists.", value);
				}
				return undefined;
			}
		});
		if (name) {
			try {
				await userDataProfileManagementService.createAndEnterProfile(name, undefined, undefined);
			} catch (error) {
				notificationService.error(error);
			}
		}
	}
}
registerAction2(CreateEmptyProfileAction);

registerAction2(class CreateProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.createProfile',
			title: {
				value: localize('create profile', "Create..."),
				original: 'Create...'
			},
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
			menu: [
				{
					id: ManageProfilesSubMenu,
					group: '2_manage_profiles',
					when: PROFILES_ENABLEMENT_CONTEXT,
					order: 1
				}
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);
		const pick = await quickInputService.pick(
			[{
				id: CreateFromCurrentProfileAction.ID,
				label: CreateFromCurrentProfileAction.TITLE.value,
			}, {
				id: CreateEmptyProfileAction.ID,
				label: CreateEmptyProfileAction.TITLE.value,
			}], { hideInput: true, canPickMany: false, title: localize('create settings profile', "{0}: Create...", PROFILES_CATEGORY) });
		if (pick) {
			return commandService.executeCommand(pick.id);
		}
	}
});

registerAction2(class CreateTransientProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.createTemporaryProfile',
			title: {
				value: localize('create temporary profile', "Create a Temporary Settings Profile"),
				original: 'Create a Temporary Settings Profile'
			},
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT
		});
	}

	async run(accessor: ServicesAccessor) {
		return accessor.get(IUserDataProfileManagementService).createAndEnterTransientProfile();
	}
});

registerAction2(class RenameProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.renameProfile',
			title: {
				value: localize('rename profile', "Rename..."),
				original: 'Rename...'
			},
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
			menu: [
				{
					id: ManageProfilesSubMenu,
					group: '2_manage_profiles',
					when: PROFILES_ENABLEMENT_CONTEXT,
					order: 1
				}
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
		const notificationService = accessor.get(INotificationService);

		const profiles = userDataProfilesService.profiles.filter(p => !p.isDefault);
		if (profiles.length) {
			const pick = await quickInputService.pick(
				profiles.map(profile => ({
					label: profile.name,
					description: profile.id === userDataProfileService.currentProfile.id ? localize('current', "Current") : undefined,
					profile
				})),
				{
					placeHolder: localize('pick profile to rename', "Select Settings Profile to Rename"),
				});
			if (pick) {
				const name = await quickInputService.input({
					value: pick.profile.name,
					title: localize('edit settings profile', "Rename Settings Profile..."),
					validateInput: async (value: string) => {
						if (pick.profile.name !== value && profiles.some(p => p.name === value)) {
							return localize('profileExists', "Settings Profile with name {0} already exists.", value);
						}
						return undefined;
					}
				});
				if (name && name !== pick.profile.name) {
					try {
						await userDataProfileManagementService.renameProfile(pick.profile, name);
					} catch (error) {
						notificationService.error(error);
					}
				}
			}
		}
	}
});

registerAction2(class DeleteProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.deleteProfile',
			title: {
				value: localize('delete profile', "Delete..."),
				original: 'Delete...'
			},
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
			menu: [
				{
					id: ManageProfilesSubMenu,
					group: '2_manage_profiles',
					when: PROFILES_ENABLEMENT_CONTEXT,
					order: 2
				}
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
		const notificationService = accessor.get(INotificationService);

		const profiles = userDataProfilesService.profiles.filter(p => !p.isDefault);
		if (profiles.length) {
			const picks = await quickInputService.pick(
				profiles.map(profile => ({
					label: profile.name,
					description: profile.id === userDataProfileService.currentProfile.id ? localize('current', "Current") : undefined,
					profile
				})),
				{
					placeHolder: localize('pick profile to delete', "Select Settings Profiles to Delete"),
					canPickMany: true
				});
			if (picks) {
				try {
					await Promise.all(picks.map(pick => userDataProfileManagementService.removeProfile(pick.profile)));
				} catch (error) {
					notificationService.error(error);
				}
			}
		}
	}
});

export class MangeSettingsProfileAction extends Action2 {
	static readonly ID = 'workbench.profiles.actions.manage';
	constructor() {
		super({
			id: MangeSettingsProfileAction.ID,
			title: {
				value: localize('mange', "Manage..."),
				original: 'Manage...'
			},
			category: PROFILES_CATEGORY,
			precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const menuService = accessor.get(IMenuService);
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);

		const menu = menuService.createMenu(ManageProfilesSubMenu, contextKeyService);
		const actions: IAction[] = [];
		createAndFillInActionBarActions(menu, undefined, actions);
		menu.dispose();

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
			const pick = await quickInputService.pick(picks, { canPickMany: false });
			if (pick?.id) {
				await commandService.executeCommand(pick.id);
			}
		}
	}
}
registerAction2(MangeSettingsProfileAction);

registerAction2(class SwitchProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.switchProfile',
			title: {
				value: localize('switch profile', "Switch..."),
				original: 'Switch...'
			},
			category: PROFILES_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
		});
	}

	async run(accessor: ServicesAccessor) {
		const quickInputService = accessor.get(IQuickInputService);
		const userDataProfileService = accessor.get(IUserDataProfileService);
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);

		const profiles = userDataProfilesService.profiles.slice(0).sort((a, b) => compare(a.name, b.name));
		if (profiles.length) {
			const picks: Array<IQuickPickItem & { profile: IUserDataProfile }> = profiles.map(profile => ({
				label: `${profile.name}${profile.id === userDataProfileService.currentProfile.id ? ` $(${Codicon.check.id})` : ''}`,
				profile
			}));
			const pick = await quickInputService.pick(picks, { placeHolder: localize('pick profile', "Select Settings Profile") });
			if (pick) {
				await userDataProfileManagementService.switchProfile(pick.profile);
			}
		}
	}
});

registerAction2(class ExportProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.exportProfile',
			title: {
				value: localize('export profile', "Export..."),
				original: 'Export...'
			},
			category: PROFILES_CATEGORY,
			menu: [
				{
					id: ManageProfilesSubMenu,
					group: '3_import_export_profiles',
					when: PROFILES_ENABLEMENT_CONTEXT,
					order: 1
				}, {
					id: MenuId.CommandPalette
				}
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const textFileService = accessor.get(ITextFileService);
		const fileDialogService = accessor.get(IFileDialogService);
		const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
		const notificationService = accessor.get(INotificationService);

		const profileLocation = await fileDialogService.showSaveDialog({
			title: localize('export profile dialog', "Save Profile"),
			filters: PROFILE_FILTER,
			defaultUri: joinPath(await fileDialogService.defaultFilePath(), `profile.${PROFILE_EXTENSION}`),
		});

		if (!profileLocation) {
			return;
		}

		const profile = await userDataProfileImportExportService.exportProfile({ skipComments: true });
		await textFileService.create([{ resource: profileLocation, value: JSON.stringify(profile), options: { overwrite: true } }]);

		notificationService.info(localize('export success', "{0}: Exported successfully.", PROFILES_CATEGORY));
	}
});

registerAction2(class ImportProfileAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.importProfile',
			title: {
				value: localize('import profile', "Import..."),
				original: 'Import...'
			},
			category: PROFILES_CATEGORY,
			menu: [
				{
					id: ManageProfilesSubMenu,
					group: '3_import_export_profiles',
					when: PROFILES_ENABLEMENT_CONTEXT,
					order: 2
				}, {
					id: MenuId.CommandPalette
				}
			]
		});
	}

	async run(accessor: ServicesAccessor) {
		const fileDialogService = accessor.get(IFileDialogService);
		const quickInputService = accessor.get(IQuickInputService);
		const fileService = accessor.get(IFileService);
		const requestService = accessor.get(IRequestService);
		const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
		const dialogService = accessor.get(IDialogService);
		const contextKeyService = accessor.get(IContextKeyService);
		const notificationService = accessor.get(INotificationService);

		const isSettingProfilesEnabled = contextKeyService.contextMatchesRules(PROFILES_ENABLEMENT_CONTEXT);

		if (!isSettingProfilesEnabled) {
			if (!(await dialogService.confirm({
				title: localize('import profile title', "Import Settings from a Profile"),
				message: localize('confiirmation message', "This will replace your current settings. Are you sure you want to continue?"),
			})).confirmed) {
				return;
			}
		}

		const disposables = new DisposableStore();
		const quickPick = disposables.add(quickInputService.createQuickPick());
		const updateQuickPickItems = (value?: string) => {
			const selectFromFileItem: IQuickPickItem = { label: localize('select from file', "Import from profile file") };
			quickPick.items = value ? [{ label: localize('select from url', "Import from URL"), description: quickPick.value }, selectFromFileItem] : [selectFromFileItem];
		};
		quickPick.title = localize('import profile quick pick title', "Import Settings from a Profile");
		quickPick.placeholder = localize('import profile placeholder', "Provide profile URL or select profile file to import");
		quickPick.ignoreFocusOut = true;
		disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
		updateQuickPickItems();
		quickPick.matchOnLabel = false;
		quickPick.matchOnDescription = false;
		disposables.add(quickPick.onDidAccept(async () => {
			try {
				quickPick.hide();
				const profile = quickPick.selectedItems[0].description ? await this.getProfileFromURL(quickPick.value, requestService) : await this.getProfileFromFileSystem(fileDialogService, fileService);
				if (profile) {
					if (isSettingProfilesEnabled) {
						await userDataProfileImportExportService.importProfile(profile);
					} else {
						await userDataProfileImportExportService.setProfile(profile);
					}
				}
			} catch (error) {
				notificationService.error(error);
			}
		}));
		disposables.add(quickPick.onDidHide(() => disposables.dispose()));
		quickPick.show();
	}

	private async getProfileFromFileSystem(fileDialogService: IFileDialogService, fileService: IFileService): Promise<IUserDataProfileTemplate | null> {
		const profileLocation = await fileDialogService.showOpenDialog({
			canSelectFolders: false,
			canSelectFiles: true,
			canSelectMany: false,
			filters: PROFILE_FILTER,
			title: localize('import profile dialog', "Import Profile"),
		});
		if (!profileLocation) {
			return null;
		}
		const content = (await fileService.readFile(profileLocation[0])).value.toString();
		const parsed = JSON.parse(content);
		return isUserDataProfileTemplate(parsed) ? parsed : null;
	}

	private async getProfileFromURL(url: string, requestService: IRequestService): Promise<IUserDataProfileTemplate | null> {
		const options = { type: 'GET', url };
		const context = await requestService.request(options, CancellationToken.None);
		if (context.res.statusCode === 200) {
			const result = await asJson(context);
			return isUserDataProfileTemplate(result) ? result : null;
		} else {
			const message = await asText(context);
			throw new Error(`Expected 200, got back ${context.res.statusCode} instead.\n\n${message}`);
		}
	}

});

// Developer Actions

registerAction2(class CleanupProfilesAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.profiles.actions.cleanupProfiles',
			title: {
				value: localize('cleanup profile', "Cleanup Settings Profiles"),
				original: 'Cleanup Profiles'
			},
			category: CATEGORIES.Developer,
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
			title: {
				value: localize('reset workspaces', "Reset Workspace Settings Profiles Associations"),
				original: 'Reset Workspace Settings Profiles Associations'
			},
			category: CATEGORIES.Developer,
			f1: true,
			precondition: PROFILES_ENABLEMENT_CONTEXT,
		});
	}

	async run(accessor: ServicesAccessor) {
		const userDataProfilesService = accessor.get(IUserDataProfilesService);
		return userDataProfilesService.resetWorkspaces();
	}
});
