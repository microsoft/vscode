/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from 'vs/workbench/common/editor';
import { parse } from 'vs/base/common/marshalling';
import { assertType } from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { CellEditType, CellKind, NotebookSetting, NotebookWorkingCopyTypeIdentifier, REPL_EDITOR_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
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
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { IInteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { getReplView } from 'vs/workbench/contrib/debug/browser/repl';
import { REPL_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { localize2 } from 'vs/nls';
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INotebookEditorOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

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
					const scratchpad = this.configurationService.getValue<boolean>(NotebookSetting.InteractiveWindowPromptToSave) !== true;
					const ref = await this.notebookEditorModelResolverService.resolve({ untitledResource: resource }, 'jupyter-notebook', { scratchpad });

					// untitled notebooks are disposed when they get saved. we should not hold a reference
					// to such a disposed notebook and therefore dispose the reference as well
					ref.object.notebook.onWillDispose(() => {
						ref.dispose();
					});
					const label = (options as INotebookEditorOptions)?.label ?? undefined;
					return { editor: this.instantiationService.createInstance(ReplEditorInput, resource!, label), options };
				},
				createEditorInput: async ({ resource, options }) => {
					const label = (options as INotebookEditorOptions)?.label ?? undefined;
					return { editor: this.instantiationService.createInstance(ReplEditorInput, resource, label), options };
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
		return !!viewType && viewType === 'jupyter-notebook' && extname(workingCopy.resource) === '.replNotebook';

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

	private _getViewType(workingCopy: IWorkingCopyIdentifier): string | undefined {
		return NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
	}
}

registerWorkbenchContribution2(ReplWindowWorkingCopyEditorHandler.ID, ReplWindowWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ReplDocumentContribution.ID, ReplDocumentContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'repl.execute',
			title: localize2('repl.execute', 'Execute REPL input'),
			category: 'REPL',
			keybinding: [{
				when: ContextKeyExpr.equals('activeEditor', 'workbench.editor.repl'),
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}, {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('activeEditor', 'workbench.editor.repl'),
					ContextKeyExpr.equals('config.interactiveWindow.executeWithShiftEnter', true)
				),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			}, {
				when: ContextKeyExpr.and(
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
		let editorControl: { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		if (context) {
			const resourceUri = URI.revive(context);
			const editors = editorService.findEditors(resourceUri);
			for (const found of editors) {
				if (found.editor.typeId === ReplEditorInput.ID) {
					const editor = await editorService.openEditor(found.editor, found.groupId);
					editorControl = editor?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
					break;
				}
			}
		}
		else {
			editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget } | undefined;
		}

		if (editorControl) {
			executeReplInput(bulkEditService, historyService, notebookEditorService, editorControl);
		}
	}
});

async function executeReplInput(
	bulkEditService: IBulkEditService,
	historyService: IInteractiveHistoryService,
	notebookEditorService: INotebookEditorService,
	editorControl: { notebookEditor: NotebookEditorWidget | undefined; codeEditor: CodeEditorWidget }) {

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
