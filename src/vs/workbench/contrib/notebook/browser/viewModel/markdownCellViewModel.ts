/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import * as UUID from 'vs/base/common/uuid';
import * as model from 'vs/editor/common/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CellState, ICellViewModel, CellFindMatch, NotebookViewLayoutAccessor, MarkdownCellLayoutInfo, MarkdownCellLayoutChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { MarkdownRenderer } from 'vs/workbench/contrib/notebook/browser/view/renderers/mdRenderer';
import { BaseCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/baseCellViewModel';
import { CellKind, ICell } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CELL_MARGIN } from 'vs/workbench/contrib/notebook/browser/constants';

export class MarkdownCellViewModel extends BaseCellViewModel implements ICellViewModel {
	cellKind: CellKind.Markdown = CellKind.Markdown;
	private _mdRenderer: MarkdownRenderer | null = null;
	private _html: HTMLElement | null = null;
	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	private _layoutInfo: MarkdownCellLayoutInfo;

	get layoutInfo() {
		return this._layoutInfo;
	}

	protected readonly _onDidChangeLayout = new Emitter<MarkdownCellLayoutChangeEvent>();
	readonly onDidChangeLayout = this._onDidChangeLayout.event;

	constructor(
		readonly viewType: string,
		readonly notebookHandle: number,
		readonly cell: ICell,
		private _layoutAccessor: NotebookViewLayoutAccessor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private readonly _modelService: ITextModelService) {
		super(viewType, notebookHandle, cell, UUID.generateUuid());

		this._layoutInfo = {
			fontInfo: this._layoutAccessor.layoutInfo?.fontInfo || null,
			editorWidth: 0
		};

		this._register(_layoutAccessor.onDidChangeLayout((e) => {
			if (e.width) {
				this.layoutChange({ outerWidth: true });
			}
		}));
	}

	layoutChange(state: MarkdownCellLayoutChangeEvent) {
		// recompute
		const editorWidth = this._layoutAccessor.layoutInfo ? this._layoutAccessor.layoutInfo.width - CELL_MARGIN * 2 : 0;

		this._layoutInfo = {
			fontInfo: this._layoutAccessor.layoutInfo?.fontInfo || null,
			editorWidth
		};

		this._onDidChangeLayout.fire(state);
	}

	hasDynamicHeight() {
		return true;
	}

	getHeight(lineHeight: number) {
		return 100;
	}

	setText(strs: string[]) {
		this.cell.source = strs;
		this._html = null;
	}

	save() {
		if (this._textModel && !this._textModel.isDisposed() && this.state === CellState.Editing) {
			let cnt = this._textModel.getLineCount();
			this.cell.source = this._textModel.getLinesContent().map((str, index) => str + (index !== cnt - 1 ? '\n' : ''));
		}
	}

	getText(): string {
		if (this._textModel) {
			return this._textModel.getValue();
		}
		return this.cell.source.join('\n');
	}

	getHTML(): HTMLElement | null {
		if (this.cellKind === CellKind.Markdown) {
			if (this._html) {
				return this._html;
			}
			let renderer = this.getMarkdownRenderer();
			this._html = renderer.render({ value: this.getText(), isTrusted: true }).element;
			return this._html;
		}
		return null;
	}

	async resolveTextModel(): Promise<model.ITextModel> {
		if (!this._textModel) {
			const ref = await this._modelService.createModelReference(this.cell.uri);
			this._textModel = ref.object.textEditorModel;
			this._buffer = this._textModel.getTextBuffer();
			this._register(ref);
			this._register(this._textModel.onDidChangeContent(() => {
				this.cell.contentChange();
				this._html = null;
				this._onDidChangeContent.fire();
			}));
		}
		return this._textModel;
	}

	onDeselect() {
		this.state = CellState.Preview;
	}

	getMarkdownRenderer() {
		if (!this._mdRenderer) {
			this._mdRenderer = this._instaService.createInstance(MarkdownRenderer);
		}
		return this._mdRenderer;
	}

	private readonly _hasFindResult = this._register(new Emitter<boolean>());
	public readonly hasFindResult: Event<boolean> = this._hasFindResult.event;

	startFind(value: string): CellFindMatch | null {
		const matches = super.cellStartFind(value);

		if (matches === null) {
			return null;
		}

		return {
			cell: this,
			matches
		};
	}
}
