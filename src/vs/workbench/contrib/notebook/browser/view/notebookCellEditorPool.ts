/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { CancelablePromise, createCancelablePromise } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { CellFocusMode, ICellViewModel, INotebookEditorDelegate } from '../notebookBrowser.js';
import { CellEditorOptions } from './cellParts/cellEditorOptions.js';

export class NotebookCellEditorPool extends Disposable {
	private readonly _focusedEditorDOM: HTMLElement;
	private readonly _editorDisposable = this._register(new MutableDisposable());
	private _editorContextKeyService!: IScopedContextKeyService;
	private _editor!: CodeEditorWidget;
	private _focusEditorCancellablePromise: CancelablePromise<void> | undefined;
	private _isInitialized = false;
	private _isDisposed = false;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		private readonly contextKeyServiceProvider: (container: HTMLElement) => IScopedContextKeyService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._focusedEditorDOM = this.notebookEditor.getDomNode().appendChild(DOM.$('.cell-editor-part-cache'));
		this._focusedEditorDOM.style.position = 'absolute';
		this._focusedEditorDOM.style.top = '-50000px';
		this._focusedEditorDOM.style.width = '1px';
		this._focusedEditorDOM.style.height = '1px';
	}

	private _initializeEditor(cell: ICellViewModel) {
		this._editorContextKeyService = this._register(this.contextKeyServiceProvider(this._focusedEditorDOM));

		const editorContainer = DOM.prepend(this._focusedEditorDOM, DOM.$('.cell-editor-container'));
		const editorInstaService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, this._editorContextKeyService])));
		EditorContextKeys.inCompositeEditor.bindTo(this._editorContextKeyService).set(true);
		const editorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(cell.language), this.notebookEditor.notebookOptions, this._configurationService);

		this._editor = this._register(editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
			...editorOptions.getDefaultValue(),
			dimension: {
				width: 0,
				height: 0
			},
			scrollbar: {
				vertical: 'hidden',
				horizontal: 'auto',
				handleMouseWheel: false,
				useShadows: false,
			},
		}, {
			contributions: this.notebookEditor.creationOptions.cellEditorContributions
		}));
		editorOptions.dispose();
		this._isInitialized = true;
	}

	preserveFocusedEditor(cell: ICellViewModel): void {
		if (!this._isInitialized) {
			this._initializeEditor(cell);
		}

		this._editorDisposable.clear();
		this._focusEditorCancellablePromise?.cancel();

		this._focusEditorCancellablePromise = createCancelablePromise(async token => {
			const ref = await this.textModelService.createModelReference(cell.uri);

			if (this._isDisposed || token.isCancellationRequested) {
				ref.dispose();
				return;
			}

			const editorDisposable = new DisposableStore();
			editorDisposable.add(ref);
			this._editor.setModel(ref.object.textEditorModel);
			this._editor.setSelections(cell.getSelections());
			this._editor.focus();

			const _update = () => {
				const editorSelections = this._editor.getSelections();
				if (editorSelections) {
					cell.setSelections(editorSelections);
				}

				this.notebookEditor.revealInView(cell);
				this._editor.setModel(null);
				ref.dispose();
			};

			editorDisposable.add(this._editor.onDidChangeModelContent((e) => {
				_update();
			}));

			editorDisposable.add(this._editor.onDidChangeCursorSelection(e => {
				if (e.source === 'keyboard' || e.source === 'mouse') {
					_update();
				}
			}));

			editorDisposable.add(this.notebookEditor.onDidChangeActiveEditor(() => {
				const latestActiveCell = this.notebookEditor.getActiveCell();

				if (latestActiveCell !== cell || latestActiveCell.focusMode !== CellFocusMode.Editor) {
					// focus moves to another cell or cell container
					// we should stop preserving the editor
					this._editorDisposable.clear();
					this._editor.setModel(null);
					ref.dispose();
				}
			}));

			this._editorDisposable.value = editorDisposable;
		});
	}

	override dispose() {
		this._isDisposed = true;
		this._focusEditorCancellablePromise?.cancel();

		super.dispose();
	}
}
