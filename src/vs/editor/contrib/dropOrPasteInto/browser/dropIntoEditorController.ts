/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays';
import { CancelablePromise, createCancelablePromise, raceCancellation } from '../../../../base/common/async';
import { VSDataTransfer, matchesMimeType } from '../../../../base/common/dataTransfer';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle';
import { toExternalVSDataTransfer } from '../../../browser/dnd';
import { ICodeEditor } from '../../../browser/editorBrowser';
import { EditorOption } from '../../../common/config/editorOptions';
import { IPosition } from '../../../common/core/position';
import { Range } from '../../../common/core/range';
import { IEditorContribution } from '../../../common/editorCommon';
import { DocumentDropEdit, DocumentDropEditProvider } from '../../../common/languages';
import { ITextModel } from '../../../common/model';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures';
import { DraggedTreeItemsIdentifier } from '../../../common/services/treeViewsDnd';
import { ITreeViewsDnDService } from '../../../common/services/treeViewsDndService';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from '../../editorState/browser/editorState';
import { InlineProgressManager } from '../../inlineProgress/browser/inlineProgress';
import { localize } from '../../../../nls';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey';
import { LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { sortEditsByYieldTo } from './edit';
import { PostEditWidgetManager } from './postEditWidget';

export const defaultProviderConfig = 'editor.experimental.dropIntoEditor.defaultProvider';

export const changeDropTypeCommandId = 'editor.changeDropType';

export const dropWidgetVisibleCtx = new RawContextKey<boolean>('dropWidgetVisible', false, localize('dropWidgetVisible', "Whether the drop widget is showing"));

export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	public static get(editor: ICodeEditor): DropIntoEditorController | null {
		return editor.getContribution<DropIntoEditorController>(DropIntoEditorController.ID);
	}

	private _currentOperation?: CancelablePromise<void>;

	private readonly _dropProgressManager: InlineProgressManager;
	private readonly _postDropWidgetManager: PostEditWidgetManager<DocumentDropEdit>;

	private readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configService: IConfigurationService,
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
			const disposables = new DisposableStore();

			const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value, undefined, token));
			try {
				const ourDataTransfer = await this.extractDataTransferData(dragEvent);
				if (ourDataTransfer.size === 0 || tokenSource.token.isCancellationRequested) {
					return;
				}

				const model = editor.getModel();
				if (!model) {
					return;
				}

				const providers = this._languageFeaturesService.documentDropEditProvider
					.ordered(model)
					.filter(provider => {
						if (!provider.dropMimeTypes) {
							// Keep all providers that don't specify mime types
							return true;
						}
						return provider.dropMimeTypes.some(mime => ourDataTransfer.matches(mime));
					});

				const editSession = disposables.add(await this.getDropEdits(providers, model, position, ourDataTransfer, tokenSource));
				if (tokenSource.token.isCancellationRequested) {
					return;
				}

				if (editSession.edits.length) {
					const activeEditIndex = this.getInitialActiveEditIndex(model, editSession.edits);
					const canShowWidget = editor.getOption(EditorOption.dropIntoEditor).showDropSelector === 'afterDrop';
					// Pass in the parent token here as it tracks cancelling the entire drop operation
					await this._postDropWidgetManager.applyEditAndShowIfNeeded([Range.fromPositions(position)], { activeEditIndex, allEdits: editSession.edits }, canShowWidget, async edit => edit, token);
				}
			} finally {
				disposables.dispose();
				if (this._currentOperation === p) {
					this._currentOperation = undefined;
				}
			}
		});

		this._dropProgressManager.showWhile(position, localize('dropIntoEditorProgress', "Running drop handlers. Click to cancel"), p, { cancel: () => p.cancel() });
		this._currentOperation = p;
	}

	private async getDropEdits(providers: readonly DocumentDropEditProvider[], model: ITextModel, position: IPosition, dataTransfer: VSDataTransfer, tokenSource: EditorStateCancellationTokenSource) {
		const disposables = new DisposableStore();

		const results = await raceCancellation(Promise.all(providers.map(async provider => {
			try {
				const edits = await provider.provideDocumentDropEdits(model, position, dataTransfer, tokenSource.token);
				if (edits) {
					disposables.add(edits);
				}
				return edits?.edits.map(edit => ({ ...edit, providerId: provider.id }));
			} catch (err) {
				console.error(err);
			}
			return undefined;
		})), tokenSource.token);

		const edits = coalesce(results ?? []).flat();
		return {
			edits: sortEditsByYieldTo(edits),
			dispose: () => disposables.dispose()
		};
	}

	private getInitialActiveEditIndex(model: ITextModel, edits: ReadonlyArray<DocumentDropEdit & { readonly providerId?: string }>) {
		const preferredProviders = this._configService.getValue<Record<string, string>>(defaultProviderConfig, { resource: model.uri });
		for (const [configMime, desiredKindStr] of Object.entries(preferredProviders)) {
			const desiredKind = new HierarchicalKind(desiredKindStr);
			const editIndex = edits.findIndex(edit =>
				desiredKind.value === edit.providerId
				&& edit.handledMimeType && matchesMimeType(configMime, [edit.handledMimeType]));
			if (editIndex >= 0) {
				return editIndex;
			}
		}
		return 0;
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
