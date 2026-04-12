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
var UserDataProfilesEditorModel_1;
import { Action, Separator, toAction } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isMarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isUserDataProfile, IUserDataProfilesService, toUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { isProfileURL, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import * as arrays from '../../../../base/common/arrays.js';
import { equals } from '../../../../base/common/objects.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { ExtensionsResourceExportTreeItem, ExtensionsResourceImportTreeItem } from '../../../services/userDataProfile/browser/extensionsResource.js';
import { SettingsResource, SettingsResourceTreeItem } from '../../../services/userDataProfile/browser/settingsResource.js';
import { KeybindingsResource, KeybindingsResourceTreeItem } from '../../../services/userDataProfile/browser/keybindingsResource.js';
import { TasksResource, TasksResourceTreeItem } from '../../../services/userDataProfile/browser/tasksResource.js';
import { SnippetsResource, SnippetsResourceTreeItem } from '../../../services/userDataProfile/browser/snippetsResource.js';
import { McpProfileResource, McpResourceTreeItem } from '../../../services/userDataProfile/browser/mcpProfileResource.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InMemoryFileSystemProvider } from '../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { createCancelablePromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CONFIG_NEW_WINDOW_PROFILE } from '../../../common/configuration.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService, WORKSPACE_SUFFIX } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isString } from '../../../../base/common/types.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
export function isProfileResourceTypeElement(element) {
    return element.resourceType !== undefined;
}
export function isProfileResourceChildElement(element) {
    return element.label !== undefined;
}
let AbstractUserDataProfileElement = class AbstractUserDataProfileElement extends Disposable {
    constructor(name, icon, flags, workspaces, isActive, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
        super();
        this.userDataProfileManagementService = userDataProfileManagementService;
        this.userDataProfilesService = userDataProfilesService;
        this.commandService = commandService;
        this.workspaceContextService = workspaceContextService;
        this.hostService = hostService;
        this.uriIdentityService = uriIdentityService;
        this.fileService = fileService;
        this.extensionManagementService = extensionManagementService;
        this.instantiationService = instantiationService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.saveScheduler = this._register(new RunOnceScheduler(() => this.doSave(), 500));
        this._name = '';
        this._active = false;
        this._disabled = false;
        this._name = name;
        this._icon = icon;
        this._flags = flags;
        this._workspaces = workspaces;
        this._active = isActive;
        this._register(this.onDidChange(e => {
            if (!e.message) {
                this.validate();
            }
            this.save();
        }));
        this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions(results => {
            const profile = this.getProfileToWatch();
            if (profile && results.some(r => !r.error && (r.applicationScoped || this.uriIdentityService.extUri.isEqual(r.profileLocation, profile.extensionsResource)))) {
                this._onDidChange.fire({ extensions: true });
            }
        }));
        this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension(e => {
            const profile = this.getProfileToWatch();
            if (profile && !e.error && (e.applicationScoped || this.uriIdentityService.extUri.isEqual(e.profileLocation, profile.extensionsResource))) {
                this._onDidChange.fire({ extensions: true });
            }
        }));
        this._register(this.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata(e => {
            const profile = this.getProfileToWatch();
            if (profile && e.local.isApplicationScoped || this.uriIdentityService.extUri.isEqual(e.profileLocation, profile?.extensionsResource)) {
                this._onDidChange.fire({ extensions: true });
            }
        }));
    }
    get name() { return this._name; }
    set name(name) {
        name = name.trim();
        if (this._name !== name) {
            this._name = name;
            this._onDidChange.fire({ name: true });
        }
    }
    get icon() { return this._icon; }
    set icon(icon) {
        if (this._icon !== icon) {
            this._icon = icon;
            this._onDidChange.fire({ icon: true });
        }
    }
    get workspaces() { return this._workspaces; }
    set workspaces(workspaces) {
        if (!arrays.equals(this._workspaces, workspaces, (a, b) => a.toString() === b.toString())) {
            this._workspaces = workspaces;
            this._onDidChange.fire({ workspaces: true });
        }
    }
    get flags() { return this._flags; }
    set flags(flags) {
        if (!equals(this._flags, flags)) {
            this._flags = flags;
            this._onDidChange.fire({ flags: true });
        }
    }
    get active() { return this._active; }
    set active(active) {
        if (this._active !== active) {
            this._active = active;
            this._onDidChange.fire({ active: true });
        }
    }
    get message() { return this._message; }
    set message(message) {
        if (this._message !== message) {
            this._message = message;
            this._onDidChange.fire({ message: true });
        }
    }
    get disabled() { return this._disabled; }
    set disabled(saving) {
        if (this._disabled !== saving) {
            this._disabled = saving;
            this._onDidChange.fire({ disabled: true });
        }
    }
    getFlag(key) {
        return this.flags?.[key] ?? false;
    }
    setFlag(key, value) {
        const flags = this.flags ? { ...this.flags } : {};
        if (value) {
            flags[key] = true;
        }
        else {
            delete flags[key];
        }
        this.flags = flags;
    }
    validate() {
        if (!this.name) {
            this.message = localize('name required', "Profile name is required and must be a non-empty value.");
            return;
        }
        if (this.shouldValidateName() && this.name !== this.getInitialName() && this.userDataProfilesService.profiles.some(p => p.name === this.name)) {
            this.message = localize('profileExists', "Profile with name {0} already exists.", this.name);
            return;
        }
        if (this.flags && this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.snippets && this.flags.extensions) {
            this.message = localize('invalid configurations', "The profile should contain at least one configuration.");
            return;
        }
        this.message = undefined;
    }
    async getChildren(resourceType) {
        if (resourceType === undefined) {
            const resourceTypes = [
                "settings" /* ProfileResourceType.Settings */,
                "keybindings" /* ProfileResourceType.Keybindings */,
                "tasks" /* ProfileResourceType.Tasks */,
                "mcp" /* ProfileResourceType.Mcp */,
                "snippets" /* ProfileResourceType.Snippets */,
                "extensions" /* ProfileResourceType.Extensions */
            ];
            return Promise.all(resourceTypes.map(async (r) => {
                const children = (r === "settings" /* ProfileResourceType.Settings */
                    || r === "keybindings" /* ProfileResourceType.Keybindings */
                    || r === "tasks" /* ProfileResourceType.Tasks */
                    || r === "mcp" /* ProfileResourceType.Mcp */) ? await this.getChildrenForResourceType(r) : [];
                return {
                    handle: r,
                    checkbox: undefined,
                    resourceType: r,
                    openAction: children.length
                        ? toAction({
                            id: '_open',
                            label: localize('open', "Open to the Side"),
                            class: ThemeIcon.asClassName(Codicon.goToFile),
                            run: () => children[0]?.openAction?.run()
                        })
                        : undefined
                };
            }));
        }
        return this.getChildrenForResourceType(resourceType);
    }
    async getChildrenForResourceType(resourceType) {
        return [];
    }
    async getChildrenFromProfile(profile, resourceType) {
        profile = this.getFlag(resourceType) ? this.userDataProfilesService.defaultProfile : profile;
        let children = [];
        switch (resourceType) {
            case "settings" /* ProfileResourceType.Settings */:
                children = await this.instantiationService.createInstance(SettingsResourceTreeItem, profile).getChildren();
                break;
            case "keybindings" /* ProfileResourceType.Keybindings */:
                children = await this.instantiationService.createInstance(KeybindingsResourceTreeItem, profile).getChildren();
                break;
            case "snippets" /* ProfileResourceType.Snippets */:
                children = (await this.instantiationService.createInstance(SnippetsResourceTreeItem, profile).getChildren()) ?? [];
                break;
            case "tasks" /* ProfileResourceType.Tasks */:
                children = await this.instantiationService.createInstance(TasksResourceTreeItem, profile).getChildren();
                break;
            case "mcp" /* ProfileResourceType.Mcp */:
                children = await this.instantiationService.createInstance(McpResourceTreeItem, profile).getChildren();
                break;
            case "extensions" /* ProfileResourceType.Extensions */:
                children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, profile).getChildren();
                break;
        }
        return children.map(child => this.toUserDataProfileResourceChildElement(child));
    }
    toUserDataProfileResourceChildElement(child, primaryActions, contextMenuActions) {
        return {
            handle: child.handle,
            checkbox: child.checkbox,
            label: child.label ? (isMarkdownString(child.label.label) ? child.label.label.value : child.label.label) : '',
            description: isString(child.description) ? child.description : undefined,
            resource: URI.revive(child.resourceUri),
            icon: child.themeIcon,
            openAction: toAction({
                id: '_openChild',
                label: localize('open', "Open to the Side"),
                class: ThemeIcon.asClassName(Codicon.goToFile),
                run: async () => {
                    if (child.parent.type === "extensions" /* ProfileResourceType.Extensions */) {
                        await this.commandService.executeCommand('extension.open', child.handle, undefined, true, undefined, true);
                    }
                    else if (child.resourceUri) {
                        await this.commandService.executeCommand(API_OPEN_EDITOR_COMMAND_ID, child.resourceUri, [SIDE_GROUP], undefined);
                    }
                }
            }),
            actions: {
                primary: primaryActions,
                contextMenu: contextMenuActions,
            }
        };
    }
    getInitialName() {
        return '';
    }
    shouldValidateName() {
        return true;
    }
    getCurrentWorkspace() {
        const workspace = this.workspaceContextService.getWorkspace();
        return workspace.configuration ?? workspace.folders[0]?.uri;
    }
    openWorkspace(workspace) {
        if (this.uriIdentityService.extUri.extname(workspace) === WORKSPACE_SUFFIX) {
            this.hostService.openWindow([{ workspaceUri: workspace }], { forceNewWindow: true });
        }
        else {
            this.hostService.openWindow([{ folderUri: workspace }], { forceNewWindow: true });
        }
    }
    save() {
        this.saveScheduler.schedule();
    }
    hasUnsavedChanges(profile) {
        if (this.name !== profile.name) {
            return true;
        }
        if (this.icon !== profile.icon) {
            return true;
        }
        if (!equals(this.flags ?? {}, profile.useDefaultFlags ?? {})) {
            return true;
        }
        if (!arrays.equals(this.workspaces ?? [], profile.workspaces ?? [], (a, b) => a.toString() === b.toString())) {
            return true;
        }
        return false;
    }
    async saveProfile(profile) {
        if (!this.hasUnsavedChanges(profile)) {
            return;
        }
        this.validate();
        if (this.message) {
            return;
        }
        const useDefaultFlags = this.flags
            ? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? undefined : this.flags
            : undefined;
        return await this.userDataProfileManagementService.updateProfile(profile, {
            name: this.name,
            icon: this.icon,
            useDefaultFlags: profile.useDefaultFlags && !useDefaultFlags ? {} : useDefaultFlags,
            workspaces: this.workspaces
        });
    }
};
AbstractUserDataProfileElement = __decorate([
    __param(5, IUserDataProfileManagementService),
    __param(6, IUserDataProfilesService),
    __param(7, ICommandService),
    __param(8, IWorkspaceContextService),
    __param(9, IHostService),
    __param(10, IUriIdentityService),
    __param(11, IFileService),
    __param(12, IWorkbenchExtensionManagementService),
    __param(13, IInstantiationService)
], AbstractUserDataProfileElement);
export { AbstractUserDataProfileElement };
let UserDataProfileElement = class UserDataProfileElement extends AbstractUserDataProfileElement {
    get profile() { return this._profile; }
    constructor(_profile, titleButtons, actions, userDataProfileService, configurationService, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
        super(_profile.name, _profile.icon, _profile.useDefaultFlags, _profile.workspaces, userDataProfileService.currentProfile.id === _profile.id, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService);
        this._profile = _profile;
        this.titleButtons = titleButtons;
        this.actions = actions;
        this.userDataProfileService = userDataProfileService;
        this.configurationService = configurationService;
        this._isNewWindowProfile = false;
        this._isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CONFIG_NEW_WINDOW_PROFILE)) {
                this.isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
            }
        }));
        this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.active = this.userDataProfileService.currentProfile.id === this.profile.id));
        this._register(this.userDataProfilesService.onDidChangeProfiles(({ updated }) => {
            const profile = updated.find(p => p.id === this.profile.id);
            if (profile) {
                this._profile = profile;
                this.reset();
                this._onDidChange.fire({ profile: true });
            }
        }));
        this._register(fileService.watch(this.profile.snippetsHome));
        this._register(fileService.onDidFilesChange(e => {
            if (e.affects(this.profile.snippetsHome)) {
                this._onDidChange.fire({ snippets: true });
            }
        }));
    }
    getProfileToWatch() {
        return this.profile;
    }
    reset() {
        this.name = this._profile.name;
        this.icon = this._profile.icon;
        this.flags = this._profile.useDefaultFlags;
        this.workspaces = this._profile.workspaces;
    }
    updateWorkspaces(toAdd, toRemove) {
        const workspaces = new ResourceSet(this.workspaces ?? []);
        for (const workspace of toAdd) {
            workspaces.add(workspace);
        }
        for (const workspace of toRemove) {
            workspaces.delete(workspace);
        }
        this.workspaces = [...workspaces.values()];
    }
    async toggleNewWindowProfile() {
        if (this._isNewWindowProfile) {
            await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, null);
        }
        else {
            await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, this.profile.name);
        }
    }
    get isNewWindowProfile() { return this._isNewWindowProfile; }
    set isNewWindowProfile(isNewWindowProfile) {
        if (this._isNewWindowProfile !== isNewWindowProfile) {
            this._isNewWindowProfile = isNewWindowProfile;
            this._onDidChange.fire({ newWindowProfile: true });
        }
    }
    async toggleCurrentWindowProfile() {
        if (this.userDataProfileService.currentProfile.id === this.profile.id) {
            await this.userDataProfileManagementService.switchProfile(this.userDataProfilesService.defaultProfile);
        }
        else {
            await this.userDataProfileManagementService.switchProfile(this.profile);
        }
    }
    async doSave() {
        await this.saveProfile(this.profile);
    }
    async getChildrenForResourceType(resourceType) {
        if (resourceType === "extensions" /* ProfileResourceType.Extensions */) {
            const children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, this.profile).getChildren();
            return children.map(child => this.toUserDataProfileResourceChildElement(child, undefined, [{
                    id: 'applyToAllProfiles',
                    label: localize('applyToAllProfiles', "Apply Extension to all Profiles"),
                    checked: child.applicationScoped,
                    enabled: true,
                    class: '',
                    tooltip: '',
                    run: async () => {
                        const extensions = await this.extensionManagementService.getInstalled(undefined, this.profile.extensionsResource);
                        const extension = extensions.find(e => areSameExtensions(e.identifier, child.identifier));
                        if (extension) {
                            await this.extensionManagementService.toggleApplicationScope(extension, this.profile.extensionsResource);
                        }
                    }
                }]));
        }
        return this.getChildrenFromProfile(this.profile, resourceType);
    }
    getInitialName() {
        return this.profile.name;
    }
};
UserDataProfileElement = __decorate([
    __param(3, IUserDataProfileService),
    __param(4, IConfigurationService),
    __param(5, IUserDataProfileManagementService),
    __param(6, IUserDataProfilesService),
    __param(7, ICommandService),
    __param(8, IWorkspaceContextService),
    __param(9, IHostService),
    __param(10, IUriIdentityService),
    __param(11, IFileService),
    __param(12, IWorkbenchExtensionManagementService),
    __param(13, IInstantiationService)
], UserDataProfileElement);
export { UserDataProfileElement };
const USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME = 'userdataprofiletemplatepreview';
let NewProfileElement = class NewProfileElement extends AbstractUserDataProfileElement {
    get copyFromTemplates() { return this._copyFromTemplates; }
    constructor(copyFrom, titleButtons, actions, userDataProfileImportExportService, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
        super('', undefined, undefined, undefined, false, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService);
        this.titleButtons = titleButtons;
        this.actions = actions;
        this.userDataProfileImportExportService = userDataProfileImportExportService;
        this._copyFromTemplates = new ResourceMap();
        this.template = null;
        this.previewProfileWatchDisposables = this._register(new DisposableStore());
        this.name = this.defaultName = this.getNewProfileName();
        this._copyFrom = copyFrom;
        this._copyFlags = this.getCopyFlagsFrom(copyFrom);
        this.initialize();
        this._register(this.fileService.registerProvider(USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, this._register(new InMemoryFileSystemProvider())));
        this._register(toDisposable(() => {
            if (this.previewProfile) {
                this.userDataProfilesService.removeProfile(this.previewProfile);
            }
        }));
    }
    get copyFrom() { return this._copyFrom; }
    set copyFrom(copyFrom) {
        if (this._copyFrom !== copyFrom) {
            this._copyFrom = copyFrom;
            this._onDidChange.fire({ copyFrom: true });
            this.flags = undefined;
            this.copyFlags = this.getCopyFlagsFrom(copyFrom);
            if (copyFrom instanceof URI) {
                this.templatePromise?.cancel();
                this.templatePromise = undefined;
            }
            this.initialize();
        }
    }
    get copyFlags() { return this._copyFlags; }
    set copyFlags(flags) {
        if (!equals(this._copyFlags, flags)) {
            this._copyFlags = flags;
            this._onDidChange.fire({ copyFlags: true });
        }
    }
    get previewProfile() { return this._previewProfile; }
    set previewProfile(profile) {
        if (this._previewProfile !== profile) {
            this._previewProfile = profile;
            this._onDidChange.fire({ preview: true });
            this.previewProfileWatchDisposables.clear();
            if (this._previewProfile) {
                this.previewProfileWatchDisposables.add(this.fileService.watch(this._previewProfile.snippetsHome));
                this.previewProfileWatchDisposables.add(this.fileService.onDidFilesChange(e => {
                    if (!this._previewProfile) {
                        return;
                    }
                    if (e.affects(this._previewProfile.snippetsHome)) {
                        this._onDidChange.fire({ snippets: true });
                    }
                }));
            }
        }
    }
    getProfileToWatch() {
        return this.previewProfile;
    }
    getCopyFlagsFrom(copyFrom) {
        return copyFrom ? {
            settings: true,
            keybindings: true,
            snippets: true,
            tasks: true,
            extensions: true,
            mcp: true
        } : undefined;
    }
    async initialize() {
        this.disabled = true;
        try {
            if (this.copyFrom instanceof URI) {
                await this.resolveTemplate(this.copyFrom);
                if (this.template) {
                    this.copyFromTemplates.set(this.copyFrom, this.template.name);
                    if (this.defaultName === this.name) {
                        this.name = this.defaultName = this.template.name ?? '';
                    }
                    if (this.defaultIcon === this.icon) {
                        this.icon = this.defaultIcon = this.template.icon;
                    }
                    this.setCopyFlag("settings" /* ProfileResourceType.Settings */, !!this.template.settings);
                    this.setCopyFlag("keybindings" /* ProfileResourceType.Keybindings */, !!this.template.keybindings);
                    this.setCopyFlag("tasks" /* ProfileResourceType.Tasks */, !!this.template.tasks);
                    this.setCopyFlag("snippets" /* ProfileResourceType.Snippets */, !!this.template.snippets);
                    this.setCopyFlag("extensions" /* ProfileResourceType.Extensions */, !!this.template.extensions);
                    this.setCopyFlag("mcp" /* ProfileResourceType.Mcp */, !!this.template.mcp);
                    this._onDidChange.fire({ copyFromInfo: true });
                }
                return;
            }
            if (isUserDataProfile(this.copyFrom)) {
                if (this.defaultName === this.name) {
                    this.name = this.defaultName = localize('copy from', "{0} (Copy)", this.copyFrom.name);
                }
                if (this.defaultIcon === this.icon) {
                    this.icon = this.defaultIcon = this.copyFrom.icon;
                }
                this.setCopyFlag("settings" /* ProfileResourceType.Settings */, true);
                this.setCopyFlag("keybindings" /* ProfileResourceType.Keybindings */, true);
                this.setCopyFlag("tasks" /* ProfileResourceType.Tasks */, true);
                this.setCopyFlag("snippets" /* ProfileResourceType.Snippets */, true);
                this.setCopyFlag("extensions" /* ProfileResourceType.Extensions */, true);
                this.setCopyFlag("mcp" /* ProfileResourceType.Mcp */, true);
                this._onDidChange.fire({ copyFromInfo: true });
                return;
            }
            if (this.defaultName === this.name) {
                this.name = this.defaultName = this.getNewProfileName();
            }
            if (this.defaultIcon === this.icon) {
                this.icon = this.defaultIcon = undefined;
            }
            this.setCopyFlag("settings" /* ProfileResourceType.Settings */, false);
            this.setCopyFlag("keybindings" /* ProfileResourceType.Keybindings */, false);
            this.setCopyFlag("tasks" /* ProfileResourceType.Tasks */, false);
            this.setCopyFlag("snippets" /* ProfileResourceType.Snippets */, false);
            this.setCopyFlag("extensions" /* ProfileResourceType.Extensions */, false);
            this.setCopyFlag("mcp" /* ProfileResourceType.Mcp */, false);
            this._onDidChange.fire({ copyFromInfo: true });
        }
        finally {
            this.disabled = false;
        }
    }
    getNewProfileName() {
        const name = localize('untitled', "Untitled");
        const nameRegEx = new RegExp(`${name}\\s(\\d+)`);
        let nameIndex = 0;
        for (const profile of this.userDataProfilesService.profiles) {
            const matches = nameRegEx.exec(profile.name);
            const index = matches ? parseInt(matches[1]) : 0;
            nameIndex = index > nameIndex ? index : nameIndex;
        }
        return `${name} ${nameIndex + 1}`;
    }
    async resolveTemplate(uri) {
        if (!this.templatePromise) {
            this.templatePromise = createCancelablePromise(async (token) => {
                const template = await this.userDataProfileImportExportService.resolveProfileTemplate(uri);
                if (!token.isCancellationRequested) {
                    this.template = template;
                }
            });
        }
        await this.templatePromise;
        return this.template;
    }
    hasResource(resourceType) {
        if (this.template) {
            switch (resourceType) {
                case "settings" /* ProfileResourceType.Settings */:
                    return !!this.template.settings;
                case "keybindings" /* ProfileResourceType.Keybindings */:
                    return !!this.template.keybindings;
                case "snippets" /* ProfileResourceType.Snippets */:
                    return !!this.template.snippets;
                case "tasks" /* ProfileResourceType.Tasks */:
                    return !!this.template.tasks;
                case "extensions" /* ProfileResourceType.Extensions */:
                    return !!this.template.extensions;
            }
        }
        return true;
    }
    getCopyFlag(key) {
        return this.copyFlags?.[key] ?? false;
    }
    setCopyFlag(key, value) {
        const flags = this.copyFlags ? { ...this.copyFlags } : {};
        flags[key] = value;
        this.copyFlags = flags;
    }
    getCopyFromName() {
        if (isUserDataProfile(this.copyFrom)) {
            return this.copyFrom.name;
        }
        if (this.copyFrom instanceof URI) {
            return this.copyFromTemplates.get(this.copyFrom);
        }
        return undefined;
    }
    async getChildrenForResourceType(resourceType) {
        if (this.getFlag(resourceType)) {
            return this.getChildrenFromProfile(this.userDataProfilesService.defaultProfile, resourceType);
        }
        if (!this.getCopyFlag(resourceType)) {
            return [];
        }
        if (this.previewProfile) {
            return this.getChildrenFromProfile(this.previewProfile, resourceType);
        }
        if (this.copyFrom instanceof URI) {
            await this.resolveTemplate(this.copyFrom);
            if (!this.template) {
                return [];
            }
            return this.getChildrenFromProfileTemplate(this.template, resourceType);
        }
        if (this.copyFrom) {
            return this.getChildrenFromProfile(this.copyFrom, resourceType);
        }
        return [];
    }
    async getChildrenFromProfileTemplate(profileTemplate, resourceType) {
        const location = URI.from({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, path: `/root/profiles/${profileTemplate.name}` });
        const cacheLocation = URI.from({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, path: `/root/cache/${profileTemplate.name}` });
        const profile = toUserDataProfile(generateUuid(), this.name, location, cacheLocation);
        switch (resourceType) {
            case "settings" /* ProfileResourceType.Settings */:
                if (profileTemplate.settings) {
                    await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
                    return this.getChildrenFromProfile(profile, resourceType);
                }
                return [];
            case "keybindings" /* ProfileResourceType.Keybindings */:
                if (profileTemplate.keybindings) {
                    await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
                    return this.getChildrenFromProfile(profile, resourceType);
                }
                return [];
            case "snippets" /* ProfileResourceType.Snippets */:
                if (profileTemplate.snippets) {
                    await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
                    return this.getChildrenFromProfile(profile, resourceType);
                }
                return [];
            case "tasks" /* ProfileResourceType.Tasks */:
                if (profileTemplate.tasks) {
                    await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
                    return this.getChildrenFromProfile(profile, resourceType);
                }
                return [];
            case "mcp" /* ProfileResourceType.Mcp */:
                if (profileTemplate.mcp) {
                    await this.instantiationService.createInstance(McpProfileResource).apply(profileTemplate.mcp, profile);
                    return this.getChildrenFromProfile(profile, resourceType);
                }
                return [];
            case "extensions" /* ProfileResourceType.Extensions */:
                if (profileTemplate.extensions) {
                    const children = await this.instantiationService.createInstance(ExtensionsResourceImportTreeItem, profileTemplate.extensions).getChildren();
                    return children.map(child => this.toUserDataProfileResourceChildElement(child));
                }
                return [];
        }
        return [];
    }
    shouldValidateName() {
        return !this.copyFrom;
    }
    getInitialName() {
        return this.previewProfile?.name ?? '';
    }
    async doSave() {
        if (this.previewProfile) {
            const profile = await this.saveProfile(this.previewProfile);
            if (profile) {
                this.previewProfile = profile;
            }
        }
    }
};
NewProfileElement = __decorate([
    __param(3, IUserDataProfileImportExportService),
    __param(4, IUserDataProfileManagementService),
    __param(5, IUserDataProfilesService),
    __param(6, ICommandService),
    __param(7, IWorkspaceContextService),
    __param(8, IHostService),
    __param(9, IUriIdentityService),
    __param(10, IFileService),
    __param(11, IWorkbenchExtensionManagementService),
    __param(12, IInstantiationService)
], NewProfileElement);
export { NewProfileElement };
let UserDataProfilesEditorModel = class UserDataProfilesEditorModel extends EditorModel {
    static { UserDataProfilesEditorModel_1 = this; }
    static getInstance(instantiationService) {
        if (!UserDataProfilesEditorModel_1.INSTANCE) {
            UserDataProfilesEditorModel_1.INSTANCE = instantiationService.createInstance(UserDataProfilesEditorModel_1);
        }
        return UserDataProfilesEditorModel_1.INSTANCE;
    }
    get profiles() {
        return this._profiles
            .map(([profile]) => profile)
            .sort((a, b) => {
            if (a instanceof NewProfileElement) {
                return 1;
            }
            if (b instanceof NewProfileElement) {
                return -1;
            }
            if (a instanceof UserDataProfileElement && a.profile.isDefault) {
                return -1;
            }
            if (b instanceof UserDataProfileElement && b.profile.isDefault) {
                return 1;
            }
            return a.name.localeCompare(b.name);
        });
    }
    constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, userDataProfileImportExportService, dialogService, telemetryService, hostService, productService, openerService, instantiationService) {
        super();
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.userDataProfileManagementService = userDataProfileManagementService;
        this.userDataProfileImportExportService = userDataProfileImportExportService;
        this.dialogService = dialogService;
        this.telemetryService = telemetryService;
        this.hostService = hostService;
        this.productService = productService;
        this.openerService = openerService;
        this.instantiationService = instantiationService;
        this._profiles = [];
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        for (const profile of userDataProfilesService.profiles) {
            if (!profile.isTransient) {
                this._profiles.push(this.createProfileElement(profile));
            }
        }
        this._register(toDisposable(() => this._profiles.splice(0, this._profiles.length).map(([, disposables]) => disposables.dispose())));
        this._register(userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
    }
    onDidChangeProfiles(e) {
        let changed = false;
        for (const profile of e.added) {
            if (!profile.isTransient && profile.name !== this.newProfileElement?.name) {
                changed = true;
                this._profiles.push(this.createProfileElement(profile));
            }
        }
        for (const profile of e.removed) {
            if (profile.id === this.newProfileElement?.previewProfile?.id) {
                this.newProfileElement.previewProfile = undefined;
            }
            const index = this._profiles.findIndex(([p]) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
            if (index !== -1) {
                changed = true;
                this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
            }
        }
        if (changed) {
            this._onDidChange.fire(undefined);
        }
    }
    getTemplates() {
        if (!this.templates) {
            this.templates = this.userDataProfileManagementService.getBuiltinProfileTemplates();
        }
        return this.templates;
    }
    createProfileElement(profile) {
        const disposables = new DisposableStore();
        const activateAction = disposables.add(new Action('userDataProfile.activate', localize('active', "Use this Profile for Current Window"), ThemeIcon.asClassName(Codicon.check), true, () => this.userDataProfileManagementService.switchProfile(profileElement.profile)));
        const copyFromProfileAction = disposables.add(new Action('userDataProfile.copyFromProfile', localize('copyFromProfile', "Duplicate..."), ThemeIcon.asClassName(Codicon.copy), true, () => this.createNewProfile(profileElement.profile)));
        const exportAction = disposables.add(new Action('userDataProfile.export', localize('export', "Export..."), ThemeIcon.asClassName(Codicon.export), true, () => this.userDataProfileImportExportService.exportProfile(profile)));
        const deleteAction = disposables.add(new Action('userDataProfile.delete', localize('delete', "Delete"), ThemeIcon.asClassName(Codicon.trash), true, () => this.removeProfile(profileElement.profile)));
        const newWindowAction = disposables.add(new Action('userDataProfile.newWindow', localize('open new window', "Open New Window with this Profile"), ThemeIcon.asClassName(Codicon.emptyWindow), true, () => this.openWindow(profileElement.profile)));
        const primaryActions = [];
        primaryActions.push(activateAction);
        primaryActions.push(newWindowAction);
        const secondaryActions = [];
        secondaryActions.push(copyFromProfileAction);
        secondaryActions.push(exportAction);
        if (!profile.isDefault) {
            secondaryActions.push(new Separator());
            secondaryActions.push(deleteAction);
        }
        const profileElement = disposables.add(this.instantiationService.createInstance(UserDataProfileElement, profile, [[], []], [primaryActions, secondaryActions]));
        activateAction.enabled = this.userDataProfileService.currentProfile.id !== profileElement.profile.id;
        disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(() => activateAction.enabled = this.userDataProfileService.currentProfile.id !== profileElement.profile.id));
        return [profileElement, disposables];
    }
    async createNewProfile(copyFrom) {
        if (this.newProfileElement) {
            const result = await this.dialogService.confirm({
                type: 'info',
                message: localize('new profile exists', "A new profile is already being created. Do you want to discard it and create a new one?"),
                primaryButton: localize('discard', "Discard & Create"),
                cancelButton: localize('cancel', "Cancel")
            });
            if (!result.confirmed) {
                return;
            }
            this.revert();
        }
        if (copyFrom instanceof URI) {
            try {
                await this.userDataProfileImportExportService.resolveProfileTemplate(copyFrom);
            }
            catch (error) {
                this.dialogService.error(getErrorMessage(error));
                return;
            }
        }
        if (!this.newProfileElement) {
            const disposables = new DisposableStore();
            const cancellationTokenSource = new CancellationTokenSource();
            disposables.add(toDisposable(() => cancellationTokenSource.dispose(true)));
            const primaryActions = [];
            const secondaryActions = [];
            const createAction = disposables.add(new Action('userDataProfile.create', localize('create', "Create"), undefined, true, () => this.saveNewProfile(false, cancellationTokenSource.token)));
            primaryActions.push(createAction);
            if (isWeb && copyFrom instanceof URI && isProfileURL(copyFrom)) {
                primaryActions.push(disposables.add(new Action('userDataProfile.createInDesktop', localize('import in desktop', "Create in {0}", this.productService.nameLong), undefined, true, () => this.openerService.open(copyFrom, { openExternal: true }))));
            }
            const cancelAction = disposables.add(new Action('userDataProfile.cancel', localize('cancel', "Cancel"), ThemeIcon.asClassName(Codicon.trash), true, () => this.discardNewProfile()));
            secondaryActions.push(cancelAction);
            const previewProfileAction = disposables.add(new Action('userDataProfile.preview', localize('preview', "Preview"), ThemeIcon.asClassName(Codicon.openPreview), true, () => this.previewNewProfile(cancellationTokenSource.token)));
            secondaryActions.push(previewProfileAction);
            const exportAction = disposables.add(new Action('userDataProfile.export', localize('export', "Export..."), ThemeIcon.asClassName(Codicon.export), isUserDataProfile(copyFrom), () => this.exportNewProfile(cancellationTokenSource.token)));
            this.newProfileElement = disposables.add(this.instantiationService.createInstance(NewProfileElement, copyFrom, [primaryActions, secondaryActions], [[cancelAction], [exportAction]]));
            const updateCreateActionLabel = () => {
                if (createAction.enabled) {
                    if (this.newProfileElement?.copyFrom && this.userDataProfilesService.profiles.some(p => !p.isTransient && p.name === this.newProfileElement?.name)) {
                        createAction.label = localize('replace', "Replace");
                    }
                    else {
                        createAction.label = localize('create', "Create");
                    }
                }
            };
            updateCreateActionLabel();
            disposables.add(this.newProfileElement.onDidChange(e => {
                if (e.preview || e.disabled || e.message) {
                    createAction.enabled = !this.newProfileElement?.disabled && !this.newProfileElement?.message;
                    previewProfileAction.enabled = !this.newProfileElement?.previewProfile && !this.newProfileElement?.disabled && !this.newProfileElement?.message;
                }
                if (e.name || e.copyFrom) {
                    updateCreateActionLabel();
                    exportAction.enabled = isUserDataProfile(this.newProfileElement?.copyFrom);
                }
            }));
            disposables.add(this.userDataProfilesService.onDidChangeProfiles((e) => {
                updateCreateActionLabel();
                this.newProfileElement?.validate();
            }));
            this._profiles.push([this.newProfileElement, disposables]);
            this._onDidChange.fire(this.newProfileElement);
        }
        return this.newProfileElement;
    }
    revert() {
        this.removeNewProfile();
        this._onDidChange.fire(undefined);
    }
    removeNewProfile() {
        if (this.newProfileElement) {
            const index = this._profiles.findIndex(([p]) => p === this.newProfileElement);
            if (index !== -1) {
                this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
            }
            this.newProfileElement = undefined;
        }
    }
    async previewNewProfile(token) {
        if (!this.newProfileElement) {
            return;
        }
        if (this.newProfileElement.previewProfile) {
            return;
        }
        const profile = await this.saveNewProfile(true, token);
        if (profile) {
            this.newProfileElement.previewProfile = profile;
            if (isWeb) {
                await this.userDataProfileManagementService.switchProfile(profile);
            }
            else {
                await this.openWindow(profile);
            }
        }
    }
    async exportNewProfile(token) {
        if (!this.newProfileElement) {
            return;
        }
        if (!isUserDataProfile(this.newProfileElement.copyFrom)) {
            return;
        }
        const profile = toUserDataProfile(generateUuid(), this.newProfileElement.name, this.newProfileElement.copyFrom.location, this.newProfileElement.copyFrom.cacheHome, {
            icon: this.newProfileElement.icon,
            useDefaultFlags: this.newProfileElement.flags,
        }, this.userDataProfilesService.defaultProfile);
        await this.userDataProfileImportExportService.exportProfile(profile, this.newProfileElement.copyFlags);
    }
    async saveNewProfile(transient, token) {
        if (!this.newProfileElement) {
            return undefined;
        }
        this.newProfileElement.validate();
        if (this.newProfileElement.message) {
            return undefined;
        }
        this.newProfileElement.disabled = true;
        let profile;
        try {
            if (this.newProfileElement.previewProfile) {
                if (!transient) {
                    profile = await this.userDataProfileManagementService.updateProfile(this.newProfileElement.previewProfile, { transient: false });
                }
            }
            else {
                const { flags, icon, name, copyFrom } = this.newProfileElement;
                const useDefaultFlags = flags
                    ? flags.settings && flags.keybindings && flags.tasks && flags.globalState && flags.extensions ? undefined : flags
                    : undefined;
                const createProfileTelemetryData = { source: copyFrom instanceof URI ? 'template' : isUserDataProfile(copyFrom) ? 'profile' : copyFrom ? 'external' : undefined };
                if (copyFrom instanceof URI) {
                    const template = await this.newProfileElement.resolveTemplate(copyFrom);
                    if (template) {
                        this.telemetryService.publicLog2('userDataProfile.createFromTemplate', createProfileTelemetryData);
                        profile = await this.userDataProfileImportExportService.createProfileFromTemplate(template, {
                            name,
                            useDefaultFlags,
                            icon,
                            resourceTypeFlags: this.newProfileElement.copyFlags,
                            transient
                        }, token ?? CancellationToken.None);
                    }
                }
                else if (isUserDataProfile(copyFrom)) {
                    profile = await this.userDataProfileImportExportService.createFromProfile(copyFrom, {
                        name,
                        useDefaultFlags,
                        icon: icon,
                        resourceTypeFlags: this.newProfileElement.copyFlags,
                        transient
                    }, token ?? CancellationToken.None);
                }
                else {
                    profile = await this.userDataProfileManagementService.createProfile(name, { useDefaultFlags, icon, transient });
                }
            }
        }
        finally {
            if (this.newProfileElement) {
                this.newProfileElement.disabled = false;
            }
        }
        if (token?.isCancellationRequested) {
            if (profile) {
                try {
                    await this.userDataProfileManagementService.removeProfile(profile);
                }
                catch (error) {
                    // ignore
                }
            }
            return;
        }
        if (profile && !profile.isTransient && this.newProfileElement) {
            this.removeNewProfile();
            const existing = this._profiles.find(([p]) => p.name === profile.name);
            if (existing) {
                this._onDidChange.fire(existing[0]);
            }
            else {
                this.onDidChangeProfiles({ added: [profile], removed: [], updated: [], all: this.userDataProfilesService.profiles });
            }
        }
        return profile;
    }
    async discardNewProfile() {
        if (!this.newProfileElement) {
            return;
        }
        if (this.newProfileElement.previewProfile) {
            await this.userDataProfileManagementService.removeProfile(this.newProfileElement.previewProfile);
            return;
        }
        this.removeNewProfile();
        this._onDidChange.fire(undefined);
    }
    async removeProfile(profile) {
        const result = await this.dialogService.confirm({
            type: 'info',
            message: localize('deleteProfile', "Are you sure you want to delete the profile '{0}'?", profile.name),
            primaryButton: localize('delete', "Delete"),
            cancelButton: localize('cancel', "Cancel")
        });
        if (result.confirmed) {
            await this.userDataProfileManagementService.removeProfile(profile);
        }
    }
    async openWindow(profile) {
        await this.hostService.openWindow({ forceProfile: profile.name });
    }
};
UserDataProfilesEditorModel = UserDataProfilesEditorModel_1 = __decorate([
    __param(0, IUserDataProfileService),
    __param(1, IUserDataProfilesService),
    __param(2, IUserDataProfileManagementService),
    __param(3, IUserDataProfileImportExportService),
    __param(4, IDialogService),
    __param(5, ITelemetryService),
    __param(6, IHostService),
    __param(7, IProductService),
    __param(8, IOpenerService),
    __param(9, IInstantiationService)
], UserDataProfilesEditorModel);
export { UserDataProfilesEditorModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvdXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFXLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQTBCLGlCQUFpQixFQUFvQix3QkFBd0IsRUFBaUQsaUJBQWlCLEVBQTBCLE1BQU0sZ0VBQWdFLENBQUM7QUFDalEsT0FBTyxFQUF1RCxZQUFZLEVBQUUsbUNBQW1DLEVBQUUsaUNBQWlDLEVBQUUsdUJBQXVCLEVBQTRCLE1BQU0sNkRBQTZELENBQUM7QUFDM1EsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sS0FBSyxNQUFNLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNySixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUMzSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwSSxPQUFPLEVBQUUsYUFBYSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDM0gsT0FBTyxFQUFFLGtCQUFrQixFQUFFLG1CQUFtQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDMUgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDM0gsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUF5Qy9HLE1BQU0sVUFBVSw0QkFBNEIsQ0FBQyxPQUE2QjtJQUN6RSxPQUFRLE9BQXVDLENBQUMsWUFBWSxLQUFLLFNBQVMsQ0FBQztBQUM1RSxDQUFDO0FBRUQsTUFBTSxVQUFVLDZCQUE2QixDQUFDLE9BQTZCO0lBQzFFLE9BQVEsT0FBNEMsQ0FBQyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQzFFLENBQUM7QUFFTSxJQUFlLDhCQUE4QixHQUE3QyxNQUFlLDhCQUErQixTQUFRLFVBQVU7SUFPdEUsWUFDQyxJQUFZLEVBQ1osSUFBd0IsRUFDeEIsS0FBeUMsRUFDekMsVUFBc0MsRUFDdEMsUUFBaUIsRUFDa0IsZ0NBQXNGLEVBQy9GLHVCQUFvRSxFQUM3RSxjQUFrRCxFQUN6Qyx1QkFBb0UsRUFDaEYsV0FBNEMsRUFDckMsa0JBQTBELEVBQ2pFLFdBQTRDLEVBQ3BCLDBCQUFtRixFQUNsRyxvQkFBOEQ7UUFFckYsS0FBSyxFQUFFLENBQUM7UUFWOEMscUNBQWdDLEdBQWhDLGdDQUFnQyxDQUFtQztRQUM1RSw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQzFELG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUN0Qiw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQzdELGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2xCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDOUMsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFDRCwrQkFBMEIsR0FBMUIsMEJBQTBCLENBQXNDO1FBQy9FLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFuQm5FLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBZSxDQUFDLENBQUM7UUFDcEUsZ0JBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUU5QixrQkFBYSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQWtEeEYsVUFBSyxHQUFHLEVBQUUsQ0FBQztRQXFDWCxZQUFPLEdBQVksS0FBSyxDQUFDO1FBa0J6QixjQUFTLEdBQVksS0FBSyxDQUFDO1FBdEZsQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztRQUNwQixJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQztRQUM5QixJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQztRQUN4QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDbkMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pCLENBQUM7WUFDRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDYixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsa0NBQWtDLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDM0YsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDekMsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUM5SixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDdEYsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDekMsSUFBSSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMzSSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsd0NBQXdDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDM0YsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDekMsSUFBSSxPQUFPLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RJLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDOUMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBR0QsSUFBSSxJQUFJLEtBQWEsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN6QyxJQUFJLElBQUksQ0FBQyxJQUFZO1FBQ3BCLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbkIsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQztJQUNGLENBQUM7SUFHRCxJQUFJLElBQUksS0FBeUIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNyRCxJQUFJLElBQUksQ0FBQyxJQUF3QjtRQUNoQyxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7WUFDbEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN4QyxDQUFDO0lBQ0YsQ0FBQztJQUdELElBQUksVUFBVSxLQUFpQyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLElBQUksVUFBVSxDQUFDLFVBQXNDO1FBQ3BELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDM0YsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7WUFDOUIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM5QyxDQUFDO0lBQ0YsQ0FBQztJQUdELElBQUksS0FBSyxLQUF5QyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLElBQUksS0FBSyxDQUFDLEtBQXlDO1FBQ2xELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ3BCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDekMsQ0FBQztJQUNGLENBQUM7SUFHRCxJQUFJLE1BQU0sS0FBYyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQzlDLElBQUksTUFBTSxDQUFDLE1BQWU7UUFDekIsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUMsQ0FBQztJQUNGLENBQUM7SUFHRCxJQUFJLE9BQU8sS0FBeUIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUMzRCxJQUFJLE9BQU8sQ0FBQyxPQUEyQjtRQUN0QyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7WUFDeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMzQyxDQUFDO0lBQ0YsQ0FBQztJQUdELElBQUksUUFBUSxLQUFjLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbEQsSUFBSSxRQUFRLENBQUMsTUFBZTtRQUMzQixJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7WUFDeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM1QyxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUF3QjtRQUMvQixPQUFPLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUM7SUFDbkMsQ0FBQztJQUVELE9BQU8sQ0FBQyxHQUF3QixFQUFFLEtBQWM7UUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ2xELElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQ25CLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxRQUFRO1FBQ1AsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxlQUFlLEVBQUUseURBQXlELENBQUMsQ0FBQztZQUNwRyxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQy9JLElBQUksQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDLGVBQWUsRUFBRSx1Q0FBdUMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0YsT0FBTztRQUNSLENBQUM7UUFDRCxJQUNDLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQzlILENBQUM7WUFDRixJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSx3REFBd0QsQ0FBQyxDQUFDO1lBQzVHLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7SUFDMUIsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsWUFBa0M7UUFDbkQsSUFBSSxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDaEMsTUFBTSxhQUFhLEdBQUc7Ozs7Ozs7YUFPckIsQ0FBQztZQUNGLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUF1QyxLQUFLLEVBQUMsQ0FBQyxFQUFDLEVBQUU7Z0JBQ3BGLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxrREFBaUM7dUJBQ2hELENBQUMsd0RBQW9DO3VCQUNyQyxDQUFDLDRDQUE4Qjt1QkFDL0IsQ0FBQyx3Q0FBNEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNuRixPQUFPO29CQUNOLE1BQU0sRUFBRSxDQUFDO29CQUNULFFBQVEsRUFBRSxTQUFTO29CQUNuQixZQUFZLEVBQUUsQ0FBQztvQkFDZixVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU07d0JBQzFCLENBQUMsQ0FBQyxRQUFRLENBQUM7NEJBQ1YsRUFBRSxFQUFFLE9BQU87NEJBQ1gsS0FBSyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsa0JBQWtCLENBQUM7NEJBQzNDLEtBQUssRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7NEJBQzlDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRTt5QkFDekMsQ0FBQzt3QkFDRixDQUFDLENBQUMsU0FBUztpQkFDWixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRVMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLFlBQWlDO1FBQzNFLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVTLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxPQUF5QixFQUFFLFlBQWlDO1FBQ2xHLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDN0YsSUFBSSxRQUFRLEdBQW9DLEVBQUUsQ0FBQztRQUNuRCxRQUFRLFlBQVksRUFBRSxDQUFDO1lBQ3RCO2dCQUNDLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQzNHLE1BQU07WUFDUDtnQkFDQyxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixFQUFFLE9BQU8sQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUM5RyxNQUFNO1lBQ1A7Z0JBQ0MsUUFBUSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdCQUF3QixFQUFFLE9BQU8sQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuSCxNQUFNO1lBQ1A7Z0JBQ0MsUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsRUFBRSxPQUFPLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDeEcsTUFBTTtZQUNQO2dCQUNDLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3RHLE1BQU07WUFDUDtnQkFDQyxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdDQUFnQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNuSCxNQUFNO1FBQ1IsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBbUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMscUNBQXFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNuSCxDQUFDO0lBRVMscUNBQXFDLENBQUMsS0FBb0MsRUFBRSxjQUEwQixFQUFFLGtCQUE4QjtRQUMvSSxPQUFPO1lBQ04sTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3BCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtZQUN4QixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDN0csV0FBVyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDeEUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQztZQUN2QyxJQUFJLEVBQUUsS0FBSyxDQUFDLFNBQVM7WUFDckIsVUFBVSxFQUFFLFFBQVEsQ0FBQztnQkFDcEIsRUFBRSxFQUFFLFlBQVk7Z0JBQ2hCLEtBQUssRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDO2dCQUMzQyxLQUFLLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO2dCQUM5QyxHQUFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQ2YsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksc0RBQW1DLEVBQUUsQ0FBQzt3QkFDMUQsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUM1RyxDQUFDO3lCQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO3dCQUM5QixNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDbEgsQ0FBQztnQkFDRixDQUFDO2FBQ0QsQ0FBQztZQUNGLE9BQU8sRUFBRTtnQkFDUixPQUFPLEVBQUUsY0FBYztnQkFDdkIsV0FBVyxFQUFFLGtCQUFrQjthQUMvQjtTQUNELENBQUM7SUFFSCxDQUFDO0lBRUQsY0FBYztRQUNiLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELGtCQUFrQjtRQUNqQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxtQkFBbUI7UUFDbEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzlELE9BQU8sU0FBUyxDQUFDLGFBQWEsSUFBSSxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUM3RCxDQUFDO0lBRUQsYUFBYSxDQUFDLFNBQWM7UUFDM0IsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVFLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbkYsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJO1FBQ0gsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRU8saUJBQWlCLENBQUMsT0FBeUI7UUFDbEQsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUUsT0FBTyxDQUFDLGVBQWUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzlELE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksRUFBRSxFQUFFLE9BQU8sQ0FBQyxVQUFVLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDOUcsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRVMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUF5QjtRQUNwRCxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDdEMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDaEIsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLGVBQWUsR0FBdUMsSUFBSSxDQUFDLEtBQUs7WUFDckUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLO1lBQy9JLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFYixPQUFPLE1BQU0sSUFBSSxDQUFDLGdDQUFnQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUU7WUFDekUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZTtZQUNuRixVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7U0FDM0IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQU9ELENBQUE7QUFwVHFCLDhCQUE4QjtJQWFqRCxXQUFBLGlDQUFpQyxDQUFBO0lBQ2pDLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsWUFBWSxDQUFBO0lBQ1osWUFBQSxtQkFBbUIsQ0FBQTtJQUNuQixZQUFBLFlBQVksQ0FBQTtJQUNaLFlBQUEsb0NBQW9DLENBQUE7SUFDcEMsWUFBQSxxQkFBcUIsQ0FBQTtHQXJCRiw4QkFBOEIsQ0FvVG5EOztBQUVNLElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXVCLFNBQVEsOEJBQThCO0lBRXpFLElBQUksT0FBTyxLQUF1QixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBRXpELFlBQ1MsUUFBMEIsRUFDekIsWUFBa0MsRUFDbEMsT0FBK0IsRUFDZixzQkFBZ0UsRUFDbEUsb0JBQTRELEVBQ2hELGdDQUFtRSxFQUM1RSx1QkFBaUQsRUFDMUQsY0FBK0IsRUFDdEIsdUJBQWlELEVBQzdELFdBQXlCLEVBQ2xCLGtCQUF1QyxFQUM5QyxXQUF5QixFQUNELDBCQUFnRSxFQUMvRSxvQkFBMkM7UUFFbEUsS0FBSyxDQUNKLFFBQVEsQ0FBQyxJQUFJLEVBQ2IsUUFBUSxDQUFDLElBQUksRUFDYixRQUFRLENBQUMsZUFBZSxFQUN4QixRQUFRLENBQUMsVUFBVSxFQUNuQixzQkFBc0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxLQUFLLFFBQVEsQ0FBQyxFQUFFLEVBQ3hELGdDQUFnQyxFQUNoQyx1QkFBdUIsRUFDdkIsY0FBYyxFQUNkLHVCQUF1QixFQUN2QixXQUFXLEVBQ1gsa0JBQWtCLEVBQ2xCLFdBQVcsRUFDWCwwQkFBMEIsRUFDMUIsb0JBQW9CLENBQ3BCLENBQUM7UUE5Qk0sYUFBUSxHQUFSLFFBQVEsQ0FBa0I7UUFDekIsaUJBQVksR0FBWixZQUFZLENBQXNCO1FBQ2xDLFlBQU8sR0FBUCxPQUFPLENBQXdCO1FBQ0UsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtRQUNqRCx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBaUY1RSx3QkFBbUIsR0FBWSxLQUFLLENBQUM7UUF0RDVDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDL0csSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoRSxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDL0csQ0FBQztRQUNGLENBQUMsQ0FDQSxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3SixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtZQUMvRSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzVELElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7Z0JBQ3hCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDYixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMvQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUMxQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzVDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVTLGlCQUFpQjtRQUMxQixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBQy9CLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7UUFDL0IsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQztRQUMzQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO0lBQzVDLENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxLQUFZLEVBQUUsUUFBZTtRQUNwRCxNQUFNLFVBQVUsR0FBRyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzFELEtBQUssTUFBTSxTQUFTLElBQUksS0FBSyxFQUFFLENBQUM7WUFDL0IsVUFBVSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBQ0QsS0FBSyxNQUFNLFNBQVMsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNsQyxVQUFVLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlCLENBQUM7UUFDRCxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRU0sS0FBSyxDQUFDLHNCQUFzQjtRQUNsQyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNGLENBQUM7SUFDRixDQUFDO0lBR0QsSUFBSSxrQkFBa0IsS0FBYyxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7SUFDdEUsSUFBSSxrQkFBa0IsQ0FBQyxrQkFBMkI7UUFDakQsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztZQUNyRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLENBQUM7WUFDOUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3BELENBQUM7SUFDRixDQUFDO0lBRU0sS0FBSyxDQUFDLDBCQUEwQjtRQUN0QyxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkUsTUFBTSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN4RyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sSUFBSSxDQUFDLGdDQUFnQyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDekUsQ0FBQztJQUNGLENBQUM7SUFFa0IsS0FBSyxDQUFDLE1BQU07UUFDOUIsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRWtCLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxZQUFpQztRQUNwRixJQUFJLFlBQVksc0RBQW1DLEVBQUUsQ0FBQztZQUNyRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzlILE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBbUMsS0FBSyxDQUFDLEVBQUUsQ0FDN0QsSUFBSSxDQUFDLHFDQUFxQyxDQUN6QyxLQUFLLEVBQ0wsU0FBUyxFQUNULENBQUM7b0JBQ0EsRUFBRSxFQUFFLG9CQUFvQjtvQkFDeEIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxpQ0FBaUMsQ0FBQztvQkFDeEUsT0FBTyxFQUFFLEtBQUssQ0FBQyxpQkFBaUI7b0JBQ2hDLE9BQU8sRUFBRSxJQUFJO29CQUNiLEtBQUssRUFBRSxFQUFFO29CQUNULE9BQU8sRUFBRSxFQUFFO29CQUNYLEdBQUcsRUFBRSxLQUFLLElBQUksRUFBRTt3QkFDZixNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFDbEgsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7d0JBQzFGLElBQUksU0FBUyxFQUFFLENBQUM7NEJBQ2YsTUFBTSxJQUFJLENBQUMsMEJBQTBCLENBQUMsc0JBQXNCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFDMUcsQ0FBQztvQkFDRixDQUFDO2lCQUNELENBQUMsQ0FDRixDQUFDLENBQUM7UUFDTCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRVEsY0FBYztRQUN0QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzFCLENBQUM7Q0FFRCxDQUFBO0FBOUlZLHNCQUFzQjtJQVFoQyxXQUFBLHVCQUF1QixDQUFBO0lBQ3ZCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLFlBQVksQ0FBQTtJQUNaLFlBQUEsbUJBQW1CLENBQUE7SUFDbkIsWUFBQSxZQUFZLENBQUE7SUFDWixZQUFBLG9DQUFvQyxDQUFBO0lBQ3BDLFlBQUEscUJBQXFCLENBQUE7R0FsQlgsc0JBQXNCLENBOElsQzs7QUFFRCxNQUFNLHlDQUF5QyxHQUFHLGdDQUFnQyxDQUFDO0FBRTVFLElBQU0saUJBQWlCLEdBQXZCLE1BQU0saUJBQWtCLFNBQVEsOEJBQThCO0lBR3BFLElBQUksaUJBQWlCLEtBQTBCLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztJQVFoRixZQUNDLFFBQTRDLEVBQ25DLFlBQWtDLEVBQ2xDLE9BQStCLEVBRUgsa0NBQXdGLEVBQzFGLGdDQUFtRSxFQUM1RSx1QkFBaUQsRUFDMUQsY0FBK0IsRUFDdEIsdUJBQWlELEVBQzdELFdBQXlCLEVBQ2xCLGtCQUF1QyxFQUM5QyxXQUF5QixFQUNELDBCQUFnRSxFQUMvRSxvQkFBMkM7UUFFbEUsS0FBSyxDQUNKLEVBQUUsRUFDRixTQUFTLEVBQ1QsU0FBUyxFQUNULFNBQVMsRUFDVCxLQUFLLEVBQ0wsZ0NBQWdDLEVBQ2hDLHVCQUF1QixFQUN2QixjQUFjLEVBQ2QsdUJBQXVCLEVBQ3ZCLFdBQVcsRUFDWCxrQkFBa0IsRUFDbEIsV0FBVyxFQUNYLDBCQUEwQixFQUMxQixvQkFBb0IsQ0FDcEIsQ0FBQztRQTdCTyxpQkFBWSxHQUFaLFlBQVksQ0FBc0I7UUFDbEMsWUFBTyxHQUFQLE9BQU8sQ0FBd0I7UUFFYyx1Q0FBa0MsR0FBbEMsa0NBQWtDLENBQXFDO1FBZHRILHVCQUFrQixHQUFHLElBQUksV0FBVyxFQUFVLENBQUM7UUFJL0MsYUFBUSxHQUFvQyxJQUFJLENBQUM7UUEwRXhDLG1DQUE4QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBckN2RixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDeEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyx5Q0FBeUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksMEJBQTBCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvSSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDaEMsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ2pFLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUdELElBQUksUUFBUSxLQUF5QyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzdFLElBQUksUUFBUSxDQUFDLFFBQTRDO1FBQ3hELElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztZQUMxQixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzNDLElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pELElBQUksUUFBUSxZQUFZLEdBQUcsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsZUFBZSxFQUFFLE1BQU0sRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsZUFBZSxHQUFHLFNBQVMsQ0FBQztZQUNsQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ25CLENBQUM7SUFDRixDQUFDO0lBR0QsSUFBSSxTQUFTLEtBQTJDLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDakYsSUFBSSxTQUFTLENBQUMsS0FBMkM7UUFDeEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckMsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM3QyxDQUFDO0lBQ0YsQ0FBQztJQUlELElBQUksY0FBYyxLQUFtQyxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0lBQ25GLElBQUksY0FBYyxDQUFDLE9BQXFDO1FBQ3ZELElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsZUFBZSxHQUFHLE9BQU8sQ0FBQztZQUMvQixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM1QyxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7Z0JBQ25HLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDN0UsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDM0IsT0FBTztvQkFDUixDQUFDO29CQUNELElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7d0JBQ2xELElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQzVDLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVTLGlCQUFpQjtRQUMxQixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDNUIsQ0FBQztJQUVPLGdCQUFnQixDQUFDLFFBQTRDO1FBQ3BFLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNqQixRQUFRLEVBQUUsSUFBSTtZQUNkLFdBQVcsRUFBRSxJQUFJO1lBQ2pCLFFBQVEsRUFBRSxJQUFJO1lBQ2QsS0FBSyxFQUFFLElBQUk7WUFDWCxVQUFVLEVBQUUsSUFBSTtZQUNoQixHQUFHLEVBQUUsSUFBSTtTQUNULENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNmLENBQUM7SUFFTyxLQUFLLENBQUMsVUFBVTtRQUN2QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNyQixJQUFJLENBQUM7WUFDSixJQUFJLElBQUksQ0FBQyxRQUFRLFlBQVksR0FBRyxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzFDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNuQixJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDOUQsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDcEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDekQsQ0FBQztvQkFDRCxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUNwQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7b0JBQ25ELENBQUM7b0JBQ0QsSUFBSSxDQUFDLFdBQVcsZ0RBQStCLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN6RSxJQUFJLENBQUMsV0FBVyxzREFBa0MsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQy9FLElBQUksQ0FBQyxXQUFXLDBDQUE0QixDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDbkUsSUFBSSxDQUFDLFdBQVcsZ0RBQStCLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN6RSxJQUFJLENBQUMsV0FBVyxvREFBaUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQzdFLElBQUksQ0FBQyxXQUFXLHNDQUEwQixDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDL0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztnQkFDRCxPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3BDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN4RixDQUFDO2dCQUNELElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3BDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDbkQsQ0FBQztnQkFDRCxJQUFJLENBQUMsV0FBVyxnREFBK0IsSUFBSSxDQUFDLENBQUM7Z0JBQ3JELElBQUksQ0FBQyxXQUFXLHNEQUFrQyxJQUFJLENBQUMsQ0FBQztnQkFDeEQsSUFBSSxDQUFDLFdBQVcsMENBQTRCLElBQUksQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLENBQUMsV0FBVyxnREFBK0IsSUFBSSxDQUFDLENBQUM7Z0JBQ3JELElBQUksQ0FBQyxXQUFXLG9EQUFpQyxJQUFJLENBQUMsQ0FBQztnQkFDdkQsSUFBSSxDQUFDLFdBQVcsc0NBQTBCLElBQUksQ0FBQyxDQUFDO2dCQUNoRCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUMvQyxPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN6RCxDQUFDO1lBQ0QsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztZQUMxQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLFdBQVcsZ0RBQStCLEtBQUssQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxXQUFXLHNEQUFrQyxLQUFLLENBQUMsQ0FBQztZQUN6RCxJQUFJLENBQUMsV0FBVywwQ0FBNEIsS0FBSyxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLFdBQVcsZ0RBQStCLEtBQUssQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxXQUFXLG9EQUFpQyxLQUFLLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsV0FBVyxzQ0FBMEIsS0FBSyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNoRCxDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN2QixDQUFDO0lBQ0YsQ0FBQztJQUVPLGlCQUFpQjtRQUN4QixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sU0FBUyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxXQUFXLENBQUMsQ0FBQztRQUNqRCxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsS0FBSyxNQUFNLE9BQU8sSUFBSSxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDN0QsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0MsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRCxTQUFTLEdBQUcsS0FBSyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDbkQsQ0FBQztRQUNELE9BQU8sR0FBRyxJQUFJLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFRCxLQUFLLENBQUMsZUFBZSxDQUFDLEdBQVE7UUFDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUMsZUFBZSxHQUFHLHVCQUF1QixDQUFDLEtBQUssRUFBQyxLQUFLLEVBQUMsRUFBRTtnQkFDNUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsa0NBQWtDLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNGLElBQUksQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztvQkFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7Z0JBQzFCLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFDRCxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUM7UUFDM0IsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxXQUFXLENBQUMsWUFBaUM7UUFDNUMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkIsUUFBUSxZQUFZLEVBQUUsQ0FBQztnQkFDdEI7b0JBQ0MsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQ2pDO29CQUNDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO2dCQUNwQztvQkFDQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDakM7b0JBQ0MsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7Z0JBQzlCO29CQUNDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO1lBQ3BDLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsV0FBVyxDQUFDLEdBQXdCO1FBQ25DLE9BQU8sSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssQ0FBQztJQUN2QyxDQUFDO0lBRUQsV0FBVyxDQUFDLEdBQXdCLEVBQUUsS0FBYztRQUNuRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDMUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUN4QixDQUFDO0lBRUQsZUFBZTtRQUNkLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDdEMsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztRQUMzQixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ2xDLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFa0IsS0FBSyxDQUFDLDBCQUEwQixDQUFDLFlBQWlDO1FBQ3BGLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDL0YsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7WUFDckMsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDekIsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN2RSxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDMUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsOEJBQThCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN6RSxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDbkIsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU8sS0FBSyxDQUFDLDhCQUE4QixDQUFDLGVBQXlDLEVBQUUsWUFBaUM7UUFDeEgsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSx5Q0FBeUMsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLGVBQWUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakksTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSx5Q0FBeUMsRUFBRSxJQUFJLEVBQUUsZUFBZSxlQUFlLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ25JLE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDLFlBQVksRUFBRSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQ3RGLFFBQVEsWUFBWSxFQUFFLENBQUM7WUFDdEI7Z0JBQ0MsSUFBSSxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQzlCLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUMxRyxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQzNELENBQUM7Z0JBQ0QsT0FBTyxFQUFFLENBQUM7WUFDWDtnQkFDQyxJQUFJLGVBQWUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDakMsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ2hILE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDM0QsQ0FBQztnQkFDRCxPQUFPLEVBQUUsQ0FBQztZQUNYO2dCQUNDLElBQUksZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUM5QixNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDMUcsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUMzRCxDQUFDO2dCQUNELE9BQU8sRUFBRSxDQUFDO1lBQ1g7Z0JBQ0MsSUFBSSxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzNCLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDcEcsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUMzRCxDQUFDO2dCQUNELE9BQU8sRUFBRSxDQUFDO1lBQ1g7Z0JBQ0MsSUFBSSxlQUFlLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQ3pCLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUN2RyxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQzNELENBQUM7Z0JBQ0QsT0FBTyxFQUFFLENBQUM7WUFDWDtnQkFDQyxJQUFJLGVBQWUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDaEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdDQUFnQyxFQUFFLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDNUksT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ2pGLENBQUM7Z0JBQ0QsT0FBTyxFQUFFLENBQUM7UUFDWixDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRVEsa0JBQWtCO1FBQzFCLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3ZCLENBQUM7SUFFUSxjQUFjO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFFa0IsS0FBSyxDQUFDLE1BQU07UUFDOUIsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDekIsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM1RCxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNiLElBQUksQ0FBQyxjQUFjLEdBQUcsT0FBTyxDQUFDO1lBQy9CLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFuVVksaUJBQWlCO0lBZ0IzQixXQUFBLG1DQUFtQyxDQUFBO0lBQ25DLFdBQUEsaUNBQWlDLENBQUE7SUFDakMsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFlBQUEsWUFBWSxDQUFBO0lBQ1osWUFBQSxvQ0FBb0MsQ0FBQTtJQUNwQyxZQUFBLHFCQUFxQixDQUFBO0dBekJYLGlCQUFpQixDQW1VN0I7O0FBRU0sSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxXQUFXOztJQUczRCxNQUFNLENBQUMsV0FBVyxDQUFDLG9CQUEyQztRQUM3RCxJQUFJLENBQUMsNkJBQTJCLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDM0MsNkJBQTJCLENBQUMsUUFBUSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw2QkFBMkIsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7UUFDRCxPQUFPLDZCQUEyQixDQUFDLFFBQVEsQ0FBQztJQUM3QyxDQUFDO0lBR0QsSUFBSSxRQUFRO1FBQ1gsT0FBTyxJQUFJLENBQUMsU0FBUzthQUNuQixHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUM7YUFDM0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2QsSUFBSSxDQUFDLFlBQVksaUJBQWlCLEVBQUUsQ0FBQztnQkFDcEMsT0FBTyxDQUFDLENBQUM7WUFDVixDQUFDO1lBQ0QsSUFBSSxDQUFDLFlBQVksaUJBQWlCLEVBQUUsQ0FBQztnQkFDcEMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNYLENBQUM7WUFDRCxJQUFJLENBQUMsWUFBWSxzQkFBc0IsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNoRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQztZQUNELElBQUksQ0FBQyxZQUFZLHNCQUFzQixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hFLE9BQU8sQ0FBQyxDQUFDO1lBQ1YsQ0FBQztZQUNELE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQVNELFlBQzBCLHNCQUFnRSxFQUMvRCx1QkFBa0UsRUFDekQsZ0NBQW9GLEVBQ2xGLGtDQUF3RixFQUM3RyxhQUE4QyxFQUMzQyxnQkFBb0QsRUFDekQsV0FBMEMsRUFDdkMsY0FBZ0QsRUFDakQsYUFBOEMsRUFDdkMsb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBWGtDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBeUI7UUFDOUMsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUN4QyxxQ0FBZ0MsR0FBaEMsZ0NBQWdDLENBQW1DO1FBQ2pFLHVDQUFrQyxHQUFsQyxrQ0FBa0MsQ0FBcUM7UUFDNUYsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQzFCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDeEMsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFDdEIsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQ2hDLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUN0Qix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBdEM1RSxjQUFTLEdBQXdELEVBQUUsQ0FBQztRQXVCcEUsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE4QyxDQUFDLENBQUM7UUFDeEYsZ0JBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztRQWlCOUMsS0FBSyxNQUFNLE9BQU8sSUFBSSx1QkFBdUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN4RCxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN6RCxDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BJLElBQUksQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9GLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxDQUF5QjtRQUNwRCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7UUFDcEIsS0FBSyxNQUFNLE9BQU8sSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQzNFLE9BQU8sR0FBRyxJQUFJLENBQUM7Z0JBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNGLENBQUM7UUFDRCxLQUFLLE1BQU0sT0FBTyxJQUFJLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNqQyxJQUFJLE9BQU8sQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsQ0FBQztnQkFDL0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7WUFDbkQsQ0FBQztZQUNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxZQUFZLHNCQUFzQixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwSCxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNsQixPQUFPLEdBQUcsSUFBSSxDQUFDO2dCQUNmLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2pGLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25DLENBQUM7SUFDRixDQUFDO0lBRUQsWUFBWTtRQUNYLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUNyRixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3ZCLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxPQUF5QjtRQUNyRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQ2hELDBCQUEwQixFQUMxQixRQUFRLENBQUMsUUFBUSxFQUFFLHFDQUFxQyxDQUFDLEVBQ3pELFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUNwQyxJQUFJLEVBQ0osR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQ2pGLENBQUMsQ0FBQztRQUVILE1BQU0scUJBQXFCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FDdkQsaUNBQWlDLEVBQ2pDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLENBQUMsRUFDM0MsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQ25DLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUN6RCxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxDQUM5Qyx3QkFBd0IsRUFDeEIsUUFBUSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsRUFDL0IsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQ3JDLElBQUksRUFDSixHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUNwRSxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxDQUM5Qyx3QkFBd0IsRUFDeEIsUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFDNUIsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQ3BDLElBQUksRUFDSixHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FDaEQsQ0FBQyxDQUFDO1FBRUgsTUFBTSxlQUFlLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FDakQsMkJBQTJCLEVBQzNCLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxtQ0FBbUMsQ0FBQyxFQUNoRSxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFDMUMsSUFBSSxFQUNKLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUM3QyxDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBYyxFQUFFLENBQUM7UUFDckMsY0FBYyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNwQyxjQUFjLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sZ0JBQWdCLEdBQWMsRUFBRSxDQUFDO1FBQ3ZDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQzdDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3hCLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDdkMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLEVBQ3JHLE9BQU8sRUFDUCxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDUixDQUFDLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUNsQyxDQUFDLENBQUM7UUFFSCxjQUFjLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxLQUFLLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ3JHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLHlCQUF5QixDQUFDLEdBQUcsRUFBRSxDQUMxRSxjQUFjLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxLQUFLLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV4RyxPQUFPLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBaUM7UUFDdkQsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM1QixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO2dCQUMvQyxJQUFJLEVBQUUsTUFBTTtnQkFDWixPQUFPLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHlGQUF5RixDQUFDO2dCQUNsSSxhQUFhLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQztnQkFDdEQsWUFBWSxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDO2FBQzFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3ZCLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2YsQ0FBQztRQUVELElBQUksUUFBUSxZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNoRixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ2pELE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM3QixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQzFDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1lBQzlELFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0UsTUFBTSxjQUFjLEdBQWEsRUFBRSxDQUFDO1lBQ3BDLE1BQU0sZ0JBQWdCLEdBQWEsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQzlDLHdCQUF3QixFQUN4QixRQUFRLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxFQUM1QixTQUFTLEVBQ1QsSUFBSSxFQUNKLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUMvRCxDQUFDLENBQUM7WUFDSCxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ2xDLElBQUksS0FBSyxJQUFJLFFBQVEsWUFBWSxHQUFHLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hFLGNBQWMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FDN0MsaUNBQWlDLEVBQ2pDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFDNUUsU0FBUyxFQUNULElBQUksRUFDSixHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FDL0QsQ0FBQyxDQUFDLENBQUM7WUFDTCxDQUFDO1lBQ0QsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FDOUMsd0JBQXdCLEVBQ3hCLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLEVBQzVCLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUNwQyxJQUFJLEVBQ0osR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQzlCLENBQUMsQ0FBQztZQUNILGdCQUFnQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNwQyxNQUFNLG9CQUFvQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQ3RELHlCQUF5QixFQUN6QixRQUFRLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxFQUM5QixTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsRUFDMUMsSUFBSSxFQUNKLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FDM0QsQ0FBQyxDQUFDO1lBQ0gsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDNUMsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FDOUMsd0JBQXdCLEVBQ3hCLFFBQVEsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLEVBQy9CLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUNyQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFDM0IsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUMxRCxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGlCQUFpQixFQUNsRyxRQUFRLEVBQ1IsQ0FBQyxjQUFjLEVBQUUsZ0JBQWdCLENBQUMsRUFDbEMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FDaEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSx1QkFBdUIsR0FBRyxHQUFHLEVBQUU7Z0JBQ3BDLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMxQixJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLElBQUksSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDcEosWUFBWSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUNyRCxDQUFDO3lCQUFNLENBQUM7d0JBQ1AsWUFBWSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO29CQUNuRCxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDLENBQUM7WUFDRix1QkFBdUIsRUFBRSxDQUFDO1lBQzFCLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDdEQsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMxQyxZQUFZLENBQUMsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLENBQUM7b0JBQzdGLG9CQUFvQixDQUFDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE9BQU8sQ0FBQztnQkFDakosQ0FBQztnQkFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUMxQix1QkFBdUIsRUFBRSxDQUFDO29CQUMxQixZQUFZLENBQUMsT0FBTyxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDNUUsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDSixXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUN0RSx1QkFBdUIsRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxFQUFFLENBQUM7WUFDcEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7WUFDM0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDO0lBQy9CLENBQUM7SUFFRCxNQUFNO1FBQ0wsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVPLGdCQUFnQjtRQUN2QixJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzVCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzlFLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xCLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2pGLENBQUM7WUFDRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsU0FBUyxDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQixDQUFDLEtBQXdCO1FBQ3ZELElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM3QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzNDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsR0FBRyxPQUFPLENBQUM7WUFDaEQsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDWCxNQUFNLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNoQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBd0I7UUFDdEQsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzdCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ3pELE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsaUJBQWlCLENBQ2hDLFlBQVksRUFBRSxFQUNkLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQzNCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUN4QyxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFDekM7WUFDQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUk7WUFDakMsZUFBZSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLO1NBQzdDLEVBQ0QsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FDM0MsQ0FBQztRQUNGLE1BQU0sSUFBSSxDQUFDLGtDQUFrQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3hHLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQW1CLEVBQUUsS0FBeUI7UUFDbEUsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzdCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDcEMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ3ZDLElBQUksT0FBcUMsQ0FBQztRQUUxQyxJQUFJLENBQUM7WUFDSixJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUNoQixPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDbEksQ0FBQztZQUNGLENBQUM7aUJBQ0ksQ0FBQztnQkFDTCxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDO2dCQUMvRCxNQUFNLGVBQWUsR0FBdUMsS0FBSztvQkFDaEUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFdBQVcsSUFBSSxLQUFLLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxXQUFXLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLO29CQUNqSCxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQVViLE1BQU0sMEJBQTBCLEdBQTJCLEVBQUUsTUFBTSxFQUFFLFFBQVEsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUUxTCxJQUFJLFFBQVEsWUFBWSxHQUFHLEVBQUUsQ0FBQztvQkFDN0IsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN4RSxJQUFJLFFBQVEsRUFBRSxDQUFDO3dCQUNkLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQTBELG9DQUFvQyxFQUFFLDBCQUEwQixDQUFDLENBQUM7d0JBQzVKLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyx5QkFBeUIsQ0FDaEYsUUFBUSxFQUNSOzRCQUNDLElBQUk7NEJBQ0osZUFBZTs0QkFDZixJQUFJOzRCQUNKLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTOzRCQUNuRCxTQUFTO3lCQUNULEVBQ0QsS0FBSyxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FDL0IsQ0FBQztvQkFDSCxDQUFDO2dCQUNGLENBQUM7cUJBQU0sSUFBSSxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO29CQUN4QyxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsa0NBQWtDLENBQUMsaUJBQWlCLENBQ3hFLFFBQVEsRUFDUjt3QkFDQyxJQUFJO3dCQUNKLGVBQWU7d0JBQ2YsSUFBSSxFQUFFLElBQUk7d0JBQ1YsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7d0JBQ25ELFNBQVM7cUJBQ1QsRUFDRCxLQUFLLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUMvQixDQUFDO2dCQUNILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztnQkFDakgsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztZQUN6QyxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7WUFDcEMsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixJQUFJLENBQUM7b0JBQ0osTUFBTSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2hCLFNBQVM7Z0JBQ1YsQ0FBQztZQUNGLENBQUM7WUFDRCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMvRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN4QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZFLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2QsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdEgsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQjtRQUM5QixJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDN0IsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUMzQyxNQUFNLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ2pHLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhLENBQUMsT0FBeUI7UUFDcEQsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztZQUMvQyxJQUFJLEVBQUUsTUFBTTtZQUNaLE9BQU8sRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLG9EQUFvRCxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDdEcsYUFBYSxFQUFFLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDO1lBQzNDLFlBQVksRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQztTQUMxQyxDQUFDLENBQUM7UUFDSCxJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN0QixNQUFNLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEUsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQXlCO1FBQ2pELE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsRUFBRSxZQUFZLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7SUFDbkUsQ0FBQztDQUNELENBQUE7QUF0YlksMkJBQTJCO0lBdUNyQyxXQUFBLHVCQUF1QixDQUFBO0lBQ3ZCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLG1DQUFtQyxDQUFBO0lBQ25DLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLHFCQUFxQixDQUFBO0dBaERYLDJCQUEyQixDQXNidkMifQ==