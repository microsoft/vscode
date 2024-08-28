/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, IS_CURRENT_PROFILE_TRANSIENT_CONTEXT, IUserDataProfileManagementService, IUserDataProfileService, PROFILES_CATEGORY, PROFILES_ENABLEMENT_CONTEXT, PROFILES_TITLE, isProfileURL } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { URI } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
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
import { IUserDataProfilesEditor } from 'vs/workbench/contrib/userDataProfile/common/userDataProfile';
import { IURLService } from 'vs/platform/url/common/url';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';

export const OpenProfileMenu = new MenuId('OpenProfile');

export class UserDataProfilesWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.userDataProfiles';

	private readonly currentProfileContext: IContextKey<string>;
	private readonly isCurrentProfileTransientContext: IContextKey<boolean>;
	private readonly hasProfilesContext: IContextKey<boolean>;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IURLService private readonly urlService: IURLService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
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

		this.registerEditor();
		this.registerActions();

		this._register(this.urlService.registerHandler(this));

		if (isWeb) {
			lifecycleService.when(LifecyclePhase.Eventually).then(() => userDataProfilesService.cleanUp());
		}

		this.reportWorkspaceProfileInfo();

		if (environmentService.options?.profileToPreview) {
			lifecycleService.when(LifecyclePhase.Restored).then(() => this.handleURL(URI.revive(environmentService.options!.profileToPreview!)));
		}
	}

	async handleURL(uri: URI): Promise<boolean> {
		if (isProfileURL(uri)) {
			const editor = await this.openProfilesEditor();
			if (editor) {
				editor.createNewProfile(uri);
				return true;
			}
		}
		return false;
	}

	private async openProfilesEditor(): Promise<IUserDataProfilesEditor | undefined> {
		const editor = await this.editorGroupsService.activeGroup.openEditor(new UserDataProfilesEditorInput(this.instantiationService));
		return editor as IUserDataProfilesEditor;
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
		this._register(this.registerManageProfilesAction());
		this._register(this.registerSwitchProfileAction());

		this.registerOpenProfileSubMenu();
		this.registerNewWindowWithProfileAction();
		this.registerProfilesActions();
		this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));

		this._register(this.registerExportCurrentProfileAction());

		this.registerCreateFromCurrentProfileAction();
		this.registerNewProfileAction();
		this.registerDeleteProfileAction();

		this.registerHelpAction();
	}

	private registerOpenProfileSubMenu(): void {
		MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
			title: localize('New Profile Window', "New Window with Profile"),
			submenu: OpenProfileMenu,
			group: '1_new',
			order: 4,
		});
	}

	private readonly profilesDisposable = this._register(new MutableDisposable<DisposableStore>());
	private registerProfilesActions(): void {
		this.profilesDisposable.value = new DisposableStore();
		for (const profile of this.userDataProfilesService.profiles) {
			if (!profile.isTransient) {
				this.profilesDisposable.value.add(this.registerNewWindowAction(profile));
			}
		}
	}

	private registerNewWindowWithProfileAction(): IDisposable {
		return registerAction2(class NewWindowWithProfileAction extends Action2 {
			constructor() {
				super({
					id: `workbench.profiles.actions.newWindowWithProfile`,
					title: localize2('newWindowWithProfile', "New Window with Profile..."),
					category: PROFILES_CATEGORY,
					precondition: HAS_PROFILES_CONTEXT,
					f1: true,
				});
			}
			async run(accessor: ServicesAccessor) {
				const quickInputService = accessor.get(IQuickInputService);
				const userDataProfilesService = accessor.get(IUserDataProfilesService);
				const hostService = accessor.get(IHostService);

				const pick = await quickInputService.pick(
					userDataProfilesService.profiles.map(profile => ({
						label: profile.name,
						profile
					})),
					{
						title: localize('new window with profile', "New Window with Profile"),
						placeHolder: localize('pick profile', "Select Profile"),
						canPickMany: false
					});
				if (pick) {
					return hostService.openWindow({ remoteAuthority: null, forceProfile: pick.profile.name });
				}
			}
		});
	}

	private registerNewWindowAction(profile: IUserDataProfile): IDisposable {
		const disposables = new DisposableStore();

		const id = `workbench.action.openProfile.${profile.name.replace('/\s+/', '_')}`;

		disposables.add(registerAction2(class NewWindowAction extends Action2 {

			constructor() {
				super({
					id,
					title: localize2('openShort', "{0}", profile.name),
					menu: {
						id: OpenProfileMenu,
						group: '0_profiles',
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
		const that = this;
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

				const items: Array<IQuickPickItem & { profile: IUserDataProfile }> = [];
				for (const profile of that.userDataProfilesService.profiles) {
					items.push({
						id: profile.id,
						label: profile.id === that.userDataProfileService.currentProfile.id ? `$(check) ${profile.name}` : profile.name,
						profile,
					});
				}

				const result = await quickInputService.pick(items.sort((a, b) => a.profile.name.localeCompare(b.profile.name)), {
					placeHolder: localize('selectProfile', "Select Profile")
				});
				if (result) {
					await that.userDataProfileManagementService.switchProfile(result.profile);
				}
			}
		});
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
						},
						{
							id: MenuId.MenubarPreferencesMenu,
							group: '2_configuration',
							order: 1,
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
			},
		}));

		return disposables;
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
					f1: true,
				});
			}

			async run() {
				const editor = await that.openProfilesEditor();
				editor?.selectProfile(that.userDataProfileService.currentProfile);
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

			async run() {
				const editor = await that.openProfilesEditor();
				editor?.createNewProfile(that.userDataProfileService.currentProfile);
			}
		}));
	}

	private registerNewProfileAction(): void {
		const that = this;
		this._register(registerAction2(class CreateProfileAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.profiles.actions.createProfile',
					title: localize2('create profile', "New Profile..."),
					category: PROFILES_CATEGORY,
					precondition: PROFILES_ENABLEMENT_CONTEXT,
					f1: true,
					menu: [
						{
							id: OpenProfileMenu,
							group: '1_manage_profiles',
							order: 1
						}
					]
				});
			}

			async run(accessor: ServicesAccessor) {
				const editor = await that.openProfilesEditor();
				return editor?.createNewProfile();
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
