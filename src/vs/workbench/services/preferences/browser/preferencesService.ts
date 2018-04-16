/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as network from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as labels from 'vs/base/common/labels';
import * as strings from 'vs/base/common/strings';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { EditorInput } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { Position as EditorPosition, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IFileService, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IPreferencesService, IPreferencesEditorModel, ISetting, getSettingsTargetName, FOLDER_SETTINGS_PATH, DEFAULT_SETTINGS_EDITOR_SETTING } from 'vs/workbench/services/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel, DefaultKeybindingsEditorModel, defaultKeybindingsContents, DefaultSettings, WorkspaceConfigurationEditorModel } from 'vs/workbench/services/preferences/common/preferencesModels';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DefaultPreferencesEditorInput, PreferencesEditorInput, KeybindingsEditorInput, PreferencesEditorInput2 } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { parse } from 'vs/base/common/json';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { INotificationService } from 'vs/platform/notification/common/notification';

const emptyEditableSettingsContent = '{\n}';

export class PreferencesService extends Disposable implements IPreferencesService {

	_serviceBrand: any;

	private lastOpenedSettingsInput: PreferencesEditorInput = null;

	private readonly _onDispose: Emitter<void> = new Emitter<void>();

	private _defaultUserSettingsUriCounter = 0;
	private _defaultUserSettingsContentModel: DefaultSettings;
	private _defaultWorkspaceSettingsUriCounter = 0;
	private _defaultWorkspaceSettingsContentModel: DefaultSettings;
	private _defaultFolderSettingsUriCounter = 0;
	private _defaultFolderSettingsContentModel: DefaultSettings;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
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
		@IModeService private modeService: IModeService
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

	openRawDefaultSettings(): TPromise<void> {
		return this.editorService.openEditor({ resource: this.defaultSettingsRawResource }, EditorPosition.ONE) as TPromise<any>;
	}

	openSettings(): TPromise<IEditor> {
		const editorInput = this.getActiveSettingsEditorInput() || this.lastOpenedSettingsInput;
		const resource = editorInput ? editorInput.master.getResource() : this.userSettingsResource;
		const target = this.getConfigurationTargetFromSettingsResource(resource);
		return this.openOrSwitchSettings(target, resource);
	}

	openGlobalSettings(options?: IEditorOptions, position?: EditorPosition): TPromise<IEditor> {
		return this.openOrSwitchSettings(ConfigurationTarget.USER, this.userSettingsResource, options, position);
	}

	openSettings2(): TPromise<IEditor> {
		return this.createDefaultSettingsEditorModel(this.userSettingsResource)
			.then(model => this.editorService.openEditor(this.instantiationService.createInstance(PreferencesEditorInput2, model), { pinned: true }).then(() => null));
	}

	openWorkspaceSettings(options?: IEditorOptions, position?: EditorPosition): TPromise<IEditor> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));
			return TPromise.as(null);
		}
		return this.openOrSwitchSettings(ConfigurationTarget.WORKSPACE, this.workspaceSettingsResource, options, position);
	}

	openFolderSettings(folder: URI, options?: IEditorOptions, position?: EditorPosition): TPromise<IEditor> {
		return this.openOrSwitchSettings(ConfigurationTarget.WORKSPACE_FOLDER, this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, folder), options, position);
	}

	switchSettings(target: ConfigurationTarget, resource: URI): TPromise<void> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && activeEditor.input instanceof PreferencesEditorInput) {
			return this.doSwitchSettings(target, resource, activeEditor.input, activeEditor.position).then(() => null);
		} else {
			return this.doOpenSettings(target, resource).then(() => null);
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

			// Create as needed and open in editor
			return this.createIfNotExists(editableKeybindings, emptyContents).then(() => {
				return this.editorService.openEditors([
					{ input: { resource: this.defaultKeybindingsResource, options: { pinned: true }, label: nls.localize('defaultKeybindings', "Default Keybindings"), description: '' }, position: EditorPosition.ONE },
					{ input: { resource: editableKeybindings, options: { pinned: true } }, position: EditorPosition.TWO },
				]).then(() => {
					this.editorGroupService.focusGroup(EditorPosition.TWO);
				});
			});

		}
		return this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { pinned: true }).then(() => null);
	}

	configureSettingsForLanguage(language: string): void {
		this.openGlobalSettings()
			.then(editor => {
				const codeEditor = getCodeEditor(editor);
				this.getPosition(language, codeEditor)
					.then(position => {
						codeEditor.setPosition(position);
						codeEditor.focus();
					});
			});
	}

	private openOrSwitchSettings(configurationTarget: ConfigurationTarget, resource: URI, options?: IEditorOptions, position?: EditorPosition): TPromise<IEditor> {
		const activeGroup = this.editorGroupService.getStacksModel().activeGroup;
		const positionToReplace = position !== void 0 ? position : activeGroup ? this.editorGroupService.getStacksModel().positionOfGroup(activeGroup) : EditorPosition.ONE;
		const editorInput = this.getActiveSettingsEditorInput(positionToReplace);
		if (editorInput && editorInput.master.getResource().fsPath !== resource.fsPath) {
			return this.doSwitchSettings(configurationTarget, resource, editorInput, positionToReplace);
		}
		return this.doOpenSettings(configurationTarget, resource, options, position);
	}

	private doOpenSettings(configurationTarget: ConfigurationTarget, resource: URI, options?: IEditorOptions, position?: EditorPosition): TPromise<IEditor> {
		const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);
		return this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource)
			.then(editableSettingsEditorInput => {
				if (!options) {
					options = { pinned: true };
				} else {
					options.pinned = true;
				}

				if (openDefaultSettings) {
					const defaultPreferencesEditorInput = this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.getDefaultSettingsResource(configurationTarget));
					const preferencesEditorInput = new PreferencesEditorInput(this.getPreferencesEditorInputName(configurationTarget, resource), editableSettingsEditorInput.getDescription(), defaultPreferencesEditorInput, <EditorInput>editableSettingsEditorInput);
					this.lastOpenedSettingsInput = preferencesEditorInput;
					return this.editorService.openEditor(preferencesEditorInput, options, position);
				}
				return this.editorService.openEditor(editableSettingsEditorInput, options, position);
			});
	}

	private doSwitchSettings(target: ConfigurationTarget, resource: URI, input: PreferencesEditorInput, position?: EditorPosition): TPromise<IEditor> {
		return this.getOrCreateEditableSettingsEditorInput(target, this.getEditableSettingsURI(target, resource))
			.then(toInput => {
				const replaceWith = new PreferencesEditorInput(this.getPreferencesEditorInputName(target, resource), toInput.getDescription(), this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.getDefaultSettingsResource(target)), toInput);
				return this.editorService.replaceEditors([{
					toReplace: input,
					replaceWith
				}], position).then(editors => {
					this.lastOpenedSettingsInput = replaceWith;
					return editors[0];
				});
			});
	}

	private getActiveSettingsEditorInput(position?: EditorPosition): PreferencesEditorInput {
		const stacksModel = this.editorGroupService.getStacksModel();
		const group = position !== void 0 ? stacksModel.groupAt(position) : stacksModel.activeGroup;
		return group && <PreferencesEditorInput>group.getEditors().filter(e => e instanceof PreferencesEditorInput)[0];
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
					return TPromise.wrapError(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", labels.getPathLabel(resource, this.contextService, this.environmentService), error)));
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

	private getPosition(language: string, codeEditor: ICodeEditor): TPromise<IPosition> {
		return this.createPreferencesEditorModel(this.userSettingsResource)
			.then((settingsModel: IPreferencesEditorModel<ISetting>) => {
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
						return { lineNumber: lastSetting.valueRange.endLineNumber + 1, column: model.getLineMaxColumn(lastSetting.valueRange.endLineNumber + 1) };
					}
					return { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 };
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
