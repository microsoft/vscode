/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as network from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { EditorInput, IEditor } from 'vs/workbench/common/editor';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { ITextModel } from 'vs/editor/common/model';
import { IFileService, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IPreferencesService, IPreferencesEditorModel, ISetting, getSettingsTargetName, FOLDER_SETTINGS_PATH, DEFAULT_SETTINGS_EDITOR_SETTING } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel, DefaultKeybindingsEditorModel, defaultKeybindingsContents, DefaultSettings, WorkspaceConfigurationEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DefaultPreferencesEditorInput, PreferencesEditorInput, KeybindingsEditorInput, SettingsEditor2Input } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { parse } from 'vs/base/common/json';
import { ICodeEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { assign } from 'vs/base/common/objects';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroup, IEditorGroupsService, GroupDirection } from 'vs/workbench/services/group/common/editorGroupsService';
import { ILabelService } from 'vs/platform/label/common/label';

const emptyEditableSettingsContent = '{\n}';

export class PreferencesService extends Disposable implements IPreferencesService {

	_serviceBrand: any;

	private lastOpenedSettingsInput: PreferencesEditorInput = null;
	private lastOpenedSettings2Input: SettingsEditor2Input = null;

	private readonly _onDispose: Emitter<void> = new Emitter<void>();

	private _defaultUserSettingsUriCounter = 0;
	private _defaultUserSettingsContentModel: DefaultSettings;
	private _defaultWorkspaceSettingsUriCounter = 0;
	private _defaultWorkspaceSettingsContentModel: DefaultSettings;
	private _defaultFolderSettingsUriCounter = 0;
	private _defaultFolderSettingsContentModel: DefaultSettings;

	constructor(
		@IEditorService private editorService: IEditorService,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
		@IFileService private fileService: IFileService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@INotificationService private notificationService: INotificationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService private modelService: IModelService,
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@IModeService private modeService: IModeService,
		@ILabelService private labelService: ILabelService
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

	getFolderSettingsResource(resource: URI): URI {
		return this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, resource);
	}

	resolveModel(uri: URI): TPromise<ITextModel> {
		if (this.isDefaultSettingsResource(uri)) {

			const target = this.getConfigurationTargetFromDefaultSettingsResource(uri);
			const mode = this.modeService.getOrCreateMode('jsonc');
			const model = this._register(this.modelService.createModel('', mode, uri));

			let defaultSettings: DefaultSettings;
			this.configurationService.onDidChangeConfiguration(e => {
				if (e.source === ConfigurationTarget.DEFAULT) {
					const model = this.modelService.getModel(uri);
					if (!model) {
						// model has not been given out => nothing to do
						return;
					}
					defaultSettings = this.getDefaultSettings(target);
					this.modelService.updateModel(model, defaultSettings.parse());
					defaultSettings._onDidChange.fire();
				}
			});

			// Check if Default settings is already created and updated in above promise
			if (!defaultSettings) {
				defaultSettings = this.getDefaultSettings(target);
				this.modelService.updateModel(model, defaultSettings.parse());
			}

			return TPromise.as(model);
		}

		if (this.defaultSettingsRawResource.toString() === uri.toString()) {
			let defaultSettings: DefaultSettings = this.getDefaultSettings(ConfigurationTarget.USER);
			const mode = this.modeService.getOrCreateMode('jsonc');
			const model = this._register(this.modelService.createModel(defaultSettings.raw, mode, uri));
			return TPromise.as(model);
		}

		if (this.defaultKeybindingsResource.toString() === uri.toString()) {
			const defaultKeybindingsEditorModel = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
			const mode = this.modeService.getOrCreateMode('jsonc');
			const model = this._register(this.modelService.createModel(defaultKeybindingsEditorModel.content, mode, uri));
			return TPromise.as(model);
		}

		return TPromise.as(null);
	}

	createPreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel<any>> {
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

		return TPromise.wrap<IPreferencesEditorModel<any>>(null);
	}

	openRawDefaultSettings(): TPromise<IEditor> {
		return this.editorService.openEditor({ resource: this.defaultSettingsRawResource });
	}

	openRawUserSettings(): TPromise<IEditor> {
		return this.editorService.openEditor({ resource: this.userSettingsResource });
	}

	openSettings(jsonEditor?: boolean): TPromise<IEditor> {
		if (!jsonEditor) {
			return this.openSettings2();
		}

		const editorInput = this.getActiveSettingsEditorInput() || this.lastOpenedSettingsInput;
		const resource = editorInput ? editorInput.master.getResource() : this.userSettingsResource;
		const target = this.getConfigurationTargetFromSettingsResource(resource);
		return this.openOrSwitchSettings(target, resource);
	}

	private openSettings2(): TPromise<IEditor> {
		const editorInput = this.getActiveSettingsEditor2Input() || this.lastOpenedSettings2Input;
		const resource = editorInput ? editorInput.getResource() : this.userSettingsResource;
		const target = this.getConfigurationTargetFromSettingsResource(resource);
		return this.openOrSwitchSettings2(target);
	}

	openGlobalSettings(jsonEditor?: boolean, options?: IEditorOptions, group?: IEditorGroup): TPromise<IEditor> {
		return jsonEditor ?
			this.openOrSwitchSettings(ConfigurationTarget.USER, this.userSettingsResource, options, group) :
			this.openOrSwitchSettings2(ConfigurationTarget.USER, options, group);
	}

	openWorkspaceSettings(jsonEditor?: boolean, options?: IEditorOptions, group?: IEditorGroup): TPromise<IEditor> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));
			return TPromise.as(null);
		}

		return jsonEditor ?
			this.openOrSwitchSettings(ConfigurationTarget.WORKSPACE, this.workspaceSettingsResource, options, group) :
			this.openOrSwitchSettings2(ConfigurationTarget.WORKSPACE, options, group);
	}

	openFolderSettings(folder: URI, jsonEditor?: boolean, options?: IEditorOptions, group?: IEditorGroup): TPromise<IEditor> {
		return jsonEditor ?
			this.openOrSwitchSettings(ConfigurationTarget.WORKSPACE_FOLDER, this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, folder), options, group) :
			this.openOrSwitchSettings2(ConfigurationTarget.WORKSPACE_FOLDER, options, group);
	}

	switchSettings(target: ConfigurationTarget, resource: URI, jsonEditor?: boolean): TPromise<void> {
		if (!jsonEditor) {
			return this.switchSettings2(target);
		}

		const activeControl = this.editorService.activeControl;
		if (activeControl && activeControl.input instanceof PreferencesEditorInput) {
			return this.doSwitchSettings(target, resource, activeControl.input, activeControl.group).then(() => null);
		} else {
			return this.doOpenSettings(target, resource).then(() => null);
		}
	}

	switchSettings2(target: ConfigurationTarget): TPromise<void> {
		const activeControl = this.editorService.activeControl;
		const resource = this.getDefaultSettingsResource(target);
		if (activeControl && activeControl.input instanceof SettingsEditor2Input) {
			return this.doSwitchSettings2(resource, activeControl.input, activeControl.group).then(() => null);
		} else {
			return this.doOpenSettings2(resource).then(() => null);
		}
	}

	openGlobalKeybindingSettings(textual: boolean): TPromise<void> {
		/* __GDPR__
			"openKeybindings" : {
				"textual" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('openKeybindings', { textual });
		if (textual) {
			const emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to overwrite the defaults") + '\n[\n]';
			const editableKeybindings = URI.file(this.environmentService.appKeybindingsPath);
			const openDefaultKeybindings = !!this.configurationService.getValue('workbench.settings.openDefaultKeybindings');

			// Create as needed and open in editor
			return this.createIfNotExists(editableKeybindings, emptyContents).then(() => {
				if (openDefaultKeybindings) {
					const activeEditorGroup = this.editorGroupService.activeGroup;
					const sideEditorGroup = this.editorGroupService.addGroup(activeEditorGroup.id, GroupDirection.RIGHT);
					return TPromise.join([
						this.editorService.openEditor({ resource: this.defaultKeybindingsResource, options: { pinned: true, preserveFocus: true }, label: nls.localize('defaultKeybindings', "Default Keybindings"), description: '' }),
						this.editorService.openEditor({ resource: editableKeybindings, options: { pinned: true } }, sideEditorGroup.id)
					]).then(editors => void 0);
				} else {
					return this.editorService.openEditor({ resource: editableKeybindings, options: { pinned: true } }).then(() => void 0);
				}
			});
		}

		return this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { pinned: true }).then(() => null);
	}

	openDefaultKeybindingsFile(): TPromise<IEditor> {
		return this.editorService.openEditor({ resource: this.defaultKeybindingsResource });
	}

	configureSettingsForLanguage(language: string): void {
		this.openGlobalSettings()
			.then(editor => this.createPreferencesEditorModel(this.userSettingsResource)
				.then((settingsModel: IPreferencesEditorModel<ISetting>) => {
					const codeEditor = getCodeEditor(editor.getControl());
					if (codeEditor) {
						this.getPosition(language, settingsModel, codeEditor)
							.then(position => {
								if (codeEditor) {
									codeEditor.setPosition(position);
									codeEditor.focus();
								}
							});
					}
				}));
	}

	private openOrSwitchSettings(configurationTarget: ConfigurationTarget, resource: URI, options?: IEditorOptions, group: IEditorGroup = this.editorGroupService.activeGroup): TPromise<IEditor> {
		const editorInput = this.getActiveSettingsEditorInput(group);
		if (editorInput && editorInput.master.getResource().fsPath !== resource.fsPath) {
			return this.doSwitchSettings(configurationTarget, resource, editorInput, group);
		}
		return this.doOpenSettings(configurationTarget, resource, options, group);
	}

	private openOrSwitchSettings2(configurationTarget: ConfigurationTarget, options?: IEditorOptions, group: IEditorGroup = this.editorGroupService.activeGroup): TPromise<IEditor> {
		const editorInput = this.getActiveSettingsEditor2Input(group);
		const resource = this.getDefaultSettingsResource(configurationTarget);
		if (editorInput && editorInput.getResource().fsPath !== resource.fsPath) {
			return this.doSwitchSettings2(resource, editorInput, group);
		}

		return this.doOpenSettings2(resource, options, group);
	}

	private doOpenSettings(configurationTarget: ConfigurationTarget, resource: URI, options?: IEditorOptions, group?: IEditorGroup): TPromise<IEditor> {
		const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);
		return this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource)
			.then(editableSettingsEditorInput => {
				if (!options) {
					options = { pinned: true };
				} else {
					options = assign(options, { pinned: true });
				}

				if (openDefaultSettings) {
					const defaultPreferencesEditorInput = this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.getDefaultSettingsResource(configurationTarget));
					const preferencesEditorInput = new PreferencesEditorInput(this.getPreferencesEditorInputName(configurationTarget, resource), editableSettingsEditorInput.getDescription(), defaultPreferencesEditorInput, <EditorInput>editableSettingsEditorInput);
					this.lastOpenedSettingsInput = preferencesEditorInput;
					return this.editorService.openEditor(preferencesEditorInput, options, group);
				}
				return this.editorService.openEditor(editableSettingsEditorInput, options, group);
			});
	}

	private doOpenSettings2(resource: URI, options?: IEditorOptions, group?: IEditorGroup): TPromise<IEditor> {
		const settingsEditorInput = this.instantiationService.createInstance(SettingsEditor2Input, resource);
		this.lastOpenedSettings2Input = settingsEditorInput;
		return this.editorService.openEditor(settingsEditorInput, options, group);
	}

	private doSwitchSettings(target: ConfigurationTarget, resource: URI, input: PreferencesEditorInput, group: IEditorGroup): TPromise<IEditor> {
		return this.getOrCreateEditableSettingsEditorInput(target, this.getEditableSettingsURI(target, resource))
			.then(toInput => {
				return group.openEditor(input).then(() => {
					const replaceWith = new PreferencesEditorInput(this.getPreferencesEditorInputName(target, resource), toInput.getDescription(), this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.getDefaultSettingsResource(target)), toInput);

					return group.replaceEditors([{
						editor: input,
						replacement: replaceWith
					}]).then(() => {
						this.lastOpenedSettingsInput = replaceWith;
						return group.activeControl;
					});
				});
			});
	}

	private doSwitchSettings2(resource: URI, input: SettingsEditor2Input, group: IEditorGroup): TPromise<IEditor> {
		return group.openEditor(input).then(() => {
			const replaceWith = this.instantiationService.createInstance(SettingsEditor2Input, resource);

			return group.replaceEditors([{
				editor: input,
				replacement: replaceWith
			}]).then(() => {
				this.lastOpenedSettings2Input = replaceWith;
				return group.activeControl;
			});
		});
	}

	private getActiveSettingsEditorInput(group: IEditorGroup = this.editorGroupService.activeGroup): PreferencesEditorInput {
		return <PreferencesEditorInput>group.editors.filter(e => e instanceof PreferencesEditorInput)[0];
	}

	private getActiveSettingsEditor2Input(group: IEditorGroup = this.editorGroupService.activeGroup): SettingsEditor2Input {
		return <SettingsEditor2Input>group.editors.filter(e => e instanceof SettingsEditor2Input)[0];
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

	private getOrCreateEditableSettingsEditorInput(target: ConfigurationTarget, resource: URI): TPromise<EditorInput> {
		return this.createSettingsIfNotExists(target, resource)
			.then(() => <EditorInput>this.editorService.createInput({ resource }));
	}

	private createEditableSettingsEditorModel(configurationTarget: ConfigurationTarget, resource: URI): TPromise<SettingsEditorModel> {
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
		return TPromise.wrap<SettingsEditorModel>(null);
	}

	private createDefaultSettingsEditorModel(defaultSettingsUri: URI): TPromise<DefaultSettingsEditorModel> {
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

	private createSettingsIfNotExists(target: ConfigurationTarget, resource: URI): TPromise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && target === ConfigurationTarget.WORKSPACE) {
			return this.fileService.resolveContent(this.contextService.getWorkspace().configuration)
				.then(content => {
					if (Object.keys(parse(content.value)).indexOf('settings') === -1) {
						return this.jsonEditingService.write(resource, { key: 'settings', value: {} }, true).then(null, () => { });
					}
					return null;
				});
		}
		return this.createIfNotExists(resource, emptyEditableSettingsContent).then(() => { });
	}

	private createIfNotExists(resource: URI, contents: string): TPromise<any> {
		return this.fileService.resolveContent(resource, { acceptTextOnly: true }).then(null, error => {
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return this.fileService.updateContent(resource, contents).then(null, error => {
					return TPromise.wrapError(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(resource, true), error)));
				});
			}

			return TPromise.wrapError(error);
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

	private getPosition(language: string, settingsModel: IPreferencesEditorModel<ISetting>, codeEditor: ICodeEditor): TPromise<IPosition> {
		const languageKey = `[${language}]`;
		let setting = settingsModel.getPreference(languageKey);
		const model = codeEditor.getModel();
		const configuration = this.configurationService.getValue<{ editor: { tabSize: number; insertSpaces: boolean }, files: { eol: string } }>();
		const eol = configuration.files && configuration.files.eol;
		if (setting) {
			if (setting.overrides.length) {
				const lastSetting = setting.overrides[setting.overrides.length - 1];
				let content;
				if (lastSetting.valueRange.endLineNumber === setting.range.endLineNumber) {
					content = ',' + eol + this.spaces(2, configuration.editor) + eol + this.spaces(1, configuration.editor);
				} else {
					content = ',' + eol + this.spaces(2, configuration.editor);
				}
				const editOperation = EditOperation.insert(new Position(lastSetting.valueRange.endLineNumber, lastSetting.valueRange.endColumn), content);
				model.pushEditOperations([], [editOperation], () => []);
				return TPromise.as({ lineNumber: lastSetting.valueRange.endLineNumber + 1, column: model.getLineMaxColumn(lastSetting.valueRange.endLineNumber + 1) });
			}
			return TPromise.as({ lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 });
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
