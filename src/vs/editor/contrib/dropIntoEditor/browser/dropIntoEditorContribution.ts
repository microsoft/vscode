/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { addExternalEditorsDropData, toVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { DocumentOnDropEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { DraggedTreeItemsIdentifier } from 'vs/editor/common/services/treeViewsDnd';
import { ITreeViewsDnDService } from 'vs/editor/common/services/treeViewsDndService';
import { PostDropWidgetManager, changeDropTypeCommandId, dropWidgetVisibleCtx } from 'vs/editor/contrib/dropIntoEditor/browser/postDropWidget';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { InlineProgressManager } from 'vs/editor/contrib/inlineProgress/browser/inlineProgress';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { localize } from 'vs/nls';
import { LocalSelectionTransfer } from 'vs/platform/dnd/browser/dnd';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { registerDefaultDropProviders } from './defaultOnDropProviders';


export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	public static get(editor: ICodeEditor): DropIntoEditorController | null {
		return editor.getContribution<DropIntoEditorController>(DropIntoEditorController.ID);
	}

	private operationIdPool = 0;
	private _currentOperation?: { readonly id: number; readonly promise: CancelablePromise<void> };

	private readonly _dropProgressManager: InlineProgressManager;
	private readonly _postDropWidgetManager: PostDropWidgetManager;

	private readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITreeViewsDnDService private readonly _treeViewsDragAndDropService: ITreeViewsDnDService,
	) {
		super();

		this._dropProgressManager = this._register(instantiationService.createInstance(InlineProgressManager, 'dropIntoEditor', editor));
		this._postDropWidgetManager = this._register(instantiationService.createInstance(PostDropWidgetManager, editor));

		this._register(editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event)));

		registerDefaultDropProviders(this._languageFeaturesService, workspaceContextService);
	}

	public clearWidgets() {
		this._postDropWidgetManager.clear();
	}

	public changeDropType() {
		this._postDropWidgetManager.changeExistingDropType();
	}

	private async onDropIntoEditor(editor: ICodeEditor, position: IPosition, dragEvent: DragEvent) {
		if (!dragEvent.dataTransfer || !editor.hasModel()) {
			return;
		}

		this._currentOperation?.promise.cancel();
		this._dropProgressManager.clear();

		editor.focus();
		editor.setPosition(position);

		const operationId = this.operationIdPool++;

		const p = createCancelablePromise(async (token) => {
			const tokenSource = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value, undefined, token);

			this._dropProgressManager.setAtPosition(position, localize('dropIntoEditorProgress', "Running drop handlers. Click to cancel"), {
				cancel: () => tokenSource.cancel()
			});

			try {
				const ourDataTransfer = await this.extractDataTransferData(dragEvent);
				if (ourDataTransfer.size === 0 || tokenSource.token.isCancellationRequested) {
					return;
				}

				const model = editor.getModel();
				if (!model) {
					return;
				}

				const providers = this._languageFeaturesService.documentOnDropEditProvider
					.ordered(model)
					.filter(provider => {
						if (!provider.dropMimeTypes) {
							// Keep all providers that don't specify mime types
							return true;
						}
						return provider.dropMimeTypes.some(mime => ourDataTransfer.matches(mime));
					});

				const possibleDropEdits = await raceCancellation(Promise.all(providers.map(provider => {
					return provider.provideDocumentOnDropEdits(model, position, ourDataTransfer, tokenSource.token);
				})), tokenSource.token);
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				if (possibleDropEdits) {
					// Pass in the parent token here as it tracks cancelling the entire drop operation.
					await this.applyDropResult(editor, position, 0, coalesce(possibleDropEdits), token);
				}
			} finally {
				tokenSource.dispose();

				if (this._currentOperation?.id === operationId) {
					this._dropProgressManager.clear();
					this._currentOperation = undefined;
				}
			}
		});

		this._currentOperation = { id: operationId, promise: p };
	}

	private async extractDataTransferData(dragEvent: DragEvent): Promise<VSDataTransfer> {
		if (!dragEvent.dataTransfer) {
			return new VSDataTransfer();
		}

		const dataTransfer = toVSDataTransfer(dragEvent.dataTransfer);
		addExternalEditorsDropData(dataTransfer, dragEvent);

		if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
			const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
			if (Array.isArray(data)) {
				for (const id of data) {
					const treeDataTransfer = await this._treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
					if (treeDataTransfer) {
						for (const [type, value] of treeDataTransfer.entries()) {
							dataTransfer.replace(type, value);
						}
					}
				}
			}
		}

		return dataTransfer;
	}

	private async applyDropResult(editor: ICodeEditor, position: IPosition, selectedEditIndex: number, allEdits: readonly DocumentOnDropEdit[], token: CancellationToken): Promise<void> {
		const model = editor.getModel();
		if (!model) {
			return;
		}

		const edit = allEdits[selectedEditIndex];
		if (!edit) {
			return;
		}

		const snippet = typeof edit.insertText === 'string' ? SnippetParser.escape(edit.insertText) : edit.insertText.snippet;
		const combinedWorkspaceEdit: WorkspaceEdit = {
			edits: [
				new ResourceTextEdit(model.uri, {
					range: Range.fromPositions(position),
					text: snippet,
					insertAsSnippet: true,
				}),
				...(edit.additionalEdit?.edits ?? [])
			]
		};

		// Use a decoration to track edits around the cursor
		const editTrackingDecoration = model.deltaDecorations([], [{
			range: Range.fromPositions(position),
			options: { description: 'drop-line-suffix', stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }
		}]);

		const editResult = await this._bulkEditService.apply(combinedWorkspaceEdit, { editor, token });

		const editRange = model.getDecorationRange(editTrackingDecoration[0]);
		model.deltaDecorations(editTrackingDecoration, []);

		if (editResult.isApplied && allEdits.length > 1) {
			const options = editor.getOptions().get(EditorOption.dropIntoEditor);
			if (options.showDropSelector === 'afterDrop') {
				this._postDropWidgetManager.show(editRange ?? Range.fromPositions(position), {
					activeEditIndex: selectedEditIndex,
					allEdits: allEdits,
				}, async (newEditIndex) => {
					await model.undo();
					this.applyDropResult(editor, position, newEditIndex, allEdits, token);
				});
			}
		}
	}
}

registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController, EditorContributionInstantiation.BeforeFirstInteraction);

registerEditorCommand(new class extends EditorCommand {
	constructor() {
		super({
			id: changeDropTypeCommandId,
			precondition: dropWidgetVisibleCtx,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
			}
		});
	}

	public override runEditorCommand(_accessor: ServicesAccessor | null, editor: ICodeEditor, _args: any) {
		DropIntoEditorController.get(editor)?.changeDropType();
	}
});
