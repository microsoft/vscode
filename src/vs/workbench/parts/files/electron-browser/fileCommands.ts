/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import { TPromise } from 'vs/base/common/winjs.base';
import * as labels from 'vs/base/common/labels';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource, IEditorCommandsContext } from 'vs/workbench/common/editor';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerFocusCondition, FileOnDiskContentProvider, VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { ExplorerViewlet } from 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
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
import { sequence } from 'vs/base/common/async';
import { getResourceForCommand, getMultiSelectedResources } from 'vs/workbench/parts/files/browser/files';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { getMultiSelectedEditorContexts } from 'vs/workbench/browser/parts/editor/editorCommands';
import { Schemas } from 'vs/base/common/network';
import { INotificationService } from 'vs/platform/notification/common/notification';

// Commands

export const REVEAL_IN_OS_COMMAND_ID = 'revealFileInOS';
export const REVEAL_IN_OS_LABEL = isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder");
export const REVEAL_IN_EXPLORER_COMMAND_ID = 'revealInExplorer';
export const REVERT_FILE_COMMAND_ID = 'workbench.action.files.revert';
export const OPEN_TO_SIDE_COMMAND_ID = 'explorer.openToSide';
export const SELECT_FOR_COMPARE_COMMAND_ID = 'selectForCompare';

export const COMPARE_SELECTED_COMMAND_ID = 'compareSelected';
export const COMPARE_RESOURCE_COMMAND_ID = 'compareFiles';
export const COMPARE_WITH_SAVED_COMMAND_ID = 'workbench.files.action.compareWithSaved';
export const COPY_PATH_COMMAND_ID = 'copyFilePath';

export const SAVE_FILE_AS_COMMAND_ID = 'workbench.action.files.saveAs';
export const SAVE_FILE_AS_LABEL = nls.localize('saveAs', "Save As...");
export const SAVE_FILE_COMMAND_ID = 'workbench.action.files.save';
export const SAVE_FILE_LABEL = nls.localize('save', "Save");

export const SAVE_ALL_COMMAND_ID = 'saveAll';
export const SAVE_ALL_LABEL = nls.localize('saveAll', "Save All");

export const SAVE_ALL_IN_GROUP_COMMAND_ID = 'workbench.files.action.saveAllInGroup';

export const SAVE_FILES_COMMAND_ID = 'workbench.action.files.saveFiles';

export const OpenEditorsGroupContext = new RawContextKey<boolean>('groupFocusedInOpenEditors', false);
export const DirtyEditorContext = new RawContextKey<boolean>('dirtyEditor', false);
export const ResourceSelectedForCompareContext = new RawContextKey<boolean>('resourceSelectedForCompare', false);

export const REMOVE_ROOT_FOLDER_COMMAND_ID = 'removeRootFolder';
export const REMOVE_ROOT_FOLDER_LABEL = nls.localize('removeFolderFromWorkspace', "Remove Folder from Workspace");

export const openWindowCommand = (accessor: ServicesAccessor, paths: string[], forceNewWindow: boolean) => {
	const windowsService = accessor.get(IWindowsService);
	windowsService.openWindow(paths, { forceNewWindow });
};

function save(resource: URI, isSaveAs: boolean, editorService: IWorkbenchEditorService, fileService: IFileService, untitledEditorService: IUntitledEditorService,
	textFileService: ITextFileService, editorGroupService: IEditorGroupService): TPromise<any> {

	if (resource && (fileService.canHandleResource(resource) || resource.scheme === Schemas.untitled)) {

		// Save As (or Save untitled with associated path)
		if (isSaveAs || resource.scheme === Schemas.untitled) {
			let encodingOfSource: string;
			if (resource.scheme === Schemas.untitled) {
				encodingOfSource = untitledEditorService.getEncoding(resource);
			} else if (fileService.canHandleResource(resource)) {
				const textModel = textFileService.models.get(resource);
				encodingOfSource = textModel && textModel.getEncoding(); // text model can be null e.g. if this is a binary file!
			}

			let viewStateOfSource: IEditorViewState;
			const activeEditor = editorService.getActiveEditor();
			const editor = getCodeEditor(activeEditor);
			if (editor) {
				const activeResource = toResource(activeEditor.input, { supportSideBySide: true });
				if (activeResource && (fileService.canHandleResource(activeResource) || resource.scheme === Schemas.untitled) && activeResource.toString() === resource.toString()) {
					viewStateOfSource = editor.saveViewState();
				}
			}

			// Special case: an untitled file with associated path gets saved directly unless "saveAs" is true
			let savePromise: TPromise<URI>;
			if (!isSaveAs && resource.scheme === Schemas.untitled && untitledEditorService.hasAssociatedFilePath(resource)) {
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
			if (!result.success || result.source.scheme !== Schemas.untitled) {
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
		const notificationService = accessor.get(INotificationService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService)
			.filter(resource => resource.scheme !== Schemas.untitled);

		if (resources.length) {
			return textFileService.revertAll(resources, { force: true }).then(null, error => {
				notificationService.error(nls.localize('genericRevertError', "Failed to revert '{0}': {1}", resources.map(r => basename(r.fsPath)).join(', '), toErrorMessage(error, false)));
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
		const editorGroupService = accessor.get(IEditorGroupService);
		const listService = accessor.get(IListService);
		const fileService = accessor.get(IFileService);
		const tree = listService.lastFocusedList;
		const resources = getMultiSelectedResources(resource, listService, editorService);
		const stacks = editorGroupService.getStacksModel();
		const activeGroup = stacks.activeGroup;

		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		// Set side input
		if (resources.length) {
			return fileService.resolveFiles(resources.map(resource => ({ resource }))).then(resolved => {
				const editors = resolved.filter(r => r.success && !r.stat.isDirectory).map(r => ({
					input: {
						resource: r.stat.resource,
						options: { preserveFocus: false }
					}
				}));

				return editorService.openEditors(editors, true).then(() => {
					if (activeGroup) {
						editorGroupService.focusGroup(stacks.positionOfGroup(activeGroup) + 1);
					}
				});
			});
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

		if (resource && resource.scheme === Schemas.file /* only files on disk supported for now */) {
			const name = paths.basename(resource.fsPath);
			const editorLabel = nls.localize('modifiedLabel', "{0} (on disk) ↔ {1}", name, name);

			return editorService.openEditor({ leftResource: URI.from({ scheme: COMPARE_WITH_SAVED_SCHEMA, path: resource.fsPath }), rightResource: resource, label: editorLabel }).then(() => void 0);
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
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService);

		if (resources.length === 2) {
			return editorService.openEditor({
				leftResource: resources[0],
				rightResource: resources[1]
			});
		}

		return TPromise.as(true);
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
		}).then(() => void 0);
	}
});

function revealResourcesInOS(resources: URI[], windowsService: IWindowsService, notificationService: INotificationService): void {
	if (resources.length) {
		sequence(resources.map(r => () => windowsService.showItemInFolder(paths.normalize(r.fsPath, true))));
	} else {
		notificationService.info(nls.localize('openFileToReveal', "Open a file first to reveal"));
	}
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REVEAL_IN_OS_COMMAND_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_R
	},
	handler: (accessor: ServicesAccessor, resource: URI) => {
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IWorkbenchEditorService));
		revealResourcesInOS(resources, accessor.get(IWindowsService), accessor.get(INotificationService));
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_R),
	id: 'workbench.action.files.revealActiveFileInWindows',
	handler: (accessor: ServicesAccessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const activeInput = editorService.getActiveEditorInput();
		const resources = activeInput && activeInput.getResource() ? [activeInput.getResource()] : [];
		revealResourcesInOS(resources, accessor.get(IWindowsService), accessor.get(INotificationService));
	}
});

function resourcesToClipboard(resources: URI[], clipboardService: IClipboardService, notificationService: INotificationService): void {
	if (resources.length) {
		const lineDelimiter = isWindows ? '\r\n' : '\n';
		const text = resources.map(r => r.scheme === Schemas.file ? labels.getPathLabel(r) : r.toString()).join(lineDelimiter);
		clipboardService.writeText(text);
	} else {
		notificationService.info(nls.localize('openFileToCopy', "Open a file first to copy its path"));
	}
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C
	},
	id: COPY_PATH_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IWorkbenchEditorService));
		resourcesToClipboard(resources, accessor.get(IClipboardService), accessor.get(INotificationService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_P),
	id: 'workbench.action.files.copyPathOfActiveFile',
	handler: (accessor, resource: URI) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const activeInput = editorService.getActiveEditorInput();
		const resources = activeInput && activeInput.getResource() ? [activeInput.getResource()] : [];
		resourcesToClipboard(resources, accessor.get(IClipboardService), accessor.get(INotificationService));
	}
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
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService);

		if (resources.length === 1) {
			// If only one resource is selected explictly call save since the behavior is a bit different than save all #41841
			return save(resources[0], false, editorService, accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
		}
		return saveAll(resources, editorService, accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
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
	handler: (accessor, resource: URI, editorContext: IEditorCommandsContext) => {
		const contexts = getMultiSelectedEditorContexts(editorContext, accessor.get(IListService));
		const editorGroupService = accessor.get(IEditorGroupService);
		let saveAllArg: any;
		if (!contexts.length) {
			saveAllArg = true;
		} else {
			const fileService = accessor.get(IFileService);
			saveAllArg = [];
			contexts.forEach(context => {
				const editorGroup = editorGroupService.getStacksModel().getGroup(context.groupId);
				editorGroup.getEditors().forEach(editor => {
					const resource = toResource(editor, { supportSideBySide: true });
					if (resource && (resource.scheme === Schemas.untitled || fileService.canHandleResource(resource))) {
						saveAllArg.push(resource);
					}
				});
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

CommandsRegistry.registerCommand({
	id: REMOVE_ROOT_FOLDER_COMMAND_ID,
	handler: (accessor, resource: URI) => {
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const contextService = accessor.get(IWorkspaceContextService);
		const workspace = contextService.getWorkspace();
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IWorkbenchEditorService)).filter(r =>
			// Need to verify resources are workspaces since multi selection can trigger this command on some non workspace resources
			workspace.folders.some(f => f.uri.toString() === r.toString())
		);

		return workspaceEditingService.removeFolders(resources);
	}
});
