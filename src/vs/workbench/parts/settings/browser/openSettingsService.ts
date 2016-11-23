/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./media/openSettings';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as labels from 'vs/base/common/labels';
import { Delayer } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { parseTree, findNodeAtLocation } from 'vs/base/common/json';
import { asFileEditorInput } from 'vs/workbench/common/editor';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { Position, IEditor } from 'vs/platform/editor/common/editor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IFileService, IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { IMessageService, Severity, IChoiceService } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IConfigurationEditingService, ConfigurationTarget, IConfigurationValue } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IOpenSettingsService, IDefaultSettings, IDefaultKeybindings } from 'vs/workbench/parts/settings/common/openSettings';
import { DefaultSettings, DefaultKeybindings } from 'vs/workbench/parts/settings/common/defaultSettings';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { DefaultSettingsInput, DefaultKeybindingsInput } from 'vs/workbench/parts/settings/browser/defaultSettingsEditors';


const SETTINGS_INFO_IGNORE_KEY = 'settings.workspace.info.ignore';

interface IWorkbenchSettingsConfiguration {
	workbench: {
		settings: {
			openDefaultSettings: boolean;
		}
	};
}

export class OpenSettingsService extends Disposable implements IOpenSettingsService {

	_serviceBrand: any;

	private configurationTarget: ConfigurationTarget = null;

	private _defaultSettings: IDefaultSettings;
	private _defaultKeybindings: IDefaultKeybindings;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService private fileService: IFileService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IMessageService private messageService: IMessageService,
		@IChoiceService private choiceService: IChoiceService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super();
		this._register(this.editorGroupService.onEditorsChanged(() => {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				const editorInput = asFileEditorInput(activeEditor.input);
				if (editorInput) {
					const configurationTarget = this.getConfigurationTarget(editorInput.getResource());
					if (configurationTarget !== null) {
						this.configurationTarget = configurationTarget;
					}
				}
			}
		}));
	}

	public get defaultSettings(): IDefaultSettings {
		if (!this._defaultSettings) {
			this._defaultSettings = this.instantiationService.createInstance(DefaultSettings);
		}
		return this._defaultSettings;
	}

	public get defaultKeybindings(): IDefaultKeybindings {
		if (!this._defaultKeybindings) {
			this._defaultKeybindings = this.instantiationService.createInstance(DefaultKeybindings);
		}
		return this._defaultKeybindings;
	}

	openGlobalSettings(): TPromise<void> {
		if (this.configurationService.hasWorkspaceConfiguration() && !this.storageService.getBoolean(SETTINGS_INFO_IGNORE_KEY, StorageScope.WORKSPACE)) {
			this.promptToOpenWorkspaceSettings();
		}
		// Open settings
		return this.openSettings(ConfigurationTarget.USER);
	}

	openWorkspaceSettings(): TPromise<void> {
		if (!this.contextService.getWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));
			return;
		}
		return this.openSettings(ConfigurationTarget.WORKSPACE);
	}

	openGlobalKeybindingSettings(): TPromise<void> {
		const emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to overwrite the defaults") + '\n[\n]';
		return this.openTwoEditors(DefaultKeybindingsInput.getInstance(this.instantiationService, this), URI.file(this.environmentService.appKeybindingsPath), emptyContents).then(() => null);
	}

	openEditableSettings(configurationTarget: ConfigurationTarget, showVisibleEditor: boolean = false): TPromise<IEditor> {
		const emptySettingsContents = this.getEmptyEditableSettingsContent(configurationTarget);
		const settingsResource = this.getEditableSettingsURI(configurationTarget);
		if (showVisibleEditor) {
			if (this.isEditorFor(this.editorService.getActiveEditor(), configurationTarget)) {
				return TPromise.wrap(this.editorService.getActiveEditor());
			}
			const [editableSettingsEditor] = this.editorService.getVisibleEditors().filter(editor => this.isEditorFor(editor, configurationTarget));
			if (editableSettingsEditor) {
				return TPromise.wrap(editableSettingsEditor);
			}
		}
		return this.createIfNotExists(settingsResource, emptySettingsContents).then(() => this.editorService.openEditor({
			resource: settingsResource,
			options: { pinned: true }
		}));
	}

	public copyConfiguration(configurationValue: IConfigurationValue): void {
		this.telemetryService.publicLog('defaultSettingsActions.copySetting', { userConfigurationKeys: [configurationValue.key] });
		this.openEditableSettings(this.configurationTarget, true).then(editor => {
			const editorControl = <ICodeEditor>editor.getControl();
			const disposable = editorControl.onDidChangeModelContent(() => {
				new Delayer(100).trigger((): any => {
					editorControl.focus();
					editorControl.setSelection(this.getSelectionRange(configurationValue.key, editorControl.getModel()));
				});
				disposable.dispose();
			});
			this.configurationEditingService.writeConfiguration(this.configurationTarget, configurationValue)
				.then(null, error => this.messageService.show(Severity.Error, error));
		});
	}

	private isEditorFor(editor: IEditor, configurationTarget: ConfigurationTarget): boolean {
		const fileEditorInput = asFileEditorInput(editor.input);
		return !!fileEditorInput && fileEditorInput.getResource().fsPath === this.getEditableSettingsURI(configurationTarget).fsPath;
	}

	private getEmptyEditableSettingsContent(configurationTarget: ConfigurationTarget): string {
		switch (configurationTarget) {
			case ConfigurationTarget.USER:
				const emptySettingsHeader = nls.localize('emptySettingsHeader', "Place your settings in this file to overwrite the default settings");
				return '// ' + emptySettingsHeader + '\n{\n}';
			case ConfigurationTarget.WORKSPACE:
				return [
					'// ' + nls.localize('emptySettingsHeader1', "Place your settings in this file to overwrite default and user settings."),
					'{',
					'}'
				].join('\n');
		}
	}

	private getEditableSettingsURI(configurationTarget: ConfigurationTarget): URI {
		switch (configurationTarget) {
			case ConfigurationTarget.USER:
				return URI.file(this.environmentService.appSettingsPath);
			case ConfigurationTarget.WORKSPACE:
				return this.contextService.toResource('.vscode/settings.json');
		}
	}

	private promptToOpenWorkspaceSettings() {
		this.choiceService.choose(Severity.Info, nls.localize('workspaceHasSettings', "The currently opened folder contains workspace settings that may override user settings"),
			[nls.localize('openWorkspaceSettings', "Open Workspace Settings"), nls.localize('neverShowAgain', "Don't show again"), nls.localize('close', "Close")]
		).then(choice => {
			switch (choice) {
				case 0:
					const editorCount = this.editorService.getVisibleEditors().length;
					return this.editorService.createInput({ resource: this.contextService.toResource(WORKSPACE_CONFIG_DEFAULT_PATH) }).then(typedInput => {
						return this.editorService.openEditor(typedInput, { pinned: true }, editorCount === 2 ? Position.THREE : editorCount === 1 ? Position.TWO : void 0);
					});
				case 1:
					this.storageService.store(SETTINGS_INFO_IGNORE_KEY, true, StorageScope.WORKSPACE);
				default:
					return TPromise.as(true);
			}
		});
	}

	private openSettings(configurationTarget: ConfigurationTarget): TPromise<void> {
		const openDefaultSettings = !!this.configurationService.getConfiguration<IWorkbenchSettingsConfiguration>().workbench.settings.openDefaultSettings;
		if (openDefaultSettings) {
			const emptySettingsContents = this.getEmptyEditableSettingsContent(configurationTarget);
			const settingsResource = this.getEditableSettingsURI(configurationTarget);
			return this.openTwoEditors(DefaultSettingsInput.getInstance(this.instantiationService, this), settingsResource, emptySettingsContents).then(() => null);
		}
		return this.openEditableSettings(configurationTarget).then(() => null);
	}

	private openTwoEditors(leftHandDefaultInput: StringEditorInput, editableResource: URI, defaultEditableContents: string): TPromise<IEditor[]> {
		// Create as needed and open in editor
		return this.createIfNotExists(editableResource, defaultEditableContents).then(() => {
			return this.editorService.createInput({ resource: editableResource }).then(typedRightHandEditableInput => {
				const editors = [
					{ input: leftHandDefaultInput, position: Position.ONE, options: { pinned: true } },
					{ input: typedRightHandEditableInput, position: Position.TWO, options: { pinned: true } }
				];

				return this.editorService.openEditors(editors).then(result => {
					this.editorGroupService.focusGroup(Position.TWO);
					return result;
				});
			});
		});
	}

	private createIfNotExists(resource: URI, contents: string): TPromise<boolean> {
		return this.fileService.resolveContent(resource, { acceptTextOnly: true }).then(null, error => {
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return this.fileService.updateContent(resource, contents).then(null, error => {
					return TPromise.wrapError(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", labels.getPathLabel(resource, this.contextService), error)));
				});
			}

			return TPromise.wrapError(error);
		});
	}

	private getConfigurationTarget(resource: URI): ConfigurationTarget {
		return resource.fsPath === this.getEditableSettingsURI(ConfigurationTarget.USER).fsPath ? ConfigurationTarget.USER :
			resource.fsPath === this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE).fsPath ? ConfigurationTarget.WORKSPACE : null;
	}

	private getSelectionRange(setting: string, model: editorCommon.IModel): editorCommon.IRange {
		const tree = parseTree(model.getValue());
		const node = findNodeAtLocation(tree, [setting]);
		const position = model.getPositionAt(node.offset);
		return {
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column + node.length
		};
	}
}

export class SettingsContentProvider implements ITextModelContentProvider {

	constructor(
		@IOpenSettingsService private openSettingsService: IOpenSettingsService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
	}

	public provideTextContent(uri: URI): TPromise<editorCommon.IModel> {
		if (uri.scheme !== 'vscode') {
			return null;
		}
		const defaultSettings = this.openSettingsService.defaultSettings;
		if (defaultSettings.uri.fsPath === uri.fsPath) {
			let mode = this.modeService.getOrCreateMode('application/json');
			return TPromise.as(this.modelService.createModel(defaultSettings.content, mode, uri));
		}
		const defaultKeybindings = this.openSettingsService.defaultKeybindings;
		if (defaultKeybindings.uri.fsPath === uri.fsPath) {
			let mode = this.modeService.getOrCreateMode('application/json');
			return TPromise.as(this.modelService.createModel(defaultKeybindings.content, mode, uri));
		}
		return null;
	}
}