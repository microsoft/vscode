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
	protected _metadataHeaderContainer!: HTMLElement;
	protected _metadataInfoContainer!: HTMLElement;
	protected _diffEditorContainer!: HTMLElement;
	protected _diagonalFill?: HTMLElement;
	protected _layoutInfo!: {
		editorHeight: number;
		editorMargin: number;
		metadataStatusHeight: number;
		metadataHeight: number;
		bodyMargin: number;
	};
	protected _foldingIndicator!: HTMLElement;
	protected _foldingState!: MetadataFoldingState;
	protected _metadataEditorContainer?: HTMLElement;
	protected _metadataEditorDisposeStore!: DisposableStore;
	protected _metadataEditor?: CodeEditorWidget;

	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		readonly style: 'left' | 'right' | 'full',
		protected readonly instantiationService: IInstantiationService,
		protected readonly modeService: IModeService,
		protected readonly modelService: IModelService,

	) {
		super();
		// init
		this._layoutInfo = {
			editorHeight: 0,
			editorMargin: 0,
			metadataHeight: 0,
			metadataStatusHeight: 25,
			bodyMargin: 16
		};
		this._metadataEditorDisposeStore = new DisposableStore();
		this._foldingState = MetadataFoldingState.Collapsed;
		this.initData();
		this.buildBody(templateData.container);
		this._register(cell.onDidLayoutChange(e => this.onDidLayoutChange(e)));
	}

	buildBody(container: HTMLElement) {
		const body = DOM.$('.cell-body');
		DOM.append(container, body);
		this._diffEditorContainer = DOM.$('.cell-diff-editor-container');
		switch (this.style) {
			case 'left':
				DOM.addClass(body, 'left');
				break;
			case 'right':
				DOM.addClass(body, 'right');
				break;
			default:
				DOM.addClass(body, 'full');
				break;
		}

		DOM.append(body, this._diffEditorContainer);
		this._diagonalFill = DOM.append(body, DOM.$('.diagonal-fill'));
		// this._diagonalFill.style.display = '0px';
		this.styleContainer(this._diffEditorContainer);
		const sourceContainer = DOM.append(this._diffEditorContainer, DOM.$('.source-container'));
		this.buildSourceEditor(sourceContainer);

		this._metadataHeaderContainer = DOM.append(this._diffEditorContainer, DOM.$('.metadata-header-container'));
		this._metadataInfoContainer = DOM.append(this._diffEditorContainer, DOM.$('.metadata-info-container'));
		this.buildMetadataHeader(this._metadataHeaderContainer);
		// this.buildMetadataBody(this._metadataInfoContainer);
	}

	buildMetadataHeader(metadataHeaderContainer: HTMLElement): void {
		this._foldingIndicator = DOM.append(metadataHeaderContainer, DOM.$('.metadata-folding-indicator'));
		this._updateFoldingIcon();
		const metadataStatus = DOM.append(metadataHeaderContainer, DOM.$('div.metadata-status'));
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

	private _updateFoldingIcon() {
		if (this._foldingState === MetadataFoldingState.Collapsed) {
			this._foldingIndicator.innerHTML = renderCodicons('$(chevron-right)');
		} else {
			this._foldingIndicator.innerHTML = renderCodicons('$(chevron-down)');
		}
	}

	abstract initData(): void;
	abstract styleContainer(container: HTMLElement): void;
	abstract buildSourceEditor(sourceContainer: HTMLElement): void;
	abstract onDidLayoutChange(event: CellDiffViewModelLayoutChangeEvent): void;
	abstract layout(state: { outerWidth?: boolean, editorHeight?: boolean, metadataEditor?: boolean }): void;
}

export class UnchangedCell extends AbstractCellRenderer {
	private _editor!: CodeEditorWidget;

	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IModeService readonly modeService: IModeService,
		@IModelService protected modelService: IModelService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(notebookEditor, cell, templateData, 'full', instantiationService, modeService, modelService);
	}

	initData() {
	}

	styleContainer(container: HTMLElement) {
	}

	buildSourceEditor(sourceContainer: HTMLElement) {
		const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));
		const originalCell = this.cell.original!;
		const lineCount = originalCell.textBuffer.getLineCount();
		const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;

		this._editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: this.notebookEditor.getLayoutInfo().width - 20,
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
			this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.bodyMargin);
	}
}

export class DeletedCell extends AbstractCellRenderer {
	private _editor!: CodeEditorWidget;
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IModeService readonly modeService: IModeService,
		@IModelService readonly modelService: IModelService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(notebookEditor, cell, templateData, 'left', instantiationService, modeService, modelService);
	}

	initData(): void {
	}

	styleContainer(container: HTMLElement) {
	}

	buildSourceEditor(sourceContainer: HTMLElement): void {
		const originalCell = this.cell.original!;
		const lineCount = originalCell.textBuffer.getLineCount();
		const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;

		const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));

		this._editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: editorHeight
			}
		}, {});

		if (this._diagonalFill) {
			this._layoutInfo.editorHeight = editorHeight;
			// this._diagonalFill.style.height = `${this._diffEditorContainer.clientHeight}px`;
		}

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

	onDidLayoutChange(e: CellDiffViewModelLayoutChangeEvent) {
		if (e.outerWidth !== undefined) {
			this.layout({ outerWidth: true });
		}
	}
	layout(state: { outerWidth?: boolean, editorHeight?: boolean, metadataEditor?: boolean }) {
		if (state.editorHeight || state.outerWidth) {
			this._editor.layout({
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: this._layoutInfo.editorHeight
			});
		}

		if (state.metadataEditor || state.outerWidth) {
			this._metadataEditor?.layout({
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: this._layoutInfo.metadataHeight
			});
		}

		if (this._diagonalFill) {
			// this._diagonalFill.style.height = `${this._diffEditorContainer.clientHeight}px`;
		}

		this.notebookEditor.layoutNotebookCell(this.cell,
			this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.bodyMargin);
	}
}

export class InsertCell extends AbstractCellRenderer {
	private _editor!: CodeEditorWidget;
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IModeService readonly modeService: IModeService,
		@IModelService readonly modelService: IModelService,
	) {
		super(notebookEditor, cell, templateData, 'right', instantiationService, modeService, modelService);
	}

	initData(): void {
	}

	styleContainer(container: HTMLElement): void {
	}

	buildSourceEditor(sourceContainer: HTMLElement): void {
		const modifiedCell = this.cell.modified!;
		const lineCount = modifiedCell.textBuffer.getLineCount();
		const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;
		const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));

		this._editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: editorHeight
			}
		}, {});

		this._layoutInfo.editorHeight = editorHeight;

		if (this._diagonalFill) {
			this._diagonalFill.style.height = `${this._diffEditorContainer.clientHeight}px`;
		}

		this._register(this._editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				this._layoutInfo.editorHeight = e.contentHeight;
				this.layout({ editorHeight: true });
			}
		}));

		modifiedCell.resolveTextModelRef().then(ref => {
			this._register(ref);

			const textModel = ref.object.textEditorModel;
			this._editor.setModel(textModel);
			this._layoutInfo.editorHeight = this._editor.getContentHeight();
			this.layout({ editorHeight: true });
		});
	}

	onDidLayoutChange(e: CellDiffViewModelLayoutChangeEvent) {
		if (e.outerWidth !== undefined) {
			this.layout({ outerWidth: true });
		}
	}

	layout(state: { outerWidth?: boolean, editorHeight?: boolean, metadataEditor?: boolean }) {
		if (state.editorHeight || state.outerWidth) {
			this._editor.layout({
				width: (this.notebookEditor.getLayoutInfo().width - 20) / 2 - 18,
				height: this._layoutInfo.editorHeight
			});
		}

		if (state.metadataEditor || state.outerWidth) {
			this._metadataEditor?.layout({
				width: this.notebookEditor.getLayoutInfo().width - 20,
				height: this._layoutInfo.metadataHeight
			});
		}

		if (this._diagonalFill) {
			this._diagonalFill.style.height = `${this._diffEditorContainer.clientHeight}px`;
		}

		this.notebookEditor.layoutNotebookCell(this.cell,
			this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.bodyMargin);
	}
}

export class ModifiedCell extends AbstractCellRenderer {
	private _editor?: DiffEditorWidget;
	private _editorContainer!: HTMLElement;
	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		readonly cell: CellDiffViewModel,
		readonly templateData: CellDiffRenderTemplate,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IModeService readonly modeService: IModeService,
		@IModelService readonly modelService: IModelService,
	) {
		super(notebookEditor, cell, templateData, 'full', instantiationService, modeService, modelService);
	}

	initData(): void {
	}

	styleContainer(container: HTMLElement): void {
	}

	buildSourceEditor(sourceContainer: HTMLElement): void {
		const modifiedCell = this.cell.modified!;
		const lineCount = modifiedCell.textBuffer.getLineCount();
		const lineHeight = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight || 17;
		const editorHeight = lineCount * lineHeight + EDITOR_TOP_PADDING + EDITOR_BOTTOM_PADDING;
		this._editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));

		this._editor = this.instantiationService.createInstance(DiffEditorWidget, this._editorContainer, {
			...fixedDiffEditorOptions
		});

		this._editor.layout({
			width: this.notebookEditor.getLayoutInfo().width - 20,
			height: editorHeight
		});

		this._editorContainer.style.height = `${editorHeight}px`;

		this._register(this._editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				this._layoutInfo.editorHeight = e.contentHeight;
				this.layout({ editorHeight: true });
			}
		}));

		this._initializeSourceDiffEditor();
	}

	private async _initializeSourceDiffEditor() {
		const originalCell = this.cell.original!;
		const modifiedCell = this.cell.modified!;

		const originalRef = await originalCell.resolveTextModelRef();
		const modifiedRef = await modifiedCell.resolveTextModelRef();
		const textModel = originalRef.object.textEditorModel;
		const modifiedTextModel = modifiedRef.object.textEditorModel;
		this._register(originalRef);
		this._register(modifiedRef);

		this._editor!.setModel({
			original: textModel,
			modified: modifiedTextModel
		});

		const contentHeight = this._editor!.getContentHeight();
		this._layoutInfo.editorHeight = contentHeight;
		this.layout({ editorHeight: true });

	}

	onDidLayoutChange(e: CellDiffViewModelLayoutChangeEvent) {
		if (e.outerWidth !== undefined) {
			this.layout({ outerWidth: true });
		}
	}

	layout(state: { outerWidth?: boolean, editorHeight?: boolean, metadataEditor?: boolean }) {
		if (state.editorHeight || state.outerWidth) {
			this._editorContainer.style.height = `${this._layoutInfo.editorHeight}px`;
			this._editor!.layout();
		}

		if (state.metadataEditor || state.outerWidth) {
			this._metadataEditor?.layout({
				width: this.notebookEditor.getLayoutInfo().width - 20,
				height: this._layoutInfo.metadataHeight
			});
		}

		this.notebookEditor.layoutNotebookCell(this.cell,
			this._layoutInfo.editorHeight + this._layoutInfo.editorMargin + this._layoutInfo.metadataHeight + this._layoutInfo.metadataStatusHeight + this._layoutInfo.bodyMargin);

	}
}
