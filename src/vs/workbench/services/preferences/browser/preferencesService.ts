/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { parse } from 'vs/base/common/json';
import { Disposable } from 'vs/base/common/lifecycle';
import * as network from 'vs/base/common/network';
import { assign } from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { getCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { EditorInput, IEditor } from 'vs/workbench/common/editor';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, getSettingsTargetName, IPreferencesEditorModel, IPreferencesService, ISetting, ISettingsEditorOptions, SettingsEditorOptions, USE_SPLIT_JSON_SETTING } from 'vs/workbench/services/preferences/common/preferences';
import { DefaultPreferencesEditorInput, KeybindingsEditorInput, PreferencesEditorInput, SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { defaultKeybindingsContents, DefaultKeybindingsEditorModel, DefaultSettings, DefaultSettingsEditorModel, Settings2EditorModel, SettingsEditorModel, WorkspaceConfigurationEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';

const emptyEditableSettingsContent = '{\n}';

export class PreferencesService extends Disposable implements IPreferencesService {

	_serviceBrand: any;

	private lastOpenedSettingsInput: PreferencesEditorInput | null = null;

	private readonly _onDispose = new Emitter<void>();

	private _defaultUserSettingsUriCounter = 0;
	private _defaultUserSettingsContentModel: DefaultSettings;
	private _defaultWorkspaceSettingsUriCounter = 0;
	private _defaultWorkspaceSettingsContentModel: DefaultSettings;
	private _defaultFolderSettingsUriCounter = 0;
	private _defaultFolderSettingsContentModel: DefaultSettings;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IModeService private readonly modeService: IModeService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
		// The default keybindings.json updates based on keyboard layouts, so here we make sure
		// if a model has been given out we update it accordingly.
		keybindingService.onDidUpdateKeybindings(() => {
			const model = modelService.getModel(this.defaultKeybindingsResource);
			if (!model) {
				// model has not been given out => nothing to do
				return;
			}
			modelService.updateModel(model, defaultKeybindingsContents(keybindingService));
		});
	}

	readonly defaultKeybindingsResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });
	private readonly defaultSettingsRawResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/defaultSettings.json' });

	get userSettingsResource(): URI {
		return this.getEditableSettingsURI(ConfigurationTarget.USER);
	}

	get workspaceSettingsResource(): URI {
		return this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
	}

	get settingsEditor2Input(): SettingsEditor2Input {
		return this.instantiationService.createInstance(SettingsEditor2Input);
	}

	getFolderSettingsResource(resource: URI): URI {
		return this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, resource);
	}

	resolveModel(uri: URI): Promise<ITextModel> {
		if (this.isDefaultSettingsResource(uri)) {

			const target = this.getConfigurationTargetFromDefaultSettingsResource(uri);
			const languageSelection = this.modeService.create('jsonc');
			const model = this._register(this.modelService.createModel('', languageSelection, uri));

			let defaultSettings: DefaultSettings;
			this.configurationService.onDidChangeConfiguration(e => {
				if (e.source === ConfigurationTarget.DEFAULT) {
					const model = this.modelService.getModel(uri);
					if (!model) {
						// model has not been given out => nothing to do
						return;
					}
					defaultSettings = this.getDefaultSettings(target);
					this.modelService.updateModel(model, defaultSettings.getContent(true));
					defaultSettings._onDidChange.fire();
				}
			});

			// Check if Default settings is already created and updated in above promise
			if (!defaultSettings) {
				defaultSettings = this.getDefaultSettings(target);
				this.modelService.updateModel(model, defaultSettings.getContent(true));
			}

			return Promise.resolve(model);
		}

		if (this.defaultSettingsRawResource.toString() === uri.toString()) {
			let defaultSettings: DefaultSettings = this.getDefaultSettings(ConfigurationTarget.USER);
			const languageSelection = this.modeService.create('jsonc');
			const model = this._register(this.modelService.createModel(defaultSettings.raw, languageSelection, uri));
			return Promise.resolve(model);
		}

		if (this.defaultKeybindingsResource.toString() === uri.toString()) {
			const defaultKeybindingsEditorModel = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
			const languageSelection = this.modeService.create('jsonc');
			const model = this._register(this.modelService.createModel(defaultKeybindingsEditorModel.content, languageSelection, uri));
			return Promise.resolve(model);
		}

		return Promise.resolve(null);
	}

	createPreferencesEditorModel(uri: URI): Promise<IPreferencesEditorModel<any>> {
		if (this.isDefaultSettingsResource(uri)) {
			return this.createDefaultSettingsEditorModel(uri);
		}

		if (this.getEditableSettingsURI(ConfigurationTarget.USER).toString() === uri.toString()) {
			return this.createEditableSettingsEditorModel(ConfigurationTarget.USER, uri);
		}

		const workspaceSettingsUri = this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
		if (workspaceSettingsUri && workspaceSettingsUri.toString() === uri.toString()) {
			return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE, workspaceSettingsUri);
		}

		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE_FOLDER, uri);
		}

		return Promise.resolve<IPreferencesEditorModel<any>>(null);
	}

	openRawDefaultSettings(): Promise<IEditor> {
		return this.editorService.openEditor({ resource: this.defaultSettingsRawResource });
	}

	openRawUserSettings(): Promise<IEditor> {
		return this.editorService.openEditor({ resource: this.userSettingsResource });
	}

	openSettings(jsonEditor?: boolean): Promise<IEditor> {
		jsonEditor = typeof jsonEditor === 'undefined' ?
			this.configurationService.getValue('workbench.settings.editor') === 'json' :
			jsonEditor;

		if (!jsonEditor) {
			return this.openSettings2();
		}

		const editorInput = this.getActiveSettingsEditorInput() || this.lastOpenedSettingsInput;
		const resource = editorInput ? editorInput.master.getResource() : this.userSettingsResource;
		const target = this.getConfigurationTargetFromSettingsResource(resource);
		return this.openOrSwitchSettings(target, resource);
	}

	private openSettings2(): Promise<IEditor> {
		const input = this.settingsEditor2Input;
		return this.editorGroupService.activeGroup.openEditor(input)
			.then(() => this.editorGroupService.activeGroup.activeControl);
	}

	openGlobalSettings(jsonEditor?: boolean, options?: ISettingsEditorOptions, group?: IEditorGroup): Promise<IEditor> {
		jsonEditor = typeof jsonEditor === 'undefined' ?
			this.configurationService.getValue('workbench.settings.editor') === 'json' :
			jsonEditor;

		return jsonEditor ?
			this.openOrSwitchSettings(ConfigurationTarget.USER, this.userSettingsResource, options, group) :
			this.openOrSwitchSettings2(ConfigurationTarget.USER, undefined, options, group);
	}

	openWorkspaceSettings(jsonEditor?: boolean, options?: ISettingsEditorOptions, group?: IEditorGroup): Promise<IEditor | null> {
		jsonEditor = typeof jsonEditor === 'undefined' ?
			this.configurationService.getValue('workbench.settings.editor') === 'json' :
			jsonEditor;

		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));
			return Promise.resolve(null);
		}

		return jsonEditor ?
			this.openOrSwitchSettings(ConfigurationTarget.WORKSPACE, this.workspaceSettingsResource, options, group) :
			this.openOrSwitchSettings2(ConfigurationTarget.WORKSPACE, undefined, options, group);
	}

	openFolderSettings(folder: URI, jsonEditor?: boolean, options?: ISettingsEditorOptions, group?: IEditorGroup): Promise<IEditor> {
		jsonEditor = typeof jsonEditor === 'undefined' ?
			this.configurationService.getValue('workbench.settings.editor') === 'json' :
			jsonEditor;

		return jsonEditor ?
			this.openOrSwitchSettings(ConfigurationTarget.WORKSPACE_FOLDER, this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, folder), options, group) :
			this.openOrSwitchSettings2(ConfigurationTarget.WORKSPACE_FOLDER, folder, options, group);
	}

	switchSettings(target: ConfigurationTarget, resource: URI, jsonEditor?: boolean): Promise<void> {
		if (!jsonEditor) {
			return this.doOpenSettings2(target, resource).then(() => null);
		}

		const activeControl = this.editorService.activeControl;
		if (activeControl && activeControl.input instanceof PreferencesEditorInput) {
			return this.doSwitchSettings(target, resource, activeControl.input, activeControl.group).then(() => null);
		} else {
			return this.doOpenSettings(target, resource).then(() => null);
		}
	}

	openGlobalKeybindingSettings(textual: boolean): Promise<void> {
		/* __GDPR__
			"openKeybindings" : {
				"textual" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('openKeybindings', { textual });
		if (textual) {
			const emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to override the defaults") + '\n[\n]';
			const editableKeybindings = URI.file(this.environmentService.appKeybindingsPath);
			const openDefaultKeybindings = !!this.configurationService.getValue('workbench.settings.openDefaultKeybindings');

			// Create as needed and open in editor
			return this.createIfNotExists(editableKeybindings, emptyContents).then(() => {
				if (openDefaultKeybindings) {
					const activeEditorGroup = this.editorGroupService.activeGroup;
					const sideEditorGroup = this.editorGroupService.addGroup(activeEditorGroup.id, GroupDirection.RIGHT);
					return Promise.all([
						this.editorService.openEditor({ resource: this.defaultKeybindingsResource, options: { pinned: true, preserveFocus: true, revealIfOpened: true }, label: nls.localize('defaultKeybindings', "Default Keybindings"), description: '' }),
						this.editorService.openEditor({ resource: editableKeybindings, options: { pinned: true, revealIfOpened: true } }, sideEditorGroup.id)
					]).then(editors => undefined);
				} else {
					return this.editorService.openEditor({ resource: editableKeybindings, options: { pinned: true, revealIfOpened: true } }).then(() => undefined);
				}
			});
		}

		return this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { pinned: true, revealIfOpened: true }).then(() => null);
	}

	openDefaultKeybindingsFile(): Promise<IEditor> {
		return this.editorService.openEditor({ resource: this.defaultKeybindingsResource, label: nls.localize('defaultKeybindings', "Default Keybindings") });
	}

	configureSettingsForLanguage(language: string): void {
		this.openGlobalSettings(true)
			.then(editor => this.createPreferencesEditorModel(this.userSettingsResource)
				.then((settingsModel: IPreferencesEditorModel<ISetting>) => {
					const codeEditor = getCodeEditor(editor.getControl());
					if (codeEditor) {
						this.addLanguageOverrideEntry(language, settingsModel, codeEditor)
							.then(position => {
								if (codeEditor) {
									codeEditor.setPosition(position);
									codeEditor.revealLine(position.lineNumber);
									codeEditor.focus();
								}
							});
					}
				}));
	}

	private openOrSwitchSettings(configurationTarget: ConfigurationTarget, resource: URI, options?: ISettingsEditorOptions, group: IEditorGroup = this.editorGroupService.activeGroup): Promise<IEditor> {
		const editorInput = this.getActiveSettingsEditorInput(group);
		if (editorInput && editorInput.master.getResource().fsPath !== resource.fsPath) {
			return this.doSwitchSettings(configurationTarget, resource, editorInput, group, options);
		}
		return this.doOpenSettings(configurationTarget, resource, options, group);
	}

	private openOrSwitchSettings2(configurationTarget: ConfigurationTarget, folderUri?: URI, options?: ISettingsEditorOptions, group: IEditorGroup = this.editorGroupService.activeGroup): Promise<IEditor> {
		return this.doOpenSettings2(configurationTarget, folderUri, options, group);
	}

	private doOpenSettings(configurationTarget: ConfigurationTarget, resource: URI, options?: ISettingsEditorOptions, group?: IEditorGroup): Promise<IEditor> {
		const openSplitJSON = !!this.configurationService.getValue(USE_SPLIT_JSON_SETTING);
		if (openSplitJSON) {
			return this.doOpenSplitJSON(configurationTarget, resource, options, group);
		}

		const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);

		return this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource)
			.then(editableSettingsEditorInput => {
				if (!options) {
					options = { pinned: true };
				} else {
					options = assign(options, { pinned: true });
				}

				if (openDefaultSettings) {
					const activeEditorGroup = this.editorGroupService.activeGroup;
					const sideEditorGroup = this.editorGroupService.addGroup(activeEditorGroup.id, GroupDirection.RIGHT);
					return Promise.all([
						this.editorService.openEditor({ resource: this.defaultSettingsRawResource, options: { pinned: true, preserveFocus: true, revealIfOpened: true }, label: nls.localize('defaultSettings', "Default Settings"), description: '' }),
						this.editorService.openEditor(editableSettingsEditorInput, { pinned: true, revealIfOpened: true }, sideEditorGroup.id)
					]).then(() => null);
				} else {
					return this.editorService.openEditor(editableSettingsEditorInput, SettingsEditorOptions.create(options), group);
				}
			});
	}

	private doOpenSplitJSON(configurationTarget: ConfigurationTarget, resource: URI, options?: ISettingsEditorOptions, group?: IEditorGroup): Promise<IEditor> {
		return this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource)
			.then(editableSettingsEditorInput => {
				if (!options) {
					options = { pinned: true };
				} else {
					options = assign(options, { pinned: true });
				}

				const defaultPreferencesEditorInput = this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.getDefaultSettingsResource(configurationTarget));
				const preferencesEditorInput = new PreferencesEditorInput(this.getPreferencesEditorInputName(configurationTarget, resource), editableSettingsEditorInput.getDescription(), defaultPreferencesEditorInput, <EditorInput>editableSettingsEditorInput);
				this.lastOpenedSettingsInput = preferencesEditorInput;
				return this.editorService.openEditor(preferencesEditorInput, SettingsEditorOptions.create(options), group);
			});
	}

	public createSettings2EditorModel(): Settings2EditorModel {
		return this.instantiationService.createInstance(Settings2EditorModel, this.getDefaultSettings(ConfigurationTarget.USER));
	}

	private doOpenSettings2(target: ConfigurationTarget, folderUri: URI | undefined, options?: IEditorOptions, group?: IEditorGroup): Promise<IEditor> {
		const input = this.settingsEditor2Input;
		const settingsOptions: ISettingsEditorOptions = {
			...options,
			target,
			folderUri
		};

		return this.editorService.openEditor(input, SettingsEditorOptions.create(settingsOptions), group);
	}

	private doSwitchSettings(target: ConfigurationTarget, resource: URI, input: PreferencesEditorInput, group: IEditorGroup, options?: ISettingsEditorOptions): Promise<IEditor> {
		return this.getOrCreateEditableSettingsEditorInput(target, this.getEditableSettingsURI(target, resource))
			.then(toInput => {
				return group.openEditor(input).then(() => {
					const replaceWith = new PreferencesEditorInput(this.getPreferencesEditorInputName(target, resource), toInput.getDescription(), this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.getDefaultSettingsResource(target)), toInput);

					return group.replaceEditors([{
						editor: input,
						replacement: replaceWith,
						options: SettingsEditorOptions.create(options)
					}]).then(() => {
						this.lastOpenedSettingsInput = replaceWith;
						return group.activeControl;
					});
				});
			});
	}

	private getActiveSettingsEditorInput(group: IEditorGroup = this.editorGroupService.activeGroup): PreferencesEditorInput {
		return <PreferencesEditorInput>group.editors.filter(e => e instanceof PreferencesEditorInput)[0];
	}

	private getConfigurationTargetFromSettingsResource(resource: URI): ConfigurationTarget {
		if (this.userSettingsResource.toString() === resource.toString()) {
			return ConfigurationTarget.USER;
		}

		const workspaceSettingsResource = this.workspaceSettingsResource;
		if (workspaceSettingsResource && workspaceSettingsResource.toString() === resource.toString()) {
			return ConfigurationTarget.WORKSPACE;
		}

		const folder = this.contextService.getWorkspaceFolder(resource);
		if (folder) {
			return ConfigurationTarget.WORKSPACE_FOLDER;
		}

		return ConfigurationTarget.USER;
	}

	private getConfigurationTargetFromDefaultSettingsResource(uri: URI) {
		return this.isDefaultWorkspaceSettingsResource(uri) ? ConfigurationTarget.WORKSPACE : this.isDefaultFolderSettingsResource(uri) ? ConfigurationTarget.WORKSPACE_FOLDER : ConfigurationTarget.USER;
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
				return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/${this._defaultWorkspaceSettingsUriCounter++}/workspaceSettings.json` });
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/${this._defaultFolderSettingsUriCounter++}/resourceSettings.json` });
		}
		return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: `/${this._defaultUserSettingsUriCounter++}/settings.json` });
	}

	private getPreferencesEditorInputName(target: ConfigurationTarget, resource: URI): string {
		const name = getSettingsTargetName(target, resource, this.contextService);
		return target === ConfigurationTarget.WORKSPACE_FOLDER ? nls.localize('folderSettingsName', "{0} (Folder Settings)", name) : name;
	}

	private getOrCreateEditableSettingsEditorInput(target: ConfigurationTarget, resource: URI): Promise<EditorInput> {
		return this.createSettingsIfNotExists(target, resource)
			.then(() => <EditorInput>this.editorService.createInput({ resource }));
	}

	private createEditableSettingsEditorModel(configurationTarget: ConfigurationTarget, resource: URI): Promise<SettingsEditorModel> {
		const settingsUri = this.getEditableSettingsURI(configurationTarget, resource);
		if (settingsUri) {
			const workspace = this.contextService.getWorkspace();
			if (workspace.configuration && workspace.configuration.toString() === settingsUri.toString()) {
				return this.textModelResolverService.createModelReference(settingsUri)
					.then(reference => this.instantiationService.createInstance(WorkspaceConfigurationEditorModel, reference, configurationTarget));
			}
			return this.textModelResolverService.createModelReference(settingsUri)
				.then(reference => this.instantiationService.createInstance(SettingsEditorModel, reference, configurationTarget));
		}
		return Promise.resolve<SettingsEditorModel>(null);
	}

	private createDefaultSettingsEditorModel(defaultSettingsUri: URI): Promise<DefaultSettingsEditorModel> {
		return this.textModelResolverService.createModelReference(defaultSettingsUri)
			.then(reference => {
				const target = this.getConfigurationTargetFromDefaultSettingsResource(defaultSettingsUri);
				return this.instantiationService.createInstance(DefaultSettingsEditorModel, defaultSettingsUri, reference, this.getDefaultSettings(target));
			});
	}

	private getDefaultSettings(target: ConfigurationTarget): DefaultSettings {
		if (target === ConfigurationTarget.WORKSPACE) {
			if (!this._defaultWorkspaceSettingsContentModel) {
				this._defaultWorkspaceSettingsContentModel = new DefaultSettings(this.getMostCommonlyUsedSettings(), target);
			}
			return this._defaultWorkspaceSettingsContentModel;
		}
		if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
			if (!this._defaultFolderSettingsContentModel) {
				this._defaultFolderSettingsContentModel = new DefaultSettings(this.getMostCommonlyUsedSettings(), target);
			}
			return this._defaultFolderSettingsContentModel;
		}
		if (!this._defaultUserSettingsContentModel) {
			this._defaultUserSettingsContentModel = new DefaultSettings(this.getMostCommonlyUsedSettings(), target);
		}
		return this._defaultUserSettingsContentModel;
	}

	private getEditableSettingsURI(configurationTarget: ConfigurationTarget, resource?: URI): URI {
		switch (configurationTarget) {
			case ConfigurationTarget.USER:
				return URI.file(this.environmentService.appSettingsPath);
			case ConfigurationTarget.WORKSPACE:
				if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
					return null;
				}
				const workspace = this.contextService.getWorkspace();
				return workspace.configuration || workspace.folders[0].toResource(FOLDER_SETTINGS_PATH);
			case ConfigurationTarget.WORKSPACE_FOLDER:
				const folder = this.contextService.getWorkspaceFolder(resource);
				return folder ? folder.toResource(FOLDER_SETTINGS_PATH) : null;
		}
		return null;
	}

	private createSettingsIfNotExists(target: ConfigurationTarget, resource: URI): Promise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && target === ConfigurationTarget.WORKSPACE) {
			const workspaceConfig = this.contextService.getWorkspace().configuration;
			if (!workspaceConfig) {
				return Promise.resolve(undefined);
			}

			return this.fileService.resolveContent(workspaceConfig)
				.then(content => {
					if (Object.keys(parse(content.value)).indexOf('settings') === -1) {
						return this.jsonEditingService.write(resource, { key: 'settings', value: {} }, true).then(undefined, () => { });
					}
					return null;
				});
		}
		return this.createIfNotExists(resource, emptyEditableSettingsContent).then(() => { });
	}

	private createIfNotExists(resource: URI, contents: string): Promise<any> {
		return this.fileService.resolveContent(resource, { acceptTextOnly: true }).then(undefined, error => {
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return this.fileService.updateContent(resource, contents).then(undefined, error => {
					return Promise.reject(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(resource, { relative: true }), error)));
				});
			}

			return Promise.reject(error);
		});
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
			'files.associations'
		];
	}

	private addLanguageOverrideEntry(language: string, settingsModel: IPreferencesEditorModel<ISetting>, codeEditor: ICodeEditor): Promise<IPosition> {
		const languageKey = `[${language}]`;
		let setting = settingsModel.getPreference(languageKey);
		const model = codeEditor.getModel();
		const configuration = this.configurationService.getValue<{ editor: { tabSize: number; insertSpaces: boolean } }>();
		const eol = model.getEOL();
		if (setting) {
			if (setting.overrides.length) {
				const lastSetting = setting.overrides[setting.overrides.length - 1];
				return Promise.resolve({ lineNumber: lastSetting.valueRange.endLineNumber, column: model.getLineMaxColumn(lastSetting.valueRange.endLineNumber) });
			}
			return Promise.resolve({ lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 });
		}
		return this.configurationService.updateValue(languageKey, {}, ConfigurationTarget.USER)
			.then(() => {
				setting = settingsModel.getPreference(languageKey);
				let content = eol + this.spaces(2, configuration.editor) + eol + this.spaces(1, configuration.editor);
				let editOperation = EditOperation.insert(new Position(setting.valueRange.endLineNumber, setting.valueRange.endColumn - 1), content);
				model.pushEditOperations([], [editOperation], () => []);
				let lineNumber = setting.valueRange.endLineNumber + 1;
				settingsModel.dispose();
				return { lineNumber, column: model.getLineMaxColumn(lineNumber) };
			});
	}

	private spaces(count: number, { tabSize, insertSpaces }: { tabSize: number; insertSpaces: boolean }): string {
		return insertSpaces ? strings.repeat(' ', tabSize * count) : strings.repeat('\t', count);
	}

	public dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}
}
