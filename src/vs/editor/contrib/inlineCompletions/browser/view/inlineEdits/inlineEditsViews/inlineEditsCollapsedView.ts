/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { n } from '../../../../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../../../../base/browser/mouseEvent.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable } from '../../../../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor, observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { singleTextRemoveCommonPrefix } from '../../../model/singleTextEditHelpers.js';
import { IInlineEditsView } from '../inlineEditsViewInterface.js';
import { InlineEditWithChanges } from '../inlineEditWithChanges.js';
import { inlineEditIndicatorPrimaryBorder } from '../theme.js';
import { getEditorValidOverlayRect, PathBuilder, rectToProps } from '../utils/utils.js';

export class InlineEditsCollapsedView extends Disposable implements IInlineEditsView {

	private readonly _onDidClick = this._register(new Emitter<IMouseEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _editorObs: ObservableCodeEditor;
	private readonly _iconRef = n.ref<SVGElement>();

	readonly isVisible: IObservable<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _edit: IObservable<InlineEditWithChanges | undefined>,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this._editorObs = observableCodeEditor(this._editor);

		const firstEdit = this._edit.map(inlineEdit => inlineEdit?.edit.replacements[0] ?? null);

		const startPosition = firstEdit.map(edit => edit ? singleTextRemoveCommonPrefix(edit, this._editor.getModel()!).range.getStartPosition() : null);
		const observedStartPoint = this._editorObs.observePosition(startPosition, this._store);
		const startPoint = derived<Point | null>(reader => {
			const point = observedStartPoint.read(reader);
			if (!point) { return null; }

			const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
			const scrollLeft = this._editorObs.scrollLeft.read(reader);
			return new Point(contentLeft + point.x - scrollLeft, point.y);
		});

		const overlayElement = n.div({
			class: 'inline-edits-collapsed-view',
			style: {
				position: 'absolute',
				overflow: 'visible',
				top: '0px',
				left: '0px',
				display: 'block',
			},
		}, [
			[this.getCollapsedIndicator(startPoint)],
		]).keepUpdated(this._store).element;

		this._register(this._editorObs.createOverlayWidget({
			domNode: overlayElement,
			position: constObservable(null),
			allowEditorOverflow: false,
			minContentWidthInPx: constObservable(0),
		}));

		this.isVisible = this._edit.map((inlineEdit, reader) => !!inlineEdit && startPoint.read(reader) !== null);
	}

	public triggerAnimation(): Promise<Animation> {
		if (this._accessibilityService.isMotionReduced()) {
			return new Animation(null, null).finished;
		}

		// PULSE ANIMATION:
		const animation = this._iconRef.element.animate([
			{ offset: 0.00, transform: 'translateY(-3px)', },
			{ offset: 0.20, transform: 'translateY(1px)', },
			{ offset: 0.36, transform: 'translateY(-1px)', },
			{ offset: 0.52, transform: 'translateY(1px)', },
			{ offset: 0.68, transform: 'translateY(-1px)', },
			{ offset: 0.84, transform: 'translateY(1px)', },
			{ offset: 1.00, transform: 'translateY(0px)', },
		], { duration: 2000 });

		return animation.finished;
	}

	private getCollapsedIndicator(startPoint: IObservable<Point | null>) {
		const contentLeft = this._editorObs.layoutInfoContentLeft;
		const startPointTranslated = startPoint.map((p, reader) => p ? p.deltaX(-contentLeft.read(reader)) : null);
		const iconPath = this.createIconPath(startPointTranslated);

		return n.svg({
			class: 'collapsedView',
			ref: this._iconRef,
			style: {
				position: 'absolute',
				...rectToProps((r) => getEditorValidOverlayRect(this._editorObs).read(r)),
				overflow: 'hidden',
				pointerEvents: 'none',
			}
		}, [
			n.svgElem('path', {
				class: 'collapsedViewPath',
				d: iconPath,
				fill: asCssVariable(inlineEditIndicatorPrimaryBorder),
			}),
		]);
	}

	private createIconPath(indicatorPoint: IObservable<Point | null>): IObservable<string> {
		const width = 6;
		const triangleHeight = 3;
		const baseHeight = 1;

		return indicatorPoint.map(point => {
			if (!point) { return new PathBuilder().build(); }
			const baseTopLeft = point.deltaX(-width / 2).deltaY(-baseHeight);
			const baseTopRight = baseTopLeft.deltaX(width);
			const baseBottomLeft = baseTopLeft.deltaY(baseHeight);
			const baseBottomRight = baseTopRight.deltaY(baseHeight);
			const triangleBottomCenter = baseBottomLeft.deltaX(width / 2).deltaY(triangleHeight);
			return new PathBuilder()
				.moveTo(baseTopLeft)
				.lineTo(baseTopRight)
				.lineTo(baseBottomRight)
				.lineTo(triangleBottomCenter)
				.lineTo(baseBottomLeft)
				.lineTo(baseTopLeft)
				.build();
		});
	}

	readonly isHovered = constObservable(false);
}
