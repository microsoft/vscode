/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelService } from 'vs/editor/common/services/modelService';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Emitter } from 'vs/base/common/event';
import * as UUID from 'vs/base/common/uuid';
import { MarkdownRenderer } from 'vs/workbench/contrib/notebook/browser/renderers/mdRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICell } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class CellViewModel extends Disposable {
	private _textModel: ITextModel | null = null;
	private _mdRenderer: MarkdownRenderer | null = null;
	private _html: HTMLElement | null = null;
	private _dynamicHeight: number | null = null;
	protected readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;
	protected readonly _onDidChangeEditingState = new Emitter<void>();
	readonly onDidChangeEditingState = this._onDidChangeEditingState.event;
	protected readonly _onDidChangeOutputs = new Emitter<void>();
	readonly onDidChangeOutputs = this._onDidChangeOutputs.event;
	get cellType() {
		return this.cell.cell_type;
	}
	get lineCount() {
		return this.cell.source.length;
	}
	get outputs() {
		return this.cell.outputs;
	}
	get isEditing(): boolean {
		return this._isEditing;
	}
	set isEditing(newState: boolean) {
		this._isEditing = newState;
		this._onDidChangeEditingState.fire();
	}

	set dynamicHeight(height: number | null) {
		this._dynamicHeight = height;
	}

	get dynamicHeight(): number | null {
		return this._dynamicHeight;
	}
	public id: string;
	constructor(
		public viewType: string,
		public notebookHandle: number,
		public cell: ICell,
		private _isEditing: boolean,
		private readonly modelService: IModelService,
		private readonly modeService: IModeService,
		private readonly openerService: IOpenerService,
		private readonly notebookService: INotebookService,
		private readonly themeService: IThemeService) {
		super();
		this.id = UUID.generateUuid();
		if (this.cell.onDidChangeOutputs) {
			this.cell.onDidChangeOutputs(() => {
				this._onDidChangeOutputs.fire();
			});
		}
	}
	hasDynamicHeight() {
		if (this._dynamicHeight !== null) {
			return false;
		}
		if (this.cellType === 'code') {
			if (this.outputs && this.outputs.length > 0) {
				// for (let i = 0; i < this.outputs.length; i++) {
				// 	if (this.outputs[i].output_type === 'display_data' || this.outputs[i].output_type === 'execute_result') {
				// 		return false;
				// 	}
				// }
				return true;
			}
			else {
				return false;
			}
		}
		return true;
	}

	getHeight(lineHeight: number) {
		if (this._dynamicHeight) {
			return this._dynamicHeight;
		}
		if (this.cellType === 'markdown') {
			return 100;
		}
		else {
			return this.lineCount * lineHeight + 16;
		}
	}
	setText(strs: string[]) {
		this.cell.source = strs;
		this._html = null;
	}
	save() {
		if (this._textModel && (this.cell.isDirty || this.isEditing)) {
			let cnt = this._textModel.getLineCount();
			this.cell.source = this._textModel.getLinesContent().map((str, index) => str + (index !== cnt - 1 ? '\n' : ''));
		}
	}
	getText(): string {
		return this.cell.source.join('\n');
	}
	getHTML(): HTMLElement | null {
		if (this.cellType === 'markdown') {
			if (this._html) {
				return this._html;
			}
			let renderer = this.getMarkdownRenderer();
			this._html = renderer.render({ value: this.getText(), isTrusted: true }).element;
			return this._html;
		}
		return null;
	}
	getTextModel(): ITextModel {
		if (!this._textModel) {
			let mode = this.modeService.create(this.cellType === 'markdown' ? 'markdown' : this.cell.language);
			let ext = this.cellType === 'markdown' ? 'md' : 'py';
			let resource = URI.parse(`notebookcell-${Date.now()}.${ext}`);
			resource = resource.with({ authority: `notebook+${this.viewType}-${this.notebookHandle}-${this.cell.handle}` });
			let content = this.cell.source.join('\n');
			this._textModel = this.modelService.createModel(content, mode, resource, false);
			this._register(this._textModel);
			this._register(this._textModel.onDidChangeContent(() => {
				this.cell.isDirty = true;
			}));
		}
		return this._textModel;
	}

	getMarkdownRenderer() {
		if (!this._mdRenderer) {
			this._mdRenderer = new MarkdownRenderer(this.viewType, this.modeService, this.openerService, this.notebookService, this.themeService);
		}
		return this._mdRenderer;
	}
}
