/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { InlineChatController, InlineChatRunOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_VISIBLE, MENU_INLINE_CHAT_WIDGET_STATUS, CTX_INLINE_CHAT_EDIT_MODE, EditMode, CTX_INLINE_CHAT_DOCUMENT_CHANGED, CTX_INLINE_CHAT_HAS_STASHED_SESSION, ACTION_ACCEPT_CHANGES, CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseTypes, ACTION_VIEW_IN_CHAT, CTX_INLINE_CHAT_USER_DID_EDIT, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, CTX_INLINE_CHAT_CHANGE_HAS_DIFF, MENU_INLINE_CHAT_WIDGET, ACTION_TOGGLE_DIFF, ACTION_REGENERATE_RESPONSE } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { localize, localize2 } from 'vs/nls';
import { Action2, IAction2Options } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { fromNow } from 'vs/base/common/date';
import { IInlineChatSessionService, Recording } from './inlineChatSessionService';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { CONTEXT_CHAT_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/chat/common/chatContextKeys';

CommandsRegistry.registerCommandAlias('interactiveEditor.start', 'inlineChat.start');
CommandsRegistry.registerCommandAlias('interactive.acceptChanges', ACTION_ACCEPT_CHANGES);

export const LOCALIZED_START_INLINE_CHAT_STRING = localize2('run', 'Start in Editor');
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
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_AGENT, EditorContextKeys.writable),
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
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_AGENT, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);

		let ctrl = InlineChatController.get(editor);
		if (!ctrl) {
			const { activeTextEditorControl } = editorService;
			if (isCodeEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl;
			} else if (isDiffEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl.getModifiedEditor();
			}
			ctrl = InlineChatController.get(editor);
		}

		if (!ctrl) {
			logService.warn('[IE] NO controller found for action', this.desc.id, editor.getModel()?.uri);
			return;
		}

		if (editor instanceof EmbeddedCodeEditorWidget) {
			editor = editor.getParentEditor();
		}
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

export class DiscardHunkAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.discardHunkChange',
			title: localize('discard', 'Discard'),
			icon: Codicon.clearAll,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages), CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty), CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Live)),
				group: '0_main',
				order: 3
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		return ctrl.discardHunk();
	}
}

export class DiscardAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.discard',
			title: localize('discard', 'Discard'),
			icon: Codicon.discard,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 1,
				primary: KeyCode.Escape,
				when: CTX_INLINE_CHAT_USER_DID_EDIT.negate()
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		await ctrl.cancelSession();
	}
}

export class ToggleDiffForChange extends AbstractInlineChatAction {

	constructor() {
		super({
			id: ACTION_TOGGLE_DIFF,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Live), CTX_INLINE_CHAT_CHANGE_HAS_DIFF),
			title: localize2('showChanges', 'Toggle Changes'),
			icon: Codicon.diffSingle,
			toggled: {
				condition: CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF,
			},
			menu: [
				{
					id: MENU_INLINE_CHAT_WIDGET_STATUS,
					group: '1_main',
					when: ContextKeyExpr.and(CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Live), CTX_INLINE_CHAT_CHANGE_HAS_DIFF),
					order: 10,
				}
			]
		});
	}

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController): void {
		ctrl.toggleDiff();
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
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}],
			menu: {
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.OnlyMessages), CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
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
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Preview)),
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 1,
				primary: KeyCode.Escape
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_EDIT_MODE.isEqualTo(EditMode.Preview), CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
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
				primary: KeyCode.Escape,
				when: CTX_INLINE_CHAT_USER_DID_EDIT.negate()
			},
			menu: {
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'navigation',
				order: 10,
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		ctrl.cancelSession();
	}
}

export class ConfigureInlineChatAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: 'inlineChat.configure',
			title: localize2('configure', 'Configure Inline Chat'),
			icon: Codicon.settingsGear,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			f1: true,
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
				id: MENU_INLINE_CHAT_WIDGET,
				group: 'navigation',
				order: 5
			}
		});
	}
	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]) {
		return ctrl.viewInChat();
	}
}

export class RerunAction extends AbstractInlineChatAction {
	constructor() {
		super({
			id: ACTION_REGENERATE_RESPONSE,
			title: localize2('chat.rerun.label', "Rerun Request"),
			f1: false,
			icon: Codicon.refresh,
			precondition: CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(),
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 5,
			}
		});
	}

	override async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		const chatService = accessor.get(IChatService);
		const model = ctrl.chatWidget.viewModel?.model;

		const lastRequest = model?.getRequests().at(-1);
		if (lastRequest) {
			await chatService.resendRequest(lastRequest, { noCommandDetection: false, attempt: lastRequest.attempt + 1, location: ctrl.chatWidget.location });
		}
	}
}
