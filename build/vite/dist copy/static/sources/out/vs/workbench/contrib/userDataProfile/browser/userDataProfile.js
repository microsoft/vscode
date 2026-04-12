/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../nls.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, IS_CURRENT_PROFILE_TRANSIENT_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, PROFILES_CATEGORY, PROFILES_TITLE, PROFILE_EXTENSION, isProfileURL } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { URI } from '../../../../base/common/uri.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTagsService } from '../../tags/common/workspaceTags.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { UserDataProfilesEditor, UserDataProfilesEditorInput, UserDataProfilesEditorInputSerializer } from './userDataProfilesEditor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { Extensions as DndExtensions } from '../../../../platform/dnd/browser/dnd.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITextEditorService } from '../../../services/textfile/common/textEditorService.js';
export const OpenProfileMenu = new MenuId('OpenProfile');
const ProfilesMenu = new MenuId('Profiles');
let UserDataProfilesWorkbenchContribution = class UserDataProfilesWorkbenchContribution extends Disposable {
    static { this.ID = 'workbench.contrib.userDataProfiles'; }
    constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, telemetryService, workspaceContextService, workspaceTagsService, contextKeyService, editorService, instantiationService, lifecycleService, urlService, environmentService) {
        super();
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.userDataProfileManagementService = userDataProfileManagementService;
        this.telemetryService = telemetryService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceTagsService = workspaceTagsService;
        this.editorService = editorService;
        this.instantiationService = instantiationService;
        this.lifecycleService = lifecycleService;
        this.urlService = urlService;
        this.profilesDisposable = this._register(new MutableDisposable());
        this.currentProfileContext = CURRENT_PROFILE_CONTEXT.bindTo(contextKeyService);
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
            lifecycleService.when(4 /* LifecyclePhase.Eventually */).then(() => userDataProfilesService.cleanUp());
        }
        this.reportWorkspaceProfileInfo();
        if (environmentService.options?.profileToPreview) {
            lifecycleService.when(3 /* LifecyclePhase.Restored */).then(() => this.handleURL(URI.revive(environmentService.options.profileToPreview)));
        }
        this.registerDropHandler();
    }
    async handleURL(uri) {
        if (isProfileURL(uri)) {
            const editor = await this.openProfilesEditor();
            if (editor) {
                editor.createNewProfile(uri);
                return true;
            }
        }
        return false;
    }
    async openProfilesEditor() {
        const editor = await this.editorService.openEditor(new UserDataProfilesEditorInput(this.instantiationService));
        return editor;
    }
    registerEditor() {
        Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(UserDataProfilesEditor, UserDataProfilesEditor.ID, localize('userdataprofilesEditor', "Profiles Editor")), [
            new SyncDescriptor(UserDataProfilesEditorInput)
        ]);
        Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(UserDataProfilesEditorInput.ID, UserDataProfilesEditorInputSerializer);
    }
    registerDropHandler() {
        const dndRegistry = Registry.as(DndExtensions.DragAndDropContribution);
        const that = this;
        this._register(dndRegistry.registerDropHandler(new class UserDataProfileDropHandler {
            async handleDrop(resource, accessor) {
                const uriIdentityService = accessor.get(IUriIdentityService);
                const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
                const editorService = accessor.get(IEditorService);
                const textEditorService = accessor.get(ITextEditorService);
                const notificationService = accessor.get(INotificationService);
                if (uriIdentityService.extUri.extname(resource) === `.${PROFILE_EXTENSION}`) {
                    const template = await userDataProfileImportExportService.resolveProfileTemplate(resource);
                    if (!template) {
                        notificationService.warn(localize('invalid profile', "The dropped profile is invalid."));
                        editorService.openEditor(textEditorService.createTextEditor({ resource }));
                        return true;
                    }
                    const editor = await that.openProfilesEditor();
                    if (editor) {
                        try {
                            await editor.createNewProfile(resource);
                        }
                        catch (error) {
                            return false;
                        }
                    }
                    return true;
                }
                return false;
            }
        }));
    }
    registerActions() {
        this.registerProfileSubMenu();
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
    registerProfileSubMenu() {
        const getProfilesTitle = () => {
            return localize('profiles', "Profile ({0})", this.userDataProfileService.currentProfile.name);
        };
        MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
            get title() {
                return getProfilesTitle();
            },
            submenu: ProfilesMenu,
            group: '2_configuration',
            order: 1,
            when: HAS_PROFILES_CONTEXT
        });
        MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
            get title() {
                return getProfilesTitle();
            },
            submenu: ProfilesMenu,
            group: '2_configuration',
            order: 1,
            when: ContextKeyExpr.and(HAS_PROFILES_CONTEXT, IsSessionsWindowContext.negate())
        });
    }
    registerOpenProfileSubMenu() {
        MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
            title: localize('New Profile Window', "New Window with Profile"),
            submenu: OpenProfileMenu,
            group: '1_new',
            order: 4,
            when: IsSessionsWindowContext.negate()
        });
    }
    registerProfilesActions() {
        this.profilesDisposable.value = new DisposableStore();
        for (const profile of this.userDataProfilesService.profiles) {
            if (!profile.isTransient) {
                this.profilesDisposable.value.add(this.registerProfileEntryAction(profile));
                this.profilesDisposable.value.add(this.registerNewWindowAction(profile));
            }
        }
    }
    registerProfileEntryAction(profile) {
        const that = this;
        return registerAction2(class ProfileEntryAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.profiles.actions.profileEntry.${profile.id}`,
                    title: profile.name,
                    metadata: {
                        description: localize2('change profile', "Switch to {0} profile", profile.name),
                    },
                    toggled: ContextKeyExpr.equals(CURRENT_PROFILE_CONTEXT.key, profile.id),
                    menu: [
                        {
                            id: ProfilesMenu,
                            group: '0_profiles',
                        }
                    ]
                });
            }
            async run(accessor) {
                if (that.userDataProfileService.currentProfile.id !== profile.id) {
                    return that.userDataProfileManagementService.switchProfile(profile);
                }
            }
        });
    }
    registerNewWindowWithProfileAction() {
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
            async run(accessor) {
                const quickInputService = accessor.get(IQuickInputService);
                const userDataProfilesService = accessor.get(IUserDataProfilesService);
                const hostService = accessor.get(IHostService);
                const pick = await quickInputService.pick(userDataProfilesService.profiles.map(profile => ({
                    label: profile.name,
                    profile
                })), {
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
    registerNewWindowAction(profile) {
        const disposables = new DisposableStore();
        const id = `workbench.action.openProfile.${profile.name.replace('/\s+/', '_')}`;
        const precondition = HAS_PROFILES_CONTEXT;
        disposables.add(registerAction2(class NewWindowAction extends Action2 {
            constructor() {
                super({
                    id,
                    title: localize2('openShort', "{0}", profile.name),
                    metadata: {
                        description: localize2('open profile', "Open New Window with {0} Profile", profile.name),
                    },
                    menu: {
                        id: OpenProfileMenu,
                        group: '0_profiles',
                        when: precondition
                    }
                });
            }
            run(accessor) {
                const hostService = accessor.get(IHostService);
                return hostService.openWindow({ remoteAuthority: null, forceProfile: profile.name });
            }
        }));
        disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
            command: {
                id,
                category: PROFILES_CATEGORY,
                title: localize2('open', "Open {0} Profile", profile.name),
                precondition
            },
        }));
        return disposables;
    }
    registerSwitchProfileAction() {
        const that = this;
        return registerAction2(class SwitchProfileAction extends Action2 {
            constructor() {
                super({
                    id: `workbench.profiles.actions.switchProfile`,
                    title: localize2('switchProfile', 'Switch Profile...'),
                    category: PROFILES_CATEGORY,
                    f1: true,
                });
            }
            async run(accessor) {
                const quickInputService = accessor.get(IQuickInputService);
                const items = [];
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
    registerManageProfilesAction() {
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
                            when: HAS_PROFILES_CONTEXT.negate()
                        },
                        {
                            id: MenuId.MenubarPreferencesMenu,
                            group: '2_configuration',
                            order: 1,
                            when: ContextKeyExpr.and(HAS_PROFILES_CONTEXT.negate(), IsSessionsWindowContext.negate())
                        },
                        {
                            id: ProfilesMenu,
                            group: '1_manage',
                            order: 1,
                        },
                    ]
                });
            }
            run(accessor) {
                const editorService = accessor.get(IEditorService);
                const instantiationService = accessor.get(IInstantiationService);
                return editorService.openEditor(new UserDataProfilesEditorInput(instantiationService));
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
    registerExportCurrentProfileAction() {
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
            },
        }));
        return disposables;
    }
    registerCreateFromCurrentProfileAction() {
        const that = this;
        this._register(registerAction2(class CreateFromCurrentProfileAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.profiles.actions.createFromCurrentProfile',
                    title: localize2('save profile as', "Save Current Profile As..."),
                    category: PROFILES_CATEGORY,
                    f1: true,
                });
            }
            async run() {
                const editor = await that.openProfilesEditor();
                editor?.createNewProfile(that.userDataProfileService.currentProfile);
            }
        }));
    }
    registerNewProfileAction() {
        const that = this;
        this._register(registerAction2(class CreateProfileAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.profiles.actions.createProfile',
                    title: localize2('create profile', "New Profile..."),
                    category: PROFILES_CATEGORY,
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
            async run(accessor) {
                const editor = await that.openProfilesEditor();
                return editor?.createNewProfile();
            }
        }));
    }
    registerDeleteProfileAction() {
        this._register(registerAction2(class DeleteProfileAction extends Action2 {
            constructor() {
                super({
                    id: 'workbench.profiles.actions.deleteProfile',
                    title: localize2('delete profile', "Delete Profile..."),
                    category: PROFILES_CATEGORY,
                    f1: true,
                    precondition: HAS_PROFILES_CONTEXT,
                });
            }
            async run(accessor) {
                const quickInputService = accessor.get(IQuickInputService);
                const userDataProfileService = accessor.get(IUserDataProfileService);
                const userDataProfilesService = accessor.get(IUserDataProfilesService);
                const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
                const notificationService = accessor.get(INotificationService);
                const profiles = userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isTransient);
                if (profiles.length) {
                    const picks = await quickInputService.pick(profiles.map(profile => ({
                        label: profile.name,
                        description: profile.id === userDataProfileService.currentProfile.id ? localize('current', "Current") : undefined,
                        profile
                    })), {
                        title: localize('delete specific profile', "Delete Profile..."),
                        placeHolder: localize('pick profile to delete', "Select Profiles to Delete"),
                        canPickMany: true
                    });
                    if (picks) {
                        try {
                            await Promise.all(picks.map(pick => userDataProfileManagementService.removeProfile(pick.profile)));
                        }
                        catch (error) {
                            notificationService.error(error);
                        }
                    }
                }
            }
        }));
    }
    registerHelpAction() {
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
            run(accessor) {
                return accessor.get(IOpenerService).open(URI.parse('https://aka.ms/vscode-profiles-help'));
            }
        }));
    }
    async reportWorkspaceProfileInfo() {
        await this.lifecycleService.when(4 /* LifecyclePhase.Eventually */);
        if (this.userDataProfilesService.profiles.length > 1) {
            this.telemetryService.publicLog2('profiles:count', { count: this.userDataProfilesService.profiles.length - 1 });
        }
        const workspaceId = await this.workspaceTagsService.getTelemetryWorkspaceId(this.workspaceContextService.getWorkspace(), this.workspaceContextService.getWorkbenchState());
        this.telemetryService.publicLog2('workspaceProfileInfo', {
            workspaceId,
            defaultProfile: this.userDataProfileService.currentProfile.isDefault
        });
    }
};
UserDataProfilesWorkbenchContribution = __decorate([
    __param(0, IUserDataProfileService),
    __param(1, IUserDataProfilesService),
    __param(2, IUserDataProfileManagementService),
    __param(3, ITelemetryService),
    __param(4, IWorkspaceContextService),
    __param(5, IWorkspaceTagsService),
    __param(6, IContextKeyService),
    __param(7, IEditorService),
    __param(8, IInstantiationService),
    __param(9, ILifecycleService),
    __param(10, IURLService),
    __param(11, IBrowserWorkbenchEnvironmentService)
], UserDataProfilesWorkbenchContribution);
export { UserDataProfilesWorkbenchContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvdXNlckRhdGFQcm9maWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxjQUFjLEVBQXFDLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDN0ksT0FBTyxFQUFvQix3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBRTVILE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsb0JBQW9CLEVBQUUsb0NBQW9DLEVBQUUsbUNBQW1DLEVBQUUsaUNBQWlDLEVBQUUsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3ZVLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0IsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVB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