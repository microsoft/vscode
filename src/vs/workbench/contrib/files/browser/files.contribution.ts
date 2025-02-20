/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { sep } from '../../../../base/common/path.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IFileEditorInput, IEditorFactoryRegistry, EditorExtensions } from '../../../common/editor.js';
import { AutoSaveConfiguration, HotExitConfiguration, FILES_EXCLUDE_CONFIG, FILES_ASSOCIATIONS_CONFIG, FILES_READONLY_INCLUDE_CONFIG, FILES_READONLY_EXCLUDE_CONFIG, FILES_READONLY_FROM_PERMISSIONS_CONFIG } from '../../../../platform/files/common/files.js';
import { SortOrder, LexicographicOptions, FILE_EDITOR_INPUT_ID, BINARY_TEXT_FILE_MODE, UndoConfirmLevel, IFilesConfiguration } from '../common/files.js';
import { TextFileEditorTracker } from './editors/textFileEditorTracker.js';
import { TextFileSaveErrorHandler } from './editors/textFileSaveErrorHandler.js';
import { FileEditorInput } from './editors/fileEditorInput.js';
import { BinaryFileEditor } from './editors/binaryFileEditor.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { isNative, isWeb, isWindows } from '../../../../base/common/platform.js';
import { ExplorerViewletViewsContribution } from './explorerViewlet.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../browser/editor.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ExplorerService, UNDO_REDO_SOURCE } from './explorerService.js';
import { GUESSABLE_ENCODINGS, SUPPORTED_ENCODINGS } from '../../../services/textfile/common/encoding.js';
import { Schemas } from '../../../../base/common/network.js';
import { WorkspaceWatcher } from './workspaceWatcher.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { DirtyFilesIndicator } from '../common/dirtyFilesIndicator.js';
import { UndoCommand, RedoCommand } from '../../../../editor/browser/editorExtensions.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { IExplorerService } from './files.js';
import { FileEditorInputSerializer, FileEditorWorkingCopyEditorHandler } from './editors/fileEditorHandler.js';
import { ModesRegistry } from '../../../../editor/common/languages/modesRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TextFileEditor } from './editors/textFileEditor.js';

class FileUriLabelContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.fileUriLabel';

	constructor(@ILabelService labelService: ILabelService) {
		labelService.registerFormatter({
			scheme: Schemas.file,
			formatting: {
				label: '${authority}${path}',
				separator: sep,
				tildify: !isWindows,
				normalizeDriveLetter: isWindows,
				authorityPrefix: sep + sep,
				workspaceSuffix: ''
			}
		});
	}
}

registerSingleton(IExplorerService, ExplorerService, InstantiationType.Delayed);

// Register file editors

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TextFileEditor,
		TextFileEditor.ID,
		nls.localize('textFileEditor', "Text File Editor")
	),
	[
		new SyncDescriptor(FileEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		BinaryFileEditor,
		BinaryFileEditor.ID,
		nls.localize('binaryFileEditor', "Binary File Editor")
	),
	[
		new SyncDescriptor(FileEditorInput)
	]
);

// Register default file input factory
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerFileEditorFactory({

	typeId: FILE_EDITOR_INPUT_ID,

	createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService): IFileEditorInput => {
		return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
	},

	isFileEditor: (obj): obj is IFileEditorInput => {
		return obj instanceof FileEditorInput;
	}
});

// Register Editor Input Serializer & Handler
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(FILE_EDITOR_INPUT_ID, FileEditorInputSerializer);
registerWorkbenchContribution2(FileEditorWorkingCopyEditorHandler.ID, FileEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);

// Register Explorer views
registerWorkbenchContribution2(ExplorerViewletViewsContribution.ID, ExplorerViewletViewsContribution, WorkbenchPhase.BlockStartup);

// Register Text File Editor Tracker
registerWorkbenchContribution2(TextFileEditorTracker.ID, TextFileEditorTracker, WorkbenchPhase.BlockStartup);

// Register Text File Save Error Handler
registerWorkbenchContribution2(TextFileSaveErrorHandler.ID, TextFileSaveErrorHandler, WorkbenchPhase.BlockStartup);

// Register uri display for file uris
registerWorkbenchContribution2(FileUriLabelContribution.ID, FileUriLabelContribution, WorkbenchPhase.BlockStartup);

// Register Workspace Watcher
registerWorkbenchContribution2(WorkspaceWatcher.ID, WorkspaceWatcher, WorkbenchPhase.AfterRestored);

// Register Dirty Files Indicator
registerWorkbenchContribution2(DirtyFilesIndicator.ID, DirtyFilesIndicator, WorkbenchPhase.BlockStartup);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const hotExitConfiguration: IConfigurationPropertySchema = isNative ?
	{
		'type': 'string',
		'scope': ConfigurationScope.APPLICATION,
		'enum': [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
		'default': HotExitConfiguration.ON_EXIT,
		'markdownEnumDescriptions': [
			nls.localize('hotExit.off', 'Disable hot exit. A prompt will show when attempting to close a window with editors that have unsaved changes.'),
			nls.localize('hotExit.onExit', 'Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu). All windows without folders opened will be restored upon next launch. A list of previously opened windows with unsaved files can be accessed via `File > Open Recent > More...`'),
			nls.localize('hotExit.onExitAndWindowClose', 'Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), and also for any window with a folder opened regardless of whether it\'s the last window. All windows without folders opened will be restored upon next launch. A list of previously opened windows with unsaved files can be accessed via `File > Open Recent > More...`')
		],
		'markdownDescription': nls.localize('hotExit', "[Hot Exit](https://aka.ms/vscode-hot-exit) controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
	} : {
		'type': 'string',
		'scope': ConfigurationScope.APPLICATION,
		'enum': [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
		'default': HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE,
		'markdownEnumDescriptions': [
			nls.localize('hotExit.off', 'Disable hot exit. A prompt will show when attempting to close a window with editors that have unsaved changes.'),
			nls.localize('hotExit.onExitAndWindowCloseBrowser', 'Hot exit will be triggered when the browser quits or the window or tab is closed.')
		],
		'markdownDescription': nls.localize('hotExit', "[Hot Exit](https://aka.ms/vscode-hot-exit) controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
	};

configurationRegistry.registerConfiguration({
	'id': 'files',
	'order': 9,
	'title': nls.localize('filesConfigurationTitle', "Files"),
	'type': 'object',
	'properties': {
		[FILES_EXCLUDE_CONFIG]: {
			'type': 'object',
			'markdownDescription': nls.localize('exclude', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files and folders. For example, the File Explorer decides which files and folders to show or hide based on this setting. Refer to the `#search.exclude#` setting to define search-specific excludes. Refer to the `#explorer.excludeGitIgnore#` setting for ignoring files based on your `.gitignore`."),
			'default': {
				...{ '**/.git': true, '**/.svn': true, '**/.hg': true, '**/.DS_Store': true, '**/Thumbs.db': true },
				...(isWeb ? { '**/*.crswap': true /* filter out swap files used for local file access */ } : undefined)
			},
			'scope': ConfigurationScope.RESOURCE,
			'additionalProperties': {
				'anyOf': [
					{
						'type': 'boolean',
						'enum': [true, false],
						'enumDescriptions': [nls.localize('trueDescription', "Enable the pattern."), nls.localize('falseDescription', "Disable the pattern.")],
						'description': nls.localize('files.exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						'type': 'object',
						'properties': {
							'when': {
								'type': 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								'pattern': '\\w*\\$\\(basename\\)\\w*',
								'default': '$(basename).ext',
								'markdownDescription': nls.localize({ key: 'files.exclude.when', comment: ['\\$(basename) should not be translated'] }, "Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.")
							}
						}
					}
				]
			}
		},
		[FILES_ASSOCIATIONS_CONFIG]: {
			'type': 'object',
			'markdownDescription': nls.localize('associations', "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) of file associations to languages (for example `\"*.extension\": \"html\"`). Patterns will match on the absolute path of a file if they contain a path separator and will match on the name of the file otherwise. These have precedence over the default associations of the languages installed."),
			'additionalProperties': {
				'type': 'string'
			}
		},
		'files.encoding': {
			'type': 'string',
			'enum': Object.keys(SUPPORTED_ENCODINGS),
			'default': 'utf8',
			'description': nls.localize('encoding', "The default character set encoding to use when reading and writing files. This setting can also be configured per language."),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE,
			'enumDescriptions': Object.keys(SUPPORTED_ENCODINGS).map(key => SUPPORTED_ENCODINGS[key].labelLong),
			'enumItemLabels': Object.keys(SUPPORTED_ENCODINGS).map(key => SUPPORTED_ENCODINGS[key].labelLong)
		},
		'files.autoGuessEncoding': {
			'type': 'boolean',
			'default': false,
			'markdownDescription': nls.localize('autoGuessEncoding', "When enabled, the editor will attempt to guess the character set encoding when opening files. This setting can also be configured per language. Note, this setting is not respected by text search. Only {0} is respected.", '`#files.encoding#`'),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.candidateGuessEncodings': {
			'type': 'array',
			'items': {
				'type': 'string',
				'enum': Object.keys(GUESSABLE_ENCODINGS),
				'enumDescriptions': Object.keys(GUESSABLE_ENCODINGS).map(key => GUESSABLE_ENCODINGS[key].labelLong)
			},
			'default': [],
			'markdownDescription': nls.localize('candidateGuessEncodings', "List of character set encodings that the editor should attempt to guess in the order they are listed. In case it cannot be determined, {0} is respected", '`#files.encoding#`'),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.eol': {
			'type': 'string',
			'enum': [
				'\n',
				'\r\n',
				'auto'
			],
			'enumDescriptions': [
				nls.localize('eol.LF', "LF"),
				nls.localize('eol.CRLF', "CRLF"),
				nls.localize('eol.auto', "Uses operating system specific end of line character.")
			],
			'default': 'auto',
			'description': nls.localize('eol', "The default end of line character."),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.enableTrash': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('useTrash', "Moves files/folders to the OS trash (recycle bin on Windows) when deleting. Disabling this will delete files/folders permanently.")
		},
		'files.trimTrailingWhitespace': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('trimTrailingWhitespace', "When enabled, will trim trailing whitespace when saving a file."),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.trimTrailingWhitespaceInRegexAndStrings': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('trimTrailingWhitespaceInRegexAndStrings', "When enabled, trailing whitespace will be removed from multiline strings and regexes will be removed on save or when executing 'editor.action.trimTrailingWhitespace'. This can cause whitespace to not be trimmed from lines when there isn't up-to-date token information."),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.insertFinalNewline': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('insertFinalNewline', "When enabled, insert a final new line at the end of the file when saving it."),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.trimFinalNewlines': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('trimFinalNewlines', "When enabled, will trim all new lines after the final new line at the end of the file when saving it."),
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
		},
		'files.autoSave': {
			'type': 'string',
			'enum': [AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE],
			'markdownEnumDescriptions': [
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.off' }, "An editor with changes is never automatically saved."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.afterDelay' }, "An editor with changes is automatically saved after the configured `#files.autoSaveDelay#`."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.onFocusChange' }, "An editor with changes is automatically saved when the editor loses focus."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.onWindowChange' }, "An editor with changes is automatically saved when the window loses focus.")
			],
			'default': isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF,
			'markdownDescription': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'autoSave' }, "Controls [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors that have unsaved changes.", AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE, AutoSaveConfiguration.AFTER_DELAY),
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.autoSaveDelay': {
			'type': 'number',
			'default': 1000,
			'minimum': 0,
			'markdownDescription': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'autoSaveDelay' }, "Controls the delay in milliseconds after which an editor with unsaved changes is saved automatically. Only applies when `#files.autoSave#` is set to `{0}`.", AutoSaveConfiguration.AFTER_DELAY),
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.autoSaveWorkspaceFilesOnly': {
			'type': 'boolean',
			'default': false,
			'markdownDescription': nls.localize('autoSaveWorkspaceFilesOnly', "When enabled, will limit [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors to files that are inside the opened workspace. Only applies when {0} is enabled.", '`#files.autoSave#`'),
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.autoSaveWhenNoErrors': {
			'type': 'boolean',
			'default': false,
			'markdownDescription': nls.localize('autoSaveWhenNoErrors', "When enabled, will limit [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors to files that have no errors reported in them at the time the auto save is triggered. Only applies when {0} is enabled.", '`#files.autoSave#`'),
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.watcherExclude': {
			'type': 'object',
			'patternProperties': {
				'.*': { 'type': 'boolean' }
			},
			'default': { '**/.git/objects/**': true, '**/.git/subtree-cache/**': true, '**/.hg/store/**': true },
			'markdownDescription': nls.localize('watcherExclude', "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from file watching. Paths can either be relative to the watched folder or absolute. Glob patterns are matched relative from the watched folder. When you experience the file watcher process consuming a lot of CPU, make sure to exclude large folders that are of less interest (such as build output folders)."),
			'scope': ConfigurationScope.RESOURCE
		},
		'files.watcherInclude': {
			'type': 'array',
			'items': {
				'type': 'string'
			},
			'default': [],
			'description': nls.localize('watcherInclude', "Configure extra paths to watch for changes inside the workspace. By default, all workspace folders will be watched recursively, except for folders that are symbolic links. You can explicitly add absolute or relative paths to support watching folders that are symbolic links. Relative paths will be resolved to an absolute path using the currently opened workspace."),
			'scope': ConfigurationScope.RESOURCE
		},
		'files.hotExit': hotExitConfiguration,
		'files.defaultLanguage': {
			'type': 'string',
			'markdownDescription': nls.localize('defaultLanguage', "The default language identifier that is assigned to new files. If configured to `${activeEditorLanguage}`, will use the language identifier of the currently active text editor if any.")
		},
		[FILES_READONLY_INCLUDE_CONFIG]: {
			'type': 'object',
			'patternProperties': {
				'.*': { 'type': 'boolean' }
			},
			'default': {},
			'markdownDescription': nls.localize('filesReadonlyInclude', "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to mark as read-only. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. You can exclude matching paths via the `#files.readonlyExclude#` setting. Files from readonly file system providers will always be read-only independent of this setting."),
			'scope': ConfigurationScope.RESOURCE
		},
		[FILES_READONLY_EXCLUDE_CONFIG]: {
			'type': 'object',
			'patternProperties': {
				'.*': { 'type': 'boolean' }
			},
			'default': {},
			'markdownDescription': nls.localize('filesReadonlyExclude', "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from being marked as read-only if they match as a result of the `#files.readonlyInclude#` setting. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. Files from readonly file system providers will always be read-only independent of this setting."),
			'scope': ConfigurationScope.RESOURCE
		},
		[FILES_READONLY_FROM_PERMISSIONS_CONFIG]: {
			'type': 'boolean',
			'markdownDescription': nls.localize('filesReadonlyFromPermissions', "Marks files as read-only when their file permissions indicate as such. This can be overridden via `#files.readonlyInclude#` and `#files.readonlyExclude#` settings."),
			'default': false
		},
		'files.restoreUndoStack': {
			'type': 'boolean',
			'description': nls.localize('files.restoreUndoStack', "Restore the undo stack when a file is reopened."),
			'default': true
		},
		'files.saveConflictResolution': {
			'type': 'string',
			'enum': [
				'askUser',
				'overwriteFileOnDisk'
			],
			'enumDescriptions': [
				nls.localize('askUser', "Will refuse to save and ask for resolving the save conflict manually."),
				nls.localize('overwriteFileOnDisk', "Will resolve the save conflict by overwriting the file on disk with the changes in the editor.")
			],
			'description': nls.localize('files.saveConflictResolution', "A save conflict can occur when a file is saved to disk that was changed by another program in the meantime. To prevent data loss, the user is asked to compare the changes in the editor with the version on disk. This setting should only be changed if you frequently encounter save conflict errors and may result in data loss if used without caution."),
			'default': 'askUser',
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE
		},
		'files.dialog.defaultPath': {
			'type': 'string',
			'pattern': '^((\\/|\\\\\\\\|[a-zA-Z]:\\\\).*)?$', // slash OR UNC-root OR drive-root OR undefined
			'patternErrorMessage': nls.localize('defaultPathErrorMessage', "Default path for file dialogs must be an absolute path (e.g. C:\\\\myFolder or /myFolder)."),
			'description': nls.localize('fileDialogDefaultPath', "Default path for file dialogs, overriding user's home path. Only used in the absence of a context-specific path, such as most recently opened file or folder."),
			'scope': ConfigurationScope.MACHINE
		},
		'files.simpleDialog.enable': {
			'type': 'boolean',
			'description': nls.localize('files.simpleDialog.enable', "Enables the simple file dialog for opening and saving files and folders. The simple file dialog replaces the system file dialog when enabled."),
			'default': false
		},
		'files.participants.timeout': {
			type: 'number',
			default: 60000,
			markdownDescription: nls.localize('files.participants.timeout', "Timeout in milliseconds after which file participants for create, rename, and delete are cancelled. Use `0` to disable participants."),
		}
	}
});

configurationRegistry.registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		'editor.formatOnSave': {
			'type': 'boolean',
			'markdownDescription': nls.localize('formatOnSave', "Format a file on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.", '`#files.autoSave#`'),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE,
		},
		'editor.formatOnSaveMode': {
			'type': 'string',
			'default': 'file',
			'enum': [
				'file',
				'modifications',
				'modificationsIfAvailable'
			],
			'enumDescriptions': [
				nls.localize({ key: 'everything', comment: ['This is the description of an option'] }, "Format the whole file."),
				nls.localize({ key: 'modification', comment: ['This is the description of an option'] }, "Format modifications (requires source control)."),
				nls.localize({ key: 'modificationIfAvailable', comment: ['This is the description of an option'] }, "Will attempt to format modifications only (requires source control). If source control can't be used, then the whole file will be formatted."),
			],
			'markdownDescription': nls.localize('formatOnSaveMode', "Controls if format on save formats the whole file or only modifications. Only applies when `#editor.formatOnSave#` is enabled."),
			'scope': ConfigurationScope.LANGUAGE_OVERRIDABLE,
		},
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
			'description': nls.localize({ key: 'openEditorsVisible', comment: ['Open is an adjective'] }, "The initial maximum number of editors shown in the Open Editors pane. Exceeding this limit will show a scroll bar and allow resizing the pane to display more items."),
			'default': 9,
			'minimum': 1
		},
		'explorer.openEditors.minVisible': {
			'type': 'number',
			'description': nls.localize({ key: 'openEditorsVisibleMin', comment: ['Open is an adjective'] }, "The minimum number of editor slots pre-allocated in the Open Editors pane. If set to 0 the Open Editors pane will dynamically resize based on the number of editors."),
			'default': 0,
			'minimum': 0
		},
		'explorer.openEditors.sortOrder': {
			'type': 'string',
			'enum': ['editorOrder', 'alphabetical', 'fullPath'],
			'description': nls.localize({ key: 'openEditorsSortOrder', comment: ['Open is an adjective'] }, "Controls the sorting order of editors in the Open Editors pane."),
			'enumDescriptions': [
				nls.localize('sortOrder.editorOrder', 'Editors are ordered in the same order editor tabs are shown.'),
				nls.localize('sortOrder.alphabetical', 'Editors are ordered alphabetically by tab name inside each editor group.'),
				nls.localize('sortOrder.fullPath', 'Editors are ordered alphabetically by full path inside each editor group.')
			],
			'default': 'editorOrder'
		},
		'explorer.autoReveal': {
			'type': ['boolean', 'string'],
			'enum': [true, false, 'focusNoScroll'],
			'default': true,
			'enumDescriptions': [
				nls.localize('autoReveal.on', 'Files will be revealed and selected.'),
				nls.localize('autoReveal.off', 'Files will not be revealed and selected.'),
				nls.localize('autoReveal.focusNoScroll', 'Files will not be scrolled into view, but will still be focused.'),
			],
			'description': nls.localize('autoReveal', "Controls whether the Explorer should automatically reveal and select files when opening them.")
		},
		'explorer.autoRevealExclude': {
			'type': 'object',
			'markdownDescription': nls.localize('autoRevealExclude', "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files and folders from being revealed and selected in the Explorer when they are opened. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths."),
			'default': { '**/node_modules': true, '**/bower_components': true },
			'additionalProperties': {
				'anyOf': [
					{
						'type': 'boolean',
						'description': nls.localize('explorer.autoRevealExclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						type: 'object',
						properties: {
							when: {
								type: 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								pattern: '\\w*\\$\\(basename\\)\\w*',
								default: '$(basename).ext',
								description: nls.localize('explorer.autoRevealExclude.when', 'Additional check on the siblings of a matching file. Use $(basename) as variable for the matching file name.')
							}
						}
					}
				]
			}
		},
		'explorer.enableDragAndDrop': {
			'type': 'boolean',
			'description': nls.localize('enableDragAndDrop', "Controls whether the Explorer should allow to move files and folders via drag and drop. This setting only effects drag and drop from inside the Explorer."),
			'default': true
		},
		'explorer.confirmDragAndDrop': {
			'type': 'boolean',
			'description': nls.localize('confirmDragAndDrop', "Controls whether the Explorer should ask for confirmation to move files and folders via drag and drop."),
			'default': true
		},
		'explorer.confirmPasteNative': {
			'type': 'boolean',
			'description': nls.localize('confirmPasteNative', "Controls whether the Explorer should ask for confirmation when pasting native files and folders."),
			'default': true
		},
		'explorer.confirmDelete': {
			'type': 'boolean',
			'description': nls.localize('confirmDelete', "Controls whether the Explorer should ask for confirmation when deleting a file via the trash."),
			'default': true
		},
		'explorer.enableUndo': {
			'type': 'boolean',
			'description': nls.localize('enableUndo', "Controls whether the Explorer should support undoing file and folder operations."),
			'default': true
		},
		'explorer.confirmUndo': {
			'type': 'string',
			'enum': [UndoConfirmLevel.Verbose, UndoConfirmLevel.Default, UndoConfirmLevel.Light],
			'description': nls.localize('confirmUndo', "Controls whether the Explorer should ask for confirmation when undoing."),
			'default': UndoConfirmLevel.Default,
			'enumDescriptions': [
				nls.localize('enableUndo.verbose', 'Explorer will prompt before all undo operations.'),
				nls.localize('enableUndo.default', 'Explorer will prompt before destructive undo operations.'),
				nls.localize('enableUndo.light', 'Explorer will not prompt before undo operations when focused.'),
			],
		},
		'explorer.expandSingleFolderWorkspaces': {
			'type': 'boolean',
			'description': nls.localize('expandSingleFolderWorkspaces', "Controls whether the Explorer should expand multi-root workspaces containing only one folder during initialization"),
			'default': true
		},
		'explorer.sortOrder': {
			'type': 'string',
			'enum': [SortOrder.Default, SortOrder.Mixed, SortOrder.FilesFirst, SortOrder.Type, SortOrder.Modified, SortOrder.FoldersNestsFiles],
			'default': SortOrder.Default,
			'enumDescriptions': [
				nls.localize('sortOrder.default', 'Files and folders are sorted by their names. Folders are displayed before files.'),
				nls.localize('sortOrder.mixed', 'Files and folders are sorted by their names. Files are interwoven with folders.'),
				nls.localize('sortOrder.filesFirst', 'Files and folders are sorted by their names. Files are displayed before folders.'),
				nls.localize('sortOrder.type', 'Files and folders are grouped by extension type then sorted by their names. Folders are displayed before files.'),
				nls.localize('sortOrder.modified', 'Files and folders are sorted by last modified date in descending order. Folders are displayed before files.'),
				nls.localize('sortOrder.foldersNestsFiles', 'Files and folders are sorted by their names. Folders are displayed before files. Files with nested children are displayed before other files.')
			],
			'markdownDescription': nls.localize('sortOrder', "Controls the property-based sorting of files and folders in the Explorer. When `#explorer.fileNesting.enabled#` is enabled, also controls sorting of nested files.")
		},
		'explorer.sortOrderLexicographicOptions': {
			'type': 'string',
			'enum': [LexicographicOptions.Default, LexicographicOptions.Upper, LexicographicOptions.Lower, LexicographicOptions.Unicode],
			'default': LexicographicOptions.Default,
			'enumDescriptions': [
				nls.localize('sortOrderLexicographicOptions.default', 'Uppercase and lowercase names are mixed together.'),
				nls.localize('sortOrderLexicographicOptions.upper', 'Uppercase names are grouped together before lowercase names.'),
				nls.localize('sortOrderLexicographicOptions.lower', 'Lowercase names are grouped together before uppercase names.'),
				nls.localize('sortOrderLexicographicOptions.unicode', 'Names are sorted in Unicode order.')
			],
			'description': nls.localize('sortOrderLexicographicOptions', "Controls the lexicographic sorting of file and folder names in the Explorer.")
		},
		'explorer.sortOrderReverse': {
			'type': 'boolean',
			'description': nls.localize('sortOrderReverse', "Controls whether the file and folder sort order, should be reversed."),
			'default': false,
		},
		'explorer.decorations.colors': {
			type: 'boolean',
			description: nls.localize('explorer.decorations.colors', "Controls whether file decorations should use colors."),
			default: true
		},
		'explorer.decorations.badges': {
			type: 'boolean',
			description: nls.localize('explorer.decorations.badges', "Controls whether file decorations should use badges."),
			default: true
		},
		'explorer.incrementalNaming': {
			'type': 'string',
			enum: ['simple', 'smart', 'disabled'],
			enumDescriptions: [
				nls.localize('simple', "Appends the word \"copy\" at the end of the duplicated name potentially followed by a number."),
				nls.localize('smart', "Adds a number at the end of the duplicated name. If some number is already part of the name, tries to increase that number."),
				nls.localize('disabled', "Disables incremental naming. If two files with the same name exist you will be prompted to overwrite the existing file.")
			],
			description: nls.localize('explorer.incrementalNaming', "Controls which naming strategy to use when giving a new name to a duplicated Explorer item on paste."),
			default: 'simple'
		},
		'explorer.autoOpenDroppedFile': {
			'type': 'boolean',
			'description': nls.localize('autoOpenDroppedFile', "Controls whether the Explorer should automatically open a file when it is dropped into the explorer"),
			'default': true
		},
		'explorer.compactFolders': {
			'type': 'boolean',
			'description': nls.localize('compressSingleChildFolders', "Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element. Useful for Java package structures, for example."),
			'default': true
		},
		'explorer.copyRelativePathSeparator': {
			'type': 'string',
			'enum': [
				'/',
				'\\',
				'auto'
			],
			'enumDescriptions': [
				nls.localize('copyRelativePathSeparator.slash', "Use slash as path separation character."),
				nls.localize('copyRelativePathSeparator.backslash', "Use backslash as path separation character."),
				nls.localize('copyRelativePathSeparator.auto', "Uses operating system specific path separation character."),
			],
			'description': nls.localize('copyRelativePathSeparator', "The path separation character used when copying relative file paths."),
			'default': 'auto'
		},
		'explorer.excludeGitIgnore': {
			type: 'boolean',
			markdownDescription: nls.localize('excludeGitignore', "Controls whether entries in .gitignore should be parsed and excluded from the Explorer. Similar to {0}.", '`#files.exclude#`'),
			default: false,
			scope: ConfigurationScope.RESOURCE
		},
		'explorer.fileNesting.enabled': {
			'type': 'boolean',
			scope: ConfigurationScope.RESOURCE,
			'markdownDescription': nls.localize('fileNestingEnabled', "Controls whether file nesting is enabled in the Explorer. File nesting allows for related files in a directory to be visually grouped together under a single parent file."),
			'default': false,
		},
		'explorer.fileNesting.expand': {
			'type': 'boolean',
			'markdownDescription': nls.localize('fileNestingExpand', "Controls whether file nests are automatically expanded. {0} must be set for this to take effect.", '`#explorer.fileNesting.enabled#`'),
			'default': true,
		},
		'explorer.fileNesting.patterns': {
			'type': 'object',
			scope: ConfigurationScope.RESOURCE,
			'markdownDescription': nls.localize('fileNestingPatterns', "Controls nesting of files in the Explorer. {0} must be set for this to take effect. Each __Item__ represents a parent pattern and may contain a single `*` character that matches any string. Each __Value__ represents a comma separated list of the child patterns that should be shown nested under a given parent. Child patterns may contain several special tokens:\n- `${capture}`: Matches the resolved value of the `*` from the parent pattern\n- `${basename}`: Matches the parent file's basename, the `file` in `file.ts`\n- `${extname}`: Matches the parent file's extension, the `ts` in `file.ts`\n- `${dirname}`: Matches the parent file's directory name, the `src` in `src/file.ts`\n- `*`:  Matches any string, may only be used once per child pattern", '`#explorer.fileNesting.enabled#`'),
			patternProperties: {
				'^[^*]*\\*?[^*]*$': {
					markdownDescription: nls.localize('fileNesting.description', "Each key pattern may contain a single `*` character which will match any string."),
					type: 'string',
					pattern: '^([^,*]*\\*?[^,*]*)(, ?[^,*]*\\*?[^,*]*)*$',
				}
			},
			additionalProperties: false,
			'default': {
				'*.ts': '${capture}.js',
				'*.js': '${capture}.js.map, ${capture}.min.js, ${capture}.d.ts',
				'*.jsx': '${capture}.js',
				'*.tsx': '${capture}.ts',
				'tsconfig.json': 'tsconfig.*.json',
				'package.json': 'package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock',
			}
		}
	}
});

UndoCommand.addImplementation(110, 'explorer', (accessor: ServicesAccessor) => {
	const undoRedoService = accessor.get(IUndoRedoService);
	const explorerService = accessor.get(IExplorerService);
	const configurationService = accessor.get(IConfigurationService);

	const explorerCanUndo = configurationService.getValue<IFilesConfiguration>().explorer.enableUndo;
	if (explorerService.hasViewFocus() && undoRedoService.canUndo(UNDO_REDO_SOURCE) && explorerCanUndo) {
		undoRedoService.undo(UNDO_REDO_SOURCE);
		return true;
	}

	return false;
});

RedoCommand.addImplementation(110, 'explorer', (accessor: ServicesAccessor) => {
	const undoRedoService = accessor.get(IUndoRedoService);
	const explorerService = accessor.get(IExplorerService);
	const configurationService = accessor.get(IConfigurationService);

	const explorerCanUndo = configurationService.getValue<IFilesConfiguration>().explorer.enableUndo;
	if (explorerService.hasViewFocus() && undoRedoService.canRedo(UNDO_REDO_SOURCE) && explorerCanUndo) {
		undoRedoService.redo(UNDO_REDO_SOURCE);
		return true;
	}

	return false;
});

ModesRegistry.registerLanguage({
	id: BINARY_TEXT_FILE_MODE,
	aliases: ['Binary'],
	mimetypes: ['text/x-code-binary']
});
