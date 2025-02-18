/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITreeSitterParserService } from '../../../../editor/common/services/treeSitterParserService.js';

export interface IViewPortChangeEvent {
	model: ITextModel;
	ranges: Range[];
}

export class TreeSitterCodeEditors extends Disposable {
	private readonly _editors = this._register(new DisposableMap<ICodeEditor>());
	private readonly _onDidChangeViewport = this._register(new Emitter<IViewPortChangeEvent>());
	public readonly onDidChangeViewport = this._onDidChangeViewport.event;

	constructor(private readonly _languageId: string,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ITreeSitterParserService private readonly _treeSitterParserService: ITreeSitterParserService) {
		super();
		this._register(this._codeEditorService.onCodeEditorAdd(this._onCodeEditorAdd, this));
		this._register(this._codeEditorService.onCodeEditorRemove(this._onCodeEditorRemove, this));
	}

	public async getInitialViewPorts(): Promise<IViewPortChangeEvent[]> {
		await this._treeSitterParserService.getLanguage(this._languageId);
		const editors = this._codeEditorService.listCodeEditors();
		const viewports: IViewPortChangeEvent[] = [];
		for (const editor of editors) {
			const model = await this.getEditorModel(editor);
			if (model) {
				viewports.push({
					model,
					ranges: this._nonIntersectingViewPortRanges(editor)
				});
			}
		}
		return viewports;
	}

	private _onCodeEditorRemove(editor: ICodeEditor): void {
		this._editors.deleteAndDispose(editor);
	}

	private async getEditorModel(editor: ICodeEditor): Promise<ITextModel | undefined> {
		let model = editor.getModel() ?? undefined;
		if (!model) {
			const disposableStore: DisposableStore = this._register(new DisposableStore());
			await Event.toPromise(Event.once(editor.onDidChangeModel), disposableStore);
			model = editor.getModel() ?? undefined;
		}

		if (!model) {
			return;
		}

		let language = model.getLanguageId();
		if (language === PLAINTEXT_LANGUAGE_ID) {
			const disposableStore = this._register(new DisposableStore());
			await Event.toPromise(Event.once(model.onDidChangeLanguage), disposableStore);
			language = model.getLanguageId();
		}

		if (language !== this._languageId) {
			return;
		}
		return model;
	}

	private async _onCodeEditorAdd(editor: ICodeEditor): Promise<void> {
		const model = await this.getEditorModel(editor);
		if (model) {
			this._editors.set(editor, editor.onDidScrollChange(() => this._onViewportChange(editor), this));
			this._onViewportChange(editor);
		}
	}

	private async _onViewportChange(editor: ICodeEditor): Promise<void> {
		const ranges = this._nonIntersectingViewPortRanges(editor);
		this._onDidChangeViewport.fire({ model: editor.getModel()!, ranges });
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
