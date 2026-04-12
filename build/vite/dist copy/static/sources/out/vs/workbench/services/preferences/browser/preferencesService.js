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
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import * as network from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { CoreEditingCommands } from '../../../../editor/browser/coreCommands.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions, getDefaultValue, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP, SIDE_GROUP } from '../../editor/common/editorService.js';
import { KeybindingsEditorInput } from './keybindingsEditorInput.js';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, SETTINGS_AUTHORITY, USE_SPLIT_JSON_SETTING, validateSettingsEditorOptions } from '../common/preferences.js';
import { PreferencesEditorInput, SettingsEditor2Input } from '../common/preferencesEditorInput.js';
import { defaultKeybindingsContents, DefaultKeybindingsEditorModel, DefaultRawSettingsEditorModel, DefaultSettings, DefaultSettingsEditorModel, Settings2EditorModel, SettingsEditorModel, WorkspaceConfigurationEditorModel } from '../common/preferencesModels.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { ITextEditorService } from '../../textfile/common/textEditorService.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { isObject } from '../../../../base/common/types.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { compareIgnoreCase } from '../../../../base/common/strings.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
const emptyEditableSettingsContent = '{\n}';
let PreferencesService = class PreferencesService extends Disposable {
    constructor(editorService, editorGroupService, textFileService, configurationService, notificationService, contextService, instantiationService, userDataProfileService, userDataProfilesService, textModelResolverService, keybindingService, modelService, jsonEditingService, labelService, remoteAgentService, textEditorService, urlService, extensionService, progressService, environmentService) {
        super();
        this.editorService = editorService;
        this.editorGroupService = editorGroupService;
        this.textFileService = textFileService;
        this.configurationService = configurationService;
        this.notificationService = notificationService;
        this.contextService = contextService;
        this.instantiationService = instantiationService;
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.textModelResolverService = textModelResolverService;
        this.jsonEditingService = jsonEditingService;
        this.labelService = labelService;
        this.remoteAgentService = remoteAgentService;
        this.textEditorService = textEditorService;
        this.extensionService = extensionService;
        this.progressService = progressService;
        this.environmentService = environmentService;
        this._onDispose = this._register(new Emitter());
        this._onDidDefaultSettingsContentChanged = this._register(new Emitter());
        this.onDidDefaultSettingsContentChanged = this._onDidDefaultSettingsContentChanged.event;
        this._requestedDefaultSettings = new ResourceSet();
        this._settingsGroups = undefined;
        this._cachedSettingsEditor2Input = undefined;
        this.defaultKeybindingsResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });
        this.defaultSettingsRawResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/defaultSettings.jsonc' });
        // The default keybindings.json updates based on keyboard layouts, so here we make sure
        // if a model has been given out we update it accordingly.
        this._register(keybindingService.onDidUpdateKeybindings(() => {
            const model = modelService.getModel(this.defaultKeybindingsResource);
            if (!model) {
                // model has not been given out => nothing to do
                return;
            }
            modelService.updateModel(model, defaultKeybindingsContents(keybindingService));
        }));
        this._register(urlService.registerHandler(this));
    }
    get userSettingsResource() {
        return this.userDataProfileService.currentProfile.settingsResource;
    }
    get workspaceSettingsResource() {
        if (this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return null;
        }
        const workspace = this.contextService.getWorkspace();
        return workspace.configuration || workspace.folders[0].toResource(FOLDER_SETTINGS_PATH);
    }
    createOrGetCachedSettingsEditor2Input() {
        if (!this._cachedSettingsEditor2Input || this._cachedSettingsEditor2Input.isDisposed()) {
            // Recreate the input if the user never opened the Settings editor,
            // or if they closed it and want to reopen it.
            this._cachedSettingsEditor2Input = new SettingsEditor2Input(this);
        }
        return this._cachedSettingsEditor2Input;
    }
    getFolderSettingsResource(resource) {
        const folder = this.contextService.getWorkspaceFolder(resource);
        return folder ? folder.toResource(FOLDER_SETTINGS_PATH) : null;
    }
    hasDefaultSettingsContent(uri) {
        return this.isDefaultSettingsResource(uri) || isEqual(uri, this.defaultSettingsRawResource) || isEqual(uri, this.defaultKeybindingsResource);
    }
    getDefaultSettingsContent(uri) {
        if (this.isDefaultSettingsResource(uri)) {
            // We opened a split json editor in this case,
            // and this half shows the default settings.
            const target = this.getConfigurationTargetFromDefaultSettingsResource(uri);
            const defaultSettings = this.getDefaultSettings(target);
            if (!this._requestedDefaultSettings.has(uri)) {
                this._register(defaultSettings.onDidChange(() => this._onDidDefaultSettingsContentChanged.fire(uri)));
                this._requestedDefaultSettings.add(uri);
            }
            return defaultSettings.getContentWithoutMostCommonlyUsed(true);
        }
        if (isEqual(uri, this.defaultSettingsRawResource)) {
            if (!this._defaultRawSettingsEditorModel) {
                this._defaultRawSettingsEditorModel = this._register(this.instantiationService.createInstance(DefaultRawSettingsEditorModel, this.getDefaultSettings(3 /* ConfigurationTarget.USER_LOCAL */)));
                this._register(this._defaultRawSettingsEditorModel.onDidContentChanged(() => this._onDidDefaultSettingsContentChanged.fire(uri)));
            }
            return this._defaultRawSettingsEditorModel.content;
        }
        if (isEqual(uri, this.defaultKeybindingsResource)) {
            const defaultKeybindingsEditorModel = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
            return defaultKeybindingsEditorModel.content;
        }
        return undefined;
    }
    async createPreferencesEditorModel(uri) {
        if (this.isDefaultSettingsResource(uri)) {
            return this.createDefaultSettingsEditorModel(uri);
        }
        if (this.userSettingsResource.toString() === uri.toString() || this.userDataProfilesService.defaultProfile.settingsResource.toString() === uri.toString()) {
            return this.createEditableSettingsEditorModel(3 /* ConfigurationTarget.USER_LOCAL */, uri);
        }
        const workspaceSettingsUri = await this.getEditableSettingsURI(5 /* ConfigurationTarget.WORKSPACE */);
        if (workspaceSettingsUri && workspaceSettingsUri.toString() === uri.toString()) {
            return this.createEditableSettingsEditorModel(5 /* ConfigurationTarget.WORKSPACE */, workspaceSettingsUri);
        }
        if (this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            const settingsUri = await this.getEditableSettingsURI(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, uri);
            if (settingsUri && settingsUri.toString() === uri.toString()) {
                return this.createEditableSettingsEditorModel(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, uri);
            }
        }
        const remoteEnvironment = await this.remoteAgentService.getEnvironment();
        const remoteSettingsUri = remoteEnvironment ? remoteEnvironment.settingsPath : null;
        if (remoteSettingsUri && remoteSettingsUri.toString() === uri.toString()) {
            return this.createEditableSettingsEditorModel(4 /* ConfigurationTarget.USER_REMOTE */, uri);
        }
        return null;
    }
    openRawDefaultSettings() {
        return this.editorService.openEditor({ resource: this.defaultSettingsRawResource });
    }
    openRawUserSettings() {
        return this.editorService.openEditor({ resource: this.userSettingsResource });
    }
    shouldOpenJsonByDefault() {
        return this.configurationService.getValue('workbench.settings.editor') === 'json';
    }
    async openPreferences() {
        await this.editorService.openEditor(this.instantiationService.createInstance(PreferencesEditorInput), undefined, MODAL_GROUP);
    }
    openSettings(options = {}) {
        options = {
            ...options,
            target: 3 /* ConfigurationTarget.USER_LOCAL */,
        };
        if (options.query) {
            options.jsonEditor = false;
        }
        return this.open(this.userSettingsResource, options);
    }
    openLanguageSpecificSettings(languageId, options = {}) {
        if (this.shouldOpenJsonByDefault()) {
            options.query = undefined;
            options.revealSetting = { key: `[${languageId}]`, edit: true };
        }
        else {
            options.query = `@lang:${languageId}${options.query ? ` ${options.query}` : ''}`;
        }
        options.target = options.target ?? 3 /* ConfigurationTarget.USER_LOCAL */;
        return this.open(this.userSettingsResource, options);
    }
    open(settingsResource, options) {
        options = {
            ...options,
            jsonEditor: options.jsonEditor ?? this.shouldOpenJsonByDefault()
        };
        if (options.jsonEditor && options.query && !options.revealSetting) {
            const query = options.query.trim();
            const idMatch = query.match(/^@id:(.+)$/);
            let key;
            if (idMatch) {
                key = idMatch[1].trim();
            }
            else if (Registry.as(Extensions.Configuration).getConfigurationProperties()[query.trim()]) {
                key = query.trim();
            }
            options.query = undefined;
            if (key) {
                options.revealSetting = { key };
            }
        }
        return options.jsonEditor ?
            this.openSettingsJson(settingsResource, options) :
            this.openSettings2(options);
    }
    async openSettings2(options) {
        const input = this.createOrGetCachedSettingsEditor2Input();
        options = {
            ...options,
            focusSearch: true
        };
        const group = this.getEditorGroupFromOptions(options);
        return this.editorService.openEditor(input, validateSettingsEditorOptions(options), group);
    }
    openApplicationSettings(options = {}) {
        options = {
            ...options,
            target: 3 /* ConfigurationTarget.USER_LOCAL */,
        };
        return this.open(this.userDataProfilesService.defaultProfile.settingsResource, options);
    }
    openUserSettings(options = {}) {
        options = {
            ...options,
            target: 3 /* ConfigurationTarget.USER_LOCAL */,
        };
        return this.open(this.userSettingsResource, options);
    }
    async openRemoteSettings(options = {}) {
        const environment = await this.remoteAgentService.getEnvironment();
        if (environment) {
            options = {
                ...options,
                target: 4 /* ConfigurationTarget.USER_REMOTE */,
            };
            this.open(environment.settingsPath, options);
        }
        return undefined;
    }
    openWorkspaceSettings(options = {}) {
        if (!this.workspaceSettingsResource) {
            this.notificationService.info(nls.localize('openFolderFirst', "Open a folder or workspace first to create workspace or folder settings."));
            return Promise.reject(null);
        }
        options = {
            ...options,
            target: 5 /* ConfigurationTarget.WORKSPACE */
        };
        return this.open(this.workspaceSettingsResource, options);
    }
    async openFolderSettings(options = {}) {
        options = {
            ...options,
            target: 6 /* ConfigurationTarget.WORKSPACE_FOLDER */
        };
        if (!options.folderUri) {
            throw new Error(`Missing folder URI`);
        }
        const folderSettingsUri = await this.getEditableSettingsURI(6 /* ConfigurationTarget.WORKSPACE_FOLDER */, options.folderUri);
        if (!folderSettingsUri) {
            throw new Error(`Invalid folder URI - ${options.folderUri.toString()}`);
        }
        return this.open(folderSettingsUri, options);
    }
    async openGlobalKeybindingSettings(textual, options) {
        options = { pinned: true, revealIfOpened: true, ...options };
        if (textual) {
            const emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to override the defaults") + '\n[\n]';
            const editableKeybindings = this.userDataProfileService.currentProfile.keybindingsResource;
            const openDefaultKeybindings = !!this.configurationService.getValue('workbench.settings.openDefaultKeybindings');
            // Create as needed and open in editor
            await this.createIfNotExists(editableKeybindings, emptyContents);
            if (openDefaultKeybindings) {
                const sourceGroupId = options.groupId ?? this.editorGroupService.activeGroup.id;
                const sideEditorGroup = this.editorGroupService.addGroup(sourceGroupId, 3 /* GroupDirection.RIGHT */);
                await Promise.all([
                    this.editorService.openEditor({ resource: this.defaultKeybindingsResource, options: { pinned: true, preserveFocus: true, revealIfOpened: true, override: DEFAULT_EDITOR_ASSOCIATION.id }, label: nls.localize('defaultKeybindings', "Default Keybindings"), description: '' }, sourceGroupId),
                    this.editorService.openEditor({ resource: editableKeybindings, options }, sideEditorGroup.id)
                ]);
            }
            else {
                await this.editorService.openEditor({ resource: editableKeybindings, options }, this.getEditorGroupFromOptions(options));
            }
        }
        else {
            const group = this.getEditorGroupFromOptions(options);
            const editor = (await this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { ...options }, group));
            if (options.query) {
                editor.search(options.query);
            }
        }
    }
    openDefaultKeybindingsFile() {
        return this.editorService.openEditor({ resource: this.defaultKeybindingsResource, label: nls.localize('defaultKeybindings', "Default Keybindings") });
    }
    getEditorGroupFromOptions(options) {
        if (this.configurationService.getValue('workbench.editor.useModal') !== 'off' && // modal editors enabled in settings
            !this.environmentService.enableSmokeTestDriver && !this.environmentService.extensionTestsLocationURI // but not in smoke test or extension test environments to reduce flakiness
        ) {
            return MODAL_GROUP;
        }
        if (options.openToSide) {
            return SIDE_GROUP;
        }
        if (options?.groupId !== undefined) {
            return this.editorGroupService.getGroup(options.groupId) ?? this.editorGroupService.activeGroup;
        }
        return ACTIVE_GROUP;
    }
    async openSettingsJson(resource, options) {
        const group = this.getEditorGroupFromOptions(options);
        const editor = await this.doOpenSettingsJson(resource, options, group);
        if (editor && options?.revealSetting) {
            await this.revealSetting(options.revealSetting.key, !!options.revealSetting.edit, editor, resource);
        }
        return editor;
    }
    async doOpenSettingsJson(resource, options, group) {
        const openSplitJSON = !!this.configurationService.getValue(USE_SPLIT_JSON_SETTING);
        const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);
        if (openSplitJSON || openDefaultSettings) {
            return this.doOpenSplitJSON(resource, options, group);
        }
        const configurationTarget = options?.target ?? 2 /* ConfigurationTarget.USER */;
        const editableSettingsEditorInput = await this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource);
        options = { ...options, pinned: true };
        return await this.editorService.openEditor(editableSettingsEditorInput, { ...validateSettingsEditorOptions(options) }, group);
    }
    async doOpenSplitJSON(resource, options = {}, group) {
        const configurationTarget = options.target ?? 2 /* ConfigurationTarget.USER */;
        await this.createSettingsIfNotExists(configurationTarget, resource);
        const preferencesEditorInput = this.createSplitJsonEditorInput(configurationTarget, resource);
        options = { ...options, pinned: true };
        return this.editorService.openEditor(preferencesEditorInput, validateSettingsEditorOptions(options), group);
    }
    createSplitJsonEditorInput(configurationTarget, resource) {
        const editableSettingsEditorInput = this.textEditorService.createTextEditor({ resource });
        const defaultPreferencesEditorInput = this.textEditorService.createTextEditor({ resource: this.getDefaultSettingsResource(configurationTarget) });
        return this.instantiationService.createInstance(SideBySideEditorInput, editableSettingsEditorInput.getName(), undefined, defaultPreferencesEditorInput, editableSettingsEditorInput);
    }
    createSettings2EditorModel() {
        return this.instantiationService.createInstance(Settings2EditorModel, this.getDefaultSettings(3 /* ConfigurationTarget.USER_LOCAL */));
    }
    getConfigurationTargetFromDefaultSettingsResource(uri) {
        return this.isDefaultWorkspaceSettingsResource(uri) ?
            5 /* ConfigurationTarget.WORKSPACE */ :
            this.isDefaultFolderSettingsResource(uri) ?
                6 /* ConfigurationTarget.WORKSPACE_FOLDER */ :
                3 /* ConfigurationTarget.USER_LOCAL */;
    }
    isDefaultSettingsResource(uri) {
        return this.isDefaultUserSettingsResource(uri) || this.isDefaultWorkspaceSettingsResource(uri) || this.isDefaultFolderSettingsResource(uri);
    }
    isDefaultUserSettingsResource(uri) {
        return uri.authority === 'defaultsettings' && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?settings\.json$/);
    }
    isDefaultWorkspaceSettingsResource(uri) {
        return uri.authority === 'defaultsettings' && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?workspaceSettings\.json$/);
    }
    isDefaultFolderSettingsResource(uri) {
        return uri.authority === 'defaultsettings' && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?resourceSettings\.json$/);
    }
    getDefaultSettingsResource(configurationTarget) {
        switch (configurationTarget) {
            case 5 /* ConfigurationTarget.WORKSPACE */:
                return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/workspaceSettings.json` });
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/resourceSettings.json` });
        }
        return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/settings.json` });
    }
    async getOrCreateEditableSettingsEditorInput(target, resource) {
        await this.createSettingsIfNotExists(target, resource);
        return this.textEditorService.createTextEditor({ resource });
    }
    async createEditableSettingsEditorModel(configurationTarget, settingsUri) {
        const workspace = this.contextService.getWorkspace();
        if (workspace.configuration && workspace.configuration.toString() === settingsUri.toString()) {
            const reference = await this.textModelResolverService.createModelReference(settingsUri);
            return this.instantiationService.createInstance(WorkspaceConfigurationEditorModel, reference, configurationTarget);
        }
        const reference = await this.textModelResolverService.createModelReference(settingsUri);
        return this.instantiationService.createInstance(SettingsEditorModel, reference, configurationTarget);
    }
    async createDefaultSettingsEditorModel(defaultSettingsUri) {
        const reference = await this.textModelResolverService.createModelReference(defaultSettingsUri);
        const target = this.getConfigurationTargetFromDefaultSettingsResource(defaultSettingsUri);
        return this.instantiationService.createInstance(DefaultSettingsEditorModel, defaultSettingsUri, reference, this.getDefaultSettings(target));
    }
    getDefaultSettings(target) {
        if (target === 5 /* ConfigurationTarget.WORKSPACE */) {
            this._defaultWorkspaceSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
            return this._defaultWorkspaceSettingsContentModel;
        }
        if (target === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
            this._defaultFolderSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
            return this._defaultFolderSettingsContentModel;
        }
        this._defaultUserSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
        return this._defaultUserSettingsContentModel;
    }
    async getEditableSettingsURI(configurationTarget, resource) {
        switch (configurationTarget) {
            case 1 /* ConfigurationTarget.APPLICATION */:
                return this.userDataProfilesService.defaultProfile.settingsResource;
            case 2 /* ConfigurationTarget.USER */:
            case 3 /* ConfigurationTarget.USER_LOCAL */:
                return this.userSettingsResource;
            case 4 /* ConfigurationTarget.USER_REMOTE */: {
                const remoteEnvironment = await this.remoteAgentService.getEnvironment();
                return remoteEnvironment ? remoteEnvironment.settingsPath : null;
            }
            case 5 /* ConfigurationTarget.WORKSPACE */:
                return this.workspaceSettingsResource;
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                if (resource) {
                    return this.getFolderSettingsResource(resource);
                }
        }
        return null;
    }
    async createSettingsIfNotExists(target, resource) {
        if (this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */ && target === 5 /* ConfigurationTarget.WORKSPACE */) {
            const workspaceConfig = this.contextService.getWorkspace().configuration;
            if (!workspaceConfig) {
                return;
            }
            const content = await this.textFileService.read(workspaceConfig);
            if (Object.keys(parse(content.value)).indexOf('settings') === -1) {
                await this.jsonEditingService.write(resource, [{ path: ['settings'], value: {} }], true);
            }
            return undefined;
        }
        await this.createIfNotExists(resource, emptyEditableSettingsContent);
    }
    async createIfNotExists(resource, contents) {
        try {
            await this.textFileService.read(resource, { acceptTextOnly: true });
        }
        catch (error) {
            if (error.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                try {
                    await this.textFileService.write(resource, contents);
                    return;
                }
                catch (error2) {
                    throw new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(resource, { relative: true }), getErrorMessage(error2)));
                }
            }
            else {
                throw error;
            }
        }
    }
    getMostCommonlyUsedSettings() {
        return [
            'editor.fontSize',
            'editor.formatOnSave',
            'files.autoSave',
            'editor.defaultFormatter',
            'editor.fontFamily',
            'editor.wordWrap',
            'chat.agent.maxRequests',
            'files.exclude',
            'workbench.colorTheme',
            'editor.tabSize',
            'editor.mouseWheelZoom',
            'editor.formatOnPaste'
        ];
    }
    async revealSetting(settingKey, edit, editor, settingsResource) {
        const codeEditor = editor ? getCodeEditor(editor.getControl()) : null;
        if (!codeEditor) {
            return;
        }
        const settingsModel = await this.createPreferencesEditorModel(settingsResource);
        if (!settingsModel) {
            return;
        }
        const position = await this.getPositionToReveal(settingKey, edit, settingsModel, codeEditor);
        if (position) {
            codeEditor.setPosition(position);
            codeEditor.revealPositionNearTop(position);
            codeEditor.focus();
            if (edit) {
                SuggestController.get(codeEditor)?.triggerSuggest();
            }
        }
    }
    async getPositionToReveal(settingKey, edit, settingsModel, codeEditor) {
        const model = codeEditor.getModel();
        if (!model) {
            return null;
        }
        const schema = Registry.as(Extensions.Configuration).getConfigurationProperties()[settingKey];
        const isOverrideProperty = OVERRIDE_PROPERTY_REGEX.test(settingKey);
        if (!schema && !isOverrideProperty) {
            return null;
        }
        let position = null;
        const type = schema?.type ?? 'object' /* Type not defined or is an Override Identifier */;
        let setting = settingsModel.getPreference(settingKey);
        if (!setting && edit) {
            let defaultValue = (type === 'object' || type === 'array') ? this.configurationService.inspect(settingKey).defaultValue : getDefaultValue(type);
            defaultValue = defaultValue === undefined && isOverrideProperty ? {} : defaultValue;
            if (defaultValue !== undefined) {
                const key = settingsModel instanceof WorkspaceConfigurationEditorModel ? ['settings', settingKey] : [settingKey];
                await this.jsonEditingService.write(settingsModel.uri, [{ path: key, value: defaultValue }], false);
                setting = settingsModel.getPreference(settingKey);
            }
        }
        if (setting) {
            if (edit) {
                if (isObject(setting.value) || Array.isArray(setting.value)) {
                    position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 };
                    codeEditor.setPosition(position);
                    await this.instantiationService.invokeFunction(accessor => {
                        return CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, codeEditor, null);
                    });
                    position = { lineNumber: position.lineNumber + 1, column: model.getLineMaxColumn(position.lineNumber + 1) };
                    const firstNonWhiteSpaceColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber);
                    if (firstNonWhiteSpaceColumn) {
                        // Line has some text. Insert another new line.
                        codeEditor.setPosition({ lineNumber: position.lineNumber, column: firstNonWhiteSpaceColumn });
                        await this.instantiationService.invokeFunction(accessor => {
                            return CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, codeEditor, null);
                        });
                        position = { lineNumber: position.lineNumber, column: model.getLineMaxColumn(position.lineNumber) };
                    }
                }
                else {
                    position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.endColumn };
                }
            }
            else {
                position = { lineNumber: setting.keyRange.startLineNumber, column: setting.keyRange.startColumn };
            }
        }
        return position;
    }
    getSetting(settingId) {
        if (!this._settingsGroups) {
            const defaultSettings = this.getDefaultSettings(2 /* ConfigurationTarget.USER */);
            const defaultsChangedDisposable = this._register(new MutableDisposable());
            defaultsChangedDisposable.value = defaultSettings.onDidChange(() => {
                this._settingsGroups = undefined;
                defaultsChangedDisposable.clear();
            });
            this._settingsGroups = defaultSettings.getSettingsGroups();
        }
        for (const group of this._settingsGroups) {
            for (const section of group.sections) {
                for (const setting of section.settings) {
                    if (compareIgnoreCase(setting.key, settingId) === 0) {
                        return setting;
                    }
                }
            }
        }
        return undefined;
    }
    /**
     * Should be of the format:
     * 	code://settings/settingName
     * Examples:
     * 	code://settings/files.autoSave
     *
     */
    async handleURL(uri) {
        if (compareIgnoreCase(uri.authority, SETTINGS_AUTHORITY) !== 0) {
            return false;
        }
        const settingInfo = uri.path.split('/').filter(part => !!part);
        const settingId = ((settingInfo.length > 0) ? settingInfo[0] : undefined);
        if (!settingId) {
            this.openSettings();
            return true;
        }
        let setting = this.getSetting(settingId);
        if (!setting && this.extensionService.extensions.length === 0) {
            // wait for extension points to be processed
            await this.progressService.withProgress({ location: 10 /* ProgressLocation.Window */ }, () => Event.toPromise(this.extensionService.onDidRegisterExtensions));
            setting = this.getSetting(settingId);
        }
        const openSettingsOptions = {};
        if (setting) {
            openSettingsOptions.query = settingId;
        }
        this.openSettings(openSettingsOptions);
        return true;
    }
    dispose() {
        if (this._cachedSettingsEditor2Input && !this._cachedSettingsEditor2Input.isDisposed()) {
            this._cachedSettingsEditor2Input.dispose();
        }
        this._onDispose.fire();
        super.dispose();
    }
};
PreferencesService = __decorate([
    __param(0, IEditorService),
    __param(1, IEditorGroupsService),
    __param(2, ITextFileService),
    __param(3, IConfigurationService),
    __param(4, INotificationService),
    __param(5, IWorkspaceContextService),
    __param(6, IInstantiationService),
    __param(7, IUserDataProfileService),
    __param(8, IUserDataProfilesService),
    __param(9, ITextModelService),
    __param(10, IKeybindingService),
    __param(11, IModelService),
    __param(12, IJSONEditingService),
    __param(13, ILabelService),
    __param(14, IRemoteAgentService),
    __param(15, ITextEditorService),
    __param(16, IURLService),
    __param(17, IExtensionService),
    __param(18, IProgressService),
    __param(19, IWorkbenchEnvironmentService)
], PreferencesService);
export { PreferencesService };
registerSingleton(IPreferencesService, PreferencesService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFlLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakYsT0FBTyxFQUFFLGFBQWEsRUFBZSxNQUFNLDZDQUE2QyxDQUFDO0FBRXpGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBMEIsdUJBQXVCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUVsSyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1B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