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
import * as resources from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource, IEditorContext } from 'vs/workbench/common/editor';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerViewlet } from 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import { VIEWLET_ID, ExplorerFocusCondition } from 'vs/workbench/parts/files/common/files';
import { FileStat } from 'vs/workbench/parts/files/common/explorerModel';
import errors = require('vs/base/common/errors');
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ITextFileService, AutoSaveNotAfterDelayContext } from 'vs/workbench/services/textfile/common/textfiles';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { basename } from 'vs/base/common/paths';
import { IListService } from 'vs/platform/list/browser/listService';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IResourceInput, Position } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { CLOSE_UNMODIFIED_EDITORS_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { ResourceContextKey } from 'vs/workbench/common/resources';

// Commands

export const REVEAL_IN_OS_COMMAND_ID = 'revealFileInOS';
export const REVEAL_IN_EXPLORER_COMMAND_ID = 'workbench.command.files.revealInExplorer';
export const REVERT_FILE_COMMAND_ID = 'workbench.command.files.revert';
export const OPEN_TO_SIDE_COMMAND_ID = 'explorer.openToSide';
export const SELECT_FOR_COMPARE_COMMAND_ID = 'workbench.files.command.selectForCompare';
export const COMPARE_RESOURCE_COMMAND_ID = 'workbench.files.command.compareFiles';
export const COMPARE_WITH_SAVED_COMMAND_ID = 'workbench.files.action.compareWithSaved';
export const COMPARE_WITH_SAVED_SCHEMA = 'showModifications';
export const COPY_PATH_COMMAND_ID = 'copyFilePath';

export const SAVE_FILE_AS_COMMAND_ID = 'workbench.command.files.saveAs';
export const SAVE_FILE_AS_LABEL = nls.localize('saveAs', "Save As...");
export const SAVE_FILE_COMMAND_ID = 'workbench.action.files.save';
export const SAVE_FILE_LABEL = nls.localize('save', "Save");

export const SAVE_ALL_COMMAND_ID = 'workbench.command.files.saveAll';
export const SAVE_ALL_LABEL = nls.localize('saveAll', "Save All");

export const SAVE_ALL_IN_GROUP_COMMAND_ID = 'workbench.action.files.saveAllInGroup';

export const SAVE_FILES_COMMAND_ID = 'workbench.command.files.saveFiles';
export const SAVE_FILES_LABEL = nls.localize('saveFiles', "Save All Files");

export const EditorFocusedInOpenEditorsContext = new RawContextKey<boolean>('editorFocusedInOpenEditors', false);
export const EditorWithResourceFocusedInOpenEditorsContext = new RawContextKey<boolean>('editorWithResourceFocusedInOpenEditors', false);
export const UntitledEditorFocusedInOpenEditorsContext = new RawContextKey<boolean>('untitledEditorFocusedInOpenEditors', false);
export const UntitledEditorNotFocusedInOpenEditorsContext: ContextKeyExpr = UntitledEditorFocusedInOpenEditorsContext.toNegated();
export const GroupFocusedInOpenEditorsContext = new RawContextKey<boolean>('groupFocusedInOpenEditors', false);

export const openWindowCommand = (accessor: ServicesAccessor, paths: string[], forceNewWindow: boolean) => {
	const windowsService = accessor.get(IWindowsService);
	windowsService.openWindow(paths, { forceNewWindow });
};

function runActionOnFocusedFilesExplorerViewItem(accessor: ServicesAccessor, id: string, context?: any): void {
	withFocusedFilesExplorerViewItem(accessor).then(res => {
		if (res) {
			// TODO@Isidor
			// res.explorer.getViewletState().actionProvider.runAction(res.tree, res.item, id, context).done(null, errors.onUnexpectedError);
		}
	});
}

function withVisibleExplorer(accessor: ServicesAccessor): TPromise<ExplorerViewlet> {
	const viewletService = accessor.get(IViewletService);

	const activeViewlet = viewletService.getActiveViewlet();
	if (!activeViewlet || activeViewlet.getId() !== VIEWLET_ID) {
		return TPromise.as(void 0); // Return early if the active viewlet is not the explorer
	}

	return viewletService.openViewlet(VIEWLET_ID, false) as TPromise<ExplorerViewlet>;
}

export function withFocusedFilesExplorerViewItem(accessor: ServicesAccessor): TPromise<{ explorer: ExplorerViewlet, tree: ITree, item: FileStat }> {
	return withFocusedFilesExplorer(accessor).then(res => {
		if (!res) {
			return void 0;
		}

		const { tree, explorer } = res;
		if (!tree || !tree.getFocus()) {
			return void 0;
		}

		return { explorer, tree, item: tree.getFocus() };
	});
}

export function withFocusedFilesExplorer(accessor: ServicesAccessor): TPromise<{ explorer: ExplorerViewlet, tree: ITree }> {
	return withVisibleExplorer(accessor).then(explorer => {
		if (!explorer || !explorer.getExplorerView()) {
			return void 0; // empty folder or hidden explorer
		}

		const tree = explorer.getExplorerView().getViewer();

		// Ignore if in highlight mode or not focused
		if (tree.getHighlight() || !tree.isDOMFocused()) {
			return void 0;
		}

		return { explorer, tree };
	});
}

export const renameFocusedFilesExplorerViewItemCommand = (accessor: ServicesAccessor) => {
	runActionOnFocusedFilesExplorerViewItem(accessor, 'renameFile');
};

export const deleteFocusedFilesExplorerViewItemCommand = (accessor: ServicesAccessor) => {
	runActionOnFocusedFilesExplorerViewItem(accessor, 'moveFileToTrash', { useTrash: false });
};

export const moveFocusedFilesExplorerViewItemToTrashCommand = (accessor: ServicesAccessor) => {
	runActionOnFocusedFilesExplorerViewItem(accessor, 'moveFileToTrash', { useTrash: true });
};

export const copyFocusedFilesExplorerViewItem = (accessor: ServicesAccessor) => {
	runActionOnFocusedFilesExplorerViewItem(accessor, 'filesExplorer.copy');
};


export function computeLabelForCompare(resource: URI, contextService: IWorkspaceContextService, environmentService: IEnvironmentService): string {
	if (globalResourceToCompare) {
		let leftResourceName = paths.basename(globalResourceToCompare.fsPath);
		let rightResourceName = paths.basename(resource.fsPath);

		// If the file names are identical, add more context by looking at the parent folder
		if (leftResourceName === rightResourceName) {
			const folderPaths = labels.shorten([
				labels.getPathLabel(resources.dirname(globalResourceToCompare), contextService, environmentService),
				labels.getPathLabel(resources.dirname(resource), contextService, environmentService)
			]);

			leftResourceName = paths.join(folderPaths[0], leftResourceName);
			rightResourceName = paths.join(folderPaths[1], rightResourceName);
		}

		return nls.localize('compareWith', "Compare '{0}' with '{1}'", leftResourceName, rightResourceName);
	}

	return nls.localize('compareFiles', "Compare Files");
}

export let globalResourceToCompare: URI;

function save(resource: URI, isSaveAs: boolean, editorService: IWorkbenchEditorService, fileService: IFileService, untitledEditorService: IUntitledEditorService,
	textFileService: ITextFileService, editorGroupService: IEditorGroupService): TPromise<any> {

	let source: URI;
	if (resource) {
		source = resource;
	} else {
		source = toResource(editorService.getActiveEditorInput(), { supportSideBySide: true });
	}

	if (source && (fileService.canHandleResource(source) || source.scheme === 'untitled')) {

		// Save As (or Save untitled with associated path)
		if (isSaveAs || source.scheme === 'untitled') {
			let encodingOfSource: string;
			if (source.scheme === 'untitled') {
				encodingOfSource = untitledEditorService.getEncoding(source);
			} else if (source.scheme === 'file') {
				const textModel = textFileService.models.get(source);
				encodingOfSource = textModel && textModel.getEncoding(); // text model can be null e.g. if this is a binary file!
			}

			let viewStateOfSource: IEditorViewState;
			const activeEditor = editorService.getActiveEditor();
			const editor = getCodeEditor(activeEditor);
			if (editor) {
				const activeResource = toResource(activeEditor.input, { supportSideBySide: true });
				if (activeResource && (fileService.canHandleResource(activeResource) || source.scheme === 'untitled') && activeResource.toString() === source.toString()) {
					viewStateOfSource = editor.saveViewState();
				}
			}

			// Special case: an untitled file with associated path gets saved directly unless "saveAs" is true
			let savePromise: TPromise<URI>;
			if (!isSaveAs && source.scheme === 'untitled' && untitledEditorService.hasAssociatedFilePath(source)) {
				savePromise = textFileService.save(source).then((result) => {
					if (result) {
						return URI.file(source.fsPath);
					}

					return null;
				});
			}

			// Otherwise, really "Save As..."
			else {
				savePromise = textFileService.saveAs(source);
			}

			return savePromise.then((target) => {
				if (!target || target.toString() === source.toString()) {
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
					toReplace: { resource: source },
					replaceWith
				}]).then(() => true);
			});
		}

		// Pin the active editor if we are saving it
		if (!resource) {
			const editor = editorService.getActiveEditor();
			if (editor) {
				editorGroupService.pinEditor(editor.position, editor.input);
			}
		}

		// Just save
		return textFileService.save(source, { force: true /* force a change to the file to trigger external watchers if any */ });
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
	handler: (accessor, args: IEditorContext) => {
		let resource: URI;
		const editorService = accessor.get(IWorkbenchEditorService);
		const textFileService = accessor.get(ITextFileService);
		const messageService = accessor.get(IMessageService);

		if (args && args.resource) {
			resource = args.resource;
		} else {
			resource = toResource(editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		}

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
	id: OPEN_TO_SIDE_COMMAND_ID, handler: (accessor, args) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		// Set side input
		return editorService.openEditor({
			resource: args.resource,
			options: {
				preserveFocus: false
			}
		}, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COMPARE_WITH_SAVED_COMMAND_ID,
	when: undefined,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_D),
	handler: (accessor, args: IEditorContext) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		let resource: URI;
		if (args.resource) {
			resource = args.resource;
		} else {
			resource = toResource(editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		}

		if (resource && resource.scheme === 'file') {
			const name = paths.basename(resource.fsPath);
			const editorLabel = nls.localize('modifiedLabel', "{0} (on disk) ↔ {1}", name, name);

			return editorService.openEditor({ leftResource: URI.from({ scheme: COMPARE_WITH_SAVED_SCHEMA, path: resource.fsPath }), rightResource: resource, label: editorLabel });
		}

		return TPromise.as(true);
	}
});

CommandsRegistry.registerCommand({
	id: SELECT_FOR_COMPARE_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
			tree.DOMFocus();
		}

		globalResourceToCompare = args.resource;
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_RESOURCE_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		const editorService = accessor.get(IWorkbenchEditorService);
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		return editorService.openEditor({
			leftResource: globalResourceToCompare,
			rightResource: args.resource
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REVEAL_IN_OS_COMMAND_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_R
	},
	handler: (accessor, args: IEditorContext) => {
		// Without resource, try to look at the active editor
		let resource = args.resource;
		if (!resource) {
			const editorService = accessor.get(IWorkbenchEditorService);
			resource = toResource(editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		}

		if (resource) {
			const windowsService = accessor.get(IWindowsService);
			windowsService.showItemInFolder(paths.normalize(resource.fsPath, true));
		} else {
			const messageService = accessor.get(IMessageService);
			messageService.show(severity.Info, nls.localize('openFileToReveal', "Open a file first to reveal"));
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C
	},
	id: COPY_PATH_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		let resource = args.resource;
		// Without resource, try to look at the active editor
		if (!resource) {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);
			const activeEditor = editorService.getActiveEditor();

			resource = activeEditor ? toResource(activeEditor.input, { supportSideBySide: true }) : void 0;
			if (activeEditor) {
				editorGroupService.focusGroup(activeEditor.position); // focus back to active editor group
			}
		}

		if (resource) {
			const clipboardService = accessor.get(IClipboardService);
			clipboardService.writeText(resource.scheme === 'file' ? labels.getPathLabel(resource) : resource.toString());
		} else {
			const messageService = accessor.get(IMessageService);
			messageService.show(severity.Info, nls.localize('openFileToCopy', "Open a file first to copy its path"));
		}
	}
});

CommandsRegistry.registerCommand({
	id: REVEAL_IN_EXPLORER_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		const viewletService = accessor.get(IViewletService);
		const contextService = accessor.get(IWorkspaceContextService);

		viewletService.openViewlet(VIEWLET_ID, false).then((viewlet: ExplorerViewlet) => {
			const isInsideWorkspace = contextService.isInsideWorkspace(args.resource);
			if (isInsideWorkspace) {
				const explorerView = viewlet.getExplorerView();
				if (explorerView) {
					explorerView.setExpanded(true);
					explorerView.select(args.resource, true);
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

CommandsRegistry.registerCommand({
	id: SAVE_FILE_AS_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		return save(args.resource, true, accessor.get(IWorkbenchEditorService), accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_S,
	id: SAVE_FILE_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		return save(args.resource, false, accessor.get(IWorkbenchEditorService), accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		return saveAll(true, accessor.get(IWorkbenchEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_IN_GROUP_COMMAND_ID,
	handler: (accessor, args: IEditorContext) => {
		let saveAllArg: any;
		if (!args) {
			saveAllArg = true;
		} else {
			const fileService = accessor.get(IFileService);
			const editorGroup = args.group;
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
	handler: (accessor, args: IEditorContext) => {
		return saveAll(false, accessor.get(IWorkbenchEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupService));
	}
});

// Menu registration - open editors

const revealInOsCommand = {
	id: REVEAL_IN_OS_COMMAND_ID,
	title: isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder")
};

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '1_files',
	order: 10,
	command: {
		id: OPEN_TO_SIDE_COMMAND_ID,
		title: nls.localize('openToSide', "Open to the Side")
	},
	when: EditorWithResourceFocusedInOpenEditorsContext
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '1_files',
	order: 20,
	command: revealInOsCommand,
	when: EditorWithResourceFocusedInOpenEditorsContext
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '1_files',
	order: 40,
	command: {
		id: COPY_PATH_COMMAND_ID,
		title: nls.localize('copyPath', "Copy Path")
	},
	when: EditorWithResourceFocusedInOpenEditorsContext
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	order: 10,
	command: {
		id: SAVE_FILE_COMMAND_ID,
		title: SAVE_FILE_LABEL
	},
	when: ContextKeyExpr.and(EditorWithResourceFocusedInOpenEditorsContext, AutoSaveNotAfterDelayContext)
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	order: 20,
	command: {
		id: REVERT_FILE_COMMAND_ID,
		title: nls.localize('revert', "Revert File")
	},
	when: ContextKeyExpr.and(EditorWithResourceFocusedInOpenEditorsContext, AutoSaveNotAfterDelayContext, UntitledEditorNotFocusedInOpenEditorsContext)
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	command: {
		id: SAVE_FILE_AS_COMMAND_ID,
		title: SAVE_FILE_AS_LABEL
	},
	when: ContextKeyExpr.and(EditorWithResourceFocusedInOpenEditorsContext, UntitledEditorFocusedInOpenEditorsContext)
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '2_save',
	command: {
		id: SAVE_ALL_IN_GROUP_COMMAND_ID,
		title: nls.localize('saveAll', "Save All")
	},
	when: ContextKeyExpr.and(GroupFocusedInOpenEditorsContext, AutoSaveNotAfterDelayContext)
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 10,
	command: {
		id: COMPARE_WITH_SAVED_COMMAND_ID,
		title: nls.localize('compareWithSaved', "Compare with Saved")
	},
	when: ContextKeyExpr.and(EditorWithResourceFocusedInOpenEditorsContext, UntitledEditorNotFocusedInOpenEditorsContext)
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 20,
	command: {
		id: COMPARE_RESOURCE_COMMAND_ID,
		title: nls.localize('compareWithChosen', "Compare with Chosen")
	},
	when: ContextKeyExpr.and(EditorWithResourceFocusedInOpenEditorsContext, )
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '3_compare',
	order: 30,
	command: {
		id: SELECT_FOR_COMPARE_COMMAND_ID,
		title: nls.localize('compareSource', "Select for Compare")
	},
	when: EditorWithResourceFocusedInOpenEditorsContext
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '4_close',
	order: 10,
	command: {
		id: CLOSE_EDITOR_COMMAND_ID,
		title: nls.localize('close', "Close")
	},
	when: EditorFocusedInOpenEditorsContext
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '4_close',
	order: 20,
	command: {
		id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
		title: nls.localize('closeOthers', "Close Others")
	},
	when: EditorFocusedInOpenEditorsContext
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '4_close',
	order: 30,
	command: {
		id: CLOSE_UNMODIFIED_EDITORS_COMMAND_ID,
		title: nls.localize('closeUnmodified', "Close Unmodified")
	}
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: '4_close',
	order: 40,
	command: {
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		title: nls.localize('closeAll', "Close All")
	}
});

// Menu registration - explorer

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '1_files',
	order: 20,
	command: revealInOsCommand,
	when: ResourceContextKey.Scheme.isEqualTo('file')
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: '1_files',
	order: 40,
	command: {
		id: COPY_PATH_COMMAND_ID,
		title: nls.localize('copyPath', "Copy Path")
	},
	when: ResourceContextKey.Scheme.isEqualTo('file')
});
