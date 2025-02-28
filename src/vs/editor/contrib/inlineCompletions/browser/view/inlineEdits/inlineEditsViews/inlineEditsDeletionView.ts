/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedObservableWithCache, IObservable } from '../../../../../../../base/common/observable.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { IInlineEditsView, IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../inlineEditWithChanges.js';
import { getOriginalBorderColor, originalBackgroundColor } from '../theme.js';
import { createRectangle, getPrefixTrim, mapOutFalsy, maxContentWidthInRange } from '../utils/utils.js';

export class InlineEditsDeletionView extends Disposable implements IInlineEditsView {
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _uiState: IObservable<{
			originalRange: LineRange;
			deletions: Range[];
		} | undefined>,
		private readonly _host: IInlineEditsViewHost,
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

	private readonly _originalDisplayRange = this._uiState.map(s => s?.originalRange);
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

	private readonly _maxPrefixTrim = derived(reader => {
		const state = this._uiState.read(reader);
		if (!state) {
			return { prefixTrim: 0, prefixLeftOffset: 0 };
		}
		return getPrefixTrim(state.deletions, state.originalRange, [], this._editor);
	});

	private readonly _editorLayoutInfo = derived(this, (reader) => {
		const inlineEdit = this._edit.read(reader);
		if (!inlineEdit) {
			return null;
		}
		const state = this._uiState.read(reader);
		if (!state) {
			return null;
		}

		const editorLayout = this._editorObs.layoutInfo.read(reader);
		const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);

		const left = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;

		const range = inlineEdit.originalLineRange;
		const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);

		const codeLeft = editorLayout.contentLeft + this._maxPrefixTrim.read(reader).prefixLeftOffset;

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
		);

		const originalBorderColor = getOriginalBorderColor(this._host.tabAction).read(reader);

		return [
			n.svgElem('path', {
				class: 'originalOverlay',
				d: rectangleOverlay,
				style: {
					fill: asCssVariable(originalBackgroundColor),
					stroke: originalBorderColor,
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
