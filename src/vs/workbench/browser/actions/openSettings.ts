/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import * as network from 'vs/base/common/network';
import * as labels from 'vs/base/common/labels';
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import * as strings from 'vs/base/common/strings';
import Event, { Emitter } from 'vs/base/common/event';
import { LinkedMap as Map } from 'vs/base/common/map';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IEditorRegistry, Extensions as EditorExtensions, EditorOptions } from 'vs/workbench/common/editor';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { ICommonCodeEditor, IEditorViewState } from 'vs/editor/common/editorCommon';
import { StringEditor } from 'vs/workbench/browser/parts/editor/stringEditor';
import { getDefaultValuesContent } from 'vs/platform/configuration/common/model';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { Position } from 'vs/platform/editor/common/editor';
import { EditorInput } from 'vs/workbench/common/editor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IFileService, IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { IMessageService, Severity, CloseAction } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IFoldingController, ID as FoldingContributionId } from 'vs/editor/contrib/folding/common/folding';


interface IWorkbenchSettingsConfiguration {
	workbench: {
		settings: {
			openDefaultSettings: boolean;
		}
	};
}

export class BaseTwoEditorsAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService protected fileService: IFileService,
		@IWorkspaceConfigurationService protected configurationService: IWorkspaceConfigurationService,
		@IMessageService protected messageService: IMessageService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(id, label);

		this.enabled = true;
	}

	protected createIfNotExists(resource: URI, contents: string): TPromise<boolean> {
		return this.fileService.resolveContent(resource, { acceptTextOnly: true }).then(null, error => {
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return this.fileService.updateContent(resource, contents).then(null, error => {
					return TPromise.wrapError(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", labels.getPathLabel(resource, this.contextService), error)));
				});
			}

			return TPromise.wrapError(error);
		});
	}

	protected openTwoEditors(leftHandDefaultInput: StringEditorInput, editableResource: URI, defaultEditableContents: string): TPromise<void> {

		// Create as needed and open in editor
		return this.createIfNotExists(editableResource, defaultEditableContents).then(() => {
			return this.editorService.createInput({ resource: editableResource }).then(typedRightHandEditableInput => {
				const editors = [
					{ input: leftHandDefaultInput, position: Position.ONE, options: { pinned: true } },
					{ input: typedRightHandEditableInput, position: Position.TWO, options: { pinned: true } }
				];

				return this.editorService.openEditors(editors).then(() => {
					this.editorGroupService.focusGroup(Position.TWO);
				});
			});
		});
	}
}

export class BaseOpenSettingsAction extends BaseTwoEditorsAction {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IFileService fileService: IFileService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, editorService, editorGroupService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	protected open(emptySettingsContents: string, settingsResource: URI): TPromise<void> {
		const openDefaultSettings = !!this.configurationService.getConfiguration<IWorkbenchSettingsConfiguration>().workbench.settings.openDefaultSettings;

		if (openDefaultSettings) {
			return this.openTwoEditors(DefaultSettingsInput.getInstance(this.instantiationService, this.configurationService), settingsResource, emptySettingsContents);
		}

		// Create as needed and open in editor
		return this.createIfNotExists(settingsResource, emptySettingsContents).then(() => this.editorService.openEditor({
			resource: settingsResource,
			options: { pinned: true }
		}).then(() => null));
	}
}

export class OpenGlobalSettingsAction extends BaseOpenSettingsAction {

	public static ID = 'workbench.action.openGlobalSettings';
	public static LABEL = nls.localize('openGlobalSettings', "Open User Settings");

	private static SETTINGS_INFO_IGNORE_KEY = 'settings.workspace.info.ignore';

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IFileService fileService: IFileService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label, editorService, editorGroupService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	public run(event?: any): TPromise<void> {

		// Inform user about workspace settings
		if (this.configurationService.hasWorkspaceConfiguration() && !this.storageService.getBoolean(OpenGlobalSettingsAction.SETTINGS_INFO_IGNORE_KEY, StorageScope.WORKSPACE)) {
			this.messageService.show(Severity.Info, {
				message: nls.localize('workspaceHasSettings', "The currently opened folder contains workspace settings that may override user settings"),
				actions: [
					new Action('open.workspaceSettings', nls.localize('openWorkspaceSettings', "Open Workspace Settings"), null, true, () => {
						const editorCount = this.editorService.getVisibleEditors().length;

						return this.editorService.createInput({ resource: this.contextService.toResource(WORKSPACE_CONFIG_DEFAULT_PATH) }).then(typedInput => {
							return this.editorService.openEditor(typedInput, { pinned: true }, editorCount === 2 ? Position.THREE : editorCount === 1 ? Position.TWO : void 0);
						});
					}),
					new Action('neverShowAgain', nls.localize('neverShowAgain', "Don't show again"), null, true, () => {
						this.storageService.store(OpenGlobalSettingsAction.SETTINGS_INFO_IGNORE_KEY, true, StorageScope.WORKSPACE);

						return TPromise.as(true);
					}),
					CloseAction
				]
			});
		}

		// Open settings
		const emptySettingsHeader = nls.localize('emptySettingsHeader', "Place your settings in this file to overwrite the default settings");

		return this.open('// ' + emptySettingsHeader + '\n{\n}', URI.file(this.environmentService.appSettingsPath));
	}
}

export class OpenGlobalKeybindingsAction extends BaseTwoEditorsAction {

	public static ID = 'workbench.action.openGlobalKeybindings';
	public static LABEL = nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IFileService fileService: IFileService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label, editorService, editorGroupService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	public run(event?: any): TPromise<void> {
		const emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to overwrite the defaults") + '\n[\n]';

		return this.openTwoEditors(DefaultKeybindingsInput.getInstance(this.instantiationService, this.keybindingService), URI.file(this.environmentService.appKeybindingsPath), emptyContents);
	}
}

export class OpenWorkspaceSettingsAction extends BaseOpenSettingsAction {

	public static ID = 'workbench.action.openWorkspaceSettings';
	public static LABEL = nls.localize('openWorkspaceSettings', "Open Workspace Settings");

	public run(event?: any): TPromise<void> {
		if (!this.contextService.getWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));

			return;
		}

		const emptySettingsHeader = [
			'// ' + nls.localize('emptySettingsHeader1', "Place your settings in this file to overwrite default and user settings."),
			'{',
			'}'
		].join('\n');

		return this.open(emptySettingsHeader, this.contextService.toResource('.vscode/settings.json'));
	}
}

class DefaultSettingsInput extends StringEditorInput {
	static RESOURCE: URI = URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' }); // URI is used to register JSON schema support
	private static INSTANCE: DefaultSettingsInput;

	private _willDispose = new Emitter<void>();
	public willDispose: Event<void> = this._willDispose.event;

	public static getInstance(instantiationService: IInstantiationService, configurationService: IWorkspaceConfigurationService): DefaultSettingsInput {
		if (!DefaultSettingsInput.INSTANCE) {
			const editorConfig = configurationService.getConfiguration<any>();
			const defaults = getDefaultValuesContent(editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t');

			let defaultsHeader = '// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file.");
			defaultsHeader += '\n// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings.");
			DefaultSettingsInput.INSTANCE = instantiationService.createInstance(DefaultSettingsInput, nls.localize('defaultName', "Default Settings"), null, defaultsHeader + '\n' + defaults, 'application/json', false);
		}

		return DefaultSettingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return DefaultSettingsInput.RESOURCE;
	}

	public dispose() {
		this._willDispose.fire();
		this._willDispose.dispose();
		super.dispose();
	}
}

class DefaultKeybindingsInput extends StringEditorInput {
	private static INSTANCE: DefaultKeybindingsInput;

	public static getInstance(instantiationService: IInstantiationService, keybindingService: IKeybindingService): DefaultKeybindingsInput {
		if (!DefaultKeybindingsInput.INSTANCE) {
			const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
			const defaultContents = keybindingService.getDefaultKeybindings();

			DefaultKeybindingsInput.INSTANCE = instantiationService.createInstance(DefaultKeybindingsInput, nls.localize('defaultKeybindings', "Default Keyboard Shortcuts"), null, defaultsHeader + '\n' + defaultContents, 'application/json', false);
		}

		return DefaultKeybindingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' }); // URI is used to register JSON schema support
	}
}

export class DefaultSettingsEditor extends StringEditor {

	public static ID = 'workbench.editors.defaultSettingsEditor';

	private static VIEW_STATE: Map<URI, IEditorViewState> = new Map<URI, IEditorViewState>();

	private inputDisposeListener;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@ICommandService private commandService: ICommandService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService
	) {
		super(telemetryService, instantiationService, contextService, storageService,
			messageService, configurationService, eventService, editorService, themeService, untitledEditorService);
	}

	public getId(): string {
		return DefaultSettingsEditor.ID;
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		this.listenToInput(input);
		return super.setInput(input, options);
	}

	public clearInput(): void {
		this.saveState();
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		super.clearInput();
	}

	protected restoreViewState(input: EditorInput) {
		const viewState = DefaultSettingsEditor.VIEW_STATE.get(this.getResource());
		if (viewState) {
			this.getControl().restoreViewState(viewState);
		} else {
			this.foldAll();
		}
	}

	private saveState() {
		const resource = this.getResource();
		if (DefaultSettingsEditor.VIEW_STATE.has(resource)) {
			DefaultSettingsEditor.VIEW_STATE.delete(resource);
		}
		const state = this.getControl().saveViewState();
		if (state) {
			DefaultSettingsEditor.VIEW_STATE.set(resource, state);
		}
	}

	private getResource(): URI {
		return DefaultSettingsInput.RESOURCE;
	}

	private foldAll() {
		const foldingController = (<ICommonCodeEditor>this.getControl()).getContribution<IFoldingController>(FoldingContributionId);
		foldingController.foldAll();
	}

	private listenToInput(input: EditorInput) {
		if (this.inputDisposeListener) {
			this.inputDisposeListener.dispose();
		}
		if (input instanceof DefaultSettingsInput) {
			this.inputDisposeListener = input.willDispose(() => this.saveState());
		}
	}
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
	new EditorDescriptor(
		DefaultSettingsEditor.ID,
		nls.localize('defaultSettingsEditor', "Default Settings Editor"),
		'vs/workbench/browser/actions/openSettings',
		'DefaultSettingsEditor'
	),
	[
		new SyncDescriptor(DefaultSettingsInput)
		// new SyncDescriptor(DefaultKeybindingsInput),
	]
);

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }
}), 'Preferences: Open User Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL), 'Preferences: Open Workspace Settings', category);