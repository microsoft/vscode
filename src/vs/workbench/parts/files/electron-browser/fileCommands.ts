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
import { toResource, IEditorContext, EditorFocusedInOpenEditorsContext, UntitledEditorNotFocusedInOpenEditorsContext, UntitledEditorFocusedInOpenEditorsContext } from 'vs/workbench/common/editor';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerViewlet } from 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import { VIEWLET_ID, explorerItemToFileResource, AutoSaveDisabledContext } from 'vs/workbench/parts/files/common/files';
import { FileStat, OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import errors = require('vs/base/common/errors');
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { basename } from 'vs/base/common/paths';
import { IListService } from 'vs/platform/list/browser/listService';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';

// Commands

export const REVEAL_IN_OS_COMMAND_ID = 'workbench.command.files.revealInOS';
export const REVEAL_IN_EXPLORER_COMMAND_ID = 'workbench.command.files.revealInExplorer';
export const REVERT_FILE_COMMAND_ID = 'workbench.command.files.revert';
export const OPEN_TO_SIDE_COMMAND_ID = 'workbench.command.openToSide';
export const SELECT_FOR_COMPARE_COMMAND_ID = 'workbench.files.command.selectForCompare';
export const COMPARE_RESOURCE_COMMAND_ID = 'workbench.files.command.compareFiles';
export const COMPARE_WITH_SAVED_COMMAND_ID = 'workbench.files.command.compareWithSaved';
export const COMPARE_WITH_SAVED_SCHEMA = 'showModifications';
export const COPY_PATH_COMMAND_ID = 'workbench.command.files.copyPath';

export const SAVE_FILE_AS_COMMAND_ID = 'workbench.command.files.saveAs';
export const SAVE_FILE_AS_LABEL = nls.localize('saveAs', "Save As...");
export const SAVE_FILE_COMMAND_ID = 'workbench.command.files.save';
export const SAVE_FILE_LABEL = nls.localize('save', "Save");
export const BASE_SAVE_ONE_FILE_COMMAND_ID = 'workbench.command.files.saveAs';


registerFileCommands();

export const openWindowCommand = (accessor: ServicesAccessor, paths: string[], forceNewWindow: boolean) => {
	const windowsService = accessor.get(IWindowsService);
	windowsService.openWindow(paths, { forceNewWindow });
};

function openFocusedFilesExplorerViewItem(accessor: ServicesAccessor, sideBySide: boolean): void {
	withFocusedFilesExplorerViewItem(accessor).then(res => {
		if (res) {

			// Directory: Toggle expansion
			if (res.item.isDirectory) {
				res.tree.toggleExpansion(res.item);
			}

			// File: Open
			else {
				const editorService = accessor.get(IWorkbenchEditorService);
				editorService.openEditor({ resource: res.item.resource }, sideBySide).done(null, errors.onUnexpectedError);
			}
		}
	});
}

function openFocusedOpenedEditorsViewItem(accessor: ServicesAccessor, sideBySide: boolean): void {
	withFocusedOpenEditorsViewItem(accessor).then(res => {
		if (res) {
			const editorService = accessor.get(IWorkbenchEditorService);

			editorService.openEditor(res.item.editorInput, null, sideBySide);
		}
	});
}

function runActionOnFocusedFilesExplorerViewItem(accessor: ServicesAccessor, id: string, context?: any): void {
	withFocusedFilesExplorerViewItem(accessor).then(res => {
		if (res) {
			res.explorer.getViewletState().actionProvider.runAction(res.tree, res.item, id, context).done(null, errors.onUnexpectedError);
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

function withFocusedOpenEditorsViewItem(accessor: ServicesAccessor): TPromise<{ explorer: ExplorerViewlet, item: OpenEditor }> {
	return withVisibleExplorer(accessor).then(explorer => {
		if (!explorer || !explorer.getOpenEditorsView() || !explorer.getOpenEditorsView().getList()) {
			return void 0; // empty folder or hidden explorer
		}

		const list = explorer.getOpenEditorsView().getList();

		// Ignore if in highlight mode or not focused
		const focused = list.getFocusedElements();
		const focus = focused.length ? focused[0] : undefined;
		if (!list.isDOMFocused() || !(focus instanceof OpenEditor)) {
			return void 0;
		}

		return { explorer, item: focus };
	});
}

function withFocusedExplorerItem(accessor: ServicesAccessor): TPromise<FileStat | OpenEditor> {
	return withFocusedFilesExplorerViewItem(accessor).then(res => {
		if (res) {
			return res.item;
		}

		return withFocusedOpenEditorsViewItem(accessor).then(res => {
			if (res) {
				return res.item as FileStat | OpenEditor;
			}

			return void 0;
		});
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

export const copyPathOfFocusedExplorerItem = (accessor: ServicesAccessor) => {
	withFocusedExplorerItem(accessor).then(item => {
		const file = explorerItemToFileResource(item);
		if (!file) {
			return TPromise.as(undefined);
		}

		const commandService = accessor.get(ICommandService);
		return commandService.executeCommand(COPY_PATH_COMMAND_ID, { resource: file.resource });
	});
};

export const openFocusedExplorerItemSideBySideCommand = (accessor: ServicesAccessor) => {
	withFocusedExplorerItem(accessor).then(item => {
		if (item instanceof FileStat) {
			openFocusedFilesExplorerViewItem(accessor, true);
		} else {
			openFocusedOpenedEditorsViewItem(accessor, true);
		}
	});
};

export const revealInOSFocusedFilesExplorerItem = (accessor: ServicesAccessor) => {
	withFocusedExplorerItem(accessor).then(item => {
		const file = explorerItemToFileResource(item);
		if (!file) {
			return TPromise.as(undefined);
		}

		const commandService = accessor.get(ICommandService);
		return commandService.executeCommand(REVEAL_IN_OS_COMMAND_ID, { resource: file.resource });
	});
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

function registerFileCommands(): void {

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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'save',
		command: {
			id: REVERT_FILE_COMMAND_ID,
			title: nls.localize('revert', "Revert File")
		},
		when: ContextKeyExpr.and(EditorFocusedInOpenEditorsContext, AutoSaveDisabledContext, UntitledEditorNotFocusedInOpenEditorsContext)
	});

	CommandsRegistry.registerCommand({
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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'file',
		command: {
			id: OPEN_TO_SIDE_COMMAND_ID,
			title: nls.localize('openToSide', "Open to the Side")
		},
		when: EditorFocusedInOpenEditorsContext
	});

	CommandsRegistry.registerCommand({
		id: COMPARE_WITH_SAVED_COMMAND_ID,
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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'compare',
		command: {
			id: COMPARE_WITH_SAVED_COMMAND_ID,
			title: nls.localize('compareWithSaved', "Compare with Saved")
		},
		when: EditorFocusedInOpenEditorsContext
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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'compare',
		command: {
			id: SELECT_FOR_COMPARE_COMMAND_ID,
			title: nls.localize('compareSource', "Select for Compare")
		},
		when: EditorFocusedInOpenEditorsContext
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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'compare',
		command: {
			id: COMPARE_RESOURCE_COMMAND_ID,
			title: nls.localize('compareWithChosen', "Compare With Chosen")
		},
		when: EditorFocusedInOpenEditorsContext
	});

	CommandsRegistry.registerCommand({
		id: REVEAL_IN_OS_COMMAND_ID,
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

	CommandsRegistry.registerCommand({
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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'file',
		command: {
			id: COPY_PATH_COMMAND_ID,
			title: nls.localize('copyPath', "Copy Path")
		},
		when: EditorFocusedInOpenEditorsContext
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

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'file',
		command: {
			id: REVEAL_IN_EXPLORER_COMMAND_ID,
			title: isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder")
		},
		when: EditorFocusedInOpenEditorsContext
	});

	CommandsRegistry.registerCommand({
		id: SAVE_FILE_AS_COMMAND_ID,
		handler: (accessor, args: IEditorContext) => {
			const commandService = accessor.get(ICommandService);
			return commandService.executeCommand(BASE_SAVE_ONE_FILE_COMMAND_ID, args.resource, true);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'save',
		command: {
			id: SAVE_FILE_AS_COMMAND_ID,
			title: SAVE_FILE_AS_LABEL
		},
		when: ContextKeyExpr.and(EditorFocusedInOpenEditorsContext, UntitledEditorFocusedInOpenEditorsContext)
	});

	CommandsRegistry.registerCommand({
		id: SAVE_FILE_COMMAND_ID,
		handler: (accessor, args: IEditorContext) => {
			const commandService = accessor.get(ICommandService);
			return commandService.executeCommand(BASE_SAVE_ONE_FILE_COMMAND_ID, args.resource, false);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
		group: 'save',
		command: {
			id: SAVE_FILE_AS_COMMAND_ID,
			title: SAVE_FILE_LABEL
		},
		when: ContextKeyExpr.and(EditorFocusedInOpenEditorsContext)
	});

	CommandsRegistry.registerCommand({
		id: BASE_SAVE_ONE_FILE_COMMAND_ID,
		handler: (accessor, resource: URI, isSaveAs: boolean) => {
			const editorService = accessor.get(IWorkbenchEditorService);
			const fileService = accessor.get(IFileService);
			const untitledEditorService = accessor.get(IUntitledEditorService);
			const textFileService = accessor.get(ITextFileService);
			const editorGroupService = accessor.get(IEditorGroupService);

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
	});
}
