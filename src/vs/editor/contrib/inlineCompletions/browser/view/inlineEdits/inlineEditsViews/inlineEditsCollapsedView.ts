/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable } from '../../../../../../../base/common/observable.js';
import { editorBackground } from '../../../../../../../platform/theme/common/colors/editorColors.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { Rect } from '../../../../../../browser/rect.js';
import { singleTextRemoveCommonPrefix } from '../../../model/singleTextEditHelpers.js';
import { IInlineEditsView } from '../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../inlineEditWithChanges.js';
import { inlineEditIndicatorPrimaryBorder } from '../theme.js';

export class InlineEditsCollapsedView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _editorObs: ObservableCodeEditor;
	private readonly _startPoint: IObservable<Point | null>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		const firstEdit = this._edit.map(inlineEdit => inlineEdit?.edit.edits[0] ?? null);

		const startPosition = firstEdit.map(edit => edit ? singleTextRemoveCommonPrefix(edit, this._editor.getModel()!).range.getStartPosition() : null);
		const startPoint = this._editorObs.observePosition(startPosition, this._store);
		this._startPoint = derived<Point | null>(reader => {
			const point = startPoint.read(reader);
			if (!point) { return null; }

			const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
			const scrollLeft = this._editorObs.scrollLeft.read(reader);
			return new Point(contentLeft + point.x - scrollLeft, point.y);
		});

		this._register(this._editorObs.createOverlayWidget({
			domNode: this._nonOverflowView.element,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
		}));
	}

	private readonly _collapsedIndicator = n.div({
		style: { pointerEvents: 'none', }
	}, derived(reader => {
		this._edit.read(reader);
		const color = asCssVariable(inlineEditIndicatorPrimaryBorder);
		const width = 8;
		const height = 4;

		const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);

		const overlayhider = this._startPoint.map(point => {
			if (!point) { return new Rect(0, 0, 0, 0); }
			return Rect.fromLeftTopWidthHeight(
				contentLeft - width,
				point.y,
				width,
				height
			);
		});

		return [
			n.div({
				class: 'collapsedView',
				style: {
					position: 'absolute',
					display: this._startPoint.map(p => p && p.x + width > contentLeft ? 'block' : 'none'),
					top: this._startPoint.map(p => p?.y ?? 0),
					left: this._startPoint.map(p => p ? p.x - width / 2 : 0),
					borderLeft: `${width / 2}px solid transparent`,
					borderRight: `${width / 2}px solid transparent`,
					borderTop: `${height}px solid ${color}`,
				}
			}),
			n.div({
				class: 'collapsedViewHider',
				style: {
					...overlayhider.read(reader).toStyles(),
					backgroundColor: asCssVariable(editorBackground),
				}
			})
		];
	})).keepUpdated(this._store);

	private readonly _nonOverflowView = n.div({
		class: 'inline-edits-collapsed-view',
		style: {
			position: 'absolute',
			overflow: 'visible',
			top: '0px',
			left: '0px',
			zIndex: '0',
			display: 'block',
		},
	}, [
		[this._collapsedIndicator],
	]).keepUpdated(this._store);

	readonly isHovered = constObservable(false);
}
