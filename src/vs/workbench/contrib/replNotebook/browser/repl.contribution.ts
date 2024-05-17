/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
// is one contrib allowed to import from another?
import { parse } from 'vs/base/common/marshalling';
import { assertType } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { CellEditType, CellKind, NotebookWorkingCopyTypeIdentifier, REPL_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorInputOptions } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { ReplEditor } from 'vs/workbench/contrib/replNotebook/browser/replEditor';
import { ReplEditorInput } from 'vs/workbench/contrib/replNotebook/browser/replEditorInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';
import { extname, isEqual } from 'vs/base/common/resources';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { Schemas } from 'vs/base/common/network';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { InteractiveEditorInput } from 'vs/workbench/contrib/interactive/browser/interactiveEditorInput';
import { IInteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NOTEBOOK_EDITOR_FOCUSED, REPL_NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';


type SerializedNotebookEditorData = { resource: URI; preferredResource: URI; viewType: string; options?: NotebookEditorInputOptions };
class ReplEditorSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input instanceof ReplEditorInput;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof ReplEditorInput);
		const data: SerializedNotebookEditorData = {
			resource: input.resource,
			preferredResource: input.preferredResource,
			viewType: input.viewType,
			options: input.options
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

		const input = instantiationService.createInstance(ReplEditorInput, resource);
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

	constructor(
		@INotebookService notebookService: INotebookService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IEditorService editorService: IEditorService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		const info = notebookService.getContributedNotebookType('repl');

		// We need to register with the notebook service to let it know about this editor contribution
		if (!info) {
			this._register(notebookService.registerContributedNotebookType('repl', {
				providerDisplayName: 'REPL Notebook',
				displayName: 'Repl Notebook',
				filenamePattern: ['*.ipynb'],
				exclusive: false
			}));
		}

		editorResolverService.registerEditor(
			`*.ipynb`,
			{
				id: 'repl-notebook',
				label: 'repl Editor',
				priority: RegisteredEditorPriority.option
			},
			{
				canSupportResource: uri =>
					(uri.scheme === Schemas.untitled && extname(uri) === '.ipynb') ||
					(uri.scheme === Schemas.vscodeNotebookCell && extname(uri) === '.ipynb'),
				singlePerResource: true
			},
			{
				createUntitledEditorInput: async ({ resource, options }) => {
					const ref = await this.notebookEditorModelResolverService.resolve({ untitledResource: resource }, 'repl');

					// untitled notebooks are disposed when they get saved. we should not hold a reference
					// to such a disposed notebook and therefore dispose the reference as well
					ref.object.notebook.onWillDispose(() => {
						ref.dispose();
					});
					return { editor: this.instantiationService.createInstance(ReplEditorInput, resource!), options };
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
	) {
		super();

		this._installHandler();
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean {
		const viewType = this._getViewType(workingCopy);
		return !!viewType && viewType === 'repl';

	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}

		return editor instanceof ReplEditorInput && isEqual(workingCopy.resource, editor.resource);
	}

	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput {
		return this.instantiationService.createInstance(ReplEditorInput, workingCopy.resource);
	}

	private async _installHandler(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		this._register(this.workingCopyEditorService.registerHandler(this));
	}

	private _getViewType(workingCopy: IWorkingCopyIdentifier): string | undefined {
		return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
	}
}

registerWorkbenchContribution2(ReplWindowWorkingCopyEditorHandler.ID, ReplWindowWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ReplDocumentContribution.ID, ReplDocumentContribution, WorkbenchPhase.BlockRestore);


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repl.open',
			title: localize2('repl.open', 'Open REPL Editor'),
			category: 'REPL',
			metadata: {
				description: localize('repl.open', 'Open REPL Editor'),
			}

		});
	}

	async run(accessor: ServicesAccessor) {
		const resource = URI.from({ scheme: Schemas.untitled, path: 'repl.ipynb' });
		const editorInput: IUntypedEditorInput = { resource, options: { override: 'repl-notebook' } };

		const editorService = accessor.get(IEditorService);
		await editorService.openEditor(editorInput, 1);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'replNotebook.input.execute',
			title: localize2('replNotebook.input.execute', 'Execute the input box contents'),
			keybinding: [{
				when: ContextKeyExpr.and(
					REPL_NOTEBOOK_IS_ACTIVE_EDITOR,
					ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', true)
				),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}, {
				when: ContextKeyExpr.and(
					REPL_NOTEBOOK_IS_ACTIVE_EDITOR,
					ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', false)
				),
				primary: KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}],
			menu: [
				{
					id: MenuId.InteractiveInputExecute,
					when: REPL_NOTEBOOK_IS_ACTIVE_EDITOR
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
		let editorControl: { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		if (context) {
			const resourceUri = URI.revive(context);
			const editors = editorService.findEditors(resourceUri)
				.filter(id => id.editor instanceof InteractiveEditorInput && id.editor.resource?.toString() === resourceUri.toString());
			if (editors.length) {
				const editorInput = editors[0].editor as InteractiveEditorInput;
				const currentGroup = editors[0].groupId;
				const editor = await editorService.openEditor(editorInput, currentGroup);
				editorControl = editor?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
			}
		}
		else {
			editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		}

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();
			const activeKernel = editorControl.notebookEditor.activeKernel;
			const language = activeKernel?.supportedLanguages[0] ?? PLAINTEXT_LANGUAGE_ID;

			if (notebookDocument && textModel) {
				const index = notebookDocument.length - 1;
				const value = textModel.getValue();

				if (isFalsyOrWhitespace(value)) {
					return;
				}

				historyService.addToHistory(notebookDocument.uri, '');
				textModel.setValue('');

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
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'replNotebook.input.clear',
			title: localize2('replNotebook.input.clear', 'Clear the REPL input contents'),
			f1: false,
			keybinding: [{
				when: ContextKeyExpr.and(
					REPL_NOTEBOOK_IS_ACTIVE_EDITOR,
					InputFocusedContext,
					EditorContextKeys.writable,
					EditorContextKeys.hasNonEmptySelection.toNegated(),
				),
				primary: KeyCode.Escape,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();
			const range = editorControl.codeEditor.getModel()?.getFullModelRange();

			if (notebookDocument && textModel && range) {
				editorControl.codeEditor.executeEdits('', [EditOperation.replace(range, null)]);
			}
		}
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'replNotebook.input.focus',
			title: localize2('interactive.input.focus', 'Focus Input Editor'),
			keybinding: {
				when: ContextKeyExpr.and(
					REPL_NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_EDITOR_FOCUSED,
				),
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			editorService.activeEditorPane?.focus();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'replNotebook.history.focus',
			title: localize2('replNotebook.history.focus', 'Focus History'),
			f1: false,
			keybinding: {
				when: ContextKeyExpr.and(
					REPL_NOTEBOOK_IS_ACTIVE_EDITOR,
					EditorContextKeys.textInputFocus,
					NOTEBOOK_EDITOR_FOCUSED.toNegated()
				),
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget; focusHistory: () => void } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			editorControl.notebookEditor.focus();
		}
	}
});
