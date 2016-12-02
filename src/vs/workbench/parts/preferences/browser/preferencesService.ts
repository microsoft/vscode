/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/css!./media/preferences';
import * as network from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { LinkedMap as Map } from 'vs/base/common/map';
import * as labels from 'vs/base/common/labels';
import { Disposable } from 'vs/base/common/lifecycle';
import { parseTree, findNodeAtLocation } from 'vs/base/common/json';
import { asFileEditorInput, SideBySideEditorInput, EditorInput } from 'vs/workbench/common/editor';
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
import { IPreferencesService, IPreferencesEditorModel } from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel, DefaultKeybindingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DefaultPreferencesEditorInput } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

const SETTINGS_INFO_IGNORE_KEY = 'settings.workspace.info.ignore';

interface IWorkbenchSettingsConfiguration {
	workbench: {
		settings: {
			openDefaultSettings: boolean;
		}
	};
}

export class PreferencesService extends Disposable implements IPreferencesService {

	static DEFAULT_SETTINGS_URI: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' });
	static DEFAULT_KEY_BINDINGS_URI: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });

	_serviceBrand: any;

	private defaultEditorModels: Map<URI, IPreferencesEditorModel>;

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
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super();
		this.defaultEditorModels = new Map<URI, IPreferencesEditorModel>();
	}

	createDefaultSettingsModel(): TPromise<IPreferencesEditorModel> {
		return this.createDefaultPreferencesEditorModel(PreferencesService.DEFAULT_SETTINGS_URI);
	}

	createDefaultPreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel> {
		if (PreferencesService.DEFAULT_SETTINGS_URI.fsPath === uri.fsPath) {
			return this.fetchMostCommonlyUsedSettings()
				.then(mostCommonSettings => {
					const model = this.instantiationService.createInstance(DefaultSettingsEditorModel, uri, mostCommonSettings);
					this.defaultEditorModels.set(uri, model);
					return model;
				});
		}

		if (PreferencesService.DEFAULT_KEY_BINDINGS_URI.fsPath === uri.fsPath) {
			const model = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
			this.defaultEditorModels.set(uri, model);
			return TPromise.wrap(model);
		}

		return null;
	}

	public resolvePreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel> {
		const model = this.defaultEditorModels.get(uri);
		if (model) {
			return TPromise.wrap(model);
		}

		if (this.getEditableSettingsURI(ConfigurationTarget.USER).fsPath === uri.fsPath) {
			return this.resolveSettingsEditorModel(ConfigurationTarget.USER);
		}

		const workspaceSettingsUri = this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
		if (workspaceSettingsUri && workspaceSettingsUri.fsPath === uri.fsPath) {
			return this.resolveSettingsEditorModel(ConfigurationTarget.WORKSPACE);
		}

		return TPromise.wrap(null);
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
		return this.createDefaultPreferencesEditorModel(PreferencesService.DEFAULT_KEY_BINDINGS_URI)
			.then(editorModel => {
				const defaultKeybindingsInput = this.instantiationService.createInstance(StringEditorInput, nls.localize('keybindingsEditorName', "Default Keyboard Shortcuts"), '', editorModel.content, 'json', true);
				this.openTwoEditors(defaultKeybindingsInput, URI.file(this.environmentService.appKeybindingsPath), emptyContents);
			});
	}

	private openEditableSettings(configurationTarget: ConfigurationTarget): TPromise<IEditor> {
		const emptySettingsContents = this.getEmptyEditableSettingsContent(configurationTarget);
		const settingsResource = this.getEditableSettingsURI(configurationTarget);
		return this.createIfNotExists(settingsResource, emptySettingsContents).then(() => this.editorService.openEditor({
			resource: settingsResource,
			options: { pinned: true }
		}));
	}

	public copyConfiguration(configurationValue: IConfigurationValue): void {
		const configurationTarget = this.getConfigurationTargetForCurrentActiveEditor();
		if (configurationTarget !== null) {
			this.telemetryService.publicLog('defaultSettingsActions.copySetting', { userConfigurationKeys: [configurationValue.key] });
			const editorControl = <ICodeEditor>this.editorService.getActiveEditor().getControl();
			this.configurationEditingService.writeConfiguration(configurationTarget, configurationValue, { writeToBuffer: true, autoSave: true })
				.then(() => {
					editorControl.focus();
					editorControl.setSelection(this.getSelectionRange(configurationValue.key, editorControl.getModel()));
				}, error => this.messageService.show(Severity.Error, error));
		}
	}

	private resolveSettingsEditorModel(configurationTarget: ConfigurationTarget): TPromise<SettingsEditorModel> {
		const settingsUri = this.getEditableSettingsURI(configurationTarget);
		if (settingsUri) {
			return this.textModelResolverService.createModelReference(settingsUri)
				.then(reference => this.instantiationService.createInstance(SettingsEditorModel, reference.object.textEditorModel, configurationTarget));
		}
		return TPromise.wrap(null);
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
				if (this.contextService.getWorkspace()) {
					return this.contextService.toResource('.vscode/settings.json');
				}
		}
		return null;
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
			return this.openTwoEditors(this.instantiationService.createInstance(DefaultPreferencesEditorInput, PreferencesService.DEFAULT_SETTINGS_URI, true), settingsResource, emptySettingsContents).then(() => null);
		}
		return this.openEditableSettings(configurationTarget).then(() => null);
	}

	private openTwoEditors(leftHandDefaultInput: EditorInput, editableResource: URI, defaultEditableContents: string): TPromise<IEditor> {
		// Create as needed and open in editor
		return this.createIfNotExists(editableResource, defaultEditableContents).then(() => {
			return this.editorService.createInput({ resource: editableResource }).then(typedRightHandEditableInput => {
				const sideBySideInput = new SideBySideEditorInput(typedRightHandEditableInput.getName(), typedRightHandEditableInput.getDescription(), leftHandDefaultInput, <EditorInput>typedRightHandEditableInput);
				return this.editorService.openEditor(sideBySideInput);
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

	private getConfigurationTargetForCurrentActiveEditor(): ConfigurationTarget {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editorInput = asFileEditorInput(activeEditor.input, true);
			if (editorInput) {
				return this.getConfigurationTarget(editorInput.getResource());
			}
		}
		return null;
	}

	private getConfigurationTarget(resource: URI): ConfigurationTarget {
		if (this.getEditableSettingsURI(ConfigurationTarget.USER).fsPath === resource.fsPath) {
			return ConfigurationTarget.USER;
		}
		const workspaceSettingsUri = this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
		if (workspaceSettingsUri && workspaceSettingsUri.fsPath === resource.fsPath) {
			return ConfigurationTarget.WORKSPACE;
		}
		return null;
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

	private fetchMostCommonlyUsedSettings(): TPromise<string[]> {
		return TPromise.wrap([
			'window.zoomLevel',
			'editor.fontSize',
			'files.autoSave',
			'typescript.check.tscVersion',
			'editor.fontFamily',
			'editor.tabSize',
			'editor.cursorStyle',
			'editor.renderWhitespace',
			'files.exclude',
			'files.associations'
		]);
	}
}