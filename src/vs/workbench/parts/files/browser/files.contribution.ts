/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/files.contribution';

import URI from 'vs/base/common/uri';
import {ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction} from 'vs/workbench/browser/viewlet';
import nls = require('vs/nls');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {Registry} from 'vs/platform/platform';
import {IConfigurationRegistry, Extensions as ConfigurationExtensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';
import {IEditorRegistry, Extensions as EditorExtensions, IEditorInputFactory, EditorInput, IFileEditorInput} from 'vs/workbench/common/editor';
import {FileEditorDescriptor} from 'vs/workbench/parts/files/browser/files';
import {AutoSaveConfiguration, SUPPORTED_ENCODINGS} from 'vs/platform/files/common/files';
import {FILE_EDITOR_INPUT_ID, VIEWLET_ID} from 'vs/workbench/parts/files/common/files';
import {FileTracker} from 'vs/workbench/parts/files/browser/fileTracker';
import {SaveParticipant} from 'vs/workbench/parts/files/common/editors/saveParticipant';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {TextFileEditor} from 'vs/workbench/parts/files/browser/editors/textFileEditor';
import {BinaryFileEditor} from 'vs/workbench/parts/files/browser/editors/binaryFileEditor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {SyncDescriptor, AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IKeybindings} from 'vs/platform/keybinding/common/keybinding';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';

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
(<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).registerViewlet(new ViewletDescriptor(
	'vs/workbench/parts/files/browser/explorerViewlet',
	'ExplorerViewlet',
	VIEWLET_ID,
	nls.localize('explore', "Explorer"),
	'explore',
	0
));

(<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)).setDefaultViewletId(VIEWLET_ID);

let openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E
};

// Register Action to Open Viewlet
const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenExplorerViewletAction, OpenExplorerViewletAction.ID, OpenExplorerViewletAction.LABEL, openViewletKb),
	'View: Show Explorer',
	nls.localize('view', "View")
);

// Register file editors
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
	new FileEditorDescriptor(
		TextFileEditor.ID, // explicit dependency because we don't want these editors lazy loaded
		nls.localize('textFileEditor', "Text File Editor"),
		'vs/workbench/parts/files/browser/editors/textFileEditor',
		'TextFileEditor',
		[
			'text/*',

			// In case the mime type is unknown, we prefer the text file editor over the binary editor to leave a chance
			// of opening a potential text file properly. The resolution of the file in the text file editor will fail
			// early on in case the file is actually binary, to prevent downloading a potential large binary file.
			'application/unknown'
		]
	),
	[
		new SyncDescriptor<EditorInput>(FileEditorInput)
	]
);

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
	new FileEditorDescriptor(
		BinaryFileEditor.ID, // explicit dependency because we don't want these editors lazy loaded
		nls.localize('binaryFileEditor', "Binary File Editor"),
		'vs/workbench/parts/files/browser/editors/binaryFileEditor',
		'BinaryFileEditor',
		[
			'image/*',
			'application/pdf',
			'audio/*',
			'video/*',
			'application/octet-stream'
		]
	),
	[
		new SyncDescriptor<EditorInput>(FileEditorInput)
	]
);

// Register default file input handler
// Note: because of service injection, the descriptor needs to have the exact count
// of arguments as the FileEditorInput constructor. Otherwise when creating an
// instance through the instantiation service he will inject the services wrong!
let descriptor = new AsyncDescriptor<IFileEditorInput>('vs/workbench/parts/files/browser/editors/fileEditorInput', 'FileEditorInput', /* DO NOT REMOVE */ void 0, /* DO NOT REMOVE */ void 0, /* DO NOT REMOVE */ void 0);
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerDefaultFileInput(descriptor);

interface ISerializedFileInput {
	resource: string;
}

// Register Editor Input Factory
class FileEditorInputFactory implements IEditorInputFactory {

	constructor() { }

	public serialize(editorInput: EditorInput): string {
		let fileEditorInput = <FileEditorInput>editorInput;
		let fileInput: ISerializedFileInput = {
			resource: fileEditorInput.getResource().toString()
		};

		return JSON.stringify(fileInput);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		let fileInput: ISerializedFileInput = JSON.parse(serializedEditorInput);

		return instantiationService.createInstance(FileEditorInput, URI.parse(fileInput.resource), void 0, void 0);
	}
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditorInputFactory(FILE_EDITOR_INPUT_ID, FileEditorInputFactory);

// Register File Tracker
(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	FileTracker
);

// Register Save Participant
(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	SaveParticipant
);

// Configuration
let configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'files',
	'order': 9,
	'title': nls.localize('filesConfigurationTitle', "Files"),
	'type': 'object',
	'properties': {
		'files.exclude': {
			'type': 'object',
			'description': nls.localize('exclude', "Configure glob patterns for excluding files and folders."),
			'default': { '**/.git': true, '**/.svn': true, '**/.DS_Store': true },
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
								'description': nls.localize('files.exclude.when', 'Additional check on the siblings of a matching file. Use $(basename) as variable for the matching file name.')
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
			'description': nls.localize('trimTrailingWhitespace', "When enabled, will trim trailing whitespace when you save a file.")
		},
		'files.autoSave': {
			'type': 'string',
			'enum': [AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE],
			'default': AutoSaveConfiguration.OFF,
			'description': nls.localize('autoSave', "Controls auto save of dirty files. Accepted values:  \"{0}\", \"{1}\", \"{2}\". If set to \"{3}\" you can configure the delay in \"files.autoSaveDelay\".", AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.AFTER_DELAY)
		},
		'files.autoSaveDelay': {
			'type': 'number',
			'default': 1000,
			'description': nls.localize('autoSaveDelay', "Controls the delay in ms after which a dirty file is saved automatically. Only applies when \"files.autoSave\" is set to \"{0}\"", AutoSaveConfiguration.AFTER_DELAY)
		},
		'files.watcherExclude': {
			'type': 'object',
			'default': (platform.isLinux || platform.isMacintosh) ? { '**/.git/objects/**': true, '**/node_modules/**': true } : { '**/.git/objects/**': true },
			'description': nls.localize('watcherExclude', "Configure glob patterns of file paths to exclude from file watching. Changing this setting requires a restart. When you experience Code consuming lots of cpu time on startup, you can exclude large folders to reduce the initial load.")
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
			'description': nls.localize('openEditorsVisible', "Number of editors shown in the Open Editors pane. Set it to 0 to hide the pane."),
			'default': 9
		},
		'explorer.openEditors.dynamicHeight': {
			'type': 'boolean',
			'description': nls.localize('dynamicHeight', "Controls if the height of the open editors section should adapt dynamically to the number of elements or not."),
			'default': true
		},
		'explorer.autoReveal': {
			'type': 'boolean',
			'description': nls.localize('autoReveal', "Controls if the explorer should automatically reveal files when opening them."),
			'default': true
		},
		'explorer.enableDragAndDrop': {
			'type': 'boolean',
			'description': nls.localize('enableDragAndDrop', "Controls if the explorer should allow to move files and folders via drag and drop."),
			'default': true
		}
	}
});