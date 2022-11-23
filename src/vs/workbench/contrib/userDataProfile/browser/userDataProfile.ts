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
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, isUserDataProfileTemplate, IS_CURRENT_PROFILE_TRANSIENT_CONTEXT, IS_PROFILE_IMPORT_EXPORT_IN_PROGRESS_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, IUserDataProfileTemplate, ManageProfilesSubMenu, PROFILES_CATEGORY, PROFILES_ENABLEMENT_CONTEXT, PROFILES_TTILE, PROFILE_FILTER } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { charCount } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Codicon } from 'vs/base/common/codicons';
import { IFileService } from 'vs/platform/files/common/files';
import { asJson, asText, IRequestService } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	private readonly currentProfileContext: IContextKey<string>;
	private readonly isCurrentProfileTransientContext: IContextKey<boolean>;
	private readonly hasProfilesContext: IContextKey<boolean>;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService,
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

		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));

		this.registerCurrentProfilesActions();
		this._register(Event.any(this.userDataProfileService.onDidChangeCurrentProfile, this.userDataProfileService.onDidUpdateCurrentProfile)(() => this.registerCurrentProfilesActions()));
	}

	private registerManageProfilesSubMenu(): void {
		const that = this;
		MenuRegistry.appendMenuItem(MenuId.GlobalActivity, <ISubmenuItem>{
			get title() { return localize('manageProfiles', "{0} ({1})", PROFILES_TTILE.value, that.userDataProfileService.currentProfile.name); },
			submenu: ManageProfilesSubMenu,
			group: '5_settings',
			when: PROFILES_ENABLEMENT_CONTEXT,
			order: 1
		});
		MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, <ISubmenuItem>{
			title: PROFILES_TTILE,
			submenu: ManageProfilesSubMenu,
			group: '5_settings',
			when: PROFILES_ENABLEMENT_CONTEXT,
			order: 1
		});
		MenuRegistry.appendMenuItem(MenuId.AccountsContext, <ISubmenuItem>{
			get title() { return localize('manageProfiles', "{0} ({1})", PROFILES_TTILE.value, that.userDataProfileService.currentProfile.name); },
			submenu: ManageProfilesSubMenu,
			group: '1_settings',
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

	private readonly currentprofileActionsDisposable = this._register(new MutableDisposable<DisposableStore>());
	private registerCurrentProfilesActions(): void {
		this.currentprofileActionsDisposable.value = new DisposableStore();
		this.currentprofileActionsDisposable.value.add(this.registerUpdateCurrentProfileShortNameAction());
		this.currentprofileActionsDisposable.value.add(this.registerRenameCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerExportCurrentProfileAction());
		this.currentprofileActionsDisposable.value.add(this.registerImportProfileAction());
	}

	private registerUpdateCurrentProfileShortNameAction(): IDisposable {
		const that = this;
		return registerAction2(class UpdateCurrentProfileShortName extends Action2 {
			constructor() {
				const shortName = that.userDataProfileService.getShortName(that.userDataProfileService.currentProfile);
				const themeIcon = ThemeIcon.fromString(shortName);
				super({
					id: `workbench.profiles.actions.updateCurrentProfileShortName`,
					title: {
						value: localize('change short name profile', "Change Short Name ({0})...", themeIcon?.id ?? shortName),
						original: `Change Short Name (${themeIcon?.id ?? shortName})...`
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
				const quickInputService = accessor.get(IQuickInputService);
				const notificationService = accessor.get(INotificationService);

				const profile = that.userDataProfileService.currentProfile;
				const shortName = await quickInputService.input({
					value: that.userDataProfileService.getShortName(profile),
					title: localize('change short name', "Change Short Name..."),
					validateInput: async (value: string) => {
						if (profile.shortName === value) {
							return undefined;
						}
						const themeIcon = ThemeIcon.fromString(value);
						if (themeIcon) {
							if (Codicon.getAll().some(c => c.id === themeIcon.id)) {
								return undefined;
							}
							return localize('invalid codicon', "Invalid codicon. Please use a valid codicon id.");
						}
						if (charCount(value) > 2) {
							return localize('invalid short name', "Short name should be at most 2 characters long.");
						}
						return undefined;
					}
				});
				if (shortName && shortName !== profile.shortName) {
					try {
						await that.userDataProfileManagementService.updateProfile(profile, { shortName });
					} catch (error) {
						notificationService.error(error);
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
						value: localize('rename profile', "Rename ({0})...", that.userDataProfileService.currentProfile.name),
						original: `Rename (${that.userDataProfileService.currentProfile.name})...`
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

	private registerExportCurrentProfileAction(): IDisposable {
		const that = this;
		const disposables = new DisposableStore();
		const id = 'workbench.profiles.actions.exportProfile';
		disposables.add(registerAction2(class ExportProfileAction extends Action2 {
			constructor() {
				super({
					id,
					title: {
						value: localize('export profile', "Export ({0})...", that.userDataProfileService.currentProfile.name),
						original: `Export (${that.userDataProfileService.currentProfile.name})...`
					},
					category: PROFILES_CATEGORY,
					precondition: IS_PROFILE_IMPORT_EXPORT_IN_PROGRESS_CONTEXT.toNegated(),
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
						value: localize('import profile', "Import..."),
						original: 'Import...'
					},
					category: PROFILES_CATEGORY,
					f1: true,
					precondition: IS_PROFILE_IMPORT_EXPORT_IN_PROGRESS_CONTEXT.toNegated(),
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
						notificationService.error(error);
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
}
