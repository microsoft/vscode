/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CellDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/celllDiffViewModel';
import { CellDiffRenderTemplate, CellDiffViewModelLayoutChangeEvent, INotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/common';
import { EDITOR_BOTTOM_PADDING, EDITOR_TOP_PADDING } from 'vs/workbench/contrib/notebook/browser/constants';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { renderCodicons } from 'vs/base/common/codicons';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';


const fixedDiffEditorOptions: IEditorOptions = {
	padding: {
		top: 12,
		bottom: 12
	},
	scrollBeyondLastLine: false,
	scrollbar: {
		verticalScrollbarSize: 14,
		horizontal: 'auto',
		useShadows: true,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		alwaysConsumeMouseWheel: false
	},
	renderLineHighlightOnlyWhenFocus: true,
	overviewRulerLanes: 0,
	selectOnLineNumbers: false,
	wordWrap: 'off',
	lineNumbers: 'off',
	lineDecorationsWidth: 0,
	glyphMargin: true,
	fixedOverflowWidgets: true,
	minimap: { enabled: false },
	renderValidationDecorations: 'on'
};

const fixedEditorOptions: IEditorOptions = {
	padding: {
		top: 12,
		bottom: 12
	},
	scrollBeyondLastLine: false,
	scrollbar: {
		verticalScrollbarSize: 14,
		horizontal: 'auto',
		useShadows: true,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		alwaysConsumeMouseWheel: false
	},
	renderLineHighlightOnlyWhenFocus: true,
	overviewRulerLanes: 0,
	selectOnLineNumbers: false,
	wordWrap: 'off',
	lineNumbers: 'off',
	lineDecorationsWidth: 0,
	glyphMargin: false,
	fixedOverflowWidgets: true,
	minimap: { enabled: false },
	renderValidationDecorations: 'on'
};

enum MetadataFoldingState {
	Expanded,
	Collapsed
}

abstract class AbstractCellRenderer extends Disposable {
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
	) {
		super();

		this._register(cell.onDidLayoutChange(e => this.onDidLayoutChange(e)));
	}

	abstract onDidLayoutChange(event: CellDiffViewModelLayoutChangeEvent): void;
}

export class UnchangedCell extends AbstractCellRenderer {
	private _editor!: CodeEditorWidget;
	private _metadataEditor?: CodeEditorWidget;
	private _layoutInfo!: {
		editorHeight: number;
		editorMargin: number;
		metadataStatusHeight: number;
		metadataHeight: number;
	};

	private _foldingState: MetadataFoldingState;
	private _metadataHeaderContainer!: HTMLElement;
	private _metadataInfoContainer!: HTMLElement;
	private _metadataEditorContainer?: HTMLElement;
	private _foldingIndicator!: HTMLElement;
	private _metadataEditorDisposeStore = new DisposableStore();

	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IModeService private readonly modeService: IModeService,
		@IModelService protected modelService: IModelService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(notebookEditor, cell);

		// init
		this._layoutInfo = {
			editorHeight: 0,
			editorMargin: 32,
			metadataHeight: 0,
			metadataStatusHeight: 24
		};

		this._foldingState = MetadataFoldingState.Collapsed;

		const diffEditorContainer = DOM.$('.cell-diff-editor-container');
		DOM.append(templateData.container, diffEditorContainer);

		const originalCell = cell.original!;
		const lineCount = originalCell.textBuffer.getLineCount();
		const lineHeight = notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;
		const editorContainer = DOM.append(diffEditorContainer, DOM.$('.editor-container'));
		this._metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-container'));
		this._metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-info-container'));
		this.buildMetadata();

		this._editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: notebookEditor.getLayoutInfo().width - 20,
				height: editorHeight
			}
		}, {});

		this._register(this._editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				this._layoutInfo.editorHeight = e.contentHeight;
				this.layout({ editorHeight: true });
			}
		}));

		originalCell.resolveTextModelRef().then(ref => {
			this._register(ref);

			const textModel = ref.object.textEditorModel;
			this._editor.setModel(textModel);

			this._layoutInfo.editorHeight = this._editor.getContentHeight();
			this.layout({ editorHeight: true });
		});
	}

	onDidLayoutChange(event: CellDiffViewModelLayoutChangeEvent): void {
		if (event.outerWidth !== undefined) {
			this.layout({ outerWidth: true });
		}
	}

	layout(state: { outerWidth?: boolean, editorHeight?: boolean, metadataEditor?: boolean }) {
		if (state.editorHeight || state.outerWidth) {
			this._editor.layout({
				width: this.notebookEditor.getLayoutInfo().width - 20,
				height: this._layoutInfo.editorHeight
			});
		}

		if (state.metadataEditor || state.outerWidth) {
			this._metadataEditor?.layout({
				width: this.notebookEditor.getLayoutInfo().width - 20,
				height: this._layoutInfo.metadataHeight
			});
		}
		this.notebookEditor.layoutNotebookCell(this.cell,
			this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.metadataStatusHeight);
	}

	private _updateFoldingIcon() {
		if (this._foldingState === MetadataFoldingState.Collapsed) {
			this._foldingIndicator.innerHTML = renderCodicons('$(chevron-right)');
		} else {
			this._foldingIndicator.innerHTML = renderCodicons('$(chevron-down)');
		}
	}

	buildMetadata() {
		this._foldingIndicator = DOM.append(this._metadataHeaderContainer, DOM.$('.metadata-folding-indicator'));
		this._updateFoldingIcon();
		const metadataStatus = DOM.append(this._metadataHeaderContainer, DOM.$('div.metadata-status'));
		const metadataStatusSpan = DOM.append(metadataStatus, DOM.$('span'));
		metadataStatusSpan.textContent = 'Metadata unchanged';

		this._register(this.notebookEditor.onMouseUp(e => {
			if (!e.event.target) {
				return;
			}

			const target = e.event.target as HTMLElement;

			if (DOM.hasClass(target, 'codicon-chevron-down') || DOM.hasClass(target, 'codicon-chevron-right')) {
				const parent = target.parentElement as HTMLElement;

				if (parent && !DOM.hasClass(parent, 'metadata-folding-indicator')) {
					return;
				}

				// folding icon

				const cellViewModel = e.target;

				if (cellViewModel === this.cell) {
					this._foldingState = this._foldingState === MetadataFoldingState.Expanded ? MetadataFoldingState.Collapsed : MetadataFoldingState.Expanded;
					this.updateMetadataRendering();
				}
			}

			return;
		}));

		this.updateMetadataRendering();
	}

	updateMetadataRendering() {
		if (this._foldingState === MetadataFoldingState.Expanded) {
			// we should expand the metadata editor
			this._metadataInfoContainer.style.display = 'block';

			if (!this._metadataEditorContainer || !this._metadataEditor) {
				// create editor
				this._metadataEditorContainer = DOM.append(this._metadataInfoContainer, DOM.$('.metadata-editor-container'));

				this._metadataEditor = this.instantiationService.createInstance(CodeEditorWidget, this._metadataEditorContainer, {
					...fixedEditorOptions,
					dimension: {
						width: this.notebookEditor.getLayoutInfo().width - 20,
						height: 0
					}
				}, {});

				const mode = this.modeService.create('json');
				const content = JSON.stringify(this.cell.original!.metadata);
				const edits = format(content, undefined, {});
				const metadataSource = applyEdits(content, edits);
				const metadataModel = this.modelService.createModel(metadataSource, mode, undefined, true);
				this._metadataEditor.setModel(metadataModel);

				this._layoutInfo.metadataHeight = this._metadataEditor.getContentHeight();
				console.log(this._layoutInfo.metadataHeight);
				this.layout({ metadataEditor: true });

				this._register(this._metadataEditor.onDidContentSizeChange((e) => {
					if (e.contentHeightChanged && this._foldingState === MetadataFoldingState.Expanded) {
						this._layoutInfo.metadataHeight = e.contentHeight;
						this.layout({ metadataEditor: true });
					}
				}));
			} else {
				this._layoutInfo.metadataHeight = this._metadataEditor.getContentHeight();
				this.layout({ metadataEditor: true });
			}
		} else {
			// we should collapse the metadata editor
			this._metadataInfoContainer.style.display = 'none';
			this._metadataEditorDisposeStore.clear();
			this._layoutInfo.metadataHeight = 0;
			this.layout({});
		}

		this._updateFoldingIcon();

	}
}

export class DeletedCell extends AbstractCellRenderer {
	private _editor!: CodeEditorWidget;
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(notebookEditor, cell);
		const diffEditorContainer = DOM.$('.cell-diff-editor-container');
		DOM.append(templateData.container, diffEditorContainer);
		DOM.addClass(diffEditorContainer, 'delete');

		const originalCell = cell.original!;
		const lineCount = originalCell.textBuffer.getLineCount();
		const lineHeight = notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;
		const editorContainer = DOM.append(diffEditorContainer, DOM.$('.editor-container'));
		const diagonalFill = DOM.append(diffEditorContainer, DOM.$('.diagonal-fill'));

		this._editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: (notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: editorHeight
			}
		}, {});

		diagonalFill.style.height = `${editorHeight}px`;

		this._register(this._editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				this._editor.layout({
					width: (notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
					height: e.contentHeight
				});
				diagonalFill.style.height = `${e.contentHeight}px`;
				this.notebookEditor.layoutNotebookCell(this.cell, e.contentHeight + 32);
			}
		}));

		originalCell.resolveTextModelRef().then(ref => {
			this._register(ref);

			const textModel = ref.object.textEditorModel;
			this._editor.setModel(textModel);

			this.notebookEditor.layoutNotebookCell(this.cell, this._editor.getContentHeight() + 32);
			diagonalFill.style.height = `${this._editor.getContentHeight()}px`;
		});
	}

	onDidLayoutChange(e: CellDiffViewModelLayoutChangeEvent) {
		if (e.outerWidth !== undefined) {
			this._editor.layout({
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: this._editor.getContentHeight()
			});
		}
	}
}

export class InsertCell extends AbstractCellRenderer {
	private _editor!: CodeEditorWidget;
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(notebookEditor, cell);
		const diffEditorContainer = DOM.$('.cell-diff-editor-container');
		DOM.append(templateData.container, diffEditorContainer);
		DOM.addClass(diffEditorContainer, 'insert');

		const modifiedCell = cell.modified!;
		const lineCount = modifiedCell.textBuffer.getLineCount();
		const lineHeight = notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;
		const diagonalFill = DOM.append(diffEditorContainer, DOM.$('.diagonal-fill'));
		const editorContainer = DOM.append(diffEditorContainer, DOM.$('.editor-container'));

		this._editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: (notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: editorHeight
			}
		}, {});

		diagonalFill.style.height = `${editorHeight}px`;

		this._register(this._editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				this._editor.layout({
					width: (notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
					height: e.contentHeight
				});
				diagonalFill.style.height = `${e.contentHeight}px`;
				this.notebookEditor.layoutNotebookCell(this.cell, e.contentHeight + 32);
			}
		}));

		this._register(this.cell.onDidLayoutChange(e => {
			if (e.outerWidth !== undefined) {
				this._editor.layout({
					width: (notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
					height: this._editor.getContentHeight()
				});
			}
		}));

		modifiedCell.resolveTextModelRef().then(ref => {
			this._register(ref);

			const textModel = ref.object.textEditorModel;
			this._editor.setModel(textModel);

			this.notebookEditor.layoutNotebookCell(this.cell, this._editor.getContentHeight() + 32);
			diagonalFill.style.height = `${this._editor.getContentHeight()}px`;
		});
	}

	onDidLayoutChange(e: CellDiffViewModelLayoutChangeEvent) {
		if (e.outerWidth !== undefined) {
			this._editor.layout({
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: this._editor.getContentHeight()
			});
		}
	}
}

export class ModifiedCell extends AbstractCellRenderer {
	private _editor!: DiffEditorWidget;
	private _editorContainer!: HTMLElement;
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(notebookEditor, cell);
		const diffEditorContainer = DOM.$('.cell-diff-editor-container');
		DOM.append(templateData.container, diffEditorContainer);

		const modifiedCell = cell.modified!;
		const lineCount = modifiedCell.textBuffer.getLineCount();
		const lineHeight = notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;
		this._editorContainer = DOM.append(diffEditorContainer, DOM.$('.editor-container'));

		this._editor = this.instantiationService.createInstance(DiffEditorWidget, this._editorContainer, {
			...fixedDiffEditorOptions
		});

		this._editor.layout({
			width: notebookEditor.getLayoutInfo().width - 20,
			height: editorHeight
		});

		this._editorContainer.style.height = `${editorHeight}px`;

		this._register(this._editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				this._editorContainer.style.height = `${e.contentHeight}px`;
				this.notebookEditor.layoutNotebookCell(this.cell, e.contentHeight + 32);
				this._editor.layout();
			}
		}));

		this.initialize();
	}

	onDidLayoutChange(e: CellDiffViewModelLayoutChangeEvent) {
		if (e.outerWidth !== undefined) {
			this._editor.layout({
				width: this.notebookEditor.getLayoutInfo().width - 20,
				height: this._editor.getContentHeight()
			});
		}
	}

	async initialize() {
		const originalCell = this.cell.original!;
		const modifiedCell = this.cell.modified!;

		const originalRef = await originalCell.resolveTextModelRef();
		const modifiedRef = await modifiedCell.resolveTextModelRef();
		const textModel = originalRef.object.textEditorModel;
		const modifiedTextModel = modifiedRef.object.textEditorModel;
		this._register(originalRef);
		this._register(modifiedRef);

		this._editor.setModel({
			original: textModel,
			modified: modifiedTextModel
		});

		const contentHeight = this._editor.getContentHeight();

		this._editorContainer.style.height = `${contentHeight}px`;
		this._editor.layout();
		this.notebookEditor.layoutNotebookCell(this.cell, contentHeight + 32);
	}
}
