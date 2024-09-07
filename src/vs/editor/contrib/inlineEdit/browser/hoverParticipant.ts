/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { IModelDecoration } from '../../../common/model.js';
import { HoverAnchor, HoverAnchorType, HoverForeignElementAnchor, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../hover/browser/hoverTypes.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { InlineEditController } from './inlineEditController.js';
import { InlineEditHintsContentWidget } from './inlineEditHintsWidget.js';
import * as nls from '../../../../nls.js';

export class InlineEditHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<InlineEditHover>,
		public readonly range: Range,
		public readonly controller: InlineEditController
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class InlineEditHoverParticipant implements IEditorHoverParticipant<InlineEditHover> {

	public readonly hoverOrdinal: number = 5;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
	}

	suggestHoverAnchor(mouseEvent: IEditorMouseEvent): HoverAnchor | null {
		const controller = InlineEditController.get(this._editor);
		if (!controller) {
			return null;
		}

		const target = mouseEvent.target;
		if (target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
			// handle the case where the mouse is over the view zone
			const viewZoneData = target.detail;
			if (controller.shouldShowHoverAtViewZone(viewZoneData.viewZoneId)) {
				// const range = Range.fromPositions(this._editor.getModel()!.validatePosition(viewZoneData.positionBefore || viewZoneData.position));
				const range = target.range;
				return new HoverForeignElementAnchor(1000, this, range, mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		if (target.type === MouseTargetType.CONTENT_EMPTY) {
			// handle the case where the mouse is over the empty portion of a line following ghost text
			if (controller.shouldShowHoverAt(target.range)) {
				return new HoverForeignElementAnchor(1000, this, target.range, mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		if (target.type === MouseTargetType.CONTENT_TEXT) {
			// handle the case where the mouse is directly over ghost text
			const mightBeForeignElement = target.detail.mightBeForeignElement;
			if (mightBeForeignElement && controller.shouldShowHoverAt(target.range)) {
				return new HoverForeignElementAnchor(1000, this, target.range, mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		return null;
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): InlineEditHover[] {
		if (this._editor.getOption(EditorOption.inlineEdit).showToolbar !== 'onHover') {
			return [];
		}

		const controller = InlineEditController.get(this._editor);
		if (controller && controller.shouldShowHoverAt(anchor.range)) {
			return [new InlineEditHover(this, anchor.range, controller)];
		}
		return [];
	}

	renderHoverParts(context: IEditorHoverRenderContext, hoverParts: InlineEditHover[]): IRenderedHoverParts<InlineEditHover> {
		const disposables = new DisposableStore();

		this._telemetryService.publicLog2<{}, {
			owner: 'hediet';
			comment: 'This event tracks whenever an inline edit hover is shown.';
		}>('inlineEditHover.shown');

		const w = this._instantiationService.createInstance(InlineEditHintsContentWidget, this._editor, false,
			constObservable(null),
		);
		disposables.add(w);
		const widgetNode: HTMLElement = w.getDomNode();
		const renderedHoverPart: IRenderedHoverPart<InlineEditHover> = {
			hoverPart: hoverParts[0],
			hoverElement: widgetNode,
			dispose: () => disposables.dispose()
		};
		return new RenderedHoverParts([renderedHoverPart]);
	}

	getAccessibleContent(hoverPart: InlineEditHover): string {
		return nls.localize('hoverAccessibilityInlineEdits', 'There are inline edits here.');
	}
}
