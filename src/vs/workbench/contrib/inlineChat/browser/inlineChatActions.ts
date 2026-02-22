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
import { InlineChatController, InlineChatRunOptions } from './inlineChatController.js';
import { ACTION_ACCEPT_CHANGES, ACTION_ASK_IN_CHAT, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_POSSIBLE, ACTION_START, CTX_INLINE_CHAT_V2_ENABLED, CTX_INLINE_CHAT_V1_ENABLED, CTX_HOVER_MODE, CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, InlineChatConfigKeys } from '../common/inlineChat.js';
import { ctxHasEditorModification, ctxHasRequestInProgress } from '../../chat/browser/chatEditing/chatEditingEditorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IChatEditingService } from '../../chat/common/editing/chatEditingService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatRequestQueueKind } from '../../chat/common/chatService/chatService.js';


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

const inlineChatContextKey = ContextKeyExpr.and(
	ContextKeyExpr.or(CTX_INLINE_CHAT_V1_ENABLED, CTX_INLINE_CHAT_V2_ENABLED),
	CTX_INLINE_CHAT_POSSIBLE,
	EditorContextKeys.writable,
	EditorContextKeys.editorSimpleInput.negate()
);

export class StartSessionAction extends Action2 {

	constructor() {
		super({
			id: ACTION_START,
			title: localize2('run', 'Open Inline Chat'),
			shortTitle: localize2('runShort', 'Inline Chat'),
			category: AbstractInlineChatAction.category,
			f1: true,
			precondition: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			icon: START_INLINE_CHAT,
			menu: [{
				id: MenuId.EditorContext,
				group: '1_chat',
				order: 3,
				when: inlineChatContextKey
			}, {
				id: MenuId.ChatTitleBarMenu,
				group: 'a_open',
				order: 3,
			}]
		});
	}
	override run(accessor: ServicesAccessor, ...args: unknown[]): any {

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

	private async _runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]) {

		const configServce = accessor.get(IConfigurationService);

		const ctrl = InlineChatController.get(editor);
		if (!ctrl) {
			return;
		}

		if (_holdForSpeech) {
			accessor.get(IInstantiationService).invokeFunction(_holdForSpeech, ctrl, this);
		}

		let options: InlineChatRunOptions | undefined;
		const arg = args[0];
		if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
			options = arg;
		}

		// use hover overlay to ask for input
		if (!options?.message && configServce.getValue<string>(InlineChatConfigKeys.RenderMode) === 'hover') {
			const selection = editor.getSelection();
			const placeholder = selection && !selection.isEmpty()
				? localize('placeholderWithSelection', "Describe how to change this")
				: localize('placeholderNoSelection', "Describe what to generate");
			// show menu and RETURN because the menu is re-entrant
			await ctrl.inputOverlayWidget.showMenuAtSelection(placeholder);
			return;
		}

		await ctrl?.run({ ...options });
	}
}

// --- InlineChatEditorAffordance menu ---

MenuRegistry.appendMenuItem(MenuId.InlineChatEditorAffordance, {
	group: '0_chat',
	order: 1,
	when: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasNonEmptySelection, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
	command: {
		id: ACTION_START,
		title: localize('editCode', "Ask for Edits"),
		shortTitle: localize('editCodeShort', "Ask for Edits"),
		icon: Codicon.sparkle,
	}
});

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

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: unknown[]) {
		InlineChatController.get(editor)?.focus();
	}
}

//#region --- VERSION 2
export abstract class AbstractInlineChatAction extends EditorAction2 {

	static readonly category = localize2('cat', "Inline Chat");

	constructor(desc: IAction2Options) {
		const massageMenu = (menu: IAction2Options['menu'] | undefined) => {
			if (Array.isArray(menu)) {
				for (const entry of menu) {
					entry.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, entry.when);
				}
			} else if (menu) {
				menu.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, menu.when);
			}
		};
		if (Array.isArray(desc.menu)) {
			massageMenu(desc.menu);
		} else {
			massageMenu(desc.menu);
		}

		super({
			...desc,
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: unknown[]) {
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

	abstract runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ...args: unknown[]): void;
}

class KeepOrUndoSessionAction extends AbstractInlineChatAction {

	constructor(private readonly _keep: boolean, desc: IAction2Options) {
		super(desc);
	}

	override async runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ..._args: unknown[]): Promise<void> {
		if (this._keep) {
			await ctrl.acceptSession();
		} else {
			await ctrl.rejectSession();
		}
		if (editor.hasModel()) {
			editor.setSelection(editor.getSelection().collapseToStart());
		}
	}
}

export class KeepSessionAction2 extends KeepOrUndoSessionAction {
	constructor() {
		super(true, {
			id: 'inlineChat2.keep',
			title: localize2('Keep', "Keep"),
			f1: true,
			icon: Codicon.check,
			precondition: ContextKeyExpr.and(
				CTX_INLINE_CHAT_VISIBLE,
				ctxHasRequestInProgress.negate(),
				ctxHasEditorModification,
			),
			keybinding: [{
				when: ContextKeyExpr.and(ChatContextKeys.inputHasFocus, ChatContextKeys.inputHasText.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Enter
			}, {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyMod.CtrlCmd | KeyCode.Enter
			}],
			menu: [{
				id: MenuId.ChatEditorInlineExecute,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(
					ctxHasRequestInProgress.negate(),
					ctxHasEditorModification,
					ChatContextKeys.inputHasText.toNegated()
				),
			}]
		});
	}
}

export class UndoSessionAction2 extends KeepOrUndoSessionAction {

	constructor() {
		super(false, {
			id: 'inlineChat2.undo',
			title: localize2('undo', "Undo"),
			f1: true,
			icon: Codicon.discard,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_HOVER_MODE),
			keybinding: [{
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(EditorContextKeys.focus, ctxHasEditorModification.negate()),
					ChatContextKeys.inputHasFocus,
				),
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyCode.Escape,
			}],
			menu: [{
				id: MenuId.ChatEditorInlineExecute,
				group: 'navigation',
				order: 100,
				when: ContextKeyExpr.and(
					CTX_HOVER_MODE,
					ctxHasRequestInProgress.negate(),
					ctxHasEditorModification,
				)
			}]
		});
	}
}

export class UndoAndCloseSessionAction2 extends KeepOrUndoSessionAction {

	constructor() {
		super(false, {
			id: 'inlineChat2.close',
			title: localize2('close2', "Close"),
			f1: true,
			icon: Codicon.close,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_HOVER_MODE.negate()),
			keybinding: [{
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(EditorContextKeys.focus, ctxHasEditorModification.negate()),
					ChatContextKeys.inputHasFocus,
				),
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyCode.Escape,
			}],
			menu: [{
				id: MenuId.ChatEditorInlineExecute,
				group: 'navigation',
				order: 100,
				when: ContextKeyExpr.or(
					CTX_HOVER_MODE.negate(),
					ContextKeyExpr.and(CTX_HOVER_MODE, ctxHasEditorModification.negate(), ctxHasRequestInProgress.negate())
				)
			}]
		});
	}
}

export class SubmitInlineChatInputAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.submitInput',
			title: localize2('submitInput', "Send"),
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
			keybinding: {
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
				weight: KeybindingWeight.EditorCore + 10,
				primary: KeyCode.Enter
			},
			menu: [{
				id: MenuId.InlineChatInput,
				group: '0_main',
				order: 1,
				when: CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()
			}]
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: unknown[]): void {
		const value = ctrl.inputWidget.value;
		if (value) {
			ctrl.inputWidget.hide();
			ctrl.run({ message: value, autoSend: true });
		}
	}
}

export class HideInlineChatInputAction extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.hideInput',
			title: localize2('hideInput', "Hide Input"),
			precondition: CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED,
			keybinding: {
				when: CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED,
				weight: KeybindingWeight.EditorCore + 10,
				primary: KeyCode.Escape
			}
		});
	}

	override runInlineChatCommand(_accessor: ServicesAccessor, ctrl: InlineChatController, _editor: ICodeEditor, ..._args: unknown[]): void {
		ctrl.inputWidget.hide();
	}
}


export class AskInChatAction extends EditorAction2 {

	constructor() {
		super({
			id: ACTION_ASK_IN_CHAT,
			title: localize2('askInChat', 'Ask in Chat'),
			category: AbstractInlineChatAction.category,
			f1: true,
			precondition: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT),
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			icon: Codicon.chatSparkle,
			menu: [{
				id: MenuId.EditorContext,
				group: '1_chat',
				order: 3,
				when: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT)
			}, {
				id: MenuId.InlineChatEditorAffordance,
				group: '0_chat',
				order: 1,
				when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT)
			}]
		});
	}

	override async runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor) {
		const chatEditingService = accessor.get(IChatEditingService);
		const ctrl = InlineChatController.get(editor);
		if (!ctrl || !editor.hasModel()) {
			return;
		}
		const entry = chatEditingService.editingSessionsObs.get().find(value => value.getEntry(editor.getModel().uri));
		if (entry) {
			ctrl.inputOverlayWidget.showMenuAtSelection(localize('placeholderAskInChat', "Describe how to proceed in Chat"));
		}
	}
}

export class QueueInChatAction extends AbstractInlineChatAction {


	constructor() {
		super({
			id: 'inlineChat.queueInChat',
			title: localize2('queueInChat', "Queue in Chat"),
			icon: Codicon.arrowUp,
			precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT),
			keybinding: {
				when: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT),
				weight: KeybindingWeight.EditorCore + 10,
				primary: KeyCode.Enter
			},
			menu: [{
				id: MenuId.InlineChatInput,
				group: '0_main',
				order: 1,
				when: CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT,
			}]
		});
	}

	override async runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		if (!editor.hasModel()) {
			return;
		}

		const value = ctrl.inputWidget.value;
		ctrl.inputWidget.hide();
		if (!value) {
			return;
		}

		const session = chatEditingService.editingSessionsObs.get().find(s => s.getEntry(editor.getModel().uri));
		if (!session) {
			return;
		}

		const widget = await chatWidgetService.openSession(session.chatSessionResource);
		if (!widget) {
			return;
		}

		const selection = editor.getSelection();
		if (selection && !selection.isEmpty()) {
			await widget.attachmentModel.addFile(editor.getModel().uri, selection);
		}
		await widget.acceptInput(value, { alwaysQueue: true, queue: ChatRequestQueueKind.Queued });
	}
}
