/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import nls = require('vs/nls');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorRegistry, Extensions as EditorExtensions, IEditorInputFactory, EditorInput, IFileEditorInput } from 'vs/workbench/common/editor';
import { AutoSaveConfiguration, HotExitConfiguration, SUPPORTED_ENCODINGS, IFilesConfiguration } from 'vs/platform/files/common/files';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { FILE_EDITOR_INPUT_ID, VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { FileEditorTracker } from 'vs/workbench/parts/files/common/editors/fileEditorTracker';
import { SaveErrorHandler } from 'vs/workbench/parts/files/browser/saveErrorHandler';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import { TextFileEditor } from 'vs/workbench/parts/files/browser/editors/textFileEditor';
import { BinaryFileEditor } from 'vs/workbench/parts/files/browser/editors/binaryFileEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SyncDescriptor, AsyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { DirtyFilesTracker } from 'vs/workbench/parts/files/common/dirtyFilesTracker';

// Viewlet Action
export class OpenExplorerViewletAction extends ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = nls.localize('showExplorerViewlet', "Show Explorer");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

// Register Viewlet
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	'vs/workbench/parts/files/browser/explorerViewlet',
	'ExplorerViewlet',
	VIEWLET_ID,
	nls.localize('explore', "Explorer"),
	'explore',
	0
));

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).setDefaultViewletId(VIEWLET_ID);

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E
};

// Register Action to Open Viewlet
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenExplorerViewletAction, OpenExplorerViewletAction.ID, OpenExplorerViewletAction.LABEL, openViewletKb),
	'View: Show Explorer',
	nls.localize('view', "View")
);

// Register file editors
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		TextFileEditor.ID, // explicit dependency because we don't want these editors lazy loaded
		nls.localize('textFileEditor', "Text File Editor"),
		'vs/workbench/parts/files/browser/editors/textFileEditor',
		'TextFileEditor'
	),
	[
		new SyncDescriptor<EditorInput>(FileEditorInput)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		BinaryFileEditor.ID, // explicit dependency because we don't want these editors lazy loaded
		nls.localize('binaryFileEditor', "Binary File Editor"),
		'vs/workbench/parts/files/browser/editors/binaryFileEditor',
		'BinaryFileEditor'
	),
	[
		new SyncDescriptor<EditorInput>(FileEditorInput)
	]
);

// Register default file input handler
// Note: because of service injection, the descriptor needs to have the exact count
// of arguments as the FileEditorInput constructor. Otherwise when creating an
// instance through the instantiation service he will inject the services wrong!
const descriptor = new AsyncDescriptor<IFileEditorInput>('vs/workbench/parts/files/common/editors/fileEditorInput', 'FileEditorInput', /* DO NOT REMOVE */ void 0, /* DO NOT REMOVE */ void 0);
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerDefaultFileInput(descriptor);

interface ISerializedFileInput {
	resource: string;
	resourceJSON: any;
	encoding?: string;
}

// Register Editor Input Factory
class FileEditorInputFactory implements IEditorInputFactory {
	private configuredEncoding: string;

	constructor(
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService
	) {
		this.onConfiguration(configurationService.getConfiguration<IFilesConfiguration>());

		this.registerListeners();
	}

	private registerListeners(): void {
		this.configurationService.onDidUpdateConfiguration(e => this.onConfiguration(e.config));
	}

	private onConfiguration(config: IFilesConfiguration): void {
		this.configuredEncoding = config.files && config.files.encoding;
	}

	public serialize(editorInput: EditorInput): string {
		const fileEditorInput = <FileEditorInput>editorInput;
		const resource = fileEditorInput.getResource();
		const fileInput: ISerializedFileInput = {
			resource: resource.toString(), // Keep for backwards compatibility
			resourceJSON: resource.toJSON()
		};

		const encoding = fileEditorInput.getPreferredEncoding();
		if (encoding && encoding !== this.configuredEncoding) {
			fileInput.encoding = encoding;
		}

		return JSON.stringify(fileInput);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const fileInput: ISerializedFileInput = JSON.parse(serializedEditorInput);

		return instantiationService.createInstance(FileEditorInput, !!fileInput.resourceJSON ? URI.revive(fileInput.resourceJSON) : URI.parse(fileInput.resource), fileInput.encoding);
	}
}

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditorInputFactory(FILE_EDITOR_INPUT_ID, FileEditorInputFactory);

// Register File Editor Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	FileEditorTracker
);

// Register Save Error Handler
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	SaveErrorHandler
);

// Register Dirty Files Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DirtyFilesTracker
);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'files',
	'order': 9,
	'title': nls.localize('filesConfigurationTitle', "Files"),
	'type': 'object',
	'properties': {
		'files.exclude': {
			'type': 'object',
			'description': nls.localize('exclude', "Configure glob patterns for excluding files and folders."),
			'default': { '**/.git': true, '**/.svn': true, '**/.hg': true, '**/CVS': true, '**/.DS_Store': true },
			'additionalProperties': {
				'anyOf': [
					{
						'type': 'boolean',
						'description': nls.localize('files.exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						'type': 'object',
						'properties': {
							'when': {
								'type': 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								'pattern': '\\w*\\$\\(basename\\)\\w*',
								'default': '$(basename).ext',
								'description': nls.localize('files.exclude.when', "Additional check on the siblings of a matching file. Use $(basename) as variable for the matching file name.")
							}
						}
					}
				]
			}
		},
		'files.associations': {
			'type': 'object',
			'description': nls.localize('associations', "Configure file associations to languages (e.g. \"*.extension\": \"html\"). These have precedence over the default associations of the languages installed."),
		},
		'files.encoding': {
			'type': 'string',
			'enum': Object.keys(SUPPORTED_ENCODINGS),
			'default': 'utf8',
			'description': nls.localize('encoding', "The default character set encoding to use when reading and writing files."),
		},
		'files.autoGuessEncoding': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('autoGuessEncoding', "When enabled, will attempt to guess the character set encoding when opening files")
		},
		'files.eol': {
			'type': 'string',
			'enum': [
				'\n',
				'\r\n'
			],
			'default': (platform.isLinux || platform.isMacintosh) ? '\n' : '\r\n',
			'description': nls.localize('eol', "The default end of line character."),
		},
		'files.trimTrailingWhitespace': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('trimTrailingWhitespace', "When enabled, will trim trailing whitespace when saving a file."),
			'overridable': true
		},
		'files.insertFinalNewline': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('insertFinalNewline', "When enabled, insert a final new line at the end of the file when saving it."),
			'overridable': true
		},
		'files.autoSave': {
			'type': 'string',
			'enum': [AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, , AutoSaveConfiguration.ON_WINDOW_CHANGE],
			'enumDescriptions': [
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.off' }, "A dirty file is never automatically saved."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.afterDelay' }, "A dirty file is automatically saved after the configured 'files.autoSaveDelay'."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.onFocusChange' }, "A dirty file is automatically saved when the editor loses focus."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.onWindowChange' }, "A dirty file is automatically saved when the window loses focus.")
			],
			'default': AutoSaveConfiguration.OFF,
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'autoSave' }, "Controls auto save of dirty files. Accepted values:  '{0}', '{1}', '{2}' (editor loses focus), '{3}' (window loses focus). If set to '{4}', you can configure the delay in 'files.autoSaveDelay'.", AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE, AutoSaveConfiguration.AFTER_DELAY)
		},
		'files.autoSaveDelay': {
			'type': 'number',
			'default': 1000,
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'autoSaveDelay' }, "Controls the delay in ms after which a dirty file is saved automatically. Only applies when 'files.autoSave' is set to '{0}'", AutoSaveConfiguration.AFTER_DELAY)
		},
		'files.watcherExclude': {
			'type': 'object',
			'default': { '**/.git/objects/**': true, '**/node_modules/**': true },
			'description': nls.localize('watcherExclude', "Configure glob patterns of file paths to exclude from file watching. Changing this setting requires a restart. When you experience Code consuming lots of cpu time on startup, you can exclude large folders to reduce the initial load.")
		},
		'files.hotExit': {
			'type': 'string',
			'enum': [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
			'default': HotExitConfiguration.ON_EXIT,
			'enumDescriptions': [
				nls.localize('hotExit.off', 'Disable hot exit.'),
				nls.localize('hotExit.onExit', 'Hot exit will be triggered when the application is closed, that is when the last window is closed on Windows/Linux or when the workbench.action.quit command is triggered (command pallete, keybinding, menu). All windows with backups will be restored upon next launch.'),
				nls.localize('hotExit.onExitAndWindowClose', 'Hot exit will be triggered when the application is closed, that is when the last window is closed on Windows/Linux or when the workbench.action.quit command is triggered (command pallete, keybinding, menu), and also for any window with a folder opened regardless of whether it\'s the last window. All windows without folders opened will be restored upon next launch. To restore folder windows as they were before shutdown set "window.reopenFolders" to "all".')
			],
			'description': nls.localize('hotExit', "Controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
		},
		'files.defaultLanguage': {
			'type': 'string',
			'description': nls.localize('defaultLanguage', "The default language mode that is assigned to new files.")
		}
	}
});

configurationRegistry.registerConfiguration({
	id: 'editor',
	order: 5,
	title: nls.localize('editorConfigurationTitle', "Editor"),
	type: 'object',
	properties: {
		'editor.formatOnSave': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('formatOnSave', "Format a file on save. A formatter must be available, the file must not be auto-saved, and editor must not be shutting down."),
			'overridable': true
		}
	}
});

configurationRegistry.registerConfiguration({
	'id': 'explorer',
	'order': 10,
	'title': nls.localize('explorerConfigurationTitle', "File Explorer"),
	'type': 'object',
	'properties': {
		'explorer.openEditors.visible': {
			'type': 'number',
			'description': nls.localize({ key: 'openEditorsVisible', comment: ['Open is an adjective'] }, "Number of editors shown in the Open Editors pane. Set it to 0 to hide the pane."),
			'default': 9
		},
		'explorer.openEditors.dynamicHeight': {
			'type': 'boolean',
			'description': nls.localize({ key: 'dynamicHeight', comment: ['Open is an adjective'] }, "Controls if the height of the open editors section should adapt dynamically to the number of elements or not."),
			'default': true
		},
		'explorer.autoReveal': {
			'type': 'boolean',
			'description': nls.localize('autoReveal', "Controls if the explorer should automatically reveal and select files when opening them."),
			'default': true
		},
		'explorer.enableDragAndDrop': {
			'type': 'boolean',
			'description': nls.localize('enableDragAndDrop', "Controls if the explorer should allow to move files and folders via drag and drop."),
			'default': true
		}
	}
});
