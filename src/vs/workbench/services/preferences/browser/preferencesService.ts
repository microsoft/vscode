/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import * as network from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { CoreEditingCommands } from '../../../../editor/browser/coreCommands.js';
import { getCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import * as nls from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions, getDefaultValue, IConfigurationRegistry, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorPane } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../editor/common/editorService.js';
import { KeybindingsEditorInput } from './keybindingsEditorInput.js';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IKeybindingsEditorPane, IOpenKeybindingsEditorOptions, IOpenSettingsOptions, IPreferencesEditorModel, IPreferencesService, ISetting, ISettingsEditorOptions, ISettingsGroup, SETTINGS_AUTHORITY, USE_SPLIT_JSON_SETTING, validateSettingsEditorOptions } from '../common/preferences.js';
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
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { findGroup } from '../../editor/common/editorGroupFinder.js';

const emptyEditableSettingsContent = '{\n}';

export class PreferencesService extends Disposable implements IPreferencesService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDispose = this._register(new Emitter<void>());

	private readonly _onDidDefaultSettingsContentChanged = this._register(new Emitter<URI>());
	readonly onDidDefaultSettingsContentChanged = this._onDidDefaultSettingsContentChanged.event;

	private _defaultUserSettingsContentModel: DefaultSettings | undefined;
	private _defaultWorkspaceSettingsContentModel: DefaultSettings | undefined;
	private _defaultFolderSettingsContentModel: DefaultSettings | undefined;

	private _defaultRawSettingsEditorModel: DefaultRawSettingsEditorModel | undefined;

	private readonly _requestedDefaultSettings = new ResourceSet();

	private _settingsGroups: ISettingsGroup[] | undefined = undefined;
	private _cachedSettingsEditor2Input: SettingsEditor2Input | undefined = undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@ILabelService private readonly labelService: ILabelService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@ITextEditorService private readonly textEditorService: ITextEditorService,
		@IURLService urlService: IURLService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProgressService private readonly progressService: IProgressService
	) {
		super();
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

	readonly defaultKeybindingsResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });
	private readonly defaultSettingsRawResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/defaultSettings.json' });

	get userSettingsResource(): URI {
		return this.userDataProfileService.currentProfile.settingsResource;
	}

	get workspaceSettingsResource(): URI | null {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return null;
		}
		const workspace = this.contextService.getWorkspace();
		return workspace.configuration || workspace.folders[0].toResource(FOLDER_SETTINGS_PATH);
	}

	private createOrGetCachedSettingsEditor2Input(): SettingsEditor2Input {
		if (!this._cachedSettingsEditor2Input || this._cachedSettingsEditor2Input.isDisposed()) {
			// Recreate the input if the user never opened the Settings editor,
			// or if they closed it and want to reopen it.
			this._cachedSettingsEditor2Input = new SettingsEditor2Input(this);
		}
		return this._cachedSettingsEditor2Input;
	}

	getFolderSettingsResource(resource: URI): URI | null {
		const folder = this.contextService.getWorkspaceFolder(resource);
		return folder ? folder.toResource(FOLDER_SETTINGS_PATH) : null;
	}

	hasDefaultSettingsContent(uri: URI): boolean {
		return this.isDefaultSettingsResource(uri) || isEqual(uri, this.defaultSettingsRawResource) || isEqual(uri, this.defaultKeybindingsResource);
	}

	getDefaultSettingsContent(uri: URI): string | undefined {
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
				this._defaultRawSettingsEditorModel = this._register(this.instantiationService.createInstance(DefaultRawSettingsEditorModel, this.getDefaultSettings(ConfigurationTarget.USER_LOCAL)));
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

	public async createPreferencesEditorModel(uri: URI): Promise<IPreferencesEditorModel<ISetting> | null> {
		if (this.isDefaultSettingsResource(uri)) {
			return this.createDefaultSettingsEditorModel(uri);
		}

		if (this.userSettingsResource.toString() === uri.toString() || this.userDataProfilesService.defaultProfile.settingsResource.toString() === uri.toString()) {
			return this.createEditableSettingsEditorModel(ConfigurationTarget.USER_LOCAL, uri);
		}

		const workspaceSettingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
		if (workspaceSettingsUri && workspaceSettingsUri.toString() === uri.toString()) {
			return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE, workspaceSettingsUri);
		}

		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const settingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, uri);
			if (settingsUri && settingsUri.toString() === uri.toString()) {
				return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE_FOLDER, uri);
			}
		}

		const remoteEnvironment = await this.remoteAgentService.getEnvironment();
		const remoteSettingsUri = remoteEnvironment ? remoteEnvironment.settingsPath : null;
		if (remoteSettingsUri && remoteSettingsUri.toString() === uri.toString()) {
			return this.createEditableSettingsEditorModel(ConfigurationTarget.USER_REMOTE, uri);
		}

		return null;
	}

	openRawDefaultSettings(): Promise<IEditorPane | undefined> {
		return this.editorService.openEditor({ resource: this.defaultSettingsRawResource });
	}

	openRawUserSettings(): Promise<IEditorPane | undefined> {
		return this.editorService.openEditor({ resource: this.userSettingsResource });
	}

	private shouldOpenJsonByDefault(): boolean {
		return this.configurationService.getValue('workbench.settings.editor') === 'json';
	}

	async openPreferences(): Promise<void> {
		await this.editorGroupService.activeGroup.openEditor(this.instantiationService.createInstance(PreferencesEditorInput));
	}

	openSettings(options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		options = {
			...options,
			target: ConfigurationTarget.USER_LOCAL,
		};
		if (options.query) {
			options.jsonEditor = false;
		}

		return this.open(this.userSettingsResource, options);
	}

	openLanguageSpecificSettings(languageId: string, options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		if (this.shouldOpenJsonByDefault()) {
			options.query = undefined;
			options.revealSetting = { key: `[${languageId}]`, edit: true };
		} else {
			options.query = `@lang:${languageId}${options.query ? ` ${options.query}` : ''}`;
		}
		options.target = options.target ?? ConfigurationTarget.USER_LOCAL;

		return this.open(this.userSettingsResource, options);
	}

	private open(settingsResource: URI, options: IOpenSettingsOptions): Promise<IEditorPane | undefined> {
		options = {
			...options,
			jsonEditor: options.jsonEditor ?? this.shouldOpenJsonByDefault()
		};

		return options.jsonEditor ?
			this.openSettingsJson(settingsResource, options) :
			this.openSettings2(options);
	}

	private async openSettings2(options: IOpenSettingsOptions): Promise<IEditorPane | undefined> {
		const input = this.createOrGetCachedSettingsEditor2Input();
		options = {
			...options,
			focusSearch: true
		};
		const group = await this.getEditorGroupFromOptions(options);
		return group.openEditor(input, validateSettingsEditorOptions(options));
	}

	openApplicationSettings(options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		options = {
			...options,
			target: ConfigurationTarget.USER_LOCAL,
		};
		return this.open(this.userDataProfilesService.defaultProfile.settingsResource, options);
	}

	openUserSettings(options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		options = {
			...options,
			target: ConfigurationTarget.USER_LOCAL,
		};
		return this.open(this.userSettingsResource, options);
	}

	async openRemoteSettings(options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		const environment = await this.remoteAgentService.getEnvironment();
		if (environment) {
			options = {
				...options,
				target: ConfigurationTarget.USER_REMOTE,
			};

			this.open(environment.settingsPath, options);
		}
		return undefined;
	}

	openWorkspaceSettings(options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		if (!this.workspaceSettingsResource) {
			this.notificationService.info(nls.localize('openFolderFirst', "Open a folder or workspace first to create workspace or folder settings."));
			return Promise.reject(null);
		}

		options = {
			...options,
			target: ConfigurationTarget.WORKSPACE
		};
		return this.open(this.workspaceSettingsResource, options);
	}

	async openFolderSettings(options: IOpenSettingsOptions = {}): Promise<IEditorPane | undefined> {
		options = {
			...options,
			target: ConfigurationTarget.WORKSPACE_FOLDER
		};

		if (!options.folderUri) {
			throw new Error(`Missing folder URI`);
		}

		const folderSettingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, options.folderUri);
		if (!folderSettingsUri) {
			throw new Error(`Invalid folder URI - ${options.folderUri.toString()}`);
		}

		return this.open(folderSettingsUri, options);
	}

	async openGlobalKeybindingSettings(textual: boolean, options?: IOpenKeybindingsEditorOptions): Promise<void> {
		options = { pinned: true, revealIfOpened: true, ...options };
		if (textual) {
			const emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to override the defaults") + '\n[\n]';
			const editableKeybindings = this.userDataProfileService.currentProfile.keybindingsResource;
			const openDefaultKeybindings = !!this.configurationService.getValue('workbench.settings.openDefaultKeybindings');

			// Create as needed and open in editor
			await this.createIfNotExists(editableKeybindings, emptyContents);
			if (openDefaultKeybindings) {
				const sourceGroupId = options.groupId ?? this.editorGroupService.activeGroup.id;
				const sideEditorGroup = this.editorGroupService.addGroup(sourceGroupId, GroupDirection.RIGHT);
				await Promise.all([
					this.editorService.openEditor({ resource: this.defaultKeybindingsResource, options: { pinned: true, preserveFocus: true, revealIfOpened: true, override: DEFAULT_EDITOR_ASSOCIATION.id }, label: nls.localize('defaultKeybindings', "Default Keybindings"), description: '' }, sourceGroupId),
					this.editorService.openEditor({ resource: editableKeybindings, options }, sideEditorGroup.id)
				]);
			} else {
				await this.editorService.openEditor({ resource: editableKeybindings, options }, options.groupId);
			}

		} else {
			const editor = (await this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { ...options }, options.groupId)) as IKeybindingsEditorPane;
			if (options.query) {
				editor.search(options.query);
			}
		}

	}

	openDefaultKeybindingsFile(): Promise<IEditorPane | undefined> {
		return this.editorService.openEditor({ resource: this.defaultKeybindingsResource, label: nls.localize('defaultKeybindings', "Default Keybindings") });
	}

	private async getEditorGroupFromOptions(options: IOpenSettingsOptions): Promise<IEditorGroup> {
		let group = options?.groupId !== undefined ? this.editorGroupService.getGroup(options.groupId) ?? this.editorGroupService.activeGroup : this.editorGroupService.activeGroup;
		if (options.openToSide) {
			group = (await this.instantiationService.invokeFunction(findGroup, {}, SIDE_GROUP))[0];
		}
		return group;
	}

	private async openSettingsJson(resource: URI, options: IOpenSettingsOptions): Promise<IEditorPane | undefined> {
		const group = await this.getEditorGroupFromOptions(options);
		const editor = await this.doOpenSettingsJson(resource, options, group);
		if (editor && options?.revealSetting) {
			await this.revealSetting(options.revealSetting.key, !!options.revealSetting.edit, editor, resource);
		}
		return editor;
	}

	private async doOpenSettingsJson(resource: URI, options: ISettingsEditorOptions, group: IEditorGroup): Promise<IEditorPane | undefined> {
		const openSplitJSON = !!this.configurationService.getValue(USE_SPLIT_JSON_SETTING);
		const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);
		if (openSplitJSON || openDefaultSettings) {
			return this.doOpenSplitJSON(resource, options, group);
		}

		const configurationTarget = options?.target ?? ConfigurationTarget.USER;
		const editableSettingsEditorInput = await this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource);
		options = { ...options, pinned: true };
		return await group.openEditor(editableSettingsEditorInput, { ...validateSettingsEditorOptions(options) });
	}

	private async doOpenSplitJSON(resource: URI, options: ISettingsEditorOptions = {}, group: IEditorGroup,): Promise<IEditorPane | undefined> {
		const configurationTarget = options.target ?? ConfigurationTarget.USER;
		await this.createSettingsIfNotExists(configurationTarget, resource);
		const preferencesEditorInput = this.createSplitJsonEditorInput(configurationTarget, resource);
		options = { ...options, pinned: true };
		return group.openEditor(preferencesEditorInput, validateSettingsEditorOptions(options));
	}

	public createSplitJsonEditorInput(configurationTarget: ConfigurationTarget, resource: URI): EditorInput {
		const editableSettingsEditorInput = this.textEditorService.createTextEditor({ resource });
		const defaultPreferencesEditorInput = this.textEditorService.createTextEditor({ resource: this.getDefaultSettingsResource(configurationTarget) });
		return this.instantiationService.createInstance(SideBySideEditorInput, editableSettingsEditorInput.getName(), undefined, defaultPreferencesEditorInput, editableSettingsEditorInput);
	}

	public createSettings2EditorModel(): Settings2EditorModel {
		return this.instantiationService.createInstance(Settings2EditorModel, this.getDefaultSettings(ConfigurationTarget.USER_LOCAL));
	}

	private getConfigurationTargetFromDefaultSettingsResource(uri: URI) {
		return this.isDefaultWorkspaceSettingsResource(uri) ?
			ConfigurationTarget.WORKSPACE :
			this.isDefaultFolderSettingsResource(uri) ?
				ConfigurationTarget.WORKSPACE_FOLDER :
				ConfigurationTarget.USER_LOCAL;
	}

	private isDefaultSettingsResource(uri: URI): boolean {
		return this.isDefaultUserSettingsResource(uri) || this.isDefaultWorkspaceSettingsResource(uri) || this.isDefaultFolderSettingsResource(uri);
	}

	private isDefaultUserSettingsResource(uri: URI): boolean {
		return uri.authority === 'defaultsettings' && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?settings\.json$/);
	}

	private isDefaultWorkspaceSettingsResource(uri: URI): boolean {
		return uri.authority === 'defaultsettings' && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?workspaceSettings\.json$/);
	}

	private isDefaultFolderSettingsResource(uri: URI): boolean {
		return uri.authority === 'defaultsettings' && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?resourceSettings\.json$/);
	}

	private getDefaultSettingsResource(configurationTarget: ConfigurationTarget): URI {
		switch (configurationTarget) {
			case ConfigurationTarget.WORKSPACE:
				return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/workspaceSettings.json` });
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/resourceSettings.json` });
		}
		return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/settings.json` });
	}

	private async getOrCreateEditableSettingsEditorInput(target: ConfigurationTarget, resource: URI): Promise<EditorInput> {
		await this.createSettingsIfNotExists(target, resource);
		return this.textEditorService.createTextEditor({ resource });
	}

	private async createEditableSettingsEditorModel(configurationTarget: ConfigurationTarget, settingsUri: URI): Promise<SettingsEditorModel> {
		const workspace = this.contextService.getWorkspace();
		if (workspace.configuration && workspace.configuration.toString() === settingsUri.toString()) {
			const reference = await this.textModelResolverService.createModelReference(settingsUri);
			return this.instantiationService.createInstance(WorkspaceConfigurationEditorModel, reference, configurationTarget);
		}

		const reference = await this.textModelResolverService.createModelReference(settingsUri);
		return this.instantiationService.createInstance(SettingsEditorModel, reference, configurationTarget);
	}

	private async createDefaultSettingsEditorModel(defaultSettingsUri: URI): Promise<DefaultSettingsEditorModel> {
		const reference = await this.textModelResolverService.createModelReference(defaultSettingsUri);
		const target = this.getConfigurationTargetFromDefaultSettingsResource(defaultSettingsUri);
		return this.instantiationService.createInstance(DefaultSettingsEditorModel, defaultSettingsUri, reference, this.getDefaultSettings(target));
	}

	private getDefaultSettings(target: ConfigurationTarget): DefaultSettings {
		if (target === ConfigurationTarget.WORKSPACE) {
			this._defaultWorkspaceSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
			return this._defaultWorkspaceSettingsContentModel;
		}
		if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
			this._defaultFolderSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
			return this._defaultFolderSettingsContentModel;
		}
		this._defaultUserSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
		return this._defaultUserSettingsContentModel;
	}

	public async getEditableSettingsURI(configurationTarget: ConfigurationTarget, resource?: URI): Promise<URI | null> {
		switch (configurationTarget) {
			case ConfigurationTarget.APPLICATION:
				return this.userDataProfilesService.defaultProfile.settingsResource;
			case ConfigurationTarget.USER:
			case ConfigurationTarget.USER_LOCAL:
				return this.userSettingsResource;
			case ConfigurationTarget.USER_REMOTE: {
				const remoteEnvironment = await this.remoteAgentService.getEnvironment();
				return remoteEnvironment ? remoteEnvironment.settingsPath : null;
			}
			case ConfigurationTarget.WORKSPACE:
				return this.workspaceSettingsResource;
			case ConfigurationTarget.WORKSPACE_FOLDER:
				if (resource) {
					return this.getFolderSettingsResource(resource);
				}
		}
		return null;
	}

	private async createSettingsIfNotExists(target: ConfigurationTarget, resource: URI): Promise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && target === ConfigurationTarget.WORKSPACE) {
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

	private async createIfNotExists(resource: URI, contents: string): Promise<void> {
		try {
			await this.textFileService.read(resource, { acceptTextOnly: true });
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				try {
					await this.textFileService.write(resource, contents);
					return;
				} catch (error2) {
					throw new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(resource, { relative: true }), getErrorMessage(error2)));
				}
			} else {
				throw error;
			}

		}
	}

	private getMostCommonlyUsedSettings(): string[] {
		return [
			'files.autoSave',
			'editor.fontSize',
			'editor.fontFamily',
			'editor.tabSize',
			'editor.renderWhitespace',
			'editor.cursorStyle',
			'editor.multiCursorModifier',
			'editor.insertSpaces',
			'editor.wordWrap',
			'files.exclude',
			'files.associations',
			'workbench.editor.enablePreview'
		];
	}

	private async revealSetting(settingKey: string, edit: boolean, editor: IEditorPane, settingsResource: URI): Promise<void> {
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

	private async getPositionToReveal(settingKey: string, edit: boolean, settingsModel: IPreferencesEditorModel<ISetting>, codeEditor: ICodeEditor): Promise<IPosition | null> {
		const model = codeEditor.getModel();
		if (!model) {
			return null;
		}
		const schema = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[settingKey];
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
				await this.jsonEditingService.write(settingsModel.uri!, [{ path: key, value: defaultValue }], false);
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
				} else {
					position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.endColumn };
				}
			} else {
				position = { lineNumber: setting.keyRange.startLineNumber, column: setting.keyRange.startColumn };
			}
		}

		return position;
	}

	getSetting(settingId: string): ISetting | undefined {
		if (!this._settingsGroups) {
			const defaultSettings = this.getDefaultSettings(ConfigurationTarget.USER);
			const defaultsChangedDisposable: MutableDisposable<IDisposable> = this._register(new MutableDisposable());
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
	async handleURL(uri: URI): Promise<boolean> {
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
			await this.progressService.withProgress({ location: ProgressLocation.Window }, () => Event.toPromise(this.extensionService.onDidRegisterExtensions));
			setting = this.getSetting(settingId);
		}

		const openSettingsOptions: IOpenSettingsOptions = {};
		if (setting) {
			openSettingsOptions.query = settingId;
		}

		this.openSettings(openSettingsOptions);
		return true;
	}

	public override dispose(): void {
		if (this._cachedSettingsEditor2Input && !this._cachedSettingsEditor2Input.isDisposed()) {
			this._cachedSettingsEditor2Input.dispose();
		}
		this._onDispose.fire();
		super.dispose();
	}
}

registerSingleton(IPreferencesService, PreferencesService, InstantiationType.Delayed);
