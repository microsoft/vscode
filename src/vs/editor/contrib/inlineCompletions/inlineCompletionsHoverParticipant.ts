/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { EditorHoverStatusBar, HoverAnchor, HoverAnchorType, IEditorHover, IEditorHoverParticipant, IHoverPart } from 'vs/editor/contrib/hover/modesContentHover';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { GhostTextController, ShowNextInlineCompletionAction, ShowPreviousInlineCompletionAction } from 'vs/editor/contrib/inlineCompletions/ghostTextController';
import { ICommandService } from 'vs/platform/commands/common/commands';

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

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): InlineCompletionsHover[] {
		if (anchor.type !== HoverAnchorType.Range) {
			return [];
		}
		const controller = GhostTextController.get(this._editor);
		if (controller.shouldShowHoverAt(anchor.range)) {
			return [new InlineCompletionsHover(this, anchor.range)];
		}
		return [];
	}

	renderHoverParts(hoverParts: InlineCompletionsHover[], fragment: DocumentFragment, statusBar: EditorHoverStatusBar): IDisposable {
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
