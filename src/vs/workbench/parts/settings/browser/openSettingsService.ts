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
import { Disposable, dispose } from 'vs/base/common/lifecycle';
import { JSONVisitor, visit, parse, parseTree, findNodeAtLocation } from 'vs/base/common/json';
import { Registry } from 'vs/platform/platform';
import { hasClass, getDomNodePagePosition } from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { LinkedMap as Map } from 'vs/base/common/map';
import { Extensions } from 'vs/workbench/common/actionRegistry';
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
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IConfigurationEditingService, ConfigurationTarget, IConfigurationValue } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IOpenSettingsService } from 'vs/workbench/parts/settings/common/openSettings';
import { DefaultSettingsInput, DefaultKeybindingsInput } from 'vs/workbench/parts/settings/browser/defaultSettingsEditors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

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
	private defaultSettingsActionsRenderer: SettingsActionsRenderer;
	private userSettingsActionsRenderer: SettingsActionsRenderer;
	private workspaceSettingsActionsRenderer: SettingsActionsRenderer;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService private fileService: IFileService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IMessageService private messageService: IMessageService,
		@IChoiceService private choiceService: IChoiceService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IKeybindingService private keybindingService: IKeybindingService,
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
		return this.openTwoEditors(DefaultKeybindingsInput.getInstance(this.instantiationService, this.keybindingService), URI.file(this.environmentService.appKeybindingsPath), emptyContents).then(() => null);
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
			return this.openTwoEditors(DefaultSettingsInput.getInstance(this.instantiationService, this.configurationService), settingsResource, emptySettingsContents)
				.then(editors => this.renderActionsForDefaultSettings(editors[0]));
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

	private renderActionsForDefaultSettings(defaultSettingsEditor: IEditor) {
		const defaultSettingsEditorControl = <ICodeEditor>defaultSettingsEditor.getControl();
		if (!this.defaultSettingsActionsRenderer) {
			this.defaultSettingsActionsRenderer = this.instantiationService.createInstance(SettingsActionsRenderer, defaultSettingsEditorControl, this.copyConfiguration.bind(this));
			const disposable = defaultSettingsEditorControl.getModel().onWillDispose(() => {
				this.defaultSettingsActionsRenderer.dispose();
				this.defaultSettingsActionsRenderer = null;
				dispose(disposable);
			});
		}
		this.defaultSettingsActionsRenderer.render();
	}

	protected renderActionsForUserSettingsEditor(settingsEditor: IEditor) {
		const settingsEditorControl = <ICodeEditor>settingsEditor.getControl();
		if (!this.userSettingsActionsRenderer) {
			this.userSettingsActionsRenderer = this.instantiationService.createInstance(SettingsActionsRenderer, settingsEditorControl, this.copyConfiguration.bind(this));
			const disposable = settingsEditorControl.getModel().onWillDispose(() => {
				this.userSettingsActionsRenderer.dispose();
				this.userSettingsActionsRenderer = null;
				dispose(disposable);
			});
		}
		this.userSettingsActionsRenderer.render();
	}

	protected renderActionsForWorkspaceSettingsEditor(settingsEditor: IEditor) {
		const settingsEditorControl = <ICodeEditor>settingsEditor.getControl();
		if (!this.workspaceSettingsActionsRenderer) {
			this.workspaceSettingsActionsRenderer = this.instantiationService.createInstance(SettingsActionsRenderer, settingsEditorControl, this.copyConfiguration.bind(this));
			const disposable = settingsEditorControl.getModel().onWillDispose(() => {
				this.workspaceSettingsActionsRenderer.dispose();
				this.workspaceSettingsActionsRenderer = null;
				dispose(disposable);
			});
		}
		this.workspaceSettingsActionsRenderer.render();
	}

	private copyConfiguration(configurationValue: IConfigurationValue) {
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

class SettingsActionsRenderer extends Disposable {

	private decorationIds: string[] = [];
	private configurationsMap: Map<string, IConfigurationNode>;

	constructor(private settingsEditor: ICodeEditor,
		private copyConfiguration: (configurationValue: IConfigurationValue) => void,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMessageService private messageService: IMessageService
	) {
		super();
		this._register(this.settingsEditor.onMouseUp(e => this.onEditorMouseUp(e)));
		this._register(this.settingsEditor.getModel().onDidChangeContent(() => this.render()));
	}

	public render(): void {
		const defaultSettingsModel = this.settingsEditor.getModel();
		if (defaultSettingsModel) {
			defaultSettingsModel.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, []);
			});
			defaultSettingsModel.changeDecorations(changeAccessor => {
				this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, this.createDecorations());
			});
		}
	}

	private createDecorations(): editorCommon.IModelDeltaDecoration[] {
		const settingsModel = this.settingsEditor.getModel();
		let result: editorCommon.IModelDeltaDecoration[] = [];
		let parsingConfigurations = false;
		let parsingConfiguration = false;
		let visitor: JSONVisitor = {
			onObjectBegin: (offset: number, length: number) => {
				if (parsingConfigurations) {
					parsingConfiguration = true;
				} else {
					parsingConfigurations = true;
				}
			},
			onObjectProperty: (property: string, offset: number, length: number) => {
				if (!parsingConfiguration) {
					result.push(this.createDecoration(property, offset, settingsModel));
				}
			},
			onObjectEnd: () => {
				if (parsingConfiguration) {
					parsingConfiguration = false;
				} else {
					parsingConfigurations = false;
				}
			},
		};
		visit(settingsModel.getValue(), visitor);
		return result;
	}

	private createDecoration(property: string, offset: number, model: editorCommon.IModel): editorCommon.IModelDeltaDecoration {
		const jsonSchema: IJSONSchema = this.getConfigurationsMap().get(property);
		const position = model.getPositionAt(offset);
		const maxColumn = model.getLineMaxColumn(position.lineNumber);
		const range = {
			startLineNumber: position.lineNumber,
			startColumn: maxColumn,
			endLineNumber: position.lineNumber,
			endColumn: maxColumn
		};
		return {
			range, options: {
				afterContentClassName: `copySetting${(jsonSchema.enum || jsonSchema.type === 'boolean') ? '.select' : ''}`,
			}
		};
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		let range = e.target.range;
		if (!range || !range.isEmpty) {
			return;
		}
		if (!e.event.leftButton) {
			return;
		}

		switch (e.target.type) {
			case editorCommon.MouseTargetType.CONTENT_EMPTY:
				if (hasClass(<HTMLElement>e.target.element, 'copySetting')) {
					this.onClick(e);
				}
				return;
			default:
				return;
		}
	}

	private getConfigurationsMap(): Map<string, IConfigurationNode> {
		if (!this.configurationsMap) {
			const configurations = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurations();
			this.configurationsMap = new Map<string, IConfigurationNode>();
			configurations.forEach(configuration => this.populateProperties(configuration, this.configurationsMap));
		}
		return this.configurationsMap;
	}

	private populateProperties(configuration: IConfigurationNode, configurationsMap: Map<string, IConfigurationNode>) {
		if (configuration.properties) {
			for (const property of Object.keys(configuration.properties)) {
				configurationsMap.set(property, <IConfigurationNode>configuration.properties[property]);
			}
		}
		if (configuration.allOf) {
			for (const c of configuration.allOf) {
				this.populateProperties(c, configurationsMap);
			}
		}
	}

	private onClick(e: IEditorMouseEvent) {
		const model = this.settingsEditor.getModel();
		const setting = parse('{' + model.getLineContent(e.target.range.startLineNumber) + '}');
		const key = Object.keys(setting)[0];
		let value = setting[key];
		let jsonSchema: IJSONSchema = this.getConfigurationsMap().get(key);
		const actions = this.getActions(key, jsonSchema);
		if (actions) {
			let elementPosition = getDomNodePagePosition(<HTMLElement>e.target.element);
			const anchor = { x: elementPosition.left + elementPosition.width, y: elementPosition.top + elementPosition.height + 10 };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => TPromise.wrap(actions)
			});
			return;
		}
		this.copyConfiguration({ key, value });
	}

	private getActions(key: string, jsonSchema: IJSONSchema): IAction[] {
		if (jsonSchema.type === 'boolean') {
			return [<IAction>{
				id: 'truthyValue',
				label: 'true',
				enabled: true,
				run: () => {
					this.copyConfiguration({ key, value: true });
				}
			}, <IAction>{
				id: 'falsyValue',
				label: 'false',
				enabled: true,
				run: () => {
					this.copyConfiguration({ key, value: false });
				}
			}];
		}
		if (jsonSchema.enum) {
			return jsonSchema.enum.map(value => {
				return <IAction>{
					id: value,
					label: value,
					enabled: true,
					run: () => {
						this.copyConfiguration({ key, value });
					}
				};
			});
		}
		return null;
	}
}