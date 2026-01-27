/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorResourceAccessor, IEditorCommandsContext, SideBySideEditor, IEditorIdentifier, SaveReason, EditorsOrder, EditorInputCapabilities } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IWindowOpenable, IOpenWindowOptions, isWorkspaceToOpen, IOpenEmptyWindowOptions } from '../../../../platform/window/common/window.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, UNTITLED_WORKSPACE_NAME } from '../../../../platform/workspace/common/workspace.js';
import { ExplorerFocusCondition, TextFileContentProvider, VIEWLET_ID, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext, ExplorerCompressedLastFocusContext, FilesExplorerFocusCondition, ExplorerFolderContext, VIEW_ID } from '../common/files.js';
import { ExplorerViewPaneContainer } from './explorerViewlet.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CommandsRegistry, ICommandHandler, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode, KeyChord } from '../../../../base/common/keyCodes.js';
import { isWeb, isWindows } from '../../../../base/common/platform.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { getResourceForCommand, getMultiSelectedResources, getOpenEditorsViewMultiSelection, IExplorerService } from './files.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';
import { resolveCommandsContext } from '../../../browser/parts/editor/editorCommandsContext.js';
import { Schemas } from '../../../../base/common/network.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IEditorService, SIDE_GROUP, ISaveEditorsOptions } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService, GroupsOrder, IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { basename, joinPath, isEqual } from '../../../../base/common/resources.js';
import { IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { EditorOpenSource, EditorResolution } from '../../../../platform/editor/common/editor.js';
import { hash } from '../../../../base/common/hash.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { OPEN_TO_SIDE_COMMAND_ID, COMPARE_WITH_SAVED_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, COMPARE_SELECTED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, COPY_PATH_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_WITH_EXPLORER_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_AS_COMMAND_ID, SAVE_ALL_COMMAND_ID, SAVE_ALL_IN_GROUP_COMMAND_ID, SAVE_FILES_COMMAND_ID, REVERT_FILE_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, PREVIOUS_COMPRESSED_FOLDER, NEXT_COMPRESSED_FOLDER, FIRST_COMPRESSED_FOLDER, LAST_COMPRESSED_FOLDER, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, NEW_FILE_COMMAND_ID } from './fileConstants.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { RemoveRootFolderAction } from '../../../browser/actions/workspaceActions.js';
import { OpenEditorsView } from './views/openEditorsView.js';
import { ExplorerView } from './views/explorerView.js';
import { IListService } from '../../../../platform/list/browser/listService.js';

export const openWindowCommand = (accessor: ServicesAccessor, toOpen: IWindowOpenable[], options?: IOpenWindowOptions) => {
	if (Array.isArray(toOpen)) {
		const hostService = accessor.get(IHostService);
		const environmentService = accessor.get(IEnvironmentService);

		// rewrite untitled: workspace URIs to the absolute path on disk
		toOpen = toOpen.map(openable => {
			if (isWorkspaceToOpen(openable) && openable.workspaceUri.scheme === Schemas.untitled) {
				return {
					workspaceUri: joinPath(environmentService.untitledWorkspacesHome, openable.workspaceUri.path, UNTITLED_WORKSPACE_NAME)
				};
			}

			return openable;
		});

		hostService.openWindow(toOpen, options);
	}
};

export const newWindowCommand = (accessor: ServicesAccessor, options?: IOpenEmptyWindowOptions) => {
	const hostService = accessor.get(IHostService);
	hostService.openWindow(options);
};

// Command registration

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: ExplorerFocusCondition,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	id: OPEN_TO_SIDE_COMMAND_ID, handler: async (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const explorerService = accessor.get(IExplorerService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), explorerService);

		// Set side input
		if (resources.length) {
			const untitledResources = resources.filter(resource => resource.scheme === Schemas.untitled);
			const fileResources = resources.filter(resource => resource.scheme !== Schemas.untitled);

			const items = await Promise.all(fileResources.map(async resource => {
				const item = explorerService.findClosest(resource);
				if (item) {
					// Explorer already resolved the item, no need to go to the file service #109780
					return item;
				}

				return await fileService.stat(resource);
			}));
			const files = items.filter(i => !i.isDirectory);
			const editors = files.map(f => ({
				resource: f.resource,
				options: { pinned: true }
			})).concat(...untitledResources.map(untitledResource => ({ resource: untitledResource, options: { pinned: true } })));

			await editorService.openEditors(editors, SIDE_GROUP);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib + 10,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
	primary: KeyCode.Enter,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.DownArrow
	},
	id: 'explorer.openAndPassFocus', handler: async (accessor, _resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const explorerService = accessor.get(IExplorerService);
		const resources = explorerService.getContext(true);

		if (resources.length) {
			await editorService.openEditors(resources.map(r => ({ resource: r.resource, options: { preserveFocus: false, pinned: true } })));
		}
	}
});

const COMPARE_WITH_SAVED_SCHEMA = 'showModifications';
let providerDisposables: IDisposable[] = [];
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COMPARE_WITH_SAVED_COMMAND_ID,
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyD),
	handler: async (accessor, resource: URI | object) => {
		const instantiationService = accessor.get(IInstantiationService);
		const textModelService = accessor.get(ITextModelService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const listService = accessor.get(IListService);

		// Register provider at first as needed
		let registerEditorListener = false;
		if (providerDisposables.length === 0) {
			registerEditorListener = true;

			const provider = instantiationService.createInstance(TextFileContentProvider);
			providerDisposables.push(provider);
			providerDisposables.push(textModelService.registerTextModelContentProvider(COMPARE_WITH_SAVED_SCHEMA, provider));
		}

		// Open editor (only resources that can be handled by file service are supported)
		const uri = getResourceForCommand(resource, editorService, listService);
		if (uri && fileService.hasProvider(uri)) {
			const name = basename(uri);
			const editorLabel = nls.localize('modifiedLabel', "{0} (in file) ↔ {1}", name, name);

			try {
				await TextFileContentProvider.open(uri, COMPARE_WITH_SAVED_SCHEMA, editorLabel, editorService, { pinned: true });
				// Dispose once no more diff editor is opened with the scheme
				if (registerEditorListener) {
					providerDisposables.push(editorService.onDidVisibleEditorsChange(() => {
						if (!editorService.editors.some(editor => !!EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY, filterByScheme: COMPARE_WITH_SAVED_SCHEMA }))) {
							providerDisposables = dispose(providerDisposables);
						}
					}));
				}
			} catch {
				providerDisposables = dispose(providerDisposables);
			}
		}
	}
});

let globalResourceToCompare: URI | undefined;
let resourceSelectedForCompareContext: IContextKey<boolean>;
CommandsRegistry.registerCommand({
	id: SELECT_FOR_COMPARE_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		globalResourceToCompare = getResourceForCommand(resource, accessor.get(IEditorService), accessor.get(IListService));
		if (!resourceSelectedForCompareContext) {
			resourceSelectedForCompareContext = ResourceSelectedForCompareContext.bindTo(accessor.get(IContextKeyService));
		}
		resourceSelectedForCompareContext.set(true);
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_SELECTED_COMMAND_ID,
	handler: async (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IEditorGroupsService), accessor.get(IExplorerService));

		if (resources.length === 2) {
			return editorService.openEditor({
				original: { resource: resources[0] },
				modified: { resource: resources[1] },
				options: { pinned: true }
			});
		}

		return true;
	}
});

CommandsRegistry.registerCommand({
	id: COMPARE_RESOURCE_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const rightResource = getResourceForCommand(resource, editorService, accessor.get(IListService));
		if (globalResourceToCompare && rightResource) {
			editorService.openEditor({
				original: { resource: globalResourceToCompare },
				modified: { resource: rightResource },
				options: { pinned: true }
			});
		}
	}
});

async function resourcesToClipboard(resources: URI[], relative: boolean, clipboardService: IClipboardService, labelService: ILabelService, configurationService: IConfigurationService): Promise<void> {
	if (resources.length) {
		const lineDelimiter = isWindows ? '\r\n' : '\n';

		let separator: '/' | '\\' | undefined = undefined;
		const copyRelativeOrFullPathSeparatorSection = relative ? 'explorer.copyRelativePathSeparator' : 'explorer.copyPathSeparator';
		const copyRelativeOrFullPathSeparator: '/' | '\\' | undefined = configurationService.getValue(copyRelativeOrFullPathSeparatorSection);
		if (copyRelativeOrFullPathSeparator === '/' || copyRelativeOrFullPathSeparator === '\\') {
			separator = copyRelativeOrFullPathSeparator;
		}

		const text = resources.map(resource => labelService.getUriLabel(resource, { relative, noPrefix: true, separator })).join(lineDelimiter);
		await clipboardService.writeText(text);
	}
}

const copyPathCommandHandler: ICommandHandler = async (accessor, resource: unknown) => {
	const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
	await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
	},
	id: COPY_PATH_COMMAND_ID,
	handler: copyPathCommandHandler
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC),
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC
	},
	id: COPY_PATH_COMMAND_ID,
	handler: copyPathCommandHandler
});

const copyRelativePathCommandHandler: ICommandHandler = async (accessor, resource: unknown) => {
	const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
	await resourcesToClipboard(resources, true, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
};

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC,
	win: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
	},
	id: COPY_RELATIVE_PATH_COMMAND_ID,
	handler: copyRelativePathCommandHandler
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyC),
	win: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
	},
	id: COPY_RELATIVE_PATH_COMMAND_ID,
	handler: copyRelativePathCommandHandler
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyP),
	id: 'workbench.action.files.copyPathOfActiveFile',
	handler: async accessor => {
		const editorService = accessor.get(IEditorService);
		const activeInput = editorService.activeEditor;
		const resource = EditorResourceAccessor.getOriginalUri(activeInput, { supportSideBySide: SideBySideEditor.PRIMARY });
		const resources = resource ? [resource] : [];
		await resourcesToClipboard(resources, false, accessor.get(IClipboardService), accessor.get(ILabelService), accessor.get(IConfigurationService));
	}
});

CommandsRegistry.registerCommand({
	id: REVEAL_IN_EXPLORER_COMMAND_ID,
	handler: async (accessor, resource: URI | object) => {
		const viewService = accessor.get(IViewsService);
		const contextService = accessor.get(IWorkspaceContextService);
		const explorerService = accessor.get(IExplorerService);
		const editorService = accessor.get(IEditorService);
		const listService = accessor.get(IListService);
		const uri = getResourceForCommand(resource, editorService, listService);

		if (uri && contextService.isInsideWorkspace(uri)) {
			const explorerView = await viewService.openView<ExplorerView>(VIEW_ID, false);
			if (explorerView) {
				const oldAutoReveal = explorerView.autoReveal;
				// Disable autoreveal before revealing the explorer to prevent a race betwene auto reveal + selection
				// Fixes #197268
				explorerView.autoReveal = false;
				explorerView.setExpanded(true);
				await explorerService.select(uri, 'force');
				explorerView.focus();
				explorerView.autoReveal = oldAutoReveal;
			}
		} else {
			// Do not reveal the open editors view if it's hidden explicitly
			// See https://github.com/microsoft/vscode/issues/227378
			const openEditorsView = viewService.getViewWithId(OpenEditorsView.ID);
			if (openEditorsView) {
				openEditorsView.setExpanded(true);
				openEditorsView.focus();
			}
		}
	}
});

CommandsRegistry.registerCommand({
	id: OPEN_WITH_EXPLORER_COMMAND_ID,
	handler: async (accessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const listService = accessor.get(IListService);
		const uri = getResourceForCommand(resource, editorService, listService);
		if (uri) {
			return editorService.openEditor({ resource: uri, options: { override: EditorResolution.PICK, source: EditorOpenSource.USER } });
		}

		return undefined;
	}
});

// Save / Save As / Save All / Revert

async function saveSelectedEditors(accessor: ServicesAccessor, options?: ISaveEditorsOptions): Promise<void> {
	const editorGroupService = accessor.get(IEditorGroupsService);
	const codeEditorService = accessor.get(ICodeEditorService);
	const textFileService = accessor.get(ITextFileService);

	// Retrieve selected or active editor
	let editors = getOpenEditorsViewMultiSelection(accessor);
	if (!editors) {
		const activeGroup = editorGroupService.activeGroup;
		if (activeGroup.activeEditor) {
			editors = [];

			// Special treatment for side by side editors: if the active editor
			// has 2 sides, we consider both, to support saving both sides.
			// We only allow this when saving, not for "Save As" and not if any
			// editor is untitled which would bring up a "Save As" dialog too.
			// In addition, we require the secondary side to be modified to not
			// trigger a touch operation unexpectedly.
			//
			// See also https://github.com/microsoft/vscode/issues/4180
			// See also https://github.com/microsoft/vscode/issues/106330
			// See also https://github.com/microsoft/vscode/issues/190210
			if (
				activeGroup.activeEditor instanceof SideBySideEditorInput &&
				!options?.saveAs && !(activeGroup.activeEditor.primary.hasCapability(EditorInputCapabilities.Untitled) || activeGroup.activeEditor.secondary.hasCapability(EditorInputCapabilities.Untitled)) &&
				activeGroup.activeEditor.secondary.isModified()
			) {
				editors.push({ groupId: activeGroup.id, editor: activeGroup.activeEditor.primary });
				editors.push({ groupId: activeGroup.id, editor: activeGroup.activeEditor.secondary });
			} else {
				editors.push({ groupId: activeGroup.id, editor: activeGroup.activeEditor });
			}
		}
	}

	if (!editors || editors.length === 0) {
		return; // nothing to save
	}

	// Save editors
	await doSaveEditors(accessor, editors, options);

	// Special treatment for embedded editors: if we detect that focus is
	// inside an embedded code editor, we save that model as well if we
	// find it in our text file models. Currently, only textual editors
	// support embedded editors.
	const focusedCodeEditor = codeEditorService.getFocusedCodeEditor();
	if (focusedCodeEditor instanceof EmbeddedCodeEditorWidget && !focusedCodeEditor.isSimpleWidget) {
		const resource = focusedCodeEditor.getModel()?.uri;

		// Check that the resource of the model was not saved already
		if (resource && !editors.some(({ editor }) => isEqual(EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }), resource))) {
			const model = textFileService.files.get(resource);
			if (!model?.isReadonly()) {
				await textFileService.save(resource, options);
			}
		}
	}
}

function saveDirtyEditorsOfGroups(accessor: ServicesAccessor, groups: readonly IEditorGroup[], options?: ISaveEditorsOptions): Promise<void> {
	const dirtyEditors: IEditorIdentifier[] = [];
	for (const group of groups) {
		for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
			if (editor.isDirty()) {
				dirtyEditors.push({ groupId: group.id, editor });
			}
		}
	}

	return doSaveEditors(accessor, dirtyEditors, options);
}

async function doSaveEditors(accessor: ServicesAccessor, editors: IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const notificationService = accessor.get(INotificationService);
	const instantiationService = accessor.get(IInstantiationService);

	try {
		await editorService.save(editors, options);
	} catch (error) {
		if (!isCancellationError(error)) {
			const actions: IAction[] = [toAction({ id: 'workbench.action.files.saveEditors', label: nls.localize('retry', "Retry"), run: () => instantiationService.invokeFunction(accessor => doSaveEditors(accessor, editors, options)) })];
			const editorsToRevert = editors.filter(({ editor }) => !editor.hasCapability(EditorInputCapabilities.Untitled) /* all except untitled to prevent unexpected data-loss */);
			if (editorsToRevert.length > 0) {
				actions.push(toAction({ id: 'workbench.action.files.revertEditors', label: editorsToRevert.length > 1 ? nls.localize('revertAll', "Revert All") : nls.localize('revert', "Revert"), run: () => editorService.revert(editorsToRevert) }));
			}

			notificationService.notify({
				id: editors.map(({ editor }) => hash(editor.resource?.toString())).join(), // ensure unique notification ID per set of editor
				severity: Severity.Error,
				message: nls.localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(', '), toErrorMessage(error, false)),
				actions: { primary: actions }
			});
		}
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyS,
	id: SAVE_FILE_COMMAND_ID,
	handler: accessor => {
		return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, force: true /* force save even when non-dirty */ });
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS),
	win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS) },
	id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
	handler: accessor => {
		return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, force: true /* force save even when non-dirty */, skipSaveParticipants: true });
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: SAVE_FILE_AS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
	handler: accessor => {
		return saveSelectedEditors(accessor, { reason: SaveReason.EXPLICIT, saveAs: true });
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	when: undefined,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: undefined,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyS },
	win: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyS) },
	id: SAVE_ALL_COMMAND_ID,
	handler: accessor => {
		return saveDirtyEditorsOfGroups(accessor, accessor.get(IEditorGroupsService).getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE), { reason: SaveReason.EXPLICIT });
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_ALL_IN_GROUP_COMMAND_ID,
	handler: (accessor, _: URI | object, editorContext: IEditorCommandsContext) => {
		const editorGroupsService = accessor.get(IEditorGroupsService);

		const resolvedContext = resolveCommandsContext([editorContext], accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));

		let groups: readonly IEditorGroup[] | undefined = undefined;
		if (!resolvedContext.groupedEditors.length) {
			groups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		} else {
			groups = resolvedContext.groupedEditors.map(({ group }) => group);
		}

		return saveDirtyEditorsOfGroups(accessor, groups, { reason: SaveReason.EXPLICIT });
	}
});

CommandsRegistry.registerCommand({
	id: SAVE_FILES_COMMAND_ID,
	handler: async accessor => {
		const editorService = accessor.get(IEditorService);

		const res = await editorService.saveAll({ includeUntitled: false, reason: SaveReason.EXPLICIT });
		return res.success;
	}
});

CommandsRegistry.registerCommand({
	id: REVERT_FILE_COMMAND_ID,
	handler: async accessor => {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);

		// Retrieve selected or active editor
		let editors = getOpenEditorsViewMultiSelection(accessor);
		if (!editors) {
			const activeGroup = editorGroupService.activeGroup;
			if (activeGroup.activeEditor) {
				editors = [{ groupId: activeGroup.id, editor: activeGroup.activeEditor }];
			}
		}

		if (!editors || editors.length === 0) {
			return; // nothing to revert
		}

		try {
			await editorService.revert(editors.filter(({ editor }) => !editor.hasCapability(EditorInputCapabilities.Untitled) /* all except untitled */), { force: true });
		} catch (error) {
			const notificationService = accessor.get(INotificationService);
			notificationService.error(nls.localize('genericRevertError', "Failed to revert '{0}': {1}", editors.map(({ editor }) => editor.getName()).join(', '), toErrorMessage(error, false)));
		}
	}
});

CommandsRegistry.registerCommand({
	id: REMOVE_ROOT_FOLDER_COMMAND_ID,
	handler: (accessor, resource: URI | object) => {
		const contextService = accessor.get(IWorkspaceContextService);
		const uriIdentityService = accessor.get(IUriIdentityService);
		const workspace = contextService.getWorkspace();
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService)).filter(resource =>
			workspace.folders.some(folder => uriIdentityService.extUri.isEqual(folder.uri, resource)) // Need to verify resources are workspaces since multi selection can trigger this command on some non workspace resources
		);

		if (resources.length === 0) {
			const commandService = accessor.get(ICommandService);
			// Show a picker for the user to choose which folder to remove
			return commandService.executeCommand(RemoveRootFolderAction.ID);
		}

		const workspaceEditingService = accessor.get(IWorkspaceEditingService);
		return workspaceEditingService.removeFolders(resources);
	}
});

// Compressed item navigation

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib + 10,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
	primary: KeyCode.LeftArrow,
	id: PREVIOUS_COMPRESSED_FOLDER,
	handler: accessor => {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);

		if (viewlet?.getId() !== VIEWLET_ID) {
			return;
		}

		const explorer = viewlet.getViewPaneContainer() as ExplorerViewPaneContainer;
		const view = explorer.getExplorerView();
		view.previousCompressedStat();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib + 10,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
	primary: KeyCode.RightArrow,
	id: NEXT_COMPRESSED_FOLDER,
	handler: accessor => {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);

		if (viewlet?.getId() !== VIEWLET_ID) {
			return;
		}

		const explorer = viewlet.getViewPaneContainer() as ExplorerViewPaneContainer;
		const view = explorer.getExplorerView();
		view.nextCompressedStat();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib + 10,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext.negate()),
	primary: KeyCode.Home,
	id: FIRST_COMPRESSED_FOLDER,
	handler: accessor => {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);

		if (viewlet?.getId() !== VIEWLET_ID) {
			return;
		}

		const explorer = viewlet.getViewPaneContainer() as ExplorerViewPaneContainer;
		const view = explorer.getExplorerView();
		view.firstCompressedStat();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib + 10,
	when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerCompressedFocusContext, ExplorerCompressedLastFocusContext.negate()),
	primary: KeyCode.End,
	id: LAST_COMPRESSED_FOLDER,
	handler: accessor => {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);

		if (viewlet?.getId() !== VIEWLET_ID) {
			return;
		}

		const explorer = viewlet.getViewPaneContainer() as ExplorerViewPaneContainer;
		const view = explorer.getExplorerView();
		view.lastCompressedStat();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: null,
	primary: isWeb ? (isWindows ? KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyN) : KeyMod.CtrlCmd | KeyCode.KeyN,
	secondary: isWeb ? [KeyMod.CtrlCmd | KeyCode.KeyN] : undefined,
	id: NEW_UNTITLED_FILE_COMMAND_ID,
	metadata: {
		description: NEW_UNTITLED_FILE_LABEL,
		args: [
			{
				isOptional: true,
				name: 'New Untitled Text File arguments',
				description: 'The editor view type or language ID if known',
				schema: {
					'type': 'object',
					'properties': {
						'viewType': {
							'type': 'string'
						},
						'languageId': {
							'type': 'string'
						}
					}
				}
			}
		]
	},
	handler: async (accessor, args?: { languageId?: string; viewType?: string }) => {
		const editorService = accessor.get(IEditorService);

		await editorService.openEditor({
			resource: undefined,
			options: {
				override: args?.viewType,
				pinned: true
			},
			languageId: args?.languageId,
		});
	}
});

CommandsRegistry.registerCommand({
	id: NEW_FILE_COMMAND_ID,
	handler: async (accessor, args?: { languageId?: string; viewType?: string; fileName?: string }) => {
		const editorService = accessor.get(IEditorService);
		const dialogService = accessor.get(IFileDialogService);
		const fileService = accessor.get(IFileService);

		const createFileLocalized = nls.localize('newFileCommand.saveLabel', "Create File");
		const defaultFileUri = joinPath(await dialogService.defaultFilePath(), args?.fileName ?? 'Untitled.txt');

		const saveUri = await dialogService.showSaveDialog({ saveLabel: createFileLocalized, title: createFileLocalized, defaultUri: defaultFileUri });

		if (!saveUri) {
			return;
		}

		await fileService.createFile(saveUri, undefined, { overwrite: true });

		await editorService.openEditor({
			resource: saveUri,
			options: {
				override: args?.viewType,
				pinned: true
			},
			languageId: args?.languageId,
		});
	}
});
