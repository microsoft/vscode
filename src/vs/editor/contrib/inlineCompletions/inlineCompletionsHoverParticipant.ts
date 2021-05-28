/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { HoverAnchor, HoverAnchorType, HoverForeignElementAnchor, IEditorHover, IEditorHoverParticipant, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/hoverTypes';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { GhostTextController, ShowNextInlineCompletionAction, ShowPreviousInlineCompletionAction } from 'vs/editor/contrib/inlineCompletions/ghostTextController';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewZoneData } from 'vs/editor/browser/controller/mouseTarget';

export class InlineCompletionsHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<InlineCompletionsHover>,
		public readonly range: Range
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}

}

export class InlineCompletionsHoverParticipant implements IEditorHoverParticipant<InlineCompletionsHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		hover: IEditorHover,
		@ICommandService private readonly _commandService: ICommandService,
	) { }

	suggestHoverAnchor(mouseEvent: IEditorMouseEvent): HoverAnchor | null {
		const controller = GhostTextController.get(this._editor);
		if (!controller) {
			return null;
		}
		if (mouseEvent.target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
			// handle the case where the mouse is over the view zone
			const viewZoneData = <IViewZoneData>mouseEvent.target.detail;
			if (controller.shouldShowHoverAtViewZone(viewZoneData.viewZoneId)) {
				return new HoverForeignElementAnchor(1000, this, Range.fromPositions(viewZoneData.positionBefore || viewZoneData.position, viewZoneData.positionBefore || viewZoneData.position));
			}
		}
		if (mouseEvent.target.type === MouseTargetType.CONTENT_EMPTY) {
			// handle the case where the mouse is over the empty portion of a line following ghost text
			if (mouseEvent.target.range && controller.shouldShowHoverAt(mouseEvent.target.range)) {
				return new HoverForeignElementAnchor(1000, this, mouseEvent.target.range);
			}
		}
		// let mightBeForeignElement = false;
		// 	if (mouseEvent.target.type === MouseTargetType.CONTENT_TEXT && mouseEvent.target.detail) {
		// 		mightBeForeignElement = (<ITextContentData>mouseEvent.target.detail).mightBeForeignElement;
		// 	}
		return null;
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): InlineCompletionsHover[] {
		const controller = GhostTextController.get(this._editor);
		if (controller && controller.shouldShowHoverAt(anchor.range)) {
			return [new InlineCompletionsHover(this, anchor.range)];
		}
		return [];
	}

	renderHoverParts(hoverParts: InlineCompletionsHover[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable {
		statusBar.addAction({
			label: nls.localize('showPreviousInlineCompletion', "⬅️ Previous"),
			commandId: ShowPreviousInlineCompletionAction.ID,
			run: () => this._commandService.executeCommand(ShowPreviousInlineCompletionAction.ID)
		});
		statusBar.addAction({
			label: nls.localize('showNextInlineCompletion', "Next ➡️"),
			commandId: ShowNextInlineCompletionAction.ID,
			run: () => this._commandService.executeCommand(ShowNextInlineCompletionAction.ID)
		});
		return Disposable.None;
	}

}
