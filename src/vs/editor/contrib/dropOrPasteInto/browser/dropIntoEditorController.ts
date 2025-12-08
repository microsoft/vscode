/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancelablePromise, createCancelablePromise, raceCancellation } from 'vs/base/common/async';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { toExternalVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { DocumentOnDropEditProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { DraggedTreeItemsIdentifier } from 'vs/editor/common/services/treeViewsDnd';
import { ITreeViewsDnDService } from 'vs/editor/common/services/treeViewsDndService';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { InlineProgressManager } from 'vs/editor/contrib/inlineProgress/browser/inlineProgress';
import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { LocalSelectionTransfer } from 'vs/platform/dnd/browser/dnd';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { PostEditWidgetManager } from './postEditWidget';
import { sortEditsByYieldTo as sortEditsByYieldTo } from './edit';

export const changeDropTypeCommandId = 'editor.changeDropType';

export const dropWidgetVisibleCtx = new RawContextKey<boolean>('dropWidgetVisible', false, localize('dropWidgetVisible', "Whether the drop widget is showing"));

export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	public static get(editor: ICodeEditor): DropIntoEditorController | null {
		return editor.getContribution<DropIntoEditorController>(DropIntoEditorController.ID);
	}

	private _currentOperation?: CancelablePromise<void>;

	private readonly _dropProgressManager: InlineProgressManager;
	private readonly _postDropWidgetManager: PostEditWidgetManager;

	private readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITreeViewsDnDService private readonly _treeViewsDragAndDropService: ITreeViewsDnDService
	) {
		super();

		this._dropProgressManager = this._register(instantiationService.createInstance(InlineProgressManager, 'dropIntoEditor', editor));
		this._postDropWidgetManager = this._register(instantiationService.createInstance(PostEditWidgetManager, 'dropIntoEditor', editor, dropWidgetVisibleCtx, { id: changeDropTypeCommandId, label: localize('postDropWidgetTitle', "Show drop options...") }));

		this._register(editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event)));
	}

	public clearWidgets() {
		this._postDropWidgetManager.clear();
	}

	public changeDropType() {
		this._postDropWidgetManager.tryShowSelector();
	}

	private async onDropIntoEditor(editor: ICodeEditor, position: IPosition, dragEvent: DragEvent) {
		if (!dragEvent.dataTransfer || !editor.hasModel()) {
			return;
		}

		this._currentOperation?.cancel();

		editor.focus();
		editor.setPosition(position);

		const p = createCancelablePromise(async (token) => {
			const tokenSource = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value, undefined, token);

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

				const edits = await this.getDropEdits(providers, model, position, ourDataTransfer, tokenSource);
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				if (edits.length) {
					const canShowWidget = editor.getOption(EditorOption.dropIntoEditor).showDropSelector === 'afterDrop';
					// Pass in the parent token here as it tracks cancelling the entire drop operation
					await this._postDropWidgetManager.applyEditAndShowIfNeeded([Range.fromPositions(position)], { activeEditIndex: 0, allEdits: edits }, canShowWidget, token);
				}
			} finally {
				tokenSource.dispose();
				if (this._currentOperation === p) {
					this._currentOperation = undefined;
				}
			}
		});

		this._dropProgressManager.showWhile(position, localize('dropIntoEditorProgress', "Running drop handlers. Click to cancel"), p);
		this._currentOperation = p;
	}

	private async getDropEdits(providers: DocumentOnDropEditProvider[], model: ITextModel, position: IPosition, dataTransfer: VSDataTransfer, tokenSource: EditorStateCancellationTokenSource) {
		const results = await raceCancellation(Promise.all(providers.map(async provider => {
			try {
				const edit = await provider.provideDocumentOnDropEdits(model, position, dataTransfer, tokenSource.token);
				if (edit) {
					return { ...edit, providerId: provider.id };
				}
			} catch (err) {
				console.error(err);
			}
			return undefined;
		})), tokenSource.token);
		const edits = coalesce(results ?? []);
		sortEditsByYieldTo(edits);
		return edits;
	}

	private async extractDataTransferData(dragEvent: DragEvent): Promise<VSDataTransfer> {
		if (!dragEvent.dataTransfer) {
			return new VSDataTransfer();
		}

		const dataTransfer = toExternalVSDataTransfer(dragEvent.dataTransfer);

		if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
			const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
			if (Array.isArray(data)) {
				for (const id of data) {
					const treeDataTransfer = await this._treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
					if (treeDataTransfer) {
						for (const [type, value] of treeDataTransfer) {
							dataTransfer.replace(type, value);
						}
					}
				}
			}
		}

		return dataTransfer;
	}
}
