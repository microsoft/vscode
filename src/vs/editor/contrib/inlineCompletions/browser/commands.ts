/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { transaction } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId, inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/commandIds';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionContextKeys';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/browser/suggest';
import * as nls from 'vs/nls';
import { MenuId, Action2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

export class ShowNextInlineSuggestionAction extends EditorAction {
	public static ID = showNextInlineSuggestionActionId;
	constructor() {
		super({
			id: ShowNextInlineSuggestionAction.ID,
			label: nls.localize('action.inlineSuggest.showNext', "Show Next Inline Suggestion"),
			alias: 'Show Next Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketRight,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		controller?.model.get()?.next();
	}
}

export class ShowPreviousInlineSuggestionAction extends EditorAction {
	public static ID = showPreviousInlineSuggestionActionId;
	constructor() {
		super({
			id: ShowPreviousInlineSuggestionAction.ID,
			label: nls.localize('action.inlineSuggest.showPrevious', "Show Previous Inline Suggestion"),
			alias: 'Show Previous Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketLeft,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		controller?.model.get()?.previous();
	}
}

export class TriggerInlineSuggestionAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.trigger',
			label: nls.localize('action.inlineSuggest.trigger', "Trigger Inline Suggestion"),
			alias: 'Trigger Inline Suggestion',
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		controller?.model.get()?.triggerExplicitly();
	}
}

export class AcceptNextWordOfInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.acceptNextWord',
			label: nls.localize('action.inlineSuggest.acceptNextWord', "Accept Next Word Of Inline Suggestion"),
			alias: 'Accept Next Word Of Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
				kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			},
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('acceptWord', 'Accept Word'),
				group: 'primary',
				order: 2,
			}],
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		await controller?.model.get()?.acceptNextWord(controller.editor);
	}
}

export class AcceptNextLineOfInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.acceptNextLine',
			label: nls.localize('action.inlineSuggest.acceptNextLine', "Accept Next Line Of Inline Suggestion"),
			alias: 'Accept Next Line Of Inline Suggestion',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
			},
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('acceptLine', 'Accept Line'),
				group: 'secondary',
				order: 2,
			}],
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		await controller?.model.get()?.acceptNextLine(controller.editor);
	}
}

export class AcceptInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: inlineSuggestCommitId,
			label: nls.localize('action.inlineSuggest.accept', "Accept Inline Suggestion"),
			alias: 'Accept Inline Suggestion',
			precondition: InlineCompletionContextKeys.inlineSuggestionVisible,
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('accept', "Accept"),
				group: 'primary',
				order: 1,
			}],
			kbOpts: {
				primary: KeyCode.Tab,
				weight: 200,
				kbExpr: ContextKeyExpr.and(
					InlineCompletionContextKeys.inlineSuggestionVisible,
					EditorContextKeys.tabMovesFocus.toNegated(),
					InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize,
					SuggestContext.Visible.toNegated(),
					EditorContextKeys.hoverFocused.toNegated(),
				),
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		if (controller) {
			controller.model.get()?.accept(controller.editor);
			controller.editor.focus();
		}
	}
}

export class HideInlineCompletion extends EditorAction {
	public static ID = 'editor.action.inlineSuggest.hide';

	constructor() {
		super({
			id: HideInlineCompletion.ID,
			label: nls.localize('action.inlineSuggest.hide', "Hide Inline Suggestion"),
			alias: 'Hide Inline Suggestion',
			precondition: InlineCompletionContextKeys.inlineSuggestionVisible,
			kbOpts: {
				weight: 100,
				primary: KeyCode.Escape,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		transaction(tx => {
			controller?.model.get()?.stop(tx);
		});
	}
}

export class ToggleAlwaysShowInlineSuggestionToolbar extends Action2 {
	public static ID = 'editor.action.inlineSuggest.toggleAlwaysShowToolbar';

	constructor() {
		super({
			id: ToggleAlwaysShowInlineSuggestionToolbar.ID,
			title: nls.localize('action.inlineSuggest.alwaysShowToolbar', "Always Show Toolbar"),
			f1: false,
			precondition: undefined,
			menu: [{
				id: MenuId.InlineSuggestionToolbar,
				group: 'secondary',
				order: 10,
			}],
			toggled: ContextKeyExpr.equals('config.editor.inlineSuggest.showToolbar', 'always')
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const configService = accessor.get(IConfigurationService);
		const currentValue = configService.getValue<'always' | 'onHover'>('editor.inlineSuggest.showToolbar');
		const newValue = currentValue === 'always' ? 'onHover' : 'always';
		configService.updateValue('editor.inlineSuggest.showToolbar', newValue);
	}
}
