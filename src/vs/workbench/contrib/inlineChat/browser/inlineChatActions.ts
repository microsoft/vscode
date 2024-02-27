/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { InlineChatController, InlineChatRunOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST, CTX_INLINE_CHAT_HAS_PROVIDER, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_VISIBLE, MENU_INLINE_CHAT_INPUT, MENU_INLINE_CHAT_WIDGET_DISCARD, MENU_INLINE_CHAT_WIDGET_STATUS, CTX_INLINE_CHAT_LAST_FEEDBACK, CTX_INLINE_CHAT_EDIT_MODE, EditMode, MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE, CTX_INLINE_CHAT_MESSAGE_CROP_STATE, CTX_INLINE_CHAT_DOCUMENT_CHANGED, CTX_INLINE_CHAT_DID_EDIT, CTX_INLINE_CHAT_HAS_STASHED_SESSION, MENU_INLINE_CHAT_WIDGET_FEEDBACK, ACTION_ACCEPT_CHANGES, ACTION_REGENERATE_RESPONSE, CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseTypes, ACTION_VIEW_IN_CHAT, CTX_INLINE_CHAT_USER_DID_EDIT, CTX_INLINE_CHAT_INNER_CURSOR_START, CTX_INLINE_CHAT_INNER_CURSOR_END, CTX_INLINE_CHAT_RESPONSE_FOCUSED, CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING, InlineChatResponseFeedbackKind, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, CTX_INLINE_CHAT_CHANGE_HAS_DIFF, MENU_INLINE_CHAT_WIDGET } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { localize, localize2 } from 'vs/nls';
import { Action2, IAction2Options, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { fromNow } from 'vs/base/common/date';
import { IInlineChatSessionService, Recording } from './inlineChatSessionService';
import { runAccessibilityHelpAction } from 'vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { Disposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

CommandsRegistry.registerCommandAlias('interactiveEditor.start', 'inlineChat.start');
CommandsRegistry.registerCommandAlias('interactive.acceptChanges', ACTION_ACCEPT_CHANGES);

export const LOCALIZED_START_INLINE_CHAT_STRING = localize2('run', 'Start Inline Chat');
export const START_INLINE_CHAT = registerIcon('start-inline-chat', Codicon.sparkle, localize('startInlineChat', 'Icon which spawns the inline chat from the editor toolbar.'));

// some gymnastics to enable hold for speech without moving the StartSessionAction into the electron-layer

export interface IHoldForSpeech {
	(accessor: ServicesAccessor, controller: InlineChatController, source: Action2): void;
}
let _holdForSpeech: IHoldForSpeech | undefined = undefined;
export function setHoldForSpeech(holdForSpeech: IHoldForSpeech) {
	_holdForSpeech = holdForSpeech;
}

export class StartSessionAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.start',
			title: LOCALIZED_START_INLINE_CHAT_STRING,
			category: AbstractInlineChatAction.category,
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_PROVIDER, EditorContextKeys.writable),
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
				secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI)],
			},
			icon: START_INLINE_CHAT
		});
	}


	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {

		const ctrl = InlineChatController.get(editor);
		if (!ctrl) {
			return;
		}

		if (_holdForSpeech) {
			accessor.get(IInstantiationService).invokeFunction(_holdForSpeech, ctrl, this);
		}

		let options: InlineChatRunOptions | undefined;
		const arg = _args[0];
		if (arg && InlineChatRunOptions.isInteractiveEditorOptions(arg)) {
			options = arg;
		}
		InlineChatController.get(editor)?.run({ ...options });
	}
}

export class UnstashSessionAction extends EditorAction2 {
	constructor() {
		super({
			id: 'inlineChat.unstash',
			title: localize2('unstash', "Resume Last Dismissed Inline Chat"),
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_STASHED_SESSION, EditorContextKeys.writable),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyZ,
			}
		});
	}

	override async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
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

export abstract class AbstractInlineChatAction extends EditorAction2 {

	static readonly category = localize2('cat', "Inline Chat");

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
				id: MENU_INLINE_CHAT_INPUT,
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
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EMPTY.negate(), CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
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
				id: MENU_INLINE_CHAT_INPUT,
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
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow
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
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow
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
			title: localize2('focus', "Focus Input"),
			f1: true,
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_FOCUSED.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			keybinding: [{
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo('above'), EditorContextKeys.isEmbeddedDiffEditor.negate()),
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			}, {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo('below'), EditorContextKeys.isEmbeddedDiffEditor.negate()),
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
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
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_START),
			keybinding: {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				primary: KeyCode.UpArrow,
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
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_END),
			keybinding: {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				primary: KeyCode.DownArrow,
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.populateHistory(false);
	}
}

export class DiscardHunkAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.discardHunkChange',
			title: localize('discard', 'Discard'),
			icon: Codicon.clearAll,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages), CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Live)),
				group: '0_main',
				order: 3
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		return ctrl.discardHunk();
	}
}


MenuRegistry.appendMenuItem(MENU_INLINE_CHAT_WIDGET_STATUS, {
	submenu: MENU_INLINE_CHAT_WIDGET_DISCARD,
	title: localize('discardMenu', "Discard..."),
	icon: Codicon.discard,
	group: '0_main',
	order: 2,
	when: ContextKeyExpr.and(CTX_INLINE_CHAT_EDIT_MODE.notEqualsTo(EditMode.Preview), CTX_INLINE_CHAT_EDIT_MODE.notEqualsTo(EditMode.Live), CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages)),
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
				primary: KeyCode.Escape,
				when: CTX_INLINE_CHAT_USER_DID_EDIT.negate()
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_DISCARD,
				group: '0_main',
				order: 0
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		await ctrl.cancelSession();
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
		const changedText = await ctrl.cancelSession();
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
		const changedText = await ctrl.cancelSession();
		if (changedText !== undefined) {
			const input: IUntitledTextResourceEditorInput = { forceUntitled: true, resource: undefined, contents: changedText, languageId: editor.getModel()?.getLanguageId() };
			editorService.openEditor(input, SIDE_GROUP);
		}
	}
}

export class ToggleDiffForChange extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.toggleDiff',
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Live), CTX_INLINE_CHAT_CHANGE_HAS_DIFF),
			title: localize2('showChanges', 'Show Changes'),
			icon: Codicon.diffSingle,
			toggled: {
				condition: CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF,
			},
			menu: [
				{
					id: MENU_INLINE_CHAT_WIDGET_FEEDBACK,
					group: '1_main',
					when: ContextKeyExpr.and(CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Live), CTX_INLINE_CHAT_CHANGE_HAS_DIFF)
				}
			]
		});
	}

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.toggleDiff();
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
				when: CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty),
				group: '2_feedback',
				order: 1
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.feedbackLast(InlineChatResponseFeedbackKind.Helpful);
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
				when: CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty),
				group: '2_feedback',
				order: 2
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.feedbackLast(InlineChatResponseFeedbackKind.Unhelpful);
	}
}

export class ReportIssueForBugCommand extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.reportIssueForBug',
			title: localize('feedback.reportIssueForBug', 'Report Issue'),
			icon: Codicon.report,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
			menu: [{
				id: MENU_INLINE_CHAT_WIDGET_FEEDBACK,
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING, CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
				group: '2_feedback',
				order: 3
			}, {
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'config',
				order: 3
			}]
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.feedbackLast(InlineChatResponseFeedbackKind.Bug);
	}
}


export class AcceptChanges extends AbstractInlineChatAction {

	constructor() {
		super({
			id: ACTION_ACCEPT_CHANGES,
			title: localize2('apply1', "Accept Changes"),
			shortTitle: localize('apply2', 'Accept'),
			icon: Codicon.check,
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, ContextKeyExpr.or(CTX_INLINE_CHAT_DOCUMENT_CHANGED.toNegated(), CTX_INLINE_CHAT_EDIT_MODE.notEqualsTo(EditMode.Preview))),
			keybinding: [{
				weight: KeybindingWeight.EditorContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}, {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib,
				when: CTX_INLINE_CHAT_USER_DID_EDIT
			}],
			menu: {
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages)),
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 0
			}
		});
	}

	override async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController): Promise<void> {
		ctrl.acceptHunk();
	}
}

export class CancelSessionAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.cancel',
			title: localize('cancel', 'Cancel'),
			icon: Codicon.clearAll,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 1,
				primary: KeyCode.Escape
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				when: CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Preview),
				group: '0_main',
				order: 3
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		ctrl.cancelSession();
	}
}


export class CloseAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.close',
			title: localize('close', 'Close'),
			icon: Codicon.close,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 1,
				primary: KeyCode.Escape
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'main',
				order: 0,
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		ctrl.finishExistingSession();
	}
}

export class ConfigureInlineChatAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.configure',
			title: localize('configure', 'Configure '),
			icon: Codicon.settingsGear,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'config',
				order: 1,
			}
		});
	}

	async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		accessor.get(IPreferencesService).openSettings({ query: 'inlineChat' });
	}
}

export class MoveToNextHunk extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.moveToNextHunk',
			title: localize2('moveToNextHunk', 'Move to Next Change'),
			precondition: CTX_INLINE_CHAT_VISIBLE,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F7
			}
		});
	}

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ...args: any[]): void {
		ctrl.moveHunk(true);
	}
}

export class MoveToPreviousHunk extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.moveToPreviousHunk',
			title: localize2('moveToPreviousHunk', 'Move to Previous Change'),
			f1: true,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyCode.F7
			}
		});
	}

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ...args: any[]): void {
		ctrl.moveHunk(false);
	}
}

export class CopyRecordings extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.copyRecordings',
			f1: true,
			title: localize2('copyRecordings', "(Developer) Write Exchange to Clipboard")
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
			id: ACTION_VIEW_IN_CHAT,
			title: localize('viewInChat', 'View in Chat'),
			icon: Codicon.commentDiscussion,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				when: CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.OnlyMessages),
				group: '0_main',
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
			title: localize('expandMessage', 'Show More'),
			icon: Codicon.chevronDown,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE,
				when: ContextKeyExpr.and(ContextKeyExpr.or(CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.OnlyMessages), CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.Mixed)), CTX_INLINE_CHAT_MESSAGE_CROP_STATE.isEqualTo('cropped')),
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
			title: localize('contractMessage', 'Show Less'),
			icon: Codicon.chevronUp,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE,
				when: ContextKeyExpr.and(ContextKeyExpr.or(CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.OnlyMessages), CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.Mixed)), CTX_INLINE_CHAT_MESSAGE_CROP_STATE.isEqualTo('expanded')),
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
		this._register(AccessibilityHelpAction.addImplementation(106, 'inlineChat', async accessor => {
			const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
			if (!codeEditor) {
				return;
			}
			runAccessibilityHelpAction(accessor, codeEditor, 'inlineChat');
		}, ContextKeyExpr.or(CTX_INLINE_CHAT_RESPONSE_FOCUSED, CTX_INLINE_CHAT_FOCUSED)));
	}
}
