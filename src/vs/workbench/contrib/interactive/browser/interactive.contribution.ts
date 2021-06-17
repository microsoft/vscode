/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions, viewColumnToEditorGroup } from 'vs/workbench/common/editor';
import { InteractiveEditor } from 'vs/workbench/contrib/interactive/browser/interactiveEditor';
import { InteractiveEditorInput } from 'vs/workbench/contrib/interactive/browser/interactiveEditorInput';
import { NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { CellEditType, CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookContentProvider, INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { Schemas } from 'vs/base/common/network';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';


Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		InteractiveEditor,
		InteractiveEditor.ID,
		'Interactive Window'
	),
	[
		new SyncDescriptor(InteractiveEditorInput)
	]
);

export class InteractiveDocumentContribution extends Disposable implements IWorkbenchContribution {
	constructor(@INotebookService notebookService: INotebookService) {
		super();

		const contentOptions = {
			transientOutputs: true,
			transientCellMetadata: {},
			transientDocumentMetadata: {}
		};

		const controller: INotebookContentProvider = {
			get options() {
				return contentOptions;
			},
			set options(newOptions) {
				contentOptions.transientCellMetadata = newOptions.transientCellMetadata;
				contentOptions.transientDocumentMetadata = newOptions.transientDocumentMetadata;
				contentOptions.transientOutputs = newOptions.transientOutputs;
			},
			open: async (_uri: URI, _backupId: string | undefined, _untitledDocumentData: VSBuffer | undefined, _token: CancellationToken) => {
				return {
					data: {
						metadata: {},
						cells: []
					},
					transientOptions: contentOptions
				};
			},
			save: async (uri: URI) => {
				// return this._proxy.$saveNotebook(viewType, uri, token);
				return true;
			},
			saveAs: async (uri: URI, target: URI, token: CancellationToken) => {
				// return this._proxy.$saveNotebookAs(viewType, uri, target, token);
				return false;
			},
			backup: async (uri: URI, token: CancellationToken) => {
				// return this._proxy.$backupNotebook(viewType, uri, token);
				return '';
			}
		};
		this._register(notebookService.registerNotebookController('interactive', {
			id: new ExtensionIdentifier('interactive.builtin'),
			location: URI.parse('interactive://test')
		}, controller));

		this._register(notebookService.registerContributedNotebookType('interactive', {
			extension: new ExtensionIdentifier('interactive.builtin'),
			providerDisplayName: 'Interactive Notebook',
			displayName: 'Interactive',
			filenamePattern: ['*.interactive'],
			exclusive: true
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
// TODO@rebornix, we set it to Eventually since we want to make sure the contributedEditors in notebookserviceImpl was not flushed by the extension update
workbenchContributionsRegistry.registerWorkbenchContribution(InteractiveDocumentContribution, LifecyclePhase.Eventually);


let counter = 1;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.open',
			title: { value: localize('interactive.open', "Open Interactive Window"), original: 'Open Interactive Window' },
			menu: [
				{
					id: MenuId.CommandPalette,
					when: ContextKeyExpr.equals('config.interactive.experiments.enable', true)
				}
			],
			category: 'Interactive',
			description: {
				description: localize('notebookActions.executeNotebook', "Run All"),
				args: [
					{
						name: 'column',
						description: 'View Column',
						schema: {
							type: 'number',
							default: -1
						}
					}
				]
			}

		});
	}

	async run(accessor: ServicesAccessor, column?: number): Promise<{ notebookUri: URI, inputUri: URI; }> {
		const notebookUri = URI.from({ scheme: Schemas.vscodeInteractive, path: `Interactive-${counter}.interactive` });
		const inputUri = URI.from({ scheme: Schemas.vscodeInteractiveInput, path: `InteractiveInput-${counter}` });

		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const editorInput = new InteractiveEditorInput(notebookUri, undefined, inputUri, accessor.get(ILabelService), accessor.get(IFileService), accessor.get(IInstantiationService));
		const group = viewColumnToEditorGroup(editorGroupService, column);
		await editorService.openEditor(editorInput, undefined, group);
		counter++;

		// Extensions must retain references to these URIs to manipulate the interactive editor
		return { notebookUri, inputUri };
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'interactive.execute',
			title: { value: localize('interactive.execute', "Execute Code"), original: 'Execute Code' },
			category: 'Interactive',
			keybinding: {
				// when: NOTEBOOK_CELL_LIST_FOCUSED,
				when: ContextKeyExpr.equals('resourceScheme', Schemas.vscodeInteractive),
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyCode.Enter
				},
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const bulkEditService = accessor.get(IBulkEditService);
		const editorControl = editorService.activeEditorPane?.getControl() as { notebookEditor: NotebookEditorWidget | undefined, codeEditor: CodeEditorWidget; } | undefined;

		if (editorControl && editorControl.notebookEditor && editorControl.codeEditor) {
			const notebookDocument = editorControl.notebookEditor.textModel;
			const textModel = editorControl.codeEditor.getModel();
			const activeKernel = editorControl.notebookEditor.activeKernel;
			const language = activeKernel?.supportedLanguages[0] ?? 'plaintext';

			if (notebookDocument && textModel) {
				const index = notebookDocument.length;
				const value = textModel.getValue();

				textModel.setValue('');
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
								metadata: {}
							}]
						}
					)
				]);

				await editorControl.notebookEditor.executeNotebookCells(editorControl.notebookEditor.viewModel!.getCells({ start: index, end: index + 1 }));
				editorControl.notebookEditor.revealCellRangeInView({ start: index, end: index + 1 });
			}
		}
	}
});
