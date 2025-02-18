/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { InlineChatController, InlineChatController1, InlineChatController2, InlineChatRunOptions } from './inlineChatController.js';
import { ACTION_ACCEPT_CHANGES, CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_HAS_STASHED_SESSION, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_INNER_CURSOR_FIRST, CTX_INLINE_CHAT_INNER_CURSOR_LAST, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, MENU_INLINE_CHAT_WIDGET_STATUS, CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_RESPONSE_TYPE, InlineChatResponseType, ACTION_REGENERATE_RESPONSE, ACTION_VIEW_IN_CHAT, ACTION_TOGGLE_DIFF, CTX_INLINE_CHAT_CHANGE_HAS_DIFF, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, MENU_INLINE_CHAT_ZONE, ACTION_DISCARD_CHANGES, CTX_INLINE_CHAT_POSSIBLE, ACTION_START, CTX_INLINE_CHAT_HAS_AGENT2 } from '../common/inlineChat.js';
import { ctxIsGlobalEditingSession, ctxRequestCount } from '../../chat/browser/chatEditing/chatEditingEditorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatService } from '../../chat/common/chatService.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { HunkInformation } from './inlineChatSession.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';


CommandsRegistry.registerCommandAlias('interactiveEditor.start', 'inlineChat.start');
CommandsRegistry.registerCommandAlias('interactive.acceptChanges', ACTION_ACCEPT_CHANGES);


export const START_INLINE_CHAT = registerIcon('start-inline-chat', Codicon.sparkle, localize('startInlineChat', 'Icon which spawns the inline chat from the editor toolbar.'));

// some gymnastics to enable hold for speech without moving the StartSessionAction into the electron-layer

export interface IHoldForSpeech {
	(accessor: ServicesAccessor, controller: InlineChatController, source: Action2): void;
}
let _holdForSpeech: IHoldForSpeech | undefined = undefined;
export function setHoldForSpeech(holdForSpeech: IHoldForSpeech) {
	_holdForSpeech = holdForSpeech;
}

export class StartSessionAction extends Action2 {

	constructor() {
		super({
			id: ACTION_START,
			title: localize2('run', 'Editor Inline Chat'),
			category: AbstractInline1ChatAction.category,
			f1: true,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.or(CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_HAS_AGENT2),
				CTX_INLINE_CHAT_POSSIBLE,
				EditorContextKeys.writable,
				EditorContextKeys.editorSimpleInput.negate()
			),
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			icon: START_INLINE_CHAT,
			menu: {
				id: MenuId.ChatTitleBarMenu,
				group: 'd_inlineChat',
				order: 10,
			}
		});
	}
	override run(accessor: ServicesAccessor, ...args: any[]): any {

		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getActiveCodeEditor();
		if (!editor || editor.isSimpleWidget) {
			// well, at least we tried...
			return;
		}


		// precondition does hold
		return editor.invokeWithinContext((editorAccessor) => {
			const kbService = editorAccessor.get(IContextKeyService);
			const logService = editorAccessor.get(ILogService);
			const enabled = kbService.contextMatchesRules(this.desc.precondition ?? undefined);
			if (!enabled) {
				logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
				return;
			}
			return this._runEditorCommand(editorAccessor, editor, ...args);
		});
	}

	private _runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {

		const ctrl = InlineChatController.get(editor);
		if (!ctrl) {
			return;
		}

		if (_holdForSpeech) {
			accessor.get(IInstantiationService).invokeFunction(_holdForSpeech, ctrl, this);
		}

		let options: InlineChatRunOptions | undefined;
		const arg = _args[0];
		if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
			options = arg;
		}
		InlineChatController.get(editor)?.run({ ...options });
	}
}

export class FocusInlineChat extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.focus',
			title: localize2('focus', "Focus Input"),
			f1: true,
			category: AbstractInline1ChatAction.category,
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

//#region --- VERSION 1

export class UnstashSessionAction extends EditorAction2 {
	constructor() {
		super({
			id: 'inlineChat.unstash',
			title: localize2('unstash', "Resume Last Dismissed Inline Chat"),
			category: AbstractInline1ChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_STASHED_SESSION, EditorContextKeys.writable),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyZ,
			}
		});
	}

	override async runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		const ctrl = InlineChatController1.get(editor);
		if (ctrl) {
			const session = ctrl.unstashLastSession();
			if (session) {
				ctrl.run({
					existingSession: session,
				});
			}
		}
	}
}

export abstract class AbstractInline1ChatAction extends EditorAction2 {

	static readonly category = localize2('cat', "Inline Chat");

	constructor(desc: IAction2Options) {
		super({
			...desc,
			category: AbstractInline1ChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_AGENT, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);

		let ctrl = InlineChatController1.get(editor);
		if (!ctrl) {
			const { activeTextEditorControl } = editorService;
			if (isCodeEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl;
			} else if (isDiffEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl.getModifiedEditor();
			}
			ctrl = InlineChatController1.get(editor);
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

	abstract runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController1, editor: ICodeEditor, ...args: any[]): void;
}

export class ArrowOutUpAction extends AbstractInline1ChatAction {
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

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.arrowOut(true);
	}
}

export class ArrowOutDownAction extends AbstractInline1ChatAction {
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

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.arrowOut(false);
	}
}

export class AcceptChanges extends AbstractInline1ChatAction {

	constructor() {
		super({
			id: ACTION_ACCEPT_CHANGES,
			title: localize2('apply1', "Accept Changes"),
			shortTitle: localize('apply2', 'Accept'),
			icon: Codicon.check,
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE),
			keybinding: [{
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}],
			menu: [{
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.inputHasText.toNegated(),
					CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(),
					CTX_INLINE_CHAT_RESPONSE_TYPE.isEqualTo(InlineChatResponseType.MessagesAndEdits)
				),
			}, {
				id: MENU_INLINE_CHAT_ZONE,
				group: 'navigation',
				order: 1,
			}]
		});
	}

	override async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, hunk?: HunkInformation | any): Promise<void> {
		ctrl.acceptHunk(hunk);
	}
}

export class DiscardHunkAction extends AbstractInline1ChatAction {

	constructor() {
		super({
			id: ACTION_DISCARD_CHANGES,
			title: localize('discard', 'Discard'),
			icon: Codicon.chromeClose,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: [{
				id: MENU_INLINE_CHAT_ZONE,
				group: 'navigation',
				order: 2
			}],
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				when: CTX_INLINE_CHAT_RESPONSE_TYPE.isEqualTo(InlineChatResponseType.MessagesAndEdits)
			}
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, hunk?: HunkInformation | any): Promise<void> {
		return ctrl.discardHunk(hunk);
	}
}

export class RerunAction extends AbstractInline1ChatAction {
	constructor() {
		super({
			id: ACTION_REGENERATE_RESPONSE,
			title: localize2('chat.rerun.label', "Rerun Request"),
			shortTitle: localize('rerun', 'Rerun'),
			f1: false,
			icon: Codicon.refresh,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 5,
				when: ContextKeyExpr.and(
					ChatContextKeys.inputHasText.toNegated(),
					CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.negate(),
					CTX_INLINE_CHAT_RESPONSE_TYPE.notEqualsTo(InlineChatResponseType.None)
				)
			},
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR
			}
		});
	}

	override async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		const chatService = accessor.get(IChatService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const model = ctrl.chatWidget.viewModel?.model;
		if (!model) {
			return;
		}

		const lastRequest = model.getRequests().at(-1);
		if (lastRequest) {
			const widget = chatWidgetService.getWidgetBySessionId(model.sessionId);
			await chatService.resendRequest(lastRequest, {
				noCommandDetection: false,
				attempt: lastRequest.attempt + 1,
				location: ctrl.chatWidget.location,
				userSelectedModelId: widget?.input.currentLanguageModel
			});
		}
	}
}

export class CloseAction extends AbstractInline1ChatAction {

	constructor() {
		super({
			id: 'inlineChat.close',
			title: localize('close', 'Close'),
			icon: Codicon.close,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyCode.Escape,
			},
			menu: [{
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 1,
				when: ContextKeyExpr.and(
					CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.negate(),
					CTX_INLINE_CHAT_RESPONSE_TYPE.isEqualTo(InlineChatResponseType.Messages)
				),
			}]
		});
	}

	async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		ctrl.cancelSession();
	}
}

export class ConfigureInlineChatAction extends AbstractInline1ChatAction {
	constructor() {
		super({
			id: 'inlineChat.configure',
			title: localize2('configure', 'Configure Inline Chat'),
			icon: Codicon.settingsGear,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			f1: true,
			menu: {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: 'zzz',
				order: 5
			}
		});
	}

	async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, ..._args: any[]): Promise<void> {
		accessor.get(IPreferencesService).openSettings({ query: 'inlineChat' });
	}
}

export class MoveToNextHunk extends AbstractInline1ChatAction {

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

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController1, editor: ICodeEditor, ...args: any[]): void {
		ctrl.moveHunk(true);
	}
}

export class MoveToPreviousHunk extends AbstractInline1ChatAction {

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

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController1, editor: ICodeEditor, ...args: any[]): void {
		ctrl.moveHunk(false);
	}
}

export class ViewInChatAction extends AbstractInline1ChatAction {
	constructor() {
		super({
			id: ACTION_VIEW_IN_CHAT,
			title: localize('viewInChat', 'View in Chat'),
			icon: Codicon.commentDiscussion,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			menu: [{
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: 'more',
				order: 1,
				when: CTX_INLINE_CHAT_RESPONSE_TYPE.notEqualsTo(InlineChatResponseType.Messages)
			}, {
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: '0_main',
				order: 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.inputHasText.toNegated(),
					CTX_INLINE_CHAT_RESPONSE_TYPE.isEqualTo(InlineChatResponseType.Messages),
					CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.negate()
				)
			}],
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
				when: ChatContextKeys.inChatInput
			}
		});
	}
	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, ..._args: any[]) {
		return ctrl.viewInChat();
	}
}

export class ToggleDiffForChange extends AbstractInline1ChatAction {

	constructor() {
		super({
			id: ACTION_TOGGLE_DIFF,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_CHANGE_HAS_DIFF),
			title: localize2('showChanges', 'Toggle Changes'),
			icon: Codicon.diffSingle,
			toggled: {
				condition: CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF,
			},
			menu: [{
				id: MENU_INLINE_CHAT_WIDGET_STATUS,
				group: 'zzz',
				order: 1,
			}, {
				id: MENU_INLINE_CHAT_ZONE,
				group: 'navigation',
				when: CTX_INLINE_CHAT_CHANGE_HAS_DIFF,
				order: 2
			}]
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController1, _editor: ICodeEditor, hunkInfo: HunkInformation | any): void {
		ctrl.toggleDiff(hunkInfo);
	}
}

//#endregion


//#region --- VERSION 2
abstract class AbstractInline2ChatAction extends EditorAction2 {

	static readonly category = localize2('cat', "Inline Chat");

	constructor(desc: IAction2Options) {
		super({
			...desc,
			category: AbstractInline2ChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_HAS_AGENT2, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);

		let ctrl = InlineChatController2.get(editor);
		if (!ctrl) {
			const { activeTextEditorControl } = editorService;
			if (isCodeEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl;
			} else if (isDiffEditor(activeTextEditorControl)) {
				editor = activeTextEditorControl.getModifiedEditor();
			}
			ctrl = InlineChatController2.get(editor);
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

	abstract runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController2, editor: ICodeEditor, ...args: any[]): void;
}

export class StopSessionAction2 extends AbstractInline2ChatAction {
	constructor() {
		super({
			id: 'inlineChat2.stop',
			title: localize2('stop', "Stop"),
			f1: true,
			precondition: CTX_INLINE_CHAT_VISIBLE,
			keybinding: [{
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape,
			}, {
				when: ctxRequestCount.isEqualTo(0),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
			}],
		});
	}

	runInlineChatCommand(accessor: ServicesAccessor, _ctrl: InlineChatController2, editor: ICodeEditor, ...args: any[]): void {
		const inlineChatSessions = accessor.get(IInlineChatSessionService);
		if (!editor.hasModel()) {
			return;
		}
		const textModel = editor.getModel();
		inlineChatSessions.getSession2(textModel.uri)?.dispose();
	}
}

export class RevealWidget extends AbstractInline2ChatAction {
	constructor() {
		super({
			id: 'inlineChat2.reveal',
			title: localize2('reveal', "Toggle Inline Chat"),
			f1: true,
			icon: Codicon.copilot,
			precondition: ContextKeyExpr.and(ctxIsGlobalEditingSession.negate(), ContextKeyExpr.greaterEquals(ctxRequestCount.key, 1)),
			toggled: CTX_INLINE_CHAT_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			menu: {
				id: MenuId.ChatEditingEditorContent,
				when: ContextKeyExpr.and(
					ContextKeyExpr.greaterEquals(ctxRequestCount.key, 1),
					ctxIsGlobalEditingSession.negate(),
				),
				group: 'navigate',
				order: 4,
			}
		});
	}

	runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController2, _editor: ICodeEditor): void {
		ctrl.toggleWidgetUntilNextRequest();
		ctrl.markActiveController();
	}
}
