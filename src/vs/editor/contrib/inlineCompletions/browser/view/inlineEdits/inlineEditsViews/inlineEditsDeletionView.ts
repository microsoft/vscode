/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedObservableWithCache, IObservable } from '../../../../../../../base/common/observable.js';
import { editorBackground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { IInlineEditsView, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../inlineEditWithChanges.js';
import { getOriginalBorderColor, originalBackgroundColor } from '../theme.js';
import { getPrefixTrim, mapOutFalsy, maxContentWidthInRange } from '../utils/utils.js';

const HORIZONTAL_PADDING = 0;
const VERTICAL_PADDING = 0;
const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH = 3;
const BORDER_RADIUS = 4;

export class InlineEditsDeletionView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _editorObs: ObservableCodeEditor;

	private readonly _originalVerticalStartPosition: IObservable<number | undefined>;
	private readonly _originalVerticalEndPosition: IObservable<number | undefined>;

	private readonly _originalDisplayRange: IObservable<LineRange | undefined>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		private readonly _uiState: IObservable<{
			originalRange: LineRange;
			deletions: Range[];
			inDiffEditor: boolean;
		} | undefined>,
		private readonly _tabAction: IObservable<InlineEditTabAction>,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		const originalStartPosition = derived(this, (reader) => {
			const inlineEdit = this._edit.read(reader);
			return inlineEdit ? new Position(inlineEdit.originalLineRange.startLineNumber, 1) : null;
		});

		const originalEndPosition = derived(this, (reader) => {
			const inlineEdit = this._edit.read(reader);
			return inlineEdit ? new Position(inlineEdit.originalLineRange.endLineNumberExclusive, 1) : null;
		});

		this._originalDisplayRange = this._uiState.map(s => s?.originalRange);
		this._originalVerticalStartPosition = this._editorObs.observePosition(originalStartPosition, this._store).map(p => p?.y);
		this._originalVerticalEndPosition = this._editorObs.observePosition(originalEndPosition, this._store).map(p => p?.y);

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._nonOverflowView.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: derived(this, reader => {
				const info = this._editorLayoutInfo.read(reader);
				if (info === null) { return 0; }
				return info.codeRect.width;
			}),
		}));
	}

	private readonly _display = derived(this, reader => !!this._uiState.read(reader) ? 'block' : 'none');

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

	private readonly _maxPrefixTrim = derived(this, reader => {
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
		const w = this._editorObs.getOption(EditorOption.fontInfo).map(f => f.typicalHalfwidthCharacterWidth).read(reader);

		const right = editorLayout.contentLeft + Math.max(this._editorMaxContentWidthInRange.read(reader), w) - horizontalScrollOffset;

		const range = inlineEdit.originalLineRange;
		const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
		const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);

		const left = editorLayout.contentLeft + this._maxPrefixTrim.read(reader).prefixLeftOffset - horizontalScrollOffset;

		if (right <= left) {
			return null;
		}

		const codeRect = Rect.fromLeftTopRightBottom(left, selectionTop, right, selectionBottom).withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING);

		return {
			codeRect,
			contentLeft: editorLayout.contentLeft,
		};
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _originalOverlay = n.div({
		style: { pointerEvents: 'none', }
	}, derived(this, reader => {
		const layoutInfoObs = mapOutFalsy(this._editorLayoutInfo).read(reader);
		if (!layoutInfoObs) { return undefined; }

		// Create an overlay which hides the left hand side of the original overlay when it overflows to the left
		// such that there is a smooth transition at the edge of content left
		const overlayhider = layoutInfoObs.map(layoutInfo => Rect.fromLeftTopRightBottom(
			layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
			layoutInfo.codeRect.top,
			layoutInfo.contentLeft,
			layoutInfo.codeRect.bottom
		));

		const overlayRect = derived(this, reader => {
			const rect = layoutInfoObs.read(reader).codeRect;
			const overlayHider = overlayhider.read(reader);
			return rect.intersectHorizontal(new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER));
		});

		const separatorWidth = this._uiState.map(s => s?.inDiffEditor ? WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH : WIDGET_SEPARATOR_WIDTH).read(reader);
		const separatorRect = overlayRect.map(rect => rect.withMargin(separatorWidth, separatorWidth));

		return [
			n.div({
				class: 'originalSeparatorDeletion',
				style: {
					...separatorRect.read(reader).toStyles(),
					borderRadius: `${BORDER_RADIUS}px`,
					border: `${BORDER_WIDTH + separatorWidth}px solid ${asCssVariable(editorBackground)}`,
					boxSizing: 'border-box',
				}
			}),
			n.div({
				class: 'originalOverlayDeletion',
				style: {
					...overlayRect.read(reader).toStyles(),
					borderRadius: `${BORDER_RADIUS}px`,
					border: getOriginalBorderColor(this._tabAction).map(bc => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`),
					boxSizing: 'border-box',
					backgroundColor: asCssVariable(originalBackgroundColor),
				}
			}),
			n.div({
				class: 'originalOverlayHiderDeletion',
				style: {
					...overlayhider.read(reader).toStyles(),
					backgroundColor: asCssVariable(editorBackground),
				}
			})
		];
	})).keepUpdated(this._store);

	private readonly _nonOverflowView = n.div({
		class: 'inline-edits-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			display: this._display,
		},
	}, [
		[this._originalOverlay],
	]).keepUpdated(this._store);

	readonly isHovered = constObservable(false);
}
