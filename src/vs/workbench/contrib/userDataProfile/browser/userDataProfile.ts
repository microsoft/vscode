/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserDataProfile, IUserDataProfilesService, PROFILES_ENABLEMENT_CONFIG } from 'vs/platform/userDataProfile/common/userDataProfile';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { RenameProfileAction } from 'vs/workbench/contrib/userDataProfile/browser/userDataProfileActions';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, isUserDataProfileTemplate, IS_CURRENT_PROFILE_TRANSIENT_CONTEXT, IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, IUserDataProfileTemplate, ManageProfilesSubMenu, PROFILES_CATEGORY, PROFILES_ENABLEMENT_CONTEXT, PROFILES_TTILE, PROFILE_FILTER, IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT, defaultUserDataProfileIcon } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Codicon } from 'vs/base/common/codicons';
import { IFileService } from 'vs/platform/files/common/files';
import { asJson, asText, IRequestService } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { getErrorMessage } from 'vs/base/common/errors';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

const SelectProfileSubMenu = new MenuId('SelectProfile');

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

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly currentProfileContext: IContextKey<string>;
	private readonly isCurrentProfileTransientContext: IContextKey<boolean>;
	private readonly hasProfilesContext: IContextKey<boolean>;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IProductService private readonly productService: IProductService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		this.registerConfiguration();

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

	private registerConfiguration(): void {
		if (this.productService.quality === 'stable') {
			Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
				...workbenchConfigurationNodeBase,
				'properties': {
					[PROFILES_ENABLEMENT_CONFIG]: {
						'type': 'boolean',
						'default': false,
						'description': localize('workbench.experimental.profiles.enabled', "Controls whether to enable the Profiles preview feature."),
						scope: ConfigurationScope.APPLICATION,
						ignoreSync: true
					}
				}
			});
		}
	}

	private registerActions(): void {
		this.registerManageProfilesSubMenu();
		this.registerSelectProfileSubMenu();

		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));

		this.registerCurrentProfilesActions();
		this._register(Event.any(this.userDataProfileService.onDidChangeCurrentProfile, this.userDataProfileService.onDidUpdateCurrentProfile)(() => this.registerCurrentProfilesActions()));

		this.registerCreateEmptyProfileAction();
		this.registerCreateFromCurrentProfileAction();
		this.registerCreateProfileAction();
	}

	private registerManageProfilesSubMenu(): void {
		MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, <ISubmenuItem>{
			title: PROFILES_TTILE,
			submenu: ManageProfilesSubMenu,
			group: '5_settings',
			when: PROFILES_ENABLEMENT_CONTEXT,
			order: 1
		});
	}

	private registerSelectProfileSubMenu(): IDisposable {
		const that = this;
		return MenuRegistry.appendMenuItem(ManageProfilesSubMenu, <ISubmenuItem>{
			get title() { return localize('profile', "Profile ({0})", that.userDataProfileService.currentProfile.name); },
			submenu: SelectProfileSubMenu,
			group: '0_profiles',
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
							id: SelectProfileSubMenu,
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

	private readonly currentprofileActionsDisposable = this._register(new MutableDisposable<DisposableStore>());
	private registerCurrentProfilesActions(): void {
		this.currentprofileActionsDisposable.value = new DisposableStore();
		this.currentprofileActionsDisposable.value.add(this.registerChangeIconForCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerRenameCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerShowCurrentProfileContentsAction());
		this.currentprofileActionsDisposable.value.add(this.registerExportCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerImportProfileAction());
	}

	private registerChangeIconForCurrentProfileAction(): IDisposable {
		const that = this;
		return registerAction2(class ChangeIconForCurrentProfileAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.changeIconForCurrentProfile`,
					title: {
						value: localize('change icon', "Change Icon..."),
						original: `Change Icon...`
					},
					menu: [
						{
							id: ManageProfilesSubMenu,
							group: '2_manage_current',
							when: ContextKeyExpr.and(ContextKeyExpr.notEquals(CURRENT_PROFILE_CONTEXT.key, that.userDataProfilesService.defaultProfile.id), IS_CURRENT_PROFILE_TRANSIENT_CONTEXT.toNegated()),
							order: 1
						}
					]
				});
			}
			async run(accessor: ServicesAccessor) {
				const profile = that.userDataProfileService.currentProfile;
				const shortName = await that.pickIcon(profile);
				if (shortName && shortName !== profile.shortName) {
					try {
						await that.userDataProfileManagementService.updateProfile(profile, { shortName });
					} catch (error) {
						that.notificationService.error(error);
					}
				}
			}
		});
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
							id: ManageProfilesSubMenu,
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
							id: ManageProfilesSubMenu,
							group: '2_manage_current',
							when: PROFILES_ENABLEMENT_CONTEXT,
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
						value: localize('export profile', "Export Profile ({0})...", that.userDataProfileService.currentProfile.name),
						original: `Export Profile (${that.userDataProfileService.currentProfile.name})...`
					},
					category: PROFILES_CATEGORY,
					precondition: IS_PROFILE_EXPORT_IN_PROGRESS_CONTEXT.toNegated(),
					menu: [
						{
							id: ManageProfilesSubMenu,
							group: '4_import_export_profiles',
							when: PROFILES_ENABLEMENT_CONTEXT,
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
					f1: true,
					precondition: IS_PROFILE_IMPORT_IN_PROGRESS_CONTEXT.toNegated(),
					menu: [
						{
							id: ManageProfilesSubMenu,
							group: '4_import_export_profiles',
							when: PROFILES_ENABLEMENT_CONTEXT,
							order: 2
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
					const selectFromFileItem: IQuickPickItem = { label: localize('import from file', "Import from profile file") };
					quickPick.items = value ? [{ label: localize('import from url', "Import from URL"), description: quickPick.value }, selectFromFileItem] : [selectFromFileItem];
				};
				quickPick.title = localize('import profile quick pick title', "Import Profile");
				quickPick.placeholder = localize('import profile placeholder', "Provide profile URL or select profile file to import");
				quickPick.ignoreFocusOut = true;
				disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
				updateQuickPickItems();
				quickPick.matchOnLabel = false;
				quickPick.matchOnDescription = false;
				disposables.add(quickPick.onDidAccept(async () => {
					try {
						quickPick.hide();
						if (isSettingProfilesEnabled) {
							const profile = quickPick.selectedItems[0].description ? URI.parse(quickPick.value) : await this.getProfileUriFromFileSystem(fileDialogService);
							if (profile) {
								await userDataProfileImportExportService.importProfile(profile);
							}
						} else {
							const profile = quickPick.selectedItems[0].description ? await this.getProfileFromURL(quickPick.value, requestService) : await this.getProfileFromFileSystem(fileDialogService, fileService);
							if (profile) {
								await userDataProfileImportExportService.setProfile(profile);
							}
						}
					} catch (error) {
						notificationService.error(localize('profile import error', "Error while importing profile: {0}", getErrorMessage(error)));
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
					title: localize('import profile dialog', "Import Profile"),
				});
				if (!profileLocation) {
					return null;
				}
				return profileLocation[0];
			}

			private async getProfileFromFileSystem(fileDialogService: IFileDialogService, fileService: IFileService): Promise<IUserDataProfileTemplate | null> {
				const profileLocation = await this.getProfileUriFromFileSystem(fileDialogService);
				if (!profileLocation) {
					return null;
				}
				const content = (await fileService.readFile(profileLocation)).value.toString();
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
		const icon = await this.pickIcon();
		if (!icon) {
			return;
		}
		try {
			await this.userDataProfileManagementService.createAndEnterProfile(name, { shortName: icon }, fromExisting);
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private async pickIcon(profile?: IUserDataProfile): Promise<string | undefined> {
		const codiconQuickPicks: Array<IQuickPickItem | IQuickPickSeparator> = [];
		codiconQuickPicks.push({ label: `$(${defaultUserDataProfileIcon.id})`, description: localize('default', "Default") });
		codiconQuickPicks.push({ label: '', type: 'separator' });
		const currentIcon = profile?.shortName ? ThemeIcon.fromString(profile.shortName) : undefined;
		for (const codicon of Codicon.getAll()) {
			codiconQuickPicks.push({ label: `$(${codicon.id})`, description: `${codicon.id}${currentIcon?.id === codicon.id ? ` (${localize('current', "Current")})` : ''}` });
		}
		const result = await this.quickInputService.pick(codiconQuickPicks, {
			title: profile ? localize('change icon title', "Change icon for {0} Profile", profile.name) : localize('pick icon', "Pick icon..."),
			matchOnDescription: true,
		});
		return result?.label;
	}

	private registerCreateProfileAction(): void {
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
							id: ManageProfilesSubMenu,
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
				const pick = await quickInputService.pick(
					[{
						id: CREATE_EMPTY_PROFILE_ACTION_ID,
						label: CREATE_EMPTY_PROFILE_ACTION_TITLE.value,
					}, {
						id: CREATE_FROM_CURRENT_PROFILE_ACTION_ID,
						label: CREATE_FROM_CURRENT_PROFILE_ACTION_TITLE.value,
					}], { hideInput: true, canPickMany: false, title: localize('create profile title', "{0}: Create...", PROFILES_CATEGORY.value) });
				if (pick?.id) {
					return commandService.executeCommand(pick.id);
				}
			}
		}));
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
