/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { toResource, IEditorCommandsContext } from 'vs/workbench/common/editor';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerFocusCondition, FileOnDiskContentProvider, VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { ExplorerViewlet } from 'vs/workbench/parts/files/electron-browser/explorerViewlet';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITextFileService, ISaveOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IListService } from 'vs/platform/list/browser/listService';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorViewState } from 'vs/editor/common/editorCommon';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { sequence } from 'vs/base/common/async';
import { getResourceForCommand, getMultiSelectedResources } from 'vs/workbench/parts/files/browser/files';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { getMultiSelectedEditorContexts } from 'vs/workbench/browser/parts/editor/editorCommands';
import { Schemas } from 'vs/base/common/network';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { ILabelService } from 'vs/platform/label/common/label';

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
export const COPY_RELATIVE_PATH_COMMAND_ID = 'copyRelativeFilePath';

export const SAVE_FILE_AS_COMMAND_ID = 'workbench.action.files.saveAs';
export const SAVE_FILE_AS_LABEL = nls.localize('saveAs', "Save As...");
export const SAVE_FILE_COMMAND_ID = 'workbench.action.files.save';
export const SAVE_FILE_LABEL = nls.localize('save', "Save");
export const SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID = 'workbench.action.files.saveWithoutFormatting';
export const SAVE_FILE_WITHOUT_FORMATTING_LABEL = nls.localize('saveWithoutFormatting', "Save without Formatting");

export const SAVE_ALL_COMMAND_ID = 'saveAll';
export const SAVE_ALL_LABEL = nls.localize('saveAll', "Save All");

export const SAVE_ALL_IN_GROUP_COMMAND_ID = 'workbench.files.action.saveAllInGroup';

export const SAVE_FILES_COMMAND_ID = 'workbench.action.files.saveFiles';

export const OpenEditorsGroupContext = new RawContextKey<boolean>('groupFocusedInOpenEditors', false);
export const DirtyEditorContext = new RawContextKey<boolean>('dirtyEditor', false);
export const ResourceSelectedForCompareContext = new RawContextKey<boolean>('resourceSelectedForCompare', false);

export const REMOVE_ROOT_FOLDER_COMMAND_ID = 'removeRootFolder';
export const REMOVE_ROOT_FOLDER_LABEL = nls.localize('removeFolderFromWorkspace', "Remove Folder from Workspace");

export const openWindowCommand = (accessor: ServicesAccessor, paths: Array<string | URI>, forceNewWindow: boolean) => {
	const windowService = accessor.get(IWindowService);
	windowService.openWindow(paths.map(p => typeof p === 'string' ? URI.file(p) : p), { forceNewWindow });
};

function save(
	resource: URI,
	isSaveAs: boolean,
	options: ISaveOptions,
	editorService: IEditorService,
	fileService: IFileService,
	untitledEditorService: IUntitledEditorService,
	textFileService: ITextFileService,
	editorGroupService: IEditorGroupsService
): Promise<any> {

	function ensureForcedSave(options?: ISaveOptions): ISaveOptions {
		if (!options) {
			options = { force: true };
		} else {
			options.force = true;
		}

		return options;
	}

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
			const activeTextEditorWidget = getCodeEditor(editorService.activeTextEditorWidget);
			if (activeTextEditorWidget) {
				const activeResource = toResource(editorService.activeEditor, { supportSideBySide: true });
				if (activeResource && (fileService.canHandleResource(activeResource) || resource.scheme === Schemas.untitled) && activeResource.toString() === resource.toString()) {
					viewStateOfSource = activeTextEditorWidget.saveViewState();
				}
			}

			// Special case: an untitled file with associated path gets saved directly unless "saveAs" is true
			let savePromise: Promise<URI>;
			if (!isSaveAs && resource.scheme === Schemas.untitled && untitledEditorService.hasAssociatedFilePath(resource)) {
				savePromise = textFileService.save(resource, options).then((result) => {
					if (result) {
						return resource.with({ scheme: Schemas.file });
					}

					return null;
				});
			}

			// Otherwise, really "Save As..."
			else {

				// Force a change to the file to trigger external watchers if any
				// fixes https://github.com/Microsoft/vscode/issues/59655
				options = ensureForcedSave(options);

				savePromise = textFileService.saveAs(resource, undefined, options);
			}

			return savePromise.then((target) => {
				if (!target || target.toString() === resource.toString()) {
					return undefined; // save canceled or same resource used
				}

				const replacement: IResourceInput = {
					resource: target,
					encoding: encodingOfSource,
					options: {
						pinned: true,
						viewState: viewStateOfSource
					}
				};

				return Promise.all(editorGroupService.groups.map(g =>
					editorService.replaceEditors([{
						editor: { resource },
						replacement
					}], g))).then(() => true);
			});
		}

		// Pin the active editor if we are saving it
		const activeControl = editorService.activeControl;
		const activeEditorResource = activeControl && activeControl.input && activeControl.input.getResource();
		if (activeEditorResource && activeEditorResource.toString() === resource.toString()) {
			activeControl.group.pinEditor(activeControl.input);
		}

		// Just save (force a change to the file to trigger external watchers if any)
		options = ensureForcedSave(options);

		return textFileService.save(resource, options);
	}

	return Promise.resolve(false);
}

function saveAll(saveAllArguments: any, editorService: IEditorService, untitledEditorService: IUntitledEditorService,
	textFileService: ITextFileService, editorGroupService: IEditorGroupsService): Promise<any> {

	// Store some properties per untitled file to restore later after save is completed
	const groupIdToUntitledResourceInput = new Map<number, IResourceInput[]>();

	editorGroupService.groups.forEach(g => {
		const activeEditorResource = g.activeEditor && g.activeEditor.getResource();
		g.editors.forEach(e => {
			const resource = e.getResource();
			if (resource && untitledEditorService.isDirty(resource)) {
				if (!groupIdToUntitledResourceInput.has(g.id)) {
					groupIdToUntitledResourceInput.set(g.id, []);
				}

				groupIdToUntitledResourceInput.get(g.id).push({
					encoding: untitledEditorService.getEncoding(resource),
					resource,
					options: {
						inactive: activeEditorResource ? activeEditorResource.toString() !== resource.toString() : true,
						pinned: true,
						preserveFocus: true,
						index: g.getIndexOfEditor(e)
					}
				});
			}
		});
	});

	// Save all
	return textFileService.saveAll(saveAllArguments).then((result) => {
		groupIdToUntitledResourceInput.forEach((inputs, groupId) => {
			// Update untitled resources to the saved ones, so we open the proper files
			inputs.forEach(i => {
				const targetResult = result.results.filter(r => r.success && r.source.toString() === i.resource.toString()).pop();
				if (targetResult) {
					i.resource = targetResult.target;
				}
			});
			editorService.openEditors(inputs, groupId);
		});
	});
}

// Command registration

CommandsRegistry.registerCommand({
	id: REVERT_FILE_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const textFileService = accessor.get(ITextFileService);
		const notificationService = accessor.get(INotificationService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService)
			.filter(resource => resource.scheme !== Schemas.untitled);

		if (resources.length) {
			return textFileService.revertAll(resources, { force: true }).then(undefined, error => {
				notificationService.error(nls.localize('genericRevertError', "Failed to revert '{0}': {1}", resources.map(r => paths.basename(r.fsPath)).join(', '), toErrorMessage(error, false)));
			});
		}

		return Promise.resolve(true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	id: OPEN_TO_SIDE_COMMAND_ID, handler: (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const listService = accessor.get(IListService);
		const fileService = accessor.get(IFileService);
		const tree = listService.lastFocusedList;
		const resources = getMultiSelectedResources(resource, listService, editorService);

		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		// Set side input
		if (resources.length) {
			return fileService.resolveFiles(resources.map(resource => ({ resource }))).then(resolved => {
				const editors = resolved.filter(r => r.success && !r.stat.isDirectory).map(r => ({
					resource: r.stat.resource
				}));

				return editorService.openEditors(editors, SIDE_GROUP);
			});
		}

		return Promise.resolve(true);
	}
});

const COMPARE_WITH_SAVED_SCHEMA = 'showModifications';
let provider: FileOnDiskContentProvider;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COMPARE_WITH_SAVED_COMMAND_ID,
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_D),
	handler: (accessor, resource: URI | object) => {
		if (!provider) {
			const instantiationService = accessor.get(IInstantiationService);
			const textModelService = accessor.get(ITextModelService);
			provider = instantiationService.createInstance(FileOnDiskContentProvider);
			textModelService.registerTextModelContentProvider(COMPARE_WITH_SAVED_SCHEMA, provider);
		}

		const editorService = accessor.get(IEditorService);
		const uri = getResourceForCommand(resource, accessor.get(IListService), editorService);

		if (uri && uri.scheme === Schemas.file /* only files on disk supported for now */) {
			const name = paths.basename(uri.fsPath);
			const editorLabel = nls.localize('modifiedLabel', "{0} (on disk) ↔ {1}", name, name);

			return editorService.openEditor({ leftResource: uri.with({ scheme: COMPARE_WITH_SAVED_SCHEMA }), rightResource: uri, label: editorLabel }).then(() => undefined);
		}

		return Promise.resolve(true);
	}
});

let globalResourceToCompare: URI;
let resourceSelectedForCompareContext: IContextKey<boolean>;
CommandsRegistry.registerCommand({
	id: SELECT_FOR_COMPARE_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;
		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
			tree.domFocus();
		}

		globalResourceToCompare = getResourceForCommand(resource, listService, accessor.get(IEditorService));
		if (!resourceSelectedForCompareContext) {
			resourceSelectedForCompareContext = ResourceSelectedForCompareContext.bindTo(accessor.get(IContextKeyService));
		}
		resourceSelectedForCompareContext.set(true);
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_SELECTED_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService);

		if (resources.length === 2) {
			return editorService.openEditor({
				leftResource: resources[0],
				rightResource: resources[1]
			});
		}

		return Promise.resolve(true);
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_RESOURCE_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const listService = accessor.get(IListService);
		const tree = listService.lastFocusedList;

		// Remove highlight
		if (tree instanceof Tree) {
			tree.clearHighlight();
		}

		return editorService.openEditor({
			leftResource: globalResourceToCompare,
			rightResource: getResourceForCommand(resource, listService, editorService)
		}).then(() => undefined);
	}
});

function revealResourcesInOS(resources: URI[], windowsService: IWindowsService, notificationService: INotificationService, workspaceContextService: IWorkspaceContextService): void {
	if (resources.length) {
		sequence(resources.map(r => () => windowsService.showItemInFolder(paths.normalize(r.fsPath, true))));
	} else if (workspaceContextService.getWorkspace().folders.length) {
		windowsService.showItemInFolder(paths.normalize(workspaceContextService.getWorkspace().folders[0].uri.fsPath, true));
	} else {
		notificationService.info(nls.localize('openFileToReveal', "Open a file first to reveal"));
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REVEAL_IN_OS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_R
	},
	handler: (accessor: ServicesAccessor, resource: URI | object) => {
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService));
		revealResourcesInOS(resources, accessor.get(IWindowsService), accessor.get(INotificationService), accessor.get(IWorkspaceContextService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_R),
	id: 'workbench.action.files.revealActiveFileInWindows',
	handler: (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		const activeInput = editorService.activeEditor;
		const resources = activeInput && activeInput.getResource() ? [activeInput.getResource()] : [];
		revealResourcesInOS(resources, accessor.get(IWindowsService), accessor.get(INotificationService), accessor.get(IWorkspaceContextService));
	}
});

function resourcesToClipboard(resources: URI[], relative: boolean, clipboardService: IClipboardService, notificationService: INotificationService, labelService: ILabelService): void {
	if (resources.length) {
		const lineDelimiter = isWindows ? '\r\n' : '\n';

		const text = resources.map(resource => labelService.getUriLabel(resource, { relative, noPrefix: true }))
			.join(lineDelimiter);
		clipboardService.writeText(text);
	} else {
		notificationService.info(nls.localize('openFileToCopy', "Open a file first to copy its path"));
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C
	},
	id: COPY_PATH_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService));
		resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(INotificationService), accessor.get(ILabelService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C)
	},
	id: COPY_RELATIVE_PATH_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService));
		resourcesToClipboard(resources, true, accessor.get(IClipboardService), accessor.get(INotificationService), accessor.get(ILabelService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_P),
	id: 'workbench.action.files.copyPathOfActiveFile',
	handler: (accessor) => {
		const editorService = accessor.get(IEditorService);
		const activeInput = editorService.activeEditor;
		const resources = activeInput && activeInput.getResource() ? [activeInput.getResource()] : [];
		resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(INotificationService), accessor.get(ILabelService));
	}
});

CommandsRegistry.registerCommand({
	id: REVEAL_IN_EXPLORER_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const viewletService = accessor.get(IViewletService);
		const contextService = accessor.get(IWorkspaceContextService);
		const uri = getResourceForCommand(resource, accessor.get(IListService), accessor.get(IEditorService));

		viewletService.openViewlet(VIEWLET_ID, false).then((viewlet: ExplorerViewlet) => {
			const isInsideWorkspace = contextService.isInsideWorkspace(uri);
			if (isInsideWorkspace) {
				const explorerView = viewlet.getExplorerView();
				if (explorerView) {
					explorerView.setExpanded(true);
					explorerView.select(uri, true);
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
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S,
	handler: (accessor, resourceOrObject: URI | object | { from: string }) => {
		const editorService = accessor.get(IEditorService);
		let resource: URI | undefined = undefined;
		if (resourceOrObject && 'from' in resourceOrObject && resourceOrObject.from === 'menu') {
			resource = toResource(editorService.activeEditor);
		} else {
			resource = getResourceForCommand(resourceOrObject, accessor.get(IListService), editorService);
		}

		return save(resource, true, undefined, editorService, accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_S,
	id: SAVE_FILE_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService);

		if (resources.length === 1) {
			// If only one resource is selected explictly call save since the behavior is a bit different than save all #41841
			return save(resources[0], false, undefined, editorService, accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
		}
		return saveAll(resources, editorService, accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_S),
	win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_S) },
	id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
	handler: accessor => {
		const editorService = accessor.get(IEditorService);

		const resource = toResource(editorService.activeEditor, { supportSideBySide: true });
		if (resource) {
			return save(resource, false, { skipSaveParticipants: true }, editorService, accessor.get(IFileService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
		}

		return undefined;
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_COMMAND_ID,
	handler: (accessor) => {
		return saveAll(true, accessor.get(IEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_IN_GROUP_COMMAND_ID,
	handler: (accessor, resource: URI | object, editorContext: IEditorCommandsContext) => {
		const contexts = getMultiSelectedEditorContexts(editorContext, accessor.get(IListService), accessor.get(IEditorGroupsService));
		const editorGroupService = accessor.get(IEditorGroupsService);
		let saveAllArg: any;
		if (!contexts.length) {
			saveAllArg = true;
		} else {
			const fileService = accessor.get(IFileService);
			saveAllArg = [];
			contexts.forEach(context => {
				const editorGroup = editorGroupService.getGroup(context.groupId);
				editorGroup.editors.forEach(editor => {
					const resource = toResource(editor, { supportSideBySide: true });
					if (resource && (resource.scheme === Schemas.untitled || fileService.canHandleResource(resource))) {
						saveAllArg.push(resource);
					}
				});
			});
		}

		return saveAll(saveAllArg, accessor.get(IEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_FILES_COMMAND_ID,
	handler: (accessor) => {
		return saveAll(false, accessor.get(IEditorService), accessor.get(IUntitledEditorService), accessor.get(ITextFileService), accessor.get(IEditorGroupsService));
	}
});

CommandsRegistry.registerCommand({
	id: REMOVE_ROOT_FOLDER_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		const contextService = accessor.get(IWorkspaceContextService);
		const workspace = contextService.getWorkspace();
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService)).filter(r =>
			// Need to verify resources are workspaces since multi selection can trigger this command on some non workspace resources
			workspace.folders.some(f => f.uri.toString() === r.toString())
		);

		return workspaceEditingService.removeFolders(resources);
	}
});
