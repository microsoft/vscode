/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, autorunWithStore, derived, observableSignalFromEvent } from 'vs/base/common/observable';
import 'vs/css!./inlineEditSideBySideWidget';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { observableCodeEditor } from 'vs/editor/browser/observableCodeEditor';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IInlineEdit } from 'vs/editor/common/languages';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

function* range(start: number, end: number, step = 1) {
	if (end === undefined) { [end, start] = [start, 0]; }
	for (let n = start; n < end; n += step) { yield n; }
}

function removeIndentation(lines: string[]): string[] {
	const indentation = lines[0].match(/^\s*/)?.[0] ?? '';
	return lines.map(l => l.replace(new RegExp('^' + indentation), ''));
}

type Pos = {
	top: number;
	left: Position;
};

export class InlineEditSideBySideWidget extends Disposable {
	private readonly _position = derived(this, reader => {
		const ghostText = this._model.read(reader);

		if (!ghostText || ghostText.text.length === 0) {
			return null;
		}
		if (ghostText.range.startLineNumber === ghostText.range.endLineNumber) {
			//for inner-line suggestions we still want to use minimal ghost text
			return null;
		}
		const editorModel = this._editor.getModel();
		if (!editorModel) {
			return null;
		}
		const lines = Array.from(range(ghostText.range.startLineNumber, ghostText.range.endLineNumber + 1));
		const lengths = lines.map(lineNumber => editorModel.getLineLastNonWhitespaceColumn(lineNumber));
		const maxColumn = Math.max(...lengths);
		const lineOfMaxColumn = lines[lengths.indexOf(maxColumn)];

		const position = new Position(lineOfMaxColumn, maxColumn);
		const pos = {
			top: ghostText.range.startLineNumber,
			left: position
		};

		return pos;
	});

	private readonly _text = derived(this, reader => {
		const ghostText = this._model.read(reader);
		if (!ghostText) {
			return '';
		}
		return removeIndentation(ghostText.text.split('\n')).join('\n');
	});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<IInlineEdit | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,

	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			/** @description setup content widget */
			const model = this._model.read(reader);
			if (!model) {
				return;
			}

			const contentWidget = store.add(this._instantiationService.createInstance(
				InlineEditSideBySideContentWidget,
				this._editor,
				this._position,
				this._text
			));
			_editor.addOverlayWidget(contentWidget);
			store.add(toDisposable(() => _editor.removeOverlayWidget(contentWidget)));
		}));
	}
}

class InlineEditSideBySideContentWidget extends Disposable implements IOverlayWidget {
	private static _dropDownVisible = false;
	public static get dropDownVisible() { return this._dropDownVisible; }

	private static id = 0;

	private readonly id = `InlineEditSideBySideContentWidget${InlineEditSideBySideContentWidget.id++}`;
	public readonly allowEditorOverflow = true;
	public readonly suppressMouseDown = false;

	private readonly _nodes = $('div.inlineEditSideBySide', undefined,);

	private readonly _scrollChanged = observableSignalFromEvent('editor.onDidScrollChange', this._editor.onDidScrollChange);

	private readonly _previewEditor = this._register(this._instantiationService.createInstance(
		EmbeddedCodeEditorWidget,
		this._nodes,
		{
			glyphMargin: false,
			lineNumbers: 'off',
			minimap: { enabled: false },
			guides: {
				indentation: false,
				bracketPairs: false,
				bracketPairsHorizontal: false,
				highlightActiveIndentation: false,
			},
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			columnSelection: false,
			overviewRulerBorder: false,
			overviewRulerLanes: 0,
			lineDecorationsWidth: 0,
			lineNumbersMinChars: 0,
			scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
		},
		{ contributions: [], },
		this._editor
	));

	private readonly _previewEditorObs = observableCodeEditor(this._previewEditor);

	private readonly _previewTextModel = this._register(this._instantiationService.createInstance(
		TextModel,
		this._text.get(),
		this._editor.getModel()?.getLanguageId() ?? PLAINTEXT_LANGUAGE_ID,
		TextModel.DEFAULT_CREATION_OPTIONS,
		null
	));

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _position: IObservable<Pos | null>,
		private readonly _text: IObservable<string>,

		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._previewEditor.setModel(this._previewTextModel);

		this._register(autorun(reader => {
			const width = this._previewEditorObs.contentWidth.read(reader);
			const lines = this._text.read(reader).split('\n').length - 1;
			const height = this._editor.getOption(EditorOption.lineHeight) * lines;
			// const height = this._previewEditor.getContentHeight();
			this._nodes.style.width = `${width}px`;
			this._nodes.style.height = `${height}px`;
			this._previewEditor.layout({ height: height, width: width });
		}));

		this._register(autorun(reader => {
			/** @description update position */
			this._position.read(reader);
			this._editor.layoutOverlayWidget(this);
		}));

		this._register(autorun(reader => {
			/** @description scroll change */
			this._scrollChanged.read(reader);
			const position = this._position.read(reader);
			if (!position) {
				return;
			}
			const visibleRanges = this._editor.getVisibleRanges();
			const isVisble = visibleRanges.some(range => {
				return position.top >= range.startLineNumber && position.top <= range.endLineNumber;
			});
			if (!isVisble) {
				this._nodes.style.display = 'none';
			}
			else {
				this._nodes.style.display = 'block';
			}
			this._editor.layoutOverlayWidget(this);
		}));
	}

	getId(): string { return this.id; }

	getDomNode(): HTMLElement {
		return this._nodes;
	}

	getPosition(): IOverlayWidgetPosition | null {
		const position = this._position.get();
		if (!position) {
			return null;
		}
		const layoutInfo = this._editor.getLayoutInfo();
		const visibPos = this._editor.getScrolledVisiblePosition(new Position(position.top, 1));
		if (!visibPos) {
			return null;
		}
		const top = visibPos.top;
		const left = layoutInfo.contentLeft + this._editor.getOffsetForColumn(position.left.lineNumber, position.left.column) + 10;
		return {
			preference: {
				left,
				top,
			}
		};
	}
}
