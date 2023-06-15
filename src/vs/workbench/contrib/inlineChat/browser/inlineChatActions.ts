/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { InlineChatController, InlineChatRunOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST, CTX_INLINE_CHAT_HAS_PROVIDER, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_VISIBLE, MENU_INLINE_CHAT_WIDGET, MENU_INLINE_CHAT_WIDGET_DISCARD, MENU_INLINE_CHAT_WIDGET_STATUS, CTX_INLINE_CHAT_LAST_FEEDBACK, CTX_INLINE_CHAT_SHOWING_DIFF, CTX_INLINE_CHAT_EDIT_MODE, EditMode, CTX_INLINE_CHAT_LAST_RESPONSE_TYPE, MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE, CTX_INLINE_CHAT_MESSAGE_CROP_STATE, CTX_INLINE_CHAT_DOCUMENT_CHANGED, CTX_INLINE_CHAT_DID_EDIT, CTX_INLINE_CHAT_HAS_STASHED_SESSION, MENU_INLINE_CHAT_WIDGET_FEEDBACK, ACTION_ACCEPT_CHANGES, ACTION_REGENERATE_RESPONSE } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { localize } from 'vs/nls';
import { IAction2Options, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Range } from 'vs/editor/common/core/range';
import { fromNow } from 'vs/base/common/date';
import { IInlineChatSessionService, Recording } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { runAccessibilityHelpAction } from 'vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibilityContribution';
import { Disposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

CommandsRegistry.registerCommandAlias('interactiveEditor.start', 'inlineChat.start');

export class StartSessionAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.start',
			title: { value: localize('run', 'Start Code Chat'), original: 'Start Code Chat' },
			category: AbstractInlineChatAction.category,
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_PROVIDER, EditorContextKeys.writable),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
				secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI)],
			}
		});
	}

	private _isInteractivEditorOptions(options: any): options is InlineChatRunOptions {
		const { initialRange, message, autoSend } = options;
		if (
			typeof message !== 'undefined' && typeof message !== 'string'
			|| typeof autoSend !== 'undefined' && typeof autoSend !== 'boolean'
			|| typeof initialRange !== 'undefined' && !Range.isIRange(initialRange)) {
			return false;
		}
		return true;
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		let options: InlineChatRunOptions | undefined;
		const arg = _args[0];
		if (arg && this._isInteractivEditorOptions(arg)) {
			options = arg;
		}
		InlineChatController.get(editor)?.run(options);
	}
}

export class UnstashSessionAction extends EditorAction2 {
	constructor() {
		super({
			id: 'inlineChat.unstash',
			title: { value: localize('unstash', 'Resume Last Dismissed Code Chat'), original: 'Resume Last Dismissed Code Chat' },
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_STASHED_SESSION, EditorContextKeys.writable),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyZ,
			}
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		const ctrl = InlineChatController.get(editor);
		if (ctrl) {
			const session = ctrl.unstashLastSession();
			if (session) {
				ctrl.run({
					existingSession: session,
					isUnstashed: true
				});
			}
		}
	}
}

abstract class AbstractInlineChatAction extends EditorAction2 {

	static readonly category = { value: localize('cat', 'Inline Chat'), original: 'Inline Chat' };

	constructor(desc: IAction2Options) {
		super({
			...desc,
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_PROVIDER, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		if (editor instanceof EmbeddedCodeEditorWidget) {
			editor = editor.getParentEditor();
		}
		const ctrl = InlineChatController.get(editor);
		if (!ctrl) {
			for (const diffEditor of accessor.get(ICodeEditorService).listDiffEditors()) {
				if (diffEditor.getOriginalEditor() === editor || diffEditor.getModifiedEditor() === editor) {
					if (diffEditor instanceof EmbeddedDiffEditorWidget) {
						this.runEditorCommand(accessor, diffEditor.getParentEditor(), ..._args);
					}
				}
			}
			return;
		}
		this.runInlineChatCommand(accessor, ctrl, editor, ..._args);
	}

	abstract runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ...args: any[]): void;
}


export class MakeRequestAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.accept',
			title: localize('accept', 'Make Request'),
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EMPTY.negate()),
			keybinding: {
				when: CTX_INLINE_CHAT_FOCUSED,
				weight: KeybindingWeight.EditorCore + 7,
				primary: KeyCode.Enter
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'main',
				order: 1,
				when: CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST.isEqualTo(false)
			}
		});
	}

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.acceptInput();
	}
}

export class ReRunRequestAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: ACTION_REGENERATE_RESPONSE,
			title: localize('rerun', 'Regenerate Response'),
			shortTitle: localize('rerunShort', 'Regenerate'),
			icon: Codicon.refresh,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EMPTY.negate(), CTX_INLINE_CHAT_LAST_RESPONSE_TYPE),
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '2_feedback',
				order: 3,
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.regenerate();
	}

}

export class StopRequestAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.stop',
			title: localize('stop', 'Stop Request'),
			icon: Codicon.debugStop,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EMPTY.negate(), CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST),
			menu: {
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'main',
				order: 1,
				when: CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST
			},
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape
			}
		});
	}

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.cancelCurrentRequest();
	}
}

export class ArrowOutUpAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.arrowOutUp',
			title: localize('arrowUp', 'Cursor Up'),
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, EditorContextKeys.isEmbeddedDiffEditor.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			keybinding: {
				weight: KeybindingWeight.EditorCore,
				primary: KeyCode.UpArrow
			}
		});
	}

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.arrowOut(true);
	}
}

export class ArrowOutDownAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.arrowOutDown',
			title: localize('arrowDown', 'Cursor Down'),
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_LAST, EditorContextKeys.isEmbeddedDiffEditor.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			keybinding: {
				weight: KeybindingWeight.EditorCore,
				primary: KeyCode.DownArrow
			}
		});
	}

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.arrowOut(false);
	}
}

export class FocusInlineChat extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.focus',
			title: { value: localize('focus', 'Focus Input'), original: 'Focus Input' },
			f1: true,
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_FOCUSED.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			keybinding: [{
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo('above'), EditorContextKeys.isEmbeddedDiffEditor.negate()),
				primary: KeyCode.DownArrow,
			}, {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo('below'), EditorContextKeys.isEmbeddedDiffEditor.negate()),
				primary: KeyCode.UpArrow,
			}]
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		InlineChatController.get(editor)?.focus();
	}
}

export class PreviousFromHistory extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.previousFromHistory',
			title: localize('previousFromHistory', 'Previous From History'),
			precondition: CTX_INLINE_CHAT_FOCUSED,
			keybinding: {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.populateHistory(true);
	}
}

export class NextFromHistory extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.nextFromHistory',
			title: localize('nextFromHistory', 'Next From History'),
			precondition: CTX_INLINE_CHAT_FOCUSED,
			keybinding: {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.populateHistory(false);
	}
}

MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, {
	submenu: MENU_INLINE_CHAT_WIDGET_DISCARD,
	title: localize('discardMenu', "Discard..."),
	icon: Codicon.discard,
	group: '0_main',
	order: 2,
	when: CTX_INLINE_CHAT_EDIT_MODE.notEqualsTo(EditMode.Preview),
	rememberDefaultAction: true
});


export class DiscardAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.discard',
			title: localize('discard', 'Discard'),
			icon: Codicon.discard,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_DISCARD,
				group: '0_main',
				order: 0
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		ctrl.cancelSession();
	}
}

export class DiscardToClipboardAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.discardToClipboard',
			title: localize('undo.clipboard', 'Discard to Clipboard'),
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_DID_EDIT),
			// keybinding: {
			// 	weight: KeybindingWeight.EditorContrib + 10,
			// 	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ,
			// 	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyZ },
			// },
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_DISCARD,
				group: '0_main',
				order: 1
			}
		});
	}

	override async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const changedText = ctrl.cancelSession();
		if (changedText !== undefined) {
			clipboardService.writeText(changedText);
		}
	}
}

export class DiscardUndoToNewFileAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.discardToFile',
			title: localize('undo.newfile', 'Discard to New File'),
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_DID_EDIT),
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_DISCARD,
				group: '0_main',
				order: 2
			}
		});
	}

	override async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ..._args: any[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const changedText = ctrl.cancelSession();
		if (changedText !== undefined) {
			const input: IUntitledTextResourceEditorInput = { forceUntitled: true, resource: undefined, contents: changedText, languageId: editor.getModel()?.getLanguageId() };
			editorService.openEditor(input, SIDE_GROUP);
		}
	}
}

export class FeebackHelpfulCommand extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.feedbackHelpful',
			title: localize('feedback.helpful', 'Helpful'),
			icon: Codicon.thumbsup,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			toggled: CTX_INLINE_CHAT_LAST_FEEDBACK.isEqualTo('helpful'),
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_FEEDBACK,
				when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
				group: '2_feedback',
				order: 1
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.feedbackLast(true);
	}
}

export class FeebackUnhelpfulCommand extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.feedbackunhelpful',
			title: localize('feedback.unhelpful', 'Unhelpful'),
			icon: Codicon.thumbsdown,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			toggled: CTX_INLINE_CHAT_LAST_FEEDBACK.isEqualTo('unhelpful'),
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_FEEDBACK,
				when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
				group: '2_feedback',
				order: 2
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.feedbackLast(false);
	}
}

export class ToggleInlineDiff extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.toggleDiff',
			title: localize('toggleDiff', 'Toggle Diff'),
			icon: Codicon.diff,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_DID_EDIT),
			toggled: { condition: CTX_INLINE_CHAT_SHOWING_DIFF, title: localize('toggleDiff2', "Show Inline Diff") },
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_DISCARD,
				when: CTX_INLINE_CHAT_EDIT_MODE.notEqualsTo(EditMode.Preview),
				group: '1_config',
				order: 9
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.toggleDiff();
	}
}

export class ApplyPreviewEdits extends AbstractInlineChatAction {

	constructor() {
		super({
			id: ACTION_ACCEPT_CHANGES,
			title: localize('apply1', 'Accept Changes'),
			shortTitle: localize('apply2', 'Accept'),
			icon: Codicon.check,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, ContextKeyExpr.or(CTX_INLINE_CHAT_DOCUMENT_CHANGED.toNegated(), CTX_INLINE_CHAT_EDIT_MODE.notEqualsTo(EditMode.Preview))),
			keybinding: [{
				weight: KeybindingWeight.EditorContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}],
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 0
			}
		});
	}

	override async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): Promise<void> {
		ctrl.acceptSession();
	}
}

export class CancelSessionAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.cancel',
			title: localize('cancel', 'Cancel'),
			icon: Codicon.clearAll,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Preview)),
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 1,
				primary: KeyCode.Escape
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				when: CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Preview),
				group: '0_main',
				order: 1
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		ctrl.cancelSession();
	}
}

export class CopyRecordings extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.copyRecordings',
			f1: true,
			title: {
				value: localize('copyRecordings', '(Developer) Write Exchange to Clipboard'),
				original: '(Developer) Write Exchange to Clipboard'
			}
		});
	}

	override async runInlineChatCommand(accessor: ServicesAccessor): Promise<void> {

		const clipboardService = accessor.get(IClipboardService);
		const quickPickService = accessor.get(IQuickInputService);
		const ieSessionService = accessor.get(IInlineChatSessionService);

		const recordings = ieSessionService.recordings().filter(r => r.exchanges.length > 0);
		if (recordings.length === 0) {
			return;
		}

		const picks: (IQuickPickItem & { rec: Recording })[] = recordings.map(rec => {
			return {
				rec,
				label: localize('label', "'{0}' and {1} follow ups ({2})", rec.exchanges[0].prompt, rec.exchanges.length - 1, fromNow(rec.when, true)),
				tooltip: rec.exchanges.map(ex => ex.prompt).join('\n'),
			};
		});

		const pick = await quickPickService.pick(picks, { canPickMany: false });
		if (pick) {
			clipboardService.writeText(JSON.stringify(pick.rec, undefined, 2));
		}
	}
}

export class ViewInChatAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.viewInChat',
			title: localize('viewInChat', 'View in Chat'),
			icon: Codicon.commentDiscussion,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE,
				when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.isEqualTo('message'),
				group: '1_viewInChat',
				order: 1
			}
		});
	}
	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.viewInChat();
	}
}

export class ExpandMessageAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.expandMessageAction',
			title: localize('expandMessage', 'Expand Message'),
			icon: Codicon.chevronDown,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE,
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.isEqualTo('message'), CTX_INLINE_CHAT_MESSAGE_CROP_STATE.isEqualTo('cropped')),
				group: '2_expandOrContract',
				order: 1
			}
		});
	}
	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.updateExpansionState(true);
	}
}

export class ContractMessageAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.contractMessageAction',
			title: localize('contractMessage', 'Contract Message'),
			icon: Codicon.chevronUp,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE,
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.isEqualTo('message'), CTX_INLINE_CHAT_MESSAGE_CROP_STATE.isEqualTo('expanded')),
				group: '2_expandOrContract',
				order: 1
			}
		});
	}
	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.updateExpansionState(false);
	}
}

export class InlineAccessibilityHelpContribution extends Disposable {
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(106, 'inline-chat', async accessor => {
			const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
			if (!codeEditor) {
				return;
			}
			runAccessibilityHelpAction(accessor, codeEditor, 'inline');
		}, CTX_INLINE_CHAT_FOCUSED));
	}
}
