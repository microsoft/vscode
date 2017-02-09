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
import * as strings from 'vs/base/common/strings';
import { Disposable } from 'vs/base/common/lifecycle';
import { EditorInput, toResource } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { Position as EditorPosition, IEditor } from 'vs/platform/editor/common/editor';
import { ICommonCodeEditor, IPosition } from 'vs/editor/common/editorCommon';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IFileService, IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { IMessageService, Severity, IChoiceService } from 'vs/platform/message/common/message';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IPreferencesService, IPreferencesEditorModel, ISetting } from 'vs/workbench/parts/preferences/common/preferences';
import { SettingsEditorModel, DefaultSettingsEditorModel, DefaultKeybindingsEditorModel } from 'vs/workbench/parts/preferences/common/preferencesModels';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DefaultPreferencesEditorInput, PreferencesEditorInput } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';


interface IWorkbenchSettingsConfiguration {
	workbench: {
		settings: {
			openDefaultSettings: boolean;
		}
	};
}

export class PreferencesService extends Disposable implements IPreferencesService {

	_serviceBrand: any;

	// TODO:@sandy merge these models into editor inputs by extending resource editor model
	private defaultPreferencesEditorModels: Map<URI, IPreferencesEditorModel<any>>;
	private lastOpenedSettingsInput: PreferencesEditorInput = null;

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
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();
		this.defaultPreferencesEditorModels = new Map<URI, IPreferencesEditorModel<any>>();
		this.editorGroupService.onEditorsChanged(() => {
			const activeEditorInput = this.editorService.getActiveEditorInput();
			if (activeEditorInput instanceof PreferencesEditorInput) {
				this.lastOpenedSettingsInput = activeEditorInput;
			}
		});
	}

	readonly defaultSettingsResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' });
	readonly defaultKeybindingsResource = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' });

	get userSettingsResource(): URI {
		return this.getEditableSettingsURI(ConfigurationTarget.USER);
	}

	get workspaceSettingsResource(): URI {
		return this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
	}

	createDefaultPreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel<any>> {
		const editorModel = this.defaultPreferencesEditorModels.get(uri);
		if (editorModel) {
			return TPromise.as(editorModel);
		}

		if (this.defaultSettingsResource.fsPath === uri.fsPath) {
			return TPromise.join<any>([this.extensionService.onReady(), this.fetchMostCommonlyUsedSettings()])
				.then(result => {
					const mostCommonSettings = result[1];
					const model = this.instantiationService.createInstance(DefaultSettingsEditorModel, uri, mostCommonSettings);
					this.defaultPreferencesEditorModels.set(uri, model);
					return model;
				});
		}

		if (this.defaultKeybindingsResource.fsPath === uri.fsPath) {
			const model = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
			this.defaultPreferencesEditorModels.set(uri, model);
			return TPromise.wrap(model);
		}

		return null;
	}

	public resolvePreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel<any>> {
		const model = this.defaultPreferencesEditorModels.get(uri);
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

	openSettings(): TPromise<IEditor> {
		return this.doOpenSettings(ConfigurationTarget.USER, false);
	}

	openGlobalSettings(): TPromise<IEditor> {
		return this.doOpenSettings(ConfigurationTarget.USER);
	}

	openWorkspaceSettings(): TPromise<IEditor> {
		if (!this.contextService.hasWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));
			return TPromise.as(null);
		}
		return this.doOpenSettings(ConfigurationTarget.WORKSPACE);
	}

	switchSettings(): TPromise<void> {
		const activeEditor = this.editorService.getActiveEditor();
		const activeEditorInput = activeEditor.input;
		if (activeEditorInput instanceof PreferencesEditorInput) {
			const fromTarget = this.getSettingsConfigurationTarget(activeEditorInput);
			const toTarget = ConfigurationTarget.USER === fromTarget ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
			return this.getOrCreateEditableSettingsEditorInput(toTarget)
				.then(toInput => {
					const replaceWith = new PreferencesEditorInput(toInput.getName(), toInput.getDescription(), this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.defaultSettingsResource), toInput);
					return this.editorService.replaceEditors([{
						toReplace: this.lastOpenedSettingsInput,
						replaceWith
					}], activeEditor.position).then(() => {
						this.lastOpenedSettingsInput = replaceWith;
					});
				});
		} else {
			this.openSettings();
			return undefined;
		}
	}

	openGlobalKeybindingSettings(): TPromise<void> {
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

	private doOpenSettings(configurationTarget: ConfigurationTarget, checkToOpenDefaultSettings: boolean = true): TPromise<IEditor> {
		const openDefaultSettings = !checkToOpenDefaultSettings || !!this.configurationService.getConfiguration<IWorkbenchSettingsConfiguration>().workbench.settings.openDefaultSettings;
		return this.getOrCreateEditableSettingsEditorInput(configurationTarget)
			.then(editableSettingsEditorInput => {
				if (openDefaultSettings) {
					const defaultPreferencesEditorInput = this.instantiationService.createInstance(DefaultPreferencesEditorInput, this.defaultSettingsResource);
					const preferencesEditorInput = new PreferencesEditorInput(editableSettingsEditorInput.getName(), editableSettingsEditorInput.getDescription(), defaultPreferencesEditorInput, <EditorInput>editableSettingsEditorInput);
					this.lastOpenedSettingsInput = preferencesEditorInput;
					return this.editorService.openEditor(preferencesEditorInput, { pinned: true });
				}
				return this.editorService.openEditor(editableSettingsEditorInput, { pinned: true });
			});
	}

	private getOrCreateEditableSettingsEditorInput(configurationTarget: ConfigurationTarget): TPromise<EditorInput> {
		const resource = this.getEditableSettingsURI(configurationTarget);
		const editableSettingsEmptyContent = this.getEmptyEditableSettingsContent(configurationTarget);
		return this.createIfNotExists(resource, editableSettingsEmptyContent)
			.then(() => this.editorService.createInput({ resource }));
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
				if (this.contextService.hasWorkspace()) {
					return this.contextService.toResource('.vscode/settings.json');
				}
		}
		return null;
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

	private getSettingsConfigurationTarget(preferencesEditorInput: PreferencesEditorInput): ConfigurationTarget {
		if (preferencesEditorInput) {
			const resource = toResource(preferencesEditorInput.master);
			return resource.toString() === this.userSettingsResource.toString() ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE;
		}
		return ConfigurationTarget.USER;
	}

	private fetchMostCommonlyUsedSettings(): TPromise<string[]> {
		return TPromise.wrap([
			'editor.fontSize',
			'files.autoSave',
			'editor.fontFamily',
			'editor.tabSize',
			'editor.renderWhitespace',
			'files.exclude',
			'editor.cursorStyle',
			'editor.insertSpaces',
			'editor.wrappingColumn',
			'files.associations'
		]);
	}

	private getPosition(language: string, codeEditor: ICommonCodeEditor): TPromise<IPosition> {
		return this.resolvePreferencesEditorModel(this.userSettingsResource)
			.then((settingsModel: IPreferencesEditorModel<ISetting>) => {
				const languageKey = `[${language}]`;
				let setting = settingsModel.getPreference(languageKey);
				const model = codeEditor.getModel();
				const configuration = this.configurationService.getConfiguration<{ tabSize: number; insertSpaces: boolean }>('editor');
				const {eol} = this.configurationService.getConfiguration<{ eol: string }>('files');
				if (setting) {
					if (setting.overrides.length) {
						const lastSetting = setting.overrides[setting.overrides.length - 1];
						let content;
						if (lastSetting.valueRange.endLineNumber === setting.range.endLineNumber) {
							content = ',' + eol + this.spaces(2, configuration) + eol + this.spaces(1, configuration);
						} else {
							content = ',' + eol + this.spaces(2, configuration);
						}
						const editOperation = EditOperation.insert(new Position(lastSetting.valueRange.endLineNumber, lastSetting.valueRange.endColumn), content);
						model.pushEditOperations([], [editOperation], () => []);
						return { lineNumber: lastSetting.valueRange.endLineNumber + 1, column: model.getLineMaxColumn(lastSetting.valueRange.endLineNumber + 1) };
					}
					return { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 };
				}
				return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: languageKey, value: {} }, { autoSave: false, writeToBuffer: true })
					.then(() => {
						setting = settingsModel.getPreference(languageKey);
						let content = eol + this.spaces(2, configuration) + eol + this.spaces(1, configuration);
						let editOperation = EditOperation.insert(new Position(setting.valueRange.endLineNumber, setting.valueRange.endColumn - 1), content);
						model.pushEditOperations([], [editOperation], () => []);
						let lineNumber = setting.valueRange.endLineNumber + 1;
						return { lineNumber, column: model.getLineMaxColumn(lineNumber) };
					});
			});
	}

	private spaces(count: number, {tabSize, insertSpaces}: { tabSize: number; insertSpaces: boolean }): string {
		return insertSpaces ? strings.repeat(' ', tabSize * count) : strings.repeat('\t', count);
	}

	public dispose(): void {
		this.defaultPreferencesEditorModels.clear();
		super.dispose();
	}
}