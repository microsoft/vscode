/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import * as labels from 'vs/base/common/labels';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource, IEditorContext } from 'vs/workbench/common/editor';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerViewlet } from 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import { VIEWLET_ID, ExplorerFocusCondition, FileOnDiskContentProvider } from 'vs/workbench/parts/files/common/files';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { basename } from 'vs/base/common/paths';
import { IListService } from 'vs/platform/list/browser/listService';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IResourceInput, Position } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FileStat, OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { sequence } from 'vs/base/common/async';

// Commands

export const REVEAL_IN_OS_COMMAND_ID = 'revealFileInOS';
export const REVEAL_IN_OS_LABEL = isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder");
export const REVEAL_IN_EXPLORER_COMMAND_ID = 'workbench.command.files.revealInExplorer';
export const REVERT_FILE_COMMAND_ID = 'workbench.action.files.revert';
export const OPEN_TO_SIDE_COMMAND_ID = 'explorer.openToSide';
export const SELECT_FOR_COMPARE_COMMAND_ID = 'workbench.files.command.selectForCompare';

export const COMPARE_SELECTED_COMMAND_ID = 'compareSelected';
export const COMPARE_RESOURCE_COMMAND_ID = 'workbench.files.command.compareFiles';
export const COMPARE_WITH_SAVED_COMMAND_ID = 'workbench.files.action.compareWithSaved';
export const COPY_PATH_COMMAND_ID = 'copyFilePath';

export const SAVE_FILE_AS_COMMAND_ID = 'workbench.action.files.saveAs';
export const SAVE_FILE_AS_LABEL = nls.localize('saveAs', "Save As...");
export const SAVE_FILE_COMMAND_ID = 'workbench.action.files.save';
export const SAVE_FILE_LABEL = nls.localize('save', "Save");

export const SAVE_ALL_COMMAND_ID = 'workbench.command.files.saveAll';
export const SAVE_ALL_LABEL = nls.localize('saveAll', "Save All");

export const SAVE_ALL_IN_GROUP_COMMAND_ID = 'workbench.files.action.saveAllInGroup';

export const SAVE_FILES_COMMAND_ID = 'workbench.command.files.saveFiles';
export const SAVE_FILES_LABEL = nls.localize('saveFiles', "Save All Files");

export const OpenEditorsGroupContext = new RawContextKey<boolean>('groupFocusedInOpenEditors', false);
export const DirtyEditorContext = new RawContextKey<boolean>('dirtyEditor', false);
export const ResourceSelectedForCompareContext = new RawContextKey<boolean>('resourceSelectedForCompare', false);

export const openWindowCommand = (accessor: ServicesAccessor, paths: string[], forceNewWindow: boolean) => {
	const windowsService = accessor.get(IWindowsService);
	windowsService.openWindow(paths, { forceNewWindow });
};

// Commands can get exeucted from a command pallete, from a context menu or from some list using a keybinding
// To cover all these cases we need to properly compute the resource on which the command is being executed
export function getResourceForCommand(resource: URI, listService: IListService, editorService: IWorkbenchEditorService): URI {
	if (URI.isUri(resource)) {
		return resource;
	}

	const list = listService.lastFocusedList;
	if (list && list.isDOMFocused()) {
		const focus = list.getFocus();
		if (focus instanceof FileStat) {
			return focus.resource;
		} else if (focus instanceof OpenEditor) {
			return focus.editorInput.getResource();
		}
	}

	return toResource(editorService.getActiveEditorInput(), { supportSideBySide: true });
}

function getResourcesForCommand(resource: URI, listService: IListService, editorService: IWorkbenchEditorService): URI[] {
	const list = listService.lastFocusedList;
	if (list && list.isDOMFocused() && list instanceof Tree) {
		const selection = list.getSelection();
		if (selection && selection.length > 1) {
			return selection.map(fs => fs.resource);
		}
	}

	const result = getResourceForCommand(resource, listService, editorService);
	return !!result ? [result] : [];
}

function save(resource: URI, isSaveAs: boolean, editorService: IWorkbenchEditorService, fileService: IFileService, untitledEditorService: IUntitledEditorService,
	textFileService: ITextFileService, editorGroupService: IEditorGroupService): TPromise<any> {

	if (resource && (fileService.canHandleResource(resource) || resource.scheme === 'untitled')) {

		// Save As (or Save untitled with associated path)
		if (isSaveAs || resource.scheme === 'untitled') {
			let encodingOfSource: string;
			if (resource.scheme === 'untitled') {
				encodingOfSource = untitledEditorService.getEncoding(resource);
			} else if (resource.scheme === 'file') {
				const textModel = textFileService.models.get(resource);
				encodingOfSource = textModel && textModel.getEncoding(); // text model can be null e.g. if this is a binary file!
			}

			let viewStateOfSource: IEditorViewState;
			const activeEditor = editorService.getActiveEditor();
			const editor = getCodeEditor(activeEditor);
			if (editor) {
				const activeResource = toResource(activeEditor.input, { supportSideBySide: true });
				if (activeResource && (fileService.canHandleResource(activeResource) || resource.scheme === 'untitled') && activeResource.toString() === resource.toString()) {
					viewStateOfSource = editor.saveViewState();
				}
			}

			// Special case: an untitled file with associated path gets saved directly unless "saveAs" is true
			let savePromise: TPromise<URI>;
			if (!isSaveAs && resource.scheme === 'untitled' && untitledEditorService.hasAssociatedFilePath(resource)) {
				savePromise = textFileService.save(resource).then((result) => {
					if (result) {
						return URI.file(resource.fsPath);
					}

					return null;
				});
			}

			// Otherwise, really "Save As..."
			else {
				savePromise = textFileService.saveAs(resource);
			}

			return savePromise.then((target) => {
				if (!target || target.toString() === resource.toString()) {
					return void 0; // save canceled or same resource used
				}

				const replaceWith: IResourceInput = {
					resource: target,
					encoding: encodingOfSource,
					options: {
						pinned: true,
						viewState: viewStateOfSource
					}
				};

				return editorService.replaceEditors([{
					toReplace: { resource: resource },
					replaceWith
				}]).then(() => true);
			});
		}

		// Pin the active editor if we are saving it
		const editor = editorService.getActiveEditor();
		const activeEditorResource = editor && editor.input && editor.input.getResource();
		if (activeEditorResource && activeEditorResource.toString() === resource.toString()) {
			editorGroupService.pinEditor(editor.position, editor.input);
		}

		// Just save
		return textFileService.save(resource, { force: true /* force a change to the file to trigger external watchers if any */ });
	}

	return TPromise.as(false);
}

function saveAll(saveAllArguments: any, editorService: IWorkbenchEditorService, untitledEditorService: IUntitledEditorService,
	textFileService: ITextFileService, editorGroupService: IEditorGroupService): TPromise<any> {

	const stacks = editorGroupService.getStacksModel();

	// Store some properties per untitled file to restore later after save is completed
	const mapUntitledToProperties: { [resource: string]: { encoding: string; indexInGroups: number[]; activeInGroups: boolean[] } } = Object.create(null);
	untitledEditorService.getDirty().forEach(resource => {
		const activeInGroups: boolean[] = [];
		const indexInGroups: number[] = [];
		const encoding = untitledEditorService.getEncoding(resource);

		// For each group
		stacks.groups.forEach((group, groupIndex) => {

			// Find out if editor is active in group
			const activeEditor = group.activeEditor;
			const activeResource = toResource(activeEditor, { supportSideBySide: true });
			activeInGroups[groupIndex] = (activeResource && activeResource.toString() === resource.toString());

			// Find index of editor in group
			indexInGroups[groupIndex] = -1;
			group.getEditors().forEach((editor, editorIndex) => {
				const editorResource = toResource(editor, { supportSideBySide: true });
				if (editorResource && editorResource.toString() === resource.toString()) {
					indexInGroups[groupIndex] = editorIndex;
					return;
				}
			});
		});

		mapUntitledToProperties[resource.toString()] = { encoding, indexInGroups, activeInGroups };
	});

	// Save all
	return textFileService.saveAll(saveAllArguments).then(results => {

		// Reopen saved untitled editors
		const untitledToReopen: { input: IResourceInput, position: Position }[] = [];

		results.results.forEach(result => {
			if (!result.success || result.source.scheme !== 'untitled') {
				return;
			}

			const untitledProps = mapUntitledToProperties[result.source.toString()];
			if (!untitledProps) {
				return;
			}

			// For each position where the untitled file was opened
			untitledProps.indexInGroups.forEach((indexInGroup, index) => {
				if (indexInGroup >= 0) {
					untitledToReopen.push({
						input: {
							resource: result.target,
							encoding: untitledProps.encoding,
							options: {
								pinned: true,
								index: indexInGroup,
								preserveFocus: true,
								inactive: !untitledProps.activeInGroups[index]
							}
						},
						position: index
					});
				}
			});
		});

		if (untitledToReopen.length) {
			return editorService.openEditors(untitledToReopen).then(() => true);
		}

		return void 0;
	});
}

// Command registration

CommandsRegistry.registerCommand({
	id: REVERT_FILE_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const textFileService = accessor.get(ITextFileService);
		const messageService = accessor.get(IMessageService);
		resource = getResourceForCommand(resource, accessor.get(IListService), editorService);

		if (resource && resource.scheme !== 'untitled') {
			return textFileService.revert(resource, { force: true }).then(null, error => {
				messageService.show(Severity.Error, nls.localize('genericRevertError', "Failed to revert '{0}': {1}", basename(resource.fsPath), toErrorMessage(error, false)));
			});
		}

		return TPromise.as(true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	id: OPEN_TO_SIDE_COMMAND_ID, handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		const resources = getResourcesForCommand(resource, listService, editorService);

		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		// Set side input
		if (resources.length) {
			return editorService.openEditors(resources.map(resource => {
				return {
					input: {
						resource,
						options: { preserveFocus: false }
					}
				};
			}), true);
		}

		return TPromise.as(true);
	}
});

const COMPARE_WITH_SAVED_SCHEMA = 'showModifications';
let provider: FileOnDiskContentProvider;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COMPARE_WITH_SAVED_COMMAND_ID,
	when: undefined,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_D),
	handler: (accessor, resource: URI) => {
		if (!provider) {
			const instantiationService = accessor.get(IInstantiationService);
			const textModelService = accessor.get(ITextModelService);
			provider = instantiationService.createInstance(FileOnDiskContentProvider);
			textModelService.registerTextModelContentProvider(COMPARE_WITH_SAVED_SCHEMA, provider);
		}

		const editorService = accessor.get(IWorkbenchEditorService);
		resource = getResourceForCommand(resource, accessor.get(IListService), editorService);

		if (resource && resource.scheme === 'file') {
			const name = paths.basename(resource.fsPath);
			const editorLabel = nls.localize('modifiedLabel', "{0} (on disk) ↔ {1}", name, name);

			return editorService.openEditor({ leftResource: URI.from({ scheme: COMPARE_WITH_SAVED_SCHEMA, path: resource.fsPath }), rightResource: resource, label: editorLabel });
		}

		return TPromise.as(true);
	}
});

let globalResourceToCompare: URI;
let resourceSelectedForCompareContext: IContextKey<boolean>;
CommandsRegistry.registerCommand({
	id: SELECT_FOR_COMPARE_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
			tree.DOMFocus();
		}

		globalResourceToCompare = getResourceForCommand(resource, listService, accessor.get(IWorkbenchEditorService));
		if (!resourceSelectedForCompareContext) {
			resourceSelectedForCompareContext = ResourceSelectedForCompareContext.bindTo(accessor.get(IContextKeyService));
		}
		resourceSelectedForCompareContext.set(true);
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_SELECTED_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const resources = getResourcesForCommand(resource, accessor.get(IListService), editorService);

		return editorService.openEditor({
			leftResource: resources[0],
			rightResource: resources[1]
		});
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_RESOURCE_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		return editorService.openEditor({
			leftResource: globalResourceToCompare,
			rightResource: getResourceForCommand(resource, listService, editorService)
		});
	}
});

const revealInOSHandler = (accessor: ServicesAccessor, resource: URI) => {
	// Without resource, try to look at the active editor
	const resources = getResourcesForCommand(resource, accessor.get(IListService), accessor.get(IWorkbenchEditorService));

	if (resources.length) {
		const windowsService = accessor.get(IWindowsService);
		sequence(resources.map(r => () => windowsService.showItemInFolder(paths.normalize(r.fsPath, true))));
	} else {
		const messageService = accessor.get(IMessageService);
		messageService.show(severity.Info, nls.localize('openFileToReveal', "Open a file first to reveal"));
	}
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REVEAL_IN_OS_COMMAND_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_R),
	secondary: [KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R],
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_R
	},
	handler: revealInOSHandler
});
// TODO@isidor deprecated remove in february
CommandsRegistry.registerCommand({
	id: 'workbench.action.files.revealActiveFileInWindows',
	handler: revealInOSHandler
});

const copyPathHandler = (accessor, resource: URI) => {
	const resources = getResourcesForCommand(resource, accessor.get(IListService), accessor.get(IWorkbenchEditorService));
	if (resources.length) {
		const clipboardService = accessor.get(IClipboardService);
		const text = resources.map(r => r.scheme === 'file' ? labels.getPathLabel(r) : r.toString()).join('\n');
		clipboardService.writeText(text);
	} else {
		const messageService = accessor.get(IMessageService);
		messageService.show(severity.Info, nls.localize('openFileToCopy', "Open a file first to copy its path"));
	}
};

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C
	},
	id: COPY_PATH_COMMAND_ID,
	handler: copyPathHandler
});

// TODO@isidor deprecated remove in february
CommandsRegistry.registerCommand({
	id: 'workbench.action.files.copyPathOfActiveFile',
	handler: copyPathHandler
});

CommandsRegistry.registerCommand({
	id: REVEAL_IN_EXPLORER_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const viewletService = accessor.get(IViewletService);
		const contextService = accessor.get(IWorkspaceContextService);
		resource = getResourceForCommand(resource, accessor.get(IListService), accessor.get(IWorkbenchEditorService));

		viewletService.openViewlet(VIEWLET_ID, false).then((viewlet: ExplorerViewlet) => {
			const isInsideWorkspace = contextService.isInsideWorkspace(resource);
			if (isInsideWorkspace) {
				const explorerView = viewlet.getExplorerView();
				if (explorerView) {
					explorerView.setExpanded(true);
					explorerView.select(resource, true);
				}
			} else {
				const openEditorsView = viewlet.getOpenEditorsView();
				if (openEditorsView) {
					openEditorsView.setExpanded(true);
				}
			}
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SAVE_FILE_AS_COMMAND_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: undefined,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S,
	handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		resource = getResourceForCommand(resource, accessor.get(IListService), editorService);
		return save(resource, true, editorService, accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_S,
	id: SAVE_FILE_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		resource = getResourceForCommand(resource, accessor.get(IListService), editorService);
		return save(resource, false, editorService, accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_COMMAND_ID,
	handler: (accessor) => {
		return saveAll(true, accessor.get(IWorkbenchEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_IN_GROUP_COMMAND_ID,
	handler: (accessor, resource: URI, editorContext: IEditorContext) => {
		let saveAllArg: any;
		if (!editorContext) {
			saveAllArg = true;
		} else {
			const fileService = accessor.get(IFileService);
			const editorGroup = editorContext.group;
			saveAllArg = [];
			editorGroup.getEditors().forEach(editor => {
				const resource = toResource(editor, { supportSideBySide: true });
				if (resource && (resource.scheme === 'untitled' || fileService.canHandleResource(resource))) {
					saveAllArg.push(resource);
				}
			});
		}

		return saveAll(saveAllArg, accessor.get(IWorkbenchEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_FILES_COMMAND_ID,
	handler: (accessor) => {
		return saveAll(false, accessor.get(IWorkbenchEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});
