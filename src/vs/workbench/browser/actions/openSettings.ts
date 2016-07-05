/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import network = require('vs/base/common/network');
import labels = require('vs/base/common/labels');
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import strings = require('vs/base/common/strings');
import {EditorOptions} from 'vs/workbench/common/editor';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {getDefaultValuesContent} from 'vs/platform/configuration/common/model';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {Position} from 'vs/platform/editor/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IFileService, IFileOperationResult, FileOperationResult} from 'vs/platform/files/common/files';
import {IMessageService, Severity, CloseAction} from 'vs/platform/message/common/message';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class BaseTwoEditorsAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFileService protected fileService: IFileService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IMessageService protected messageService: IMessageService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(id, label);

		this.enabled = true;
	}

	protected createIfNotExists(resource: URI, contents: string): TPromise<boolean> {
		return this.fileService.resolveContent(resource, { acceptTextOnly: true }).then(null, (error) => {
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return this.fileService.updateContent(resource, contents).then(null, (error) => {
					return TPromise.wrapError(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", labels.getPathLabel(resource, this.contextService), error)));
				});
			}

			return TPromise.wrapError(error);
		});
	}

	protected openTwoEditors(leftHandDefaultInput: StringEditorInput, editableResource: URI, defaultEditableContents: string): TPromise<void> {

		// Create as needed and open in editor
		return this.createIfNotExists(editableResource, defaultEditableContents).then(() => {
			return this.editorService.createInput({ resource: editableResource }).then((typedRightHandEditableInput) => {
				const editors = [
					{ input: leftHandDefaultInput, position: Position.LEFT, options: { pinned: true } },
					{ input: typedRightHandEditableInput, position: Position.CENTER, options: { pinned: true } }
				];

				return this.editorService.openEditors(editors).then(() => {
					this.editorGroupService.focusGroup(Position.CENTER);
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
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, editorService, editorGroupService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	protected open(emptySettingsContents: string, settingsResource: URI): TPromise<void> {
		return this.openTwoEditors(DefaultSettingsInput.getInstance(this.instantiationService, this.configurationService), settingsResource, emptySettingsContents);
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
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService
	) {
		super(id, label, editorService, editorGroupService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	public run(event?: any): TPromise<void> {

		// Inform user about workspace settings
		if (this.configurationService.hasWorkspaceConfiguration() && !this.storageService.getBoolean(OpenGlobalSettingsAction.SETTINGS_INFO_IGNORE_KEY, StorageScope.WORKSPACE)) {
			this.messageService.show(Severity.Info, {
				message: nls.localize('workspaceHasSettings', "The currently opened folder contains workspace settings that may override user settings"),
				actions: [
					CloseAction,
					new Action('neverShowAgain', nls.localize('neverShowAgain', "Don't show again"), null, true, () => {
						this.storageService.store(OpenGlobalSettingsAction.SETTINGS_INFO_IGNORE_KEY, true, StorageScope.WORKSPACE);

						return TPromise.as(true);
					}),
					new Action('open.workspaceSettings', nls.localize('openWorkspaceSettings', "Open Workspace Settings"), null, true, () => {
						let editorCount = this.editorService.getVisibleEditors().length;

						return this.editorService.createInput({ resource: this.contextService.toResource('.vscode/settings.json') }).then((typedInput) => {
							return this.editorService.openEditor(typedInput, EditorOptions.create({ pinned: true }), editorCount === 2 ? Position.RIGHT : editorCount === 1 ? Position.CENTER : void 0);
						});
					})
				]
			});
		}

		// Open settings
		let emptySettingsHeader = nls.localize('emptySettingsHeader', "Place your settings in this file to overwrite the default settings");

		return this.open('// ' + emptySettingsHeader + '\n{\n}', URI.file(this.contextService.getConfiguration().env.appSettingsPath));
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
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, editorService, editorGroupService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	public run(event?: any): TPromise<void> {
		let emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to overwrite the defaults") + '\n[\n]';

		return this.openTwoEditors(DefaultKeybindingsInput.getInstance(this.instantiationService, this.keybindingService), URI.file(this.contextService.getConfiguration().env.appKeybindingsPath), emptyContents);
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

		let emptySettingsHeader = [
			'// ' + nls.localize('emptySettingsHeader1', "Place your settings in this file to overwrite default and user settings."),
			'{',
			'}'
		].join('\n');

		return this.open(emptySettingsHeader, this.contextService.toResource('.vscode/settings.json'));
	}
}

class DefaultSettingsInput extends StringEditorInput {
	private static INSTANCE: DefaultSettingsInput;

	public static getInstance(instantiationService: IInstantiationService, configurationService: IConfigurationService): DefaultSettingsInput {
		if (!DefaultSettingsInput.INSTANCE) {
			let editorConfig = configurationService.getConfiguration<any>();
			let defaults = getDefaultValuesContent(editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t');

			let defaultsHeader = '// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file.");
			defaultsHeader += '\n// ' + nls.localize('defaultSettingsHeader2', "See http://go.microsoft.com/fwlink/?LinkId=808995 for the most commonly used settings.");
			DefaultSettingsInput.INSTANCE = instantiationService.createInstance(DefaultSettingsInput, nls.localize('defaultName', "Default Settings"), null, defaultsHeader + '\n' + defaults, 'application/json', false);
		}

		return DefaultSettingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/settings.json' }); // URI is used to register JSON schema support
	}
}

class DefaultKeybindingsInput extends StringEditorInput {
	private static INSTANCE: DefaultKeybindingsInput;

	public static getInstance(instantiationService: IInstantiationService, keybindingService: IKeybindingService): DefaultKeybindingsInput {
		if (!DefaultKeybindingsInput.INSTANCE) {
			let defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
			let defaultContents = keybindingService.getDefaultKeybindings();

			DefaultKeybindingsInput.INSTANCE = instantiationService.createInstance(DefaultKeybindingsInput, nls.localize('defaultKeybindings', "Default Keyboard Shortcuts"), null, defaultsHeader + '\n' + defaultContents, 'application/json', false);
		}

		return DefaultKeybindingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return URI.from({ scheme: network.Schemas.vscode, authority: 'defaultsettings', path: '/keybindings.json' }); // URI is used to register JSON schema support
	}
}

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }
}), 'Preferences: Open User Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL), 'Preferences: Open Workspace Settings', category);