/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, ObservablePromise, autorun, autorunWithStore, derived, observableSignalFromEvent } from 'vs/base/common/observable';
import { derivedDisposable } from 'vs/base/common/observableInternal/derived';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./inlineEditSideBySideWidget';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { observableCodeEditor } from 'vs/editor/browser/observableCodeEditor';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackgroundWithIndicator, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from 'vs/editor/browser/widget/diffEditor/registrations.contribution';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { DetailedLineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IInlineEdit } from 'vs/editor/common/languages';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

function* range(start: number, end: number, step = 1) {
	if (end === undefined) { [end, start] = [start, 0]; }
	for (let n = start; n < end; n += step) { yield n; }
}

function removeIndentation(lines: string[]) {
	const indentation = lines[0].match(/^\s*/)?.[0] ?? '';
	const length = indentation.length;

	return {
		text: lines.map(l => l.replace(new RegExp('^' + indentation), '')),
		shift: length
	};
}

type Pos = {
	top: number;
	left: Position;
};

export class InlineEditSideBySideWidget extends Disposable {
	private static _modelId = 0;
	private static _createUniqueUri(): URI {
		return URI.from({ scheme: 'inline-edit-widget', path: new Date().toString() + String(InlineEditSideBySideWidget._modelId++) });
	}

	private readonly _position = derived(this, reader => {
		const ghostText = this._model.read(reader);

		if (!ghostText || ghostText.text.length === 0) {
			return null;
		}
		if (ghostText.range.startLineNumber === ghostText.range.endLineNumber && !(ghostText.range.startColumn === ghostText.range.endColumn && ghostText.range.startColumn === 1)) {
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
			return { text: '', shift: 0 };
		}
		const t = removeIndentation(ghostText.text.split('\n'));
		return {
			text: t.text.join('\n'),
			shift: t.shift
		};
	});


	private readonly _originalModel = derivedDisposable(() => this._modelService.createModel('', null, InlineEditSideBySideWidget._createUniqueUri())).keepObserved(this._store);
	private readonly _modifiedModel = derivedDisposable(() => this._modelService.createModel('', null, InlineEditSideBySideWidget._createUniqueUri())).keepObserved(this._store);

	private readonly _diff = derived(this, reader => {
		return this._diffPromise.read(reader)?.promiseResult.read(reader)?.data;
	});

	private readonly _diffPromise = derived(this, reader => {
		const ghostText = this._model.read(reader);
		if (!ghostText) {
			return;
		}
		const editorModel = this._editor.getModel();
		if (!editorModel) {
			return;
		}
		const originalText = removeIndentation(editorModel.getValueInRange(ghostText.range).split('\n')).text.join('\n');
		const modifiedText = removeIndentation(ghostText.text.split('\n')).text.join('\n');
		this._originalModel.get().setValue(originalText);
		this._modifiedModel.get().setValue(modifiedText);
		const d = this._diffProviderFactoryService.createDiffProvider({ diffAlgorithm: 'advanced' });
		return ObservablePromise.fromFn(async () => {
			const result = await d.computeDiff(this._originalModel.get(), this._modifiedModel.get(), {
				computeMoves: false,
				ignoreTrimWhitespace: false,
				maxComputationTimeMs: 1000,
			}, CancellationToken.None);

			if (result.identical) {
				return undefined;
			}

			return result.changes;
		});
	});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<IInlineEdit | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IDiffProviderFactoryService private readonly _diffProviderFactoryService: IDiffProviderFactoryService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			/** @description setup content widget */
			const model = this._model.read(reader);
			if (!model) {
				return;
			}
			if (this._position.get() === null) {
				return;
			}
			const contentWidget = store.add(this._instantiationService.createInstance(
				InlineEditSideBySideContentWidget,
				this._editor,
				this._position,
				this._text.map(t => t.text),
				this._text.map(t => t.shift),
				this._diff
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
	public readonly allowEditorOverflow = false;

	private readonly _nodes = $('div.inlineEditSideBySide', undefined);

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
			scrollbar: { vertical: 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: false, handleMouseWheel: false },
			readOnly: true,
			wordWrap: 'off',
			wordWrapOverride1: 'off',
			wordWrapOverride2: 'off',
			wrappingIndent: 'none',
			wrappingStrategy: undefined,
		},
		{ contributions: [], isSimpleWidget: true },
		this._editor
	));

	private readonly _previewEditorObs = observableCodeEditor(this._previewEditor);
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _previewTextModel = this._register(this._instantiationService.createInstance(
		TextModel,
		'',
		this._editor.getModel()?.getLanguageId() ?? PLAINTEXT_LANGUAGE_ID,
		TextModel.DEFAULT_CREATION_OPTIONS,
		null
	));

	private readonly _setText = derived(reader => {
		const edit = this._text.read(reader);
		if (!edit) { return; }
		this._previewTextModel.setValue(edit);
	}).recomputeInitiallyAndOnChange(this._store);


	private readonly _decorations = derived(this, (reader) => {
		this._setText.read(reader);
		const position = this._position.read(reader);
		if (!position) { return { org: [], mod: [] }; }
		const diff = this._diff.read(reader);
		if (!diff) { return { org: [], mod: [] }; }

		const originalDecorations: IModelDeltaDecoration[] = [];
		const modifiedDecorations: IModelDeltaDecoration[] = [];

		if (diff.length === 1 && diff[0].innerChanges![0].modifiedRange.equalsRange(this._previewTextModel.getFullModelRange())) {
			return { org: [], mod: [] };
		}
		const shift = this._shift.get();

		const moveRange = (range: IRange) => {
			return new Range(range.startLineNumber + position.top - 1, range.startColumn + shift, range.endLineNumber + position.top - 1, range.endColumn + shift);
		};

		for (const m of diff) {
			if (!m.original.isEmpty) {
				originalDecorations.push({ range: moveRange(m.original.toInclusiveRange()!), options: diffLineDeleteDecorationBackgroundWithIndicator });
			}
			if (!m.modified.isEmpty) {
				modifiedDecorations.push({ range: m.modified.toInclusiveRange()!, options: diffLineAddDecorationBackgroundWithIndicator });
			}

			if (m.modified.isEmpty || m.original.isEmpty) {
				if (!m.original.isEmpty) {
					originalDecorations.push({ range: moveRange(m.original.toInclusiveRange()!), options: diffWholeLineDeleteDecoration });
				}
				if (!m.modified.isEmpty) {
					modifiedDecorations.push({ range: m.modified.toInclusiveRange()!, options: diffWholeLineAddDecoration });
				}
			} else {
				for (const i of m.innerChanges || []) {
					// Don't show empty markers outside the line range
					if (m.original.contains(i.originalRange.startLineNumber)) {
						originalDecorations.push({ range: moveRange(i.originalRange), options: i.originalRange.isEmpty() ? diffDeleteDecorationEmpty : diffDeleteDecoration });
					}
					if (m.modified.contains(i.modifiedRange.startLineNumber)) {
						modifiedDecorations.push({ range: i.modifiedRange, options: i.modifiedRange.isEmpty() ? diffAddDecorationEmpty : diffAddDecoration });
					}
				}
			}
		}

		return { org: originalDecorations, mod: modifiedDecorations };
	});

	private readonly _originalDecorations = derived(this, reader => {
		return this._decorations.read(reader).org;
	});

	private readonly _modifiedDecorations = derived(this, reader => {
		return this._decorations.read(reader).mod;
	});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _position: IObservable<Pos | null>,
		private readonly _text: IObservable<string>,
		private readonly _shift: IObservable<number>,
		private readonly _diff: IObservable<readonly DetailedLineRangeMapping[] | undefined>,

		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._previewEditor.setModel(this._previewTextModel);

		this._register(this._editorObs.setDecorations(this._originalDecorations));
		this._register(this._previewEditorObs.setDecorations(this._modifiedDecorations));

		this._register(autorun(reader => {
			const width = this._previewEditorObs.contentWidth.read(reader);
			const lines = this._text.read(reader).split('\n').length - 1;
			const height = this._editor.getOption(EditorOption.lineHeight) * lines;
			if (width <= 0) {
				return;
			}
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
		const top = visibPos.top - 1; //-1 to offset the border width
		const offset = this._editor.getOffsetForColumn(position.left.lineNumber, position.left.column);
		const left = layoutInfo.contentLeft + offset + 10;
		return {
			preference: {
				left,
				top,
			}
		};
	}
}
