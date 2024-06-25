/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, IS_CURRENT_PROFILE_TRANSIENT_CONTEXT, IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, PROFILES_CATEGORY, PROFILE_FILTER, IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT, ProfilesMenu, PROFILES_ENABLEMENT_CONTEXT, PROFILES_TITLE, IProfileTemplateInfo } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { URI } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { getErrorMessage } from 'vs/base/common/errors';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { UserDataProfilesEditor, UserDataProfilesEditorInput, UserDataProfilesEditorInputSerializer } from 'vs/workbench/contrib/userDataProfile/browser/userDataProfilesEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUserDataProfilesEditor } from 'vs/workbench/contrib/userDataProfile/common/userDataProfile';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';

type IProfileTemplateQuickPickItem = IQuickPickItem & IProfileTemplateInfo;

export const OpenProfileMenu = new MenuId('OpenProfile');
const CONFIG_ENABLE_NEW_PROFILES_UI = 'workbench.experimental.enableNewProfilesUI';
const CONTEXT_ENABLE_NEW_PROFILES_UI = ContextKeyExpr.equals('config.workbench.experimental.enableNewProfilesUI', true);

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.userDataProfiles';

	private readonly currentProfileContext: IContextKey<string>;
	private readonly isCurrentProfileTransientContext: IContextKey<boolean>;
	private readonly hasProfilesContext: IContextKey<boolean>;
	private readonly startTime: number = Date.now();

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
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

		this.registerConfiguration();
		this.registerEditor();
		this.registerActions();

		if (isWeb) {
			lifecycleService.when(LifecyclePhase.Eventually).then(() => userDataProfilesService.cleanUp());
		}

		this.reportWorkspaceProfileInfo();
	}

	private openProfilesEditor(): Promise<IUserDataProfilesEditor | undefined> {
		return this.editorGroupsService.activeGroup.openEditor(new UserDataProfilesEditorInput(this.instantiationService));
	}

	private isNewProfilesUIEnabled(): boolean {
		return this.configurationService.getValue(CONFIG_ENABLE_NEW_PROFILES_UI) === true;
	}

	private registerConfiguration(): void {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration)
			.registerConfiguration({
				...workbenchConfigurationNodeBase,
				properties: {
					[CONFIG_ENABLE_NEW_PROFILES_UI]: {
						type: 'boolean',
						description: localize('enable new profiles UI', "Enables the new profiles UI."),
						default: this.productService.quality !== 'stable',
						scope: ConfigurationScope.APPLICATION,
					}
				}
			});
	}

	private registerEditor(): void {
		Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
			EditorPaneDescriptor.create(
				UserDataProfilesEditor,
				UserDataProfilesEditor.ID,
				localize('userdataprofilesEditor', "Profiles Editor")
			),
			[
				new SyncDescriptor(UserDataProfilesEditorInput)
			]
		);
		Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(UserDataProfilesEditorInput.ID, UserDataProfilesEditorInputSerializer);
	}

	private registerActions(): void {
		this.registerProfileSubMenu();
		this._register(this.registerManageProfilesAction());
		this._register(this.registerSwitchProfileAction());

		this.registerOpenProfileSubMenu();
		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));

		this.registerCurrentProfilesActions();
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.registerCurrentProfilesActions()));

		this.registerCreateFromCurrentProfileAction();
		this.registerCreateProfileAction();
		this.registerDeleteProfileAction();

		this.registerHelpAction();
	}

	private registerProfileSubMenu(): void {
		const getProfilesTitle = () => {
			return localize('profiles', "Profile ({0})", this.userDataProfileService.currentProfile.name);
		};
		const when = ContextKeyExpr.or(CONTEXT_ENABLE_NEW_PROFILES_UI.negate(), HAS_PROFILES_CONTEXT);
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
			get title() {
				return getProfilesTitle();
			},
			submenu: ProfilesMenu,
			group: '2_configuration',
			order: 1,
			when,
		});
		MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
			get title() {
				return getProfilesTitle();
			},
			submenu: ProfilesMenu,
			group: '2_configuration',
			order: 1,
			when,
		});
	}

	private registerOpenProfileSubMenu(): void {
		MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
			title: localize('New Profile Window', "New Window with Profile"),
			submenu: OpenProfileMenu,
			group: '1_new',
			order: 4,
			when: HAS_PROFILES_CONTEXT,
		});
	}

	private readonly profilesDisposable = this._register(new MutableDisposable<DisposableStore>());
	private registerProfilesActions(): void {
		this.profilesDisposable.value = new DisposableStore();
		for (const profile of this.userDataProfilesService.profiles) {
			if (!profile.isTransient) {
				this.profilesDisposable.value.add(this.registerProfileEntryAction(profile));
				this.profilesDisposable.value.add(this.registerNewWindowAction(profile));
			}
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
					if (profile.isDefault && Date.now() - that.startTime < (1000 * 20 /* 20 seconds */)) {
						type SwitchToDefaultProfileInfoClassification = {
							owner: 'sandy081';
							comment: 'Report if the user switches to the default profile.';
							emptyWindow: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If the current window is empty window or not' };
						};
						type SwitchToDefaultProfileInfoEvent = {
							emptyWindow: boolean;
						};
						that.telemetryService.publicLog2<SwitchToDefaultProfileInfoEvent, SwitchToDefaultProfileInfoClassification>('profiles:newwindowprofile', {
							emptyWindow: that.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY
						});
					}
					return that.userDataProfileManagementService.switchProfile(profile);
				}
			}
		});
	}

	private registerNewWindowAction(profile: IUserDataProfile): IDisposable {
		const disposables = new DisposableStore();

		const id = `workbench.action.openProfile.${profile.name.toLowerCase().replace('/\s+/', '_')}`;

		disposables.add(registerAction2(class NewWindowAction extends Action2 {

			constructor() {
				super({
					id,
					title: localize2('openShort', "{0}", profile.name),
					menu: {
						id: OpenProfileMenu,
						when: HAS_PROFILES_CONTEXT
					}
				});
			}

			override run(accessor: ServicesAccessor): Promise<void> {
				const hostService = accessor.get(IHostService);
				return hostService.openWindow({ remoteAuthority: null, forceProfile: profile.name });
			}
		}));

		disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id,
				category: PROFILES_CATEGORY,
				title: localize2('open', "Open {0} Profile", profile.name),
				precondition: HAS_PROFILES_CONTEXT
			},
		}));

		return disposables;
	}

	private registerSwitchProfileAction(): IDisposable {
		return registerAction2(class SwitchProfileAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.switchProfile`,
					title: localize2('switchProfile', 'Switch Profile...'),
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
		this.currentprofileActionsDisposable.value.add(this.registerEditCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerShowCurrentProfileContentsAction());
		this.currentprofileActionsDisposable.value.add(this.registerExportCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerImportProfileAction());
	}

	private registerManageProfilesAction(): IDisposable {
		const disposables = new DisposableStore();
		disposables.add(registerAction2(class ManageProfilesAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.manageProfiles`,
					title: {
						...localize2('manage profiles', "Profiles"),
						mnemonicTitle: localize({ key: 'miOpenProfiles', comment: ['&& denotes a mnemonic'] }, "&&Profiles"),
					},
					menu: [
						{
							id: MenuId.GlobalActivity,
							group: '2_configuration',
							order: 1,
							when: CONTEXT_ENABLE_NEW_PROFILES_UI,
						},
						{
							id: MenuId.MenubarPreferencesMenu,
							group: '2_configuration',
							order: 1,
							when: CONTEXT_ENABLE_NEW_PROFILES_UI,
						},
					]
				});
			}
			run(accessor: ServicesAccessor) {
				const editorGroupsService = accessor.get(IEditorGroupsService);
				const instantiationService = accessor.get(IInstantiationService);
				return editorGroupsService.activeGroup.openEditor(new UserDataProfilesEditorInput(instantiationService));
			}
		}));
		disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: {
				id: 'workbench.profiles.actions.manageProfiles',
				category: Categories.Preferences,
				title: localize2('open profiles', "Open Profiles (UI)"),
				precondition: CONTEXT_ENABLE_NEW_PROFILES_UI,
			},
		}));

		return disposables;
	}

	private registerEditCurrentProfileAction(): IDisposable {
		const that = this;
		return registerAction2(class RenameCurrentProfileAction extends Action2 {
			constructor() {
				const precondition = ContextKeyExpr.and(ContextKeyExpr.notEquals(CURRENT_PROFILE_CONTEXT.key, that.userDataProfilesService.defaultProfile.id), IS_CURRENT_PROFILE_TRANSIENT_CONTEXT.toNegated());
				super({
					id: `workbench.profiles.actions.editCurrentProfile`,
					title: localize2('edit profile', "Edit Profile..."),
					precondition,
					f1: true,
					menu: [
						{
							id: ProfilesMenu,
							group: '2_manage_current',
							when: ContextKeyExpr.and(precondition, CONTEXT_ENABLE_NEW_PROFILES_UI.negate()),
							order: 2
						}
					]
				});
			}
			run(accessor: ServicesAccessor) {
				if (that.isNewProfilesUIEnabled()) {
					return that.openProfilesEditor();
				} else {
					return that.userDataProfileImportExportService.editProfile(that.userDataProfileService.currentProfile);
				}
			}
		});
	}

	private registerShowCurrentProfileContentsAction(): IDisposable {
		const id = 'workbench.profiles.actions.showProfileContents';
		return registerAction2(class ShowProfileContentsAction extends Action2 {
			constructor() {
				super({
					id,
					title: localize2('show profile contents', "Show Profile Contents"),
					category: PROFILES_CATEGORY,
					menu: [
						{
							id: ProfilesMenu,
							group: '2_manage_current',
							order: 3,
							when: CONTEXT_ENABLE_NEW_PROFILES_UI.negate()
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
					title: localize2('export profile', "Export Profile..."),
					category: PROFILES_CATEGORY,
					precondition: IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT.toNegated(),
					menu: [
						{
							id: ProfilesMenu,
							group: '4_import_export_profiles',
							order: 1,
							when: CONTEXT_ENABLE_NEW_PROFILES_UI.negate(),
						}, {
							id: MenuId.CommandPalette
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				if (that.isNewProfilesUIEnabled()) {
					return that.openProfilesEditor();
				} else {
					return that.userDataProfileImportExportService.exportProfile2();
				}
			}
		}));
		disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarShare, {
			command: {
				id,
				title: localize2('export profile in share', "Export Profile ({0})...", that.userDataProfileService.currentProfile.name),
				precondition: PROFILES_ENABLEMENT_CONTEXT,
			},
		}));
		return disposables;
	}

	private registerImportProfileAction(): IDisposable {
		const disposables = new DisposableStore();
		const id = 'workbench.profiles.actions.importProfile';
		const that = this;
		disposables.add(registerAction2(class ImportProfileAction extends Action2 {
			constructor() {
				super({
					id,
					title: localize2('import profile', "Import Profile..."),
					category: PROFILES_CATEGORY,
					precondition: IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT.toNegated(),
					menu: [
						{
							id: ProfilesMenu,
							group: '4_import_export_profiles',
							when: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, CONTEXT_ENABLE_NEW_PROFILES_UI.negate()),
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
				const profileTemplateQuickPickItems = await that.getProfileTemplatesQuickPickItems();

				const updateQuickPickItems = (value?: string) => {
					const quickPickItems: (IQuickPickItem | IQuickPickSeparator)[] = [];
					if (value) {
						quickPickItems.push({ label: quickPick.value, description: localize('import from url', "Import from URL") });
					}
					quickPickItems.push({ label: localize('import from file', "Select File...") });
					if (profileTemplateQuickPickItems.length) {
						quickPickItems.push({
							type: 'separator',
							label: localize('templates', "Profile Templates")
						}, ...profileTemplateQuickPickItems);
					}
					quickPick.items = quickPickItems;
				};

				quickPick.title = localize('import profile quick pick title', "Import from Profile Template...");
				quickPick.placeholder = localize('import profile placeholder', "Provide Profile Template URL");
				quickPick.ignoreFocusOut = true;
				disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
				updateQuickPickItems();
				quickPick.matchOnLabel = false;
				quickPick.matchOnDescription = false;
				disposables.add(quickPick.onDidAccept(async () => {
					quickPick.hide();
					const selectedItem = quickPick.selectedItems[0];
					if (!selectedItem) {
						return;
					}
					try {
						if ((<IProfileTemplateQuickPickItem>selectedItem).url) {
							return await that.userDataProfileImportExportService.createProfile(URI.parse((<IProfileTemplateQuickPickItem>selectedItem).url));
						}
						const profile = selectedItem.label === quickPick.value ? URI.parse(quickPick.value) : await this.getProfileUriFromFileSystem(fileDialogService);
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
				title: localize2('import profile share', "Import Profile..."),
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
					id: 'workbench.profiles.actions.createFromCurrentProfile',
					title: localize2('save profile as', "Save Current Profile As..."),
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: PROFILES_ENABLEMENT_CONTEXT
				});
			}

			run(accessor: ServicesAccessor) {
				return that.userDataProfileImportExportService.createProfile(that.userDataProfileService.currentProfile);
			}
		}));
	}

	private registerCreateProfileAction(): void {
		const that = this;
		this._register(registerAction2(class CreateProfileAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.createProfile',
					title: localize2('create profile', "Create Profile..."),
					category: PROFILES_CATEGORY,
					precondition: PROFILES_ENABLEMENT_CONTEXT,
					f1: true,
					menu: [
						{
							id: ProfilesMenu,
							group: '3_manage_profiles',
							when: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, CONTEXT_ENABLE_NEW_PROFILES_UI.negate()),
							order: 1
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				if (that.isNewProfilesUIEnabled()) {
					return that.openProfilesEditor();
				} else {
					return that.userDataProfileImportExportService.createProfile();
				}
			}
		}));
	}

	private registerDeleteProfileAction(): void {
		this._register(registerAction2(class DeleteProfileAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.deleteProfile',
					title: localize2('delete profile', "Delete Profile..."),
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, HAS_PROFILES_CONTEXT),
					menu: [
						{
							id: ProfilesMenu,
							group: '3_manage_profiles',
							when: ContextKeyExpr.and(PROFILES_ENABLEMENT_CONTEXT, CONTEXT_ENABLE_NEW_PROFILES_UI.negate()),
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
		const profileTemplates = await this.userDataProfileManagementService.getBuiltinProfileTemplates();
		for (const template of profileTemplates) {
			quickPickItems.push({
				label: template.name,
				...template
			});
		}
		return quickPickItems;
	}

	private async reportWorkspaceProfileInfo(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Eventually);
		const workspaceId = await this.workspaceTagsService.getTelemetryWorkspaceId(this.workspaceContextService.getWorkspace(), this.workspaceContextService.getWorkbenchState());
		type WorkspaceProfileInfoClassification = {
			owner: 'sandy081';
			comment: 'Report profile information of the current workspace';
			workspaceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A UUID given to a workspace to identify it.' };
			defaultProfile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the profile of the workspace is default or not.' };
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
