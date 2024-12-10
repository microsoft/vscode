/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { asyncTransaction, transaction } from '../../../../../base/common/observable.js';
import { splitLines } from '../../../../../base/common/strings.js';
import * as nls from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, ServicesAccessor } from '../../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { Context as SuggestContext } from '../../../suggest/browser/suggest.js';
import { inlineSuggestCommitId, showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from './commandIds.js';
import { InlineCompletionContextKeys } from './inlineCompletionContextKeys.js';
import { InlineCompletionsController } from './inlineCompletionsController.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';

export class ShowNextInlineSuggestionAction extends EditorAction {
	public static ID = showNextInlineSuggestionActionId;
	constructor() {
		super({
			id: ShowNextInlineSuggestionAction.ID,
			label: nls.localize2('action.inlineSuggest.showNext', "Show Next Inline Suggestion"),
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
			label: nls.localize2('action.inlineSuggest.showPrevious', "Show Previous Inline Suggestion"),
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
			label: nls.localize2('action.inlineSuggest.trigger', "Trigger Inline Suggestion"),
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		await asyncTransaction(async tx => {
			/** @description triggerExplicitly from command */
			await controller?.model.get()?.triggerExplicitly(tx);
			controller?.playAccessibilitySignal(tx);
		});
	}
}

export class ExplicitTriggerInlineEditAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.triggerInlineEditExplicit',
			label: nls.localize2('action.inlineSuggest.trigger.explicitInlineEdit', "Trigger Inline Edit"),
			precondition: EditorContextKeys.writable,
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const notificationService = accessor!.get(INotificationService);
		const controller = InlineCompletionsController.get(editor);

		await controller?.model.get()?.triggerExplicitly(undefined, true);
		if (!controller?.model.get()?.inlineEditAvailable.get()) {
			notificationService.notify({
				severity: Severity.Info,
				message: nls.localize('noInlineEditAvailable', "No inline edit is available.")
			});
		}
	}
}

export class TriggerInlineEditAction extends EditorCommand {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.triggerInlineEdit',
			precondition: EditorContextKeys.writable,
		});
	}

	public override async runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: { triggerKind?: 'automatic' | 'explicit' }): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		await controller?.model.get()?.trigger(undefined, true);
	}
}

export class AcceptNextWordOfInlineCompletion extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.acceptNextWord',
			label: nls.localize2('action.inlineSuggest.acceptNextWord', "Accept Next Word Of Inline Suggestion"),
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
			label: nls.localize2('action.inlineSuggest.acceptNextLine', "Accept Next Line Of Inline Suggestion"),
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
			label: nls.localize2('action.inlineSuggest.accept', "Accept Inline Suggestion"),
			precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
			menuOpts: [{
				menuId: MenuId.InlineSuggestionToolbar,
				title: nls.localize('accept', "Accept"),
				group: 'primary',
				order: 2,
			}, {
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('accept', "Accept"),
				group: 'primary',
				order: 2,
			}],
			kbOpts: [
				{
					primary: KeyCode.Tab,
					weight: 200,
					kbExpr: ContextKeyExpr.or(
						ContextKeyExpr.and(
							InlineCompletionContextKeys.inlineSuggestionVisible,
							EditorContextKeys.tabMovesFocus.toNegated(),
							SuggestContext.Visible.toNegated(),
							EditorContextKeys.hoverFocused.toNegated(),

							InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize,
						),
						ContextKeyExpr.and(
							InlineCompletionContextKeys.inlineEditVisible,
							EditorContextKeys.tabMovesFocus.toNegated(),
							SuggestContext.Visible.toNegated(),
							EditorContextKeys.hoverFocused.toNegated(),

							InlineCompletionContextKeys.tabShouldAcceptInlineEdit,
						)
					),
				}
			],
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

export class JumpToNextInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.jump',
			label: nls.localize2('action.inlineSuggest.jump', "Jump to next inline edit"),
			precondition: InlineCompletionContextKeys.inlineEditVisible,
			menuOpts: [{
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('jump', "Jump"),
				group: 'primary',
				order: 1,
				when: InlineCompletionContextKeys.cursorAtInlineEdit.toNegated(),
			}],
			kbOpts: {
				primary: KeyCode.Tab,
				weight: 201,
				kbExpr: ContextKeyExpr.and(
					InlineCompletionContextKeys.inlineEditVisible,
					EditorContextKeys.tabMovesFocus.toNegated(),
					SuggestContext.Visible.toNegated(),
					EditorContextKeys.hoverFocused.toNegated(),
					InlineCompletionContextKeys.tabShouldJumpToInlineEdit,
				),
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		if (controller) {
			controller.jump();
		}
	}
}

export class HideInlineCompletion extends EditorAction {
	public static ID = 'editor.action.inlineSuggest.hide';

	constructor() {
		super({
			id: HideInlineCompletion.ID,
			label: nls.localize2('action.inlineSuggest.hide', "Hide Inline Suggestion"),
			precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
			kbOpts: {
				weight: 100,
				primary: KeyCode.Escape,
			},
			menuOpts: [{
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('reject', "Reject"),
				group: 'primary',
				order: 3,
			}]
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineCompletionsController.get(editor);
		transaction(tx => {
			controller?.model.get()?.stop('explicitCancel', tx);
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

	public async run(accessor: ServicesAccessor): Promise<void> {
		const configService = accessor.get(IConfigurationService);
		const currentValue = configService.getValue<'always' | 'onHover'>('editor.inlineSuggest.showToolbar');
		const newValue = currentValue === 'always' ? 'onHover' : 'always';
		configService.updateValue('editor.inlineSuggest.showToolbar', newValue);
	}
}

export class DevExtractReproSample extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineSuggest.dev.extractRepro',
			label: nls.localize('action.inlineSuggest.dev.extractRepro', "Developer: Extract Inline Suggest State"),
			alias: 'Developer: Inline Suggest Extract Repro',
			precondition: InlineCompletionContextKeys.inlineEditVisible,
		});
	}

	public override async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<any> {
		const clipboardService = accessor.get(IClipboardService);

		const controller = InlineCompletionsController.get(editor);
		const m = controller?.model.get();
		if (!m) { return; }
		const repro = m.extractReproSample();

		const inlineCompletionLines = splitLines(JSON.stringify({ inlineCompletion: repro.inlineCompletion }, null, 4));

		const json = inlineCompletionLines.map(l => '// ' + l).join('\n');

		const reproStr = `${repro.documentValue}\n\n// <json>\n${json}\n// </json>\n`;

		await clipboardService.writeText(reproStr);

		return { reproCase: reproStr };
	}
}
