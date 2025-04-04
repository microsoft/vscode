/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITreeSitterParserService } from '../../../../editor/common/services/treeSitterParserService.js';

export interface IViewPortChangeEvent {
	model: ITextModel;
	ranges: Range[];
}

export class TreeSitterCodeEditors extends Disposable {
	private readonly _textModels = new Set<ITextModel>();
	private readonly _languageEditors = this._register(new DisposableMap<ICodeEditor>);
	private readonly _allEditors = this._register(new DisposableMap<ICodeEditor>());
	private readonly _onDidChangeViewport = this._register(new Emitter<IViewPortChangeEvent>());
	public readonly onDidChangeViewport = this._onDidChangeViewport.event;

	constructor(private readonly _languageId: string,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ITreeSitterParserService private readonly _treeSitterParserService: ITreeSitterParserService) {

		super();
		this._register(this._codeEditorService.onCodeEditorAdd(this._onCodeEditorAdd, this));
		this._register(this._codeEditorService.onCodeEditorRemove(this._onCodeEditorRemove, this));
		this._codeEditorService.listCodeEditors().forEach(this._onCodeEditorAdd, this);
	}

	get textModels(): ITextModel[] {
		return Array.from(this._textModels.keys());
	}

	getEditorForModel(model: ITextModel): ICodeEditor | undefined {
		return this._codeEditorService.listCodeEditors().find(editor => editor.getModel() === model);
	}

	public async getInitialViewPorts(): Promise<IViewPortChangeEvent[]> {
		await this._treeSitterParserService.getLanguage(this._languageId);
		const editors = this._codeEditorService.listCodeEditors();
		const viewports: IViewPortChangeEvent[] = [];
		for (const editor of editors) {
			const model = await this.getEditorModel(editor);
			if (model && model.getLanguageId() === this._languageId) {
				viewports.push({
					model,
					ranges: this._nonIntersectingViewPortRanges(editor)
				});
			}
		}
		return viewports;
	}

	private _onCodeEditorRemove(editor: ICodeEditor): void {
		this._allEditors.deleteAndDispose(editor);
	}

	private async getEditorModel(editor: ICodeEditor): Promise<ITextModel | undefined> {
		let model = editor.getModel() ?? undefined;
		if (!model) {
			const disposableStore: DisposableStore = this._register(new DisposableStore());
			await Event.toPromise(Event.once(editor.onDidChangeModel), disposableStore);
			model = editor.getModel() ?? undefined;
		}
		return model;
	}

	private async _onCodeEditorAdd(editor: ICodeEditor): Promise<void> {
		const otherEditorDisposables = new DisposableStore();
		otherEditorDisposables.add(editor.onDidChangeModel(() => this._onDidChangeModel(editor, editor.getModel()), this));
		this._allEditors.set(editor, otherEditorDisposables);

		const model = editor.getModel();
		if (model) {
			this._tryAddEditor(editor, model);
		}
	}

	private _tryAddEditor(editor: ICodeEditor, model: ITextModel): void {
		const language = model.getLanguageId();
		if ((language === this._languageId)) {
			if (!this._textModels.has(model)) {
				this._textModels.add(model);
			}
			if (!this._languageEditors.has(editor)) {
				const langaugeEditorDisposables = new DisposableStore();
				langaugeEditorDisposables.add(editor.onDidScrollChange(() => this._onViewportChange(editor), this));
				this._languageEditors.set(editor, langaugeEditorDisposables);
				this._onViewportChange(editor);
			}
		}
	}

	private async _onDidChangeModel(editor: ICodeEditor, model: ITextModel | null): Promise<void> {
		if (model) {
			this._tryAddEditor(editor, model);
		} else {
			this._languageEditors.deleteAndDispose(editor);
		}
	}

	private async _onViewportChange(editor: ICodeEditor): Promise<void> {
		const ranges = this._nonIntersectingViewPortRanges(editor);
		const model = editor.getModel();
		if (!model) {
			this._languageEditors.deleteAndDispose(editor);
			return;
		}
		this._onDidChangeViewport.fire({ model: model, ranges });
	}

	private _nonIntersectingViewPortRanges(editor: ICodeEditor) {
		const viewportRanges = editor.getVisibleRangesPlusViewportAboveBelow();
		const nonIntersectingRanges: Range[] = [];
		for (const range of viewportRanges) {
			if (nonIntersectingRanges.length !== 0) {
				const prev = nonIntersectingRanges[nonIntersectingRanges.length - 1];
				if (Range.areOnlyIntersecting(prev, range)) {
					const newRange = prev.plusRange(range);
					nonIntersectingRanges[nonIntersectingRanges.length - 1] = newRange;
					continue;
				}
			}
			nonIntersectingRanges.push(range);
		}
		return nonIntersectingRanges;
	}
}
