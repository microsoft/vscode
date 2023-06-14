/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, observableFromEvent } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';
import { EditorLayoutInfo } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/editor/common/core/lineRange';

export class MovedBlocksLinesPart extends Disposable {
	public static readonly movedCodeBlockPadding = 4;

	constructor(
		private readonly _rootElement: HTMLElement,
		private readonly _diffModel: IObservable<DiffModel | undefined>,
		private readonly _originalEditorLayoutInfo: IObservable<EditorLayoutInfo | null>,
		private readonly _modifiedEditorLayoutInfo: IObservable<EditorLayoutInfo | null>,
		private readonly _originalEditor: ICodeEditor,
		private readonly _modifiedEditor: ICodeEditor,
	) {
		super();

		const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		element.setAttribute('class', 'moved-blocks-lines');
		this._rootElement.appendChild(element);

		this._register(autorun('update', (reader) => {
			const info = this._originalEditorLayoutInfo.read(reader);
			const info2 = this._modifiedEditorLayoutInfo.read(reader);
			if (!info || !info2) {
				return;
			}

			element.style.left = `${info.width - info.verticalScrollbarWidth}px`;
			element.style.height = `${info.height}px`;
			element.style.width = `${info.verticalScrollbarWidth + info.contentLeft - MovedBlocksLinesPart.movedCodeBlockPadding}px`;
		}));

		const originalScrollTop = observableFromEvent(this._originalEditor.onDidScrollChange, () => this._originalEditor.getScrollTop());
		const modifiedScrollTop = observableFromEvent(this._modifiedEditor.onDidScrollChange, () => this._modifiedEditor.getScrollTop());

		this._register(autorun('update', (reader) => {
			element.replaceChildren();

			const info = this._originalEditorLayoutInfo.read(reader);
			const info2 = this._modifiedEditorLayoutInfo.read(reader);
			if (!info || !info2) {
				return;
			}
			const width = info.verticalScrollbarWidth + info.contentLeft - MovedBlocksLinesPart.movedCodeBlockPadding;

			const moves = this._diffModel.read(reader)?.diff.read(reader)?.movedTexts;
			if (!moves) {
				return;
			}

			let idx = 0;
			for (const m of moves) {
				function computeLineStart(range: LineRange, editor: ICodeEditor) {
					const t1 = editor.getTopForLineNumber(range.startLineNumber);
					const t2 = editor.getTopForLineNumber(range.endLineNumberExclusive);
					return (t1 + t2) / 2;
				}

				const start = computeLineStart(m.lineRangeMapping.originalRange, this._originalEditor);
				const startOffset = originalScrollTop.read(reader);
				const end = computeLineStart(m.lineRangeMapping.modifiedRange, this._modifiedEditor);
				const endOffset = modifiedScrollTop.read(reader);

				const top = start - startOffset;
				const bottom = end - endOffset;

				const center = (width / 2) - moves.length * 5 + idx * 10;
				idx++;

				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				path.setAttribute('d', `M ${0} ${top} L ${center} ${top} L ${center} ${bottom} L ${width} ${bottom}`);

				path.setAttribute('fill', 'none');
				element.appendChild(path);
			}
		}));
	}
}
