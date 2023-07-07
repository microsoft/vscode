/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, IMenuService, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { RenameProfileAction } from 'vs/workbench/contrib/userDataProfile/browser/userDataProfileActions';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, IS_CURRENT_PROFILE_TRANSIENT_CONTEXT, IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, PROFILES_CATEGORY, PROFILE_FILTER, IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT, ProfilesMenu, PROFILES_ENABLEMENT_CONTEXT, PROFILES_TITLE } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IQuickInputService, IQuickPickItem, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { URI } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { getErrorMessage } from 'vs/base/common/errors';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService, asJson } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';

const CREATE_EMPTY_PROFILE_ACTION_ID = 'workbench.profiles.actions.createEmptyProfile';
const CREATE_EMPTY_PROFILE_ACTION_TITLE = {
	value: localize('create empty profile', "Create an Empty Profile..."),
	original: 'Create an Empty Profile...'
};

const CREATE_FROM_CURRENT_PROFILE_ACTION_ID = 'workbench.profiles.actions.createFromCurrentProfile';
const CREATE_FROM_CURRENT_PROFILE_ACTION_TITLE = {
	value: localize('save profile as', "Create from Current Profile..."),
	original: 'Create from Current Profile...'
};

interface IProfileTemplateInfo {
	readonly name: string;
	readonly url: string;
}

type IProfileTemplateQuickPickItem = IQuickPickItem & IProfileTemplateInfo;

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly currentProfileContext: IContextKey<string>;
	private readonly isCurrentProfileTransientContext: IContextKey<boolean>;
	private readonly hasProfilesContext: IContextKey<boolean>;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.currentProfileContext = CURRENT_PROFILE_CONTEXT.bindTo(contextKeyService);
		PROFILES_ENABLEMENT_CONTEXT.bindTo(contextKeyService).set(this.userDataProfilesService.isEnabled());
		this.isCurrentProfileTransientContext = IS_CURRENT_PROFILE_TRANSIENT_CONTEXT.bindTo(contextKeyService);

		this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
		this.isCurrentProfileTransientContext.set(!!this.userDataProfileService.currentProfile.isTransient);
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => {
			this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
			this.isCurrentProfileTransientContext.set(!!this.userDataProfileService.currentProfile.isTransient);
		}));

		this.hasProfilesContext = HAS_PROFILES_CONTEXT.bindTo(contextKeyService);
		this.hasProfilesContext.set(this.userDataProfilesService.profiles.length > 1);
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.hasProfilesContext.set(this.userDataProfilesService.profiles.length > 1)));

		this.registerActions();

		if (isWeb) {
			lifecycleService.when(LifecyclePhase.Eventually).then(() => userDataProfilesService.cleanUp());
		}

		this.reportWorkspaceProfileInfo();
	}

	private registerActions(): void {
		this.registerProfileSubMenu();
		this._register(this.registerSwitchProfileAction());

		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));

		this.registerCurrentProfilesActions();
		this._register(Event.any(this.userDataProfileService.onDidChangeCurrentProfile, this.userDataProfileService.onDidUpdateCurrentProfile)(() => this.registerCurrentProfilesActions()));

		this.registerCreateEmptyProfileAction();
		this.registerCreateFromCurrentProfileAction();
		this.registerCreateProfileAction();
		this.registerDeleteProfileAction();
		this.registerCreateProfileFromTemplatesAction();

		this.registerHelpAction();
	}

	private registerProfileSubMenu(): void {
		const getProfilesTitle = () => {
			return localize('profiles', "Profiles ({0})", this.userDataProfileService.currentProfile.name);
		};
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, <ISubmenuItem>{
			get title() {
				return getProfilesTitle();
			},
			submenu: ProfilesMenu,
			group: '1_profiles',
			order: 1,
		});
		MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, <ISubmenuItem>{
			get title() {
				return getProfilesTitle();
			},
			submenu: ProfilesMenu,
			group: '1_profiles',
			order: 1,
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
					toggled: ContextKeyExpr.equals(CURRENT_PROFILE_CONTEXT.key, profile.id),
					menu: [
						{
							id: ProfilesMenu,
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

	private registerSwitchProfileAction(): IDisposable {
		return registerAction2(class SwitchProfileAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.switchProfile`,
					title: { value: localize('switchProfile', "Switch Profile..."), original: 'Switch Profile...' },
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: PROFILES_ENABLEMENT_CONTEXT,
				});
			}
			async run(accessor: ServicesAccessor) {
				const quickInputService = accessor.get(IQuickInputService);
				const menuService = accessor.get(IMenuService);
				const menu = menuService.createMenu(ProfilesMenu, accessor.get(IContextKeyService));
				const actions = menu.getActions().find(([group]) => group === '0_profiles')?.[1] ?? [];
				try {
					const result = await quickInputService.pick(actions.map(action => ({
						action,
						label: action.checked ? `$(check) ${action.label}` : action.label,
					})), {
						placeHolder: localize('selectProfile', "Select Profile")
					});
					await result?.action.run();
				} finally {
					menu.dispose();
				}
			}
		});
	}

	private readonly currentprofileActionsDisposable = this._register(new MutableDisposable<DisposableStore>());
	private registerCurrentProfilesActions(): void {
		this.currentprofileActionsDisposable.value = new DisposableStore();
		this.currentprofileActionsDisposable.value.add(this.registerRenameCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerShowCurrentProfileContentsAction());
		this.currentprofileActionsDisposable.value.add(this.registerExportCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerImportProfileAction());
	}

	private registerRenameCurrentProfileAction(): IDisposable {
		const that = this;
		return registerAction2(class RenameCurrentProfileAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.renameCurrentProfile`,
					title: {
						value: localize('rename profile', "Rename..."),
						original: `Rename...`
					},
					menu: [
						{
							id: ProfilesMenu,
							group: '2_manage_current',
							when: ContextKeyExpr.and(ContextKeyExpr.notEquals(CURRENT_PROFILE_CONTEXT.key, that.userDataProfilesService.defaultProfile.id), IS_CURRENT_PROFILE_TRANSIENT_CONTEXT.toNegated()),
							order: 2
						}
					]
				});
			}
			async run(accessor: ServicesAccessor) {
				accessor.get(ICommandService).executeCommand(RenameProfileAction.ID, that.userDataProfileService.currentProfile);
			}
		});
	}

	private registerShowCurrentProfileContentsAction(): IDisposable {
		const id = 'workbench.profiles.actions.showProfileContents';
		return registerAction2(class ShowProfileContentsAction extends Action2 {
			constructor() {
				super({
					id,
					title: {
						value: localize('show profile contents', "Show Contents..."),
						original: `ShowContents...`
					},
					category: PROFILES_CATEGORY,
					menu: [
						{
							id: ProfilesMenu,
							group: '2_manage_current',
							order: 3
						}, {
							id: MenuId.CommandPalette
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
				return userDataProfileImportExportService.showProfileContents();
			}
		});
	}

	private registerExportCurrentProfileAction(): IDisposable {
		const that = this;
		const disposables = new DisposableStore();
		const id = 'workbench.profiles.actions.exportProfile';
		disposables.add(registerAction2(class ExportProfileAction extends Action2 {
			constructor() {
				super({
					id,
					title: {
						value: localize('export profile', "Export Profile..."),
						original: `Export Profile (${that.userDataProfileService.currentProfile.name})...`
					},
					category: PROFILES_CATEGORY,
					precondition: IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT.toNegated(),
					menu: [
						{
							id: ProfilesMenu,
							group: '4_import_export_profiles',
							order: 1
						}, {
							id: MenuId.CommandPalette
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
				return userDataProfileImportExportService.exportProfile();
			}
		}));
		disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarShare, {
			command: {
				id,
				title: {
					value: localize('export profile in share', "Export Profile ({0})...", that.userDataProfileService.currentProfile.name),
					original: `Export Profile (${that.userDataProfileService.currentProfile.name})...`
				},
				precondition: PROFILES_ENABLEMENT_CONTEXT,
			},
		}));
		return disposables;
	}

	private registerImportProfileAction(): IDisposable {
		const disposables = new DisposableStore();
		const id = 'workbench.profiles.actions.importProfile';
		disposables.add(registerAction2(class ImportProfileAction extends Action2 {
			constructor() {
				super({
					id,
					title: {
						value: localize('import profile', "Import Profile..."),
						original: 'Import Profile...'
					},
					category: PROFILES_CATEGORY,
					precondition: IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT.toNegated(),
					menu: [
						{
							id: ProfilesMenu,
							group: '4_import_export_profiles',
							when: PROFILES_ENABLEMENT_CONTEXT,
							order: 2
						}, {
							id: MenuId.CommandPalette,
							when: PROFILES_ENABLEMENT_CONTEXT,
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				const fileDialogService = accessor.get(IFileDialogService);
				const quickInputService = accessor.get(IQuickInputService);
				const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
				const notificationService = accessor.get(INotificationService);

				const disposables = new DisposableStore();
				const quickPick = disposables.add(quickInputService.createQuickPick());
				const updateQuickPickItems = (value?: string) => {
					const selectFromFileItem: IQuickPickItem = { label: localize('import from file', "Create from profile template file") };
					quickPick.items = value ? [{ label: localize('import from url', "Create from profile template URL"), description: quickPick.value }, selectFromFileItem] : [selectFromFileItem];
				};
				quickPick.title = localize('import profile quick pick title', "Create Profile from Profile Template...");
				quickPick.placeholder = localize('import profile placeholder', "Provide profile template URL or select profile template file");
				quickPick.ignoreFocusOut = true;
				disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
				updateQuickPickItems();
				quickPick.matchOnLabel = false;
				quickPick.matchOnDescription = false;
				disposables.add(quickPick.onDidAccept(async () => {
					try {
						quickPick.hide();
						const profile = quickPick.selectedItems[0].description ? URI.parse(quickPick.value) : await this.getProfileUriFromFileSystem(fileDialogService);
						if (profile) {
							await userDataProfileImportExportService.importProfile(profile);
						}
					} catch (error) {
						notificationService.error(localize('profile import error', "Error while creating profile: {0}", getErrorMessage(error)));
					}
				}));
				disposables.add(quickPick.onDidHide(() => disposables.dispose()));
				quickPick.show();
			}

			private async getProfileUriFromFileSystem(fileDialogService: IFileDialogService): Promise<URI | null> {
				const profileLocation = await fileDialogService.showOpenDialog({
					canSelectFolders: false,
					canSelectFiles: true,
					canSelectMany: false,
					filters: PROFILE_FILTER,
					title: localize('import profile dialog', "Select Profile Template File"),
				});
				if (!profileLocation) {
					return null;
				}
				return profileLocation[0];
			}
		}));
		disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarShare, {
			command: {
				id,
				title: {
					value: localize('import profile share', "Import Profile...",),
					original: 'Import Profile...'
				},
				precondition: PROFILES_ENABLEMENT_CONTEXT,
			},
		}));
		return disposables;
	}

	private registerCreateFromCurrentProfileAction(): void {
		const that = this;
		this._register(registerAction2(class CreateFromCurrentProfileAction extends Action2 {
			constructor() {
				super({
					id: CREATE_FROM_CURRENT_PROFILE_ACTION_ID,
					title: CREATE_FROM_CURRENT_PROFILE_ACTION_TITLE,
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: PROFILES_ENABLEMENT_CONTEXT
				});
			}

			run(accessor: ServicesAccessor) {
				return that.createProfile(true);
			}
		}));
	}

	private registerCreateEmptyProfileAction(): void {
		const that = this;
		this._register(registerAction2(class CreateEmptyProfileAction extends Action2 {
			constructor() {
				super({
					id: CREATE_EMPTY_PROFILE_ACTION_ID,
					title: CREATE_EMPTY_PROFILE_ACTION_TITLE,
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: PROFILES_ENABLEMENT_CONTEXT
				});
			}

			run(accessor: ServicesAccessor) {
				return that.createProfile(false);
			}
		}));
	}

	private async createProfile(fromExisting: boolean): Promise<void> {
		const name = await this.quickInputService.input({
			placeHolder: localize('name', "Profile name"),
			title: fromExisting ? localize('create from current profle', "Create from Current Profile...") : localize('create empty profile', "Create an Empty Profile..."),
			validateInput: async (value: string) => {
				if (this.userDataProfilesService.profiles.some(p => p.name === value)) {
					return localize('profileExists', "Profile with name {0} already exists.", value);
				}
				return undefined;
			}
		});
		if (!name) {
			return;
		}
		try {
			if (fromExisting) {
				await this.userDataProfileImportExportService.createFromCurrentProfile(name);
			} else {
				await this.userDataProfileManagementService.createAndEnterProfile(name);
			}
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private registerCreateProfileAction(): void {
		const that = this;
		this._register(registerAction2(class CreateProfileAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.createProfile',
					title: {
						value: localize('create profile', "Create Profile..."),
						original: 'Create Profile...'
					},
					category: PROFILES_CATEGORY,
					precondition: PROFILES_ENABLEMENT_CONTEXT,
					menu: [
						{
							id: ProfilesMenu,
							group: '3_manage_profiles',
							when: PROFILES_ENABLEMENT_CONTEXT,
							order: 1
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				const quickInputService = accessor.get(IQuickInputService);
				const commandService = accessor.get(ICommandService);
				const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
				const quickPickItems: QuickPickItem[] = [{
					id: CREATE_EMPTY_PROFILE_ACTION_ID,
					label: localize('empty', "Empty Profile"),
				}, {
					id: CREATE_FROM_CURRENT_PROFILE_ACTION_ID,
					label: localize('using current', "Using Current Profile"),
				}];
				const profileTemplateQuickPickItems = await that.getProfileTemplatesQuickPickItems();
				if (profileTemplateQuickPickItems.length) {
					quickPickItems.push({
						type: 'separator',
						label: localize('templates', "Profile Templates")
					}, ...profileTemplateQuickPickItems);
				}
				const pick = await quickInputService.pick(quickPickItems,
					{
						hideInput: true,
						canPickMany: false,
						title: localize('create profile title', "Create Profile...")
					});
				if (pick) {
					if (pick.id) {
						return commandService.executeCommand(pick.id);
					}
					if ((<IProfileTemplateQuickPickItem>pick).url) {
						type ProfileCreationFromTemplateActionClassification = {
							owner: 'sandy081';
							comment: 'Report profile creation from template action';
							profileName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of the profile created from template' };
						};
						type ProfileCreationFromTemplateActionEvent = {
							profileName: string;
						};
						that.telemetryService.publicLog2<ProfileCreationFromTemplateActionEvent, ProfileCreationFromTemplateActionClassification>('profileCreationAction:builtinTemplate', { profileName: (<IProfileTemplateQuickPickItem>pick).name });
						const uri = URI.parse((<IProfileTemplateQuickPickItem>pick).url);
						return userDataProfileImportExportService.importProfile(uri);
					}
				}
			}
		}));
	}

	private registerDeleteProfileAction(): void {
		registerAction2(class DeleteProfileAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.deleteProfile',
					title: {
						value: localize('delete profile', "Delete Profile..."),
						original: 'Delete Profile...'
					},
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
					menu: [
						{
							id: ProfilesMenu,
							group: '3_manage_profiles',
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

				const profiles = userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isTransient);
				if (profiles.length) {
					const picks = await quickInputService.pick(
						profiles.map(profile => ({
							label: profile.name,
							description: profile.id === userDataProfileService.currentProfile.id ? localize('current', "Current") : undefined,
							profile
						})),
						{
							title: localize('delete specific profile', "Delete Profile..."),
							placeHolder: localize('pick profile to delete', "Select Profiles to Delete"),
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
	}

	private registerCreateProfileFromTemplatesAction(): void {
		const that = this;
		this._register(registerAction2(class CreateProfileFromTemplatesAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.createProfileFromTemplates',
					title: {
						value: localize('create profile from templates', "Create Profile from Templates..."),
						original: 'Create Profile from Templates...'
					},
					category: PROFILES_CATEGORY,
					precondition: PROFILES_ENABLEMENT_CONTEXT,
				});
			}

			async run(accessor: ServicesAccessor) {
				const quickInputService = accessor.get(IQuickInputService);
				const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
				const notificationService = accessor.get(INotificationService);
				const profileTemplateQuickPickItems = await that.getProfileTemplatesQuickPickItems();
				if (profileTemplateQuickPickItems.length) {
					const pick = await quickInputService.pick(profileTemplateQuickPickItems,
						{
							hideInput: true,
							canPickMany: false,
							title: localize('create profile from template title', "{0}: Create...", PROFILES_CATEGORY.value)
						});
					if ((<IProfileTemplateQuickPickItem>pick)?.url) {
						const uri = URI.parse((<IProfileTemplateQuickPickItem>pick).url);
						return userDataProfileImportExportService.importProfile(uri);
					}
				} else {
					notificationService.info(localize('no templates', "There are no templates to create from"));
				}
			}
		}));
	}

	private registerHelpAction(): void {
		this._register(registerAction2(class HelpAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.help',
					title: PROFILES_TITLE,
					category: Categories.Help,
					menu: [{
						id: MenuId.CommandPalette,
					}],
				});
			}
			run(accessor: ServicesAccessor): any {
				return accessor.get(IOpenerService).open(URI.parse('https://aka.ms/vscode-profiles-help'));
			}
		}));
	}

	private async getProfileTemplatesQuickPickItems(): Promise<IProfileTemplateQuickPickItem[]> {
		const quickPickItems: IProfileTemplateQuickPickItem[] = [];
		const profileTemplates = await this.getProfileTemplatesFromProduct();
		for (const template of profileTemplates) {
			quickPickItems.push({
				label: template.name,
				...template
			});
		}
		return quickPickItems;
	}

	private async getProfileTemplatesFromProduct(): Promise<IProfileTemplateInfo[]> {
		if (this.productService.profileTemplatesUrl) {
			try {
				const context = await this.requestService.request({ type: 'GET', url: this.productService.profileTemplatesUrl }, CancellationToken.None);
				if (context.res.statusCode === 200) {
					return (await asJson<IProfileTemplateInfo[]>(context)) || [];
				} else {
					this.logService.error('Could not get profile templates.', context.res.statusCode);
				}
			} catch (error) {
				this.logService.error(error);
			}
		}
		return [];
	}

	private async reportWorkspaceProfileInfo(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Eventually);
		const workspaceId = await this.workspaceTagsService.getTelemetryWorkspaceId(this.workspaceContextService.getWorkspace(), this.workspaceContextService.getWorkbenchState());
		type WorkspaceProfileInfoClassification = {
			owner: 'sandy081';
			comment: 'Report profile information of the current workspace';
			workspaceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A UUID given to a workspace to identify it.' };
			defaultProfile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the profile of the workspace is default or not.' };
		};
		type WorkspaceProfileInfoEvent = {
			workspaceId: string | undefined;
			defaultProfile: boolean;
		};
		this.telemetryService.publicLog2<WorkspaceProfileInfoEvent, WorkspaceProfileInfoClassification>('workspaceProfileInfo', {
			workspaceId,
			defaultProfile: this.userDataProfileService.currentProfile.isDefault
		});
	}
}
