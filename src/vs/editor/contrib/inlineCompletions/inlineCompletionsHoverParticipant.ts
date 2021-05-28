/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { EditorHoverStatusBar, IEditorHover, IEditorHoverParticipant, IHoverPart } from 'vs/editor/contrib/hover/modesContentHover';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { GhostTextController, ShowNextInlineCompletionAction, ShowPreviousInlineCompletionAction } from 'vs/editor/contrib/inlineCompletions/ghostTextController';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class InlineCompletionsHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<InlineCompletionsHover>,
		public readonly range: Range
	) { }

	public isValidForHoverRange(hoverRange: Range): boolean {
		return (
			this.range.startColumn <= hoverRange.startColumn
			&& this.range.endColumn >= hoverRange.endColumn
		);
	}
}

export class InlineCompletionsHoverParticipant implements IEditorHoverParticipant<InlineCompletionsHover> {
	constructor(
		private readonly _editor: ICodeEditor,
		hover: IEditorHover,
		@ICommandService private readonly _commandService: ICommandService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) { }

	computeSync(hoverRange: Range, lineDecorations: IModelDecoration[]): InlineCompletionsHover[] {
		const controller = GhostTextController.get(this._editor);
		if (controller.shouldShowHoverAt(hoverRange)) {
			return [new InlineCompletionsHover(this, hoverRange)];
		}
		return [];
	}

	renderHoverParts(hoverParts: InlineCompletionsHover[], fragment: DocumentFragment, statusBar: EditorHoverStatusBar): IDisposable {
		const menu = this._menuService.createMenu(
			MenuId.InlineCompletionsActions,
			this._contextKeyService
		);

		statusBar.addAction({
			label: nls.localize('showPreviousInlineCompletion', "Previous"),
			commandId: ShowPreviousInlineCompletionAction.ID,
			run: () => this._commandService.executeCommand(ShowPreviousInlineCompletionAction.ID)
		});
		statusBar.addAction({
			label: nls.localize('showNextInlineCompletion', "Next"),
			commandId: ShowNextInlineCompletionAction.ID,
			run: () => this._commandService.executeCommand(ShowNextInlineCompletionAction.ID)
		});

		for (const [_, group] of menu.getActions()) {
			for (const action of group) {
				if (action instanceof MenuItemAction) {
					statusBar.addAction({
						label: action.label,
						commandId: action.item.id,
						run: () => this._commandService.executeCommand(action.item.id)
					});
				}
			}
		}

		return Disposable.None;
	}
}
