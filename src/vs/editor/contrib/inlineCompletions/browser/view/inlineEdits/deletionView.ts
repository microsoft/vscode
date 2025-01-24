/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, constObservable, derived, derivedObservableWithCache } from '../../../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../browser/point.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { Position } from '../../../../../common/core/position.js';
import { IInlineEditsView } from './sideBySideDiff.js';
import { createRectangle, mapOutFalsy, maxContentWidthInRange, n } from './utils.js';
import { InlineEditWithChanges } from './viewAndDiffProducer.js';

export class InlineEditsDeletionView extends Disposable implements IInlineEditsView {
	private readonly _editorObs = observableCodeEditor(this._editor);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _uiState: IObservable<{
			edit: InlineEditWithChanges;
			originalDisplayRange: LineRange;
			widgetStartColumn: number;
		} | undefined>,
	) {
		super();

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._nonOverflowView.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(reader => {
				const info = this._editorLayoutInfo.read(reader);
				if (info === null) { return 0; }
				return info.code1.x - info.codeStart1.x;
			}),
		}));
	}

	private readonly _display = derived(this, reader => !!this._uiState.read(reader) ? 'block' : 'none');

	private readonly _originalStartPosition = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		return inlineEdit ? new Position(inlineEdit.originalLineRange.startLineNumber, 1) : null;
	});

	private readonly _originalEndPosition = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		return inlineEdit ? new Position(inlineEdit.originalLineRange.endLineNumberExclusive, 1) : null;
	});

	private readonly _originalVerticalStartPosition = this._editorObs.observePosition(this._originalStartPosition, this._store).map(p => p?.y);
	private readonly _originalVerticalEndPosition = this._editorObs.observePosition(this._originalEndPosition, this._store).map(p => p?.y);

	private readonly _originalDisplayRange = this._uiState.map(s => s?.originalDisplayRange);
	private readonly _editorMaxContentWidthInRange = derived(this, reader => {
		const originalDisplayRange = this._originalDisplayRange.read(reader);
		if (!originalDisplayRange) {
			return constObservable(0);
		}
		this._editorObs.versionId.read(reader);

		// Take the max value that we observed.
		// Reset when either the edit changes or the editor text version.
		return derivedObservableWithCache<number>(this, (reader, lastValue) => {
			const maxWidth = maxContentWidthInRange(this._editorObs, originalDisplayRange, reader);
			return Math.max(maxWidth, lastValue ?? 0);
		});
	}).map((v, r) => v.read(r));

	private readonly _editorLayoutInfo = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) {
			return null;
		}
		const state = this._uiState.read(reader);
		if (!state) {
			return null;
		}

		const w = this._editorObs.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
		const editorLayout = this._editorObs.layoutInfo.read(reader);
		const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);

		const left = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;

		const range = inlineEdit.originalLineRange;
		const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);

		const codeLeft = editorLayout.contentLeft + state.widgetStartColumn * w;

		if (left <= codeLeft) {
			return null;
		}

		const code1 = new Point(left, selectionTop);
		const codeStart1 = new Point(codeLeft, selectionTop);
		const code2 = new Point(left, selectionBottom);
		const codeStart2 = new Point(codeLeft, selectionBottom);
		const codeHeight = selectionBottom - selectionTop;

		return {
			code1,
			codeStart1,
			code2,
			codeStart2,
			codeHeight,
			horizontalScrollOffset,
			padding: 3,
			borderRadius: 4,
		};
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _foregroundSvg = n.svg({
		transform: 'translate(-0.5 -0.5)',
		style: { overflow: 'visible', pointerEvents: 'none', position: 'absolute' },
	}, derived(reader => {
		const layoutInfoObs = mapOutFalsy(this._editorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		const layoutInfo = layoutInfoObs.read(reader);

		// TODO: look into why 1px offset is needed
		const rectangleOverlay = createRectangle(
			{
				topLeft: layoutInfo.codeStart1,
				width: layoutInfo.code1.x - layoutInfo.codeStart1.x + 1,
				height: layoutInfo.code2.y - layoutInfo.code1.y + 1,
			},
			layoutInfo.padding,
			layoutInfo.borderRadius,
			{ hideLeft: layoutInfo.horizontalScrollOffset !== 0 }
		).build();

		return [
			n.svgElem('path', {
				class: 'originalOverlay',
				d: rectangleOverlay,
				style: {
					fill: 'var(--vscode-inlineEdit-originalBackground, transparent)',
					stroke: 'var(--vscode-inlineEdit-originalBorder)',
					strokeWidth: '1px',
				}
			}),
		];
	})).keepUpdated(this._store);

	private readonly _nonOverflowView = n.div({
		class: 'inline-edits-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			zIndex: '0',
			display: this._display,
		},
	}, [
		[this._foregroundSvg],
	]).keepUpdated(this._store);

	readonly isHovered = constObservable(false);
}
