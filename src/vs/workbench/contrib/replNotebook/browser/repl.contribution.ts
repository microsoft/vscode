/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { parse } from '../../../../base/common/marshalling.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { assertType } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { localize2 } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorExtensions, IEditorControl, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkingCopyIdentifier } from '../../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
import { ResourceNotebookCellEdit } from '../../bulkEdit/browser/bulkCellEdits.js';
import { getReplView } from '../../debug/browser/repl.js';
import { REPL_VIEW_ID } from '../../debug/common/debug.js';
import { InlineChatController } from '../../inlineChat/browser/inlineChatController.js';
import { IInteractiveHistoryService } from '../../interactive/browser/interactiveHistoryService.js';
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from '../../notebook/browser/controller/coreActions.js';
import { INotebookEditorOptions } from '../../notebook/browser/notebookBrowser.js';
import { NotebookEditorWidget } from '../../notebook/browser/notebookEditorWidget.js';
import * as icons from '../../notebook/browser/notebookIcons.js';
import { ReplEditorAccessibleView } from '../../notebook/browser/replEditorAccessibleView.js';
import { INotebookEditorService } from '../../notebook/browser/services/notebookEditorService.js';
import { CellEditType, CellKind, NotebookSetting, NotebookWorkingCopyTypeIdentifier, REPL_EDITOR_ID } from '../../notebook/common/notebookCommon.js';
import { IS_COMPOSITE_NOTEBOOK, MOST_RECENT_REPL_EDITOR, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from '../../notebook/common/notebookContextKeys.js';
import { NotebookEditorInputOptions } from '../../notebook/common/notebookEditorInput.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { isReplEditorControl, ReplEditor, ReplEditorControl } from './replEditor.js';
import { ReplEditorHistoryAccessibilityHelp, ReplEditorInputAccessibilityHelp } from './replEditorAccessibilityHelp.js';
import { ReplEditorInput } from './replEditorInput.js';

type SerializedNotebookEditorData = { resource: URI; preferredResource: URI; viewType: string; options?: NotebookEditorInputOptions; label?: string };
class ReplEditorSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input.typeId === ReplEditorInput.ID;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof ReplEditorInput);
		const data: SerializedNotebookEditorData = {
			resource: input.resource,
			preferredResource: input.preferredResource,
			viewType: input.viewType,
			options: input.options,
			label: input.getName()
		};
		return JSON.stringify(data);
	}
	deserialize(instantiationService: IInstantiationService, raw: string) {
		const data = <SerializedNotebookEditorData>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, viewType } = data;
		if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
			return undefined;
		}

		const input = instantiationService.createInstance(ReplEditorInput, resource, data.label);
		return input;
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ReplEditor,
		REPL_EDITOR_ID,
		'REPL Editor'
	),
	[
		new SyncDescriptor(ReplEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	ReplEditorInput.ID,
	ReplEditorSerializer
);

export class ReplDocumentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.replDocument';

	private readonly editorInputCache = new ResourceMap<ReplEditorInput>();

	constructor(
		@INotebookService notebookService: INotebookService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		editorResolverService.registerEditor(
			// don't match anything, we don't need to support re-opening files as REPL editor at this point
			` `,
			{
				id: 'repl',
				label: 'repl Editor',
				priority: RegisteredEditorPriority.option
			},
			{
				// We want to support all notebook types which could have any file extension,
				// so we just check if the resource corresponds to a notebook
				canSupportResource: uri => notebookService.getNotebookTextModel(uri) !== undefined,
				singlePerResource: true
			},
			{
				createUntitledEditorInput: async ({ resource, options }) => {
					if (resource) {
						const editor = this.editorInputCache.get(resource);
						if (editor && !editor.isDisposed()) {
							return { editor, options };
						} else if (editor) {
							this.editorInputCache.delete(resource);
						}
					}
					const scratchpad = this.configurationService.getValue<boolean>(NotebookSetting.InteractiveWindowPromptToSave) !== true;
					const ref = await this.notebookEditorModelResolverService.resolve({ untitledResource: resource }, 'jupyter-notebook', { scratchpad, viewType: 'repl' });

					const notebookUri = ref.object.notebook.uri;

					// untitled notebooks are disposed when they get saved. we should not hold a reference
					// to such a disposed notebook and therefore dispose the reference as well
					ref.object.notebook.onWillDispose(() => {
						ref.dispose();
					});
					const label = (options as INotebookEditorOptions)?.label ?? undefined;
					const editor = this.instantiationService.createInstance(ReplEditorInput, notebookUri, label);
					this.editorInputCache.set(notebookUri, editor);
					Event.once(editor.onWillDispose)(() => this.editorInputCache.delete(notebookUri));

					return { editor, options };
				},
				createEditorInput: async ({ resource, options }) => {
					if (this.editorInputCache.has(resource)) {
						return { editor: this.editorInputCache.get(resource)!, options };
					}

					const label = (options as INotebookEditorOptions)?.label ?? undefined;
					const editor = this.instantiationService.createInstance(ReplEditorInput, resource, label);
					this.editorInputCache.set(resource, editor);
					Event.once(editor.onWillDispose)(() => this.editorInputCache.delete(resource));

					return { editor, options };
				}
			}
		);
	}
}

class ReplWindowWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.replWorkingCopyEditorHandler';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyEditorService private readonly workingCopyEditorService: IWorkingCopyEditorService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@INotebookService private readonly notebookService: INotebookService
	) {
		super();

		this._installHandler();
	}

	async handles(workingCopy: IWorkingCopyIdentifier) {
		const notebookType = this._getNotebookType(workingCopy);
		if (!notebookType) {
			return false;
		}

		return !!notebookType && notebookType.viewType === 'repl' && await this.notebookService.canResolve(notebookType.notebookType);
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}

		return editor instanceof ReplEditorInput && isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		return this.instantiationService.createInstance(ReplEditorInput, workingCopy.resource, undefined);
	}

	private async _installHandler(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		this._register(this.workingCopyEditorService.registerHandler(this));
	}

	private _getNotebookType(workingCopy: IWorkingCopyIdentifier) {
		return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
	}
}

registerWorkbenchContribution2(ReplWindowWorkingCopyEditorHandler.ID, ReplWindowWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ReplDocumentContribution.ID, ReplDocumentContribution, WorkbenchPhase.BlockRestore);

AccessibleViewRegistry.register(new ReplEditorInputAccessibilityHelp());
AccessibleViewRegistry.register(new ReplEditorHistoryAccessibilityHelp());

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repl.focusLastItemExecuted',
			title: localize2('repl.focusLastReplOutput', 'Focus Most Recent REPL Execution'),
			category: 'REPL',
			menu: {
				id: MenuId.CommandPalette,
				when: MOST_RECENT_REPL_EDITOR,
			},
			keybinding: [{
				primary: KeyChord(KeyMod.Alt | KeyCode.End, KeyMod.Alt | KeyCode.End),
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
				when: ContextKeyExpr.or(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate())
			}],
			precondition: MOST_RECENT_REPL_EDITOR
		});
	}

	async run(accessor: ServicesAccessor, context?: UriComponents): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl();
		const contextKeyService = accessor.get(IContextKeyService);

		let notebookEditor: NotebookEditorWidget | undefined;
		if (editorControl && isReplEditorControl(editorControl)) {
			notebookEditor = editorControl.notebookEditor;
		} else {
			const uriString = MOST_RECENT_REPL_EDITOR.getValue(contextKeyService);
			const uri = uriString ? URI.parse(uriString) : undefined;

			if (!uri) {
				return;
			}
			const replEditor = editorService.findEditors(uri)[0];

			if (replEditor) {
				const editor = await editorService.openEditor(replEditor.editor, replEditor.groupId);
				const editorControl = editor?.getControl();

				if (editorControl && isReplEditorControl(editorControl)) {
					notebookEditor = editorControl.notebookEditor;
				}
			}
		}

		const viewModel = notebookEditor?.getViewModel();
		if (notebookEditor && viewModel) {
			// last cell of the viewmodel is the last cell history
			const lastCellIndex = viewModel.length - 1;
			if (lastCellIndex >= 0) {
				const cell = viewModel.viewCells[lastCellIndex];
				notebookEditor.focusNotebookCell(cell, 'container');
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repl.input.focus',
			title: localize2('repl.input.focus', 'Focus Input Editor'),
			category: 'REPL',
			menu: {
				id: MenuId.CommandPalette,
				when: MOST_RECENT_REPL_EDITOR,
			},
			keybinding: [{
				when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED),
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow
			}, {
				when: ContextKeyExpr.and(MOST_RECENT_REPL_EDITOR),
				weight: KeybindingWeight.WorkbenchContrib + 5,
				primary: KeyChord(KeyMod.Alt | KeyCode.Home, KeyMod.Alt | KeyCode.Home),
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl();
		const contextKeyService = accessor.get(IContextKeyService);

		if (editorControl && isReplEditorControl(editorControl) && editorControl.notebookEditor) {
			editorService.activeEditorPane?.focus();
		}
		else {
			const uriString = MOST_RECENT_REPL_EDITOR.getValue(contextKeyService);
			const uri = uriString ? URI.parse(uriString) : undefined;

			if (!uri) {
				return;
			}
			const replEditor = editorService.findEditors(uri)[0];

			if (replEditor) {
				await editorService.openEditor({ resource: uri, options: { preserveFocus: false } }, replEditor.groupId);
			}
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repl.execute',
			title: localize2('repl.execute', 'Execute REPL input'),
			category: 'REPL',
			keybinding: [{
				when: ContextKeyExpr.and(
					IS_COMPOSITE_NOTEBOOK,
					ContextKeyExpr.equals('activeEditor', 'workbench.editor.repl')
				),
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}, {
				when: ContextKeyExpr.and(
					IS_COMPOSITE_NOTEBOOK,
					ContextKeyExpr.equals('activeEditor', 'workbench.editor.repl'),
					ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', true)
				),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}, {
				when: ContextKeyExpr.and(
					IS_COMPOSITE_NOTEBOOK,
					ContextKeyExpr.equals('activeEditor', 'workbench.editor.repl'),
					ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', false)
				),
				primary: KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}],
			menu: [
				{
					id: MenuId.ReplInputExecute
				}
			],
			icon: icons.executeIcon,
			f1: false,
			metadata: {
				description: 'Execute the Contents of the Input Box',
				args: [
					{
						name: 'resource',
						description: 'Interactive resource Uri',
						isOptional: true
					}
				]
			}
		});
	}

	async run(accessor: ServicesAccessor, context?: UriComponents): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const bulkEditService = accessor.get(IBulkEditService);
		const historyService = accessor.get(IInteractiveHistoryService);
		const notebookEditorService = accessor.get(INotebookEditorService);
		let editorControl: IEditorControl | undefined;
		if (context) {
			const resourceUri = URI.revive(context);
			const editors = editorService.findEditors(resourceUri);
			for (const found of editors) {
				if (found.editor.typeId === ReplEditorInput.ID) {
					const editor = await editorService.openEditor(found.editor, found.groupId);
					editorControl = editor?.getControl();
					break;
				}
			}
		}
		else {
			editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		}

		if (isReplEditorControl(editorControl)) {
			executeReplInput(bulkEditService, historyService, notebookEditorService, editorControl);
		}
	}
});

async function executeReplInput(
	bulkEditService: IBulkEditService,
	historyService: IInteractiveHistoryService,
	notebookEditorService: INotebookEditorService,
	editorControl: ReplEditorControl) {

	if (editorControl && editorControl.notebookEditor && editorControl.activeCodeEditor) {
		const notebookDocument = editorControl.notebookEditor.textModel;
		const textModel = editorControl.activeCodeEditor.getModel();
		const activeKernel = editorControl.notebookEditor.activeKernel;
		const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;

		if (notebookDocument && textModel) {
			const index = notebookDocument.length - 1;
			const value = textModel.getValue();

			if (isFalsyOrWhitespace(value)) {
				return;
			}

			// Just accept any existing inline chat hunk
			const ctrl = InlineChatController.get(editorControl.activeCodeEditor);
			if (ctrl) {
				ctrl.acceptHunk();
			}

			historyService.replaceLast(notebookDocument.uri, value);
			historyService.addToHistory(notebookDocument.uri, '');
			textModel.setValue('');
			notebookDocument.cells[index].resetTextBuffer(textModel.getTextBuffer());

			const collapseState = editorControl.notebookEditor.notebookOptions.getDisplayOptions().interactiveWindowCollapseCodeCells === 'fromEditor' ?
				{
					inputCollapsed: false,
					outputCollapsed: false
				} :
				undefined;

			await bulkEditService.apply([
				new ResourceNotebookCellEdit(notebookDocument.uri,
					{
						editType: CellEditType.Replace,
						index: index,
						count: 0,
						cells: [{
							cellKind: CellKind.Code,
							mime: undefined,
							language,
							source: value,
							outputs: [],
							metadata: {},
							collapseState
						}]
					}
				)
			]);

			// reveal the cell into view first
			const range = { start: index, end: index + 1 };
			editorControl.notebookEditor.revealCellRangeInView(range);
			await editorControl.notebookEditor.executeNotebookCells(editorControl.notebookEditor.getCellsInRange({ start: index, end: index + 1 }));

			// update the selection and focus in the extension host model
			const editor = notebookEditorService.getNotebookEditor(editorControl.notebookEditor.getId());
			if (editor) {
				editor.setSelections([range]);
				editor.setFocus(range);
			}
		}
	}
}

AccessibleViewRegistry.register(new ReplEditorAccessibleView());

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'list.find.replInputFocus',
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: ContextKeyExpr.equals('view', REPL_VIEW_ID),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
	secondary: [KeyCode.F3],
	handler: (accessor) => {
		getReplView(accessor.get(IViewsService))?.openFind();
	}
});
