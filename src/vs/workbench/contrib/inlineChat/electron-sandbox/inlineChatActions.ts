/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { InlineChatController, InlineChatRunOptions } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { AbstractInlineChatAction } from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';
import { LOCALIZED_START_INLINE_CHAT_STRING, START_INLINE_CHAT } from '../browser/inlineChatActions';
import { disposableTimeout } from 'vs/base/common/async';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { StartVoiceChatAction, StopListeningAction } from 'vs/workbench/contrib/chat/electron-sandbox/actions/voiceChatActions';
import { CTX_INLINE_CHAT_HAS_PROVIDER, CTX_INLINE_CHAT_VISIBLE, InlineChatConfigKeys } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { HasSpeechProvider, ISpeechService } from 'vs/workbench/contrib/speech/common/speechService';
import { localize2 } from 'vs/nls';


export class StartSessionAction extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.start',
			title: { value: LOCALIZED_START_INLINE_CHAT_STRING, original: 'Start Inline Chat' },
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

		const configService = accessor.get(IConfigurationService);
		const speechService = accessor.get(ISpeechService);

		if (configService.getValue<boolean>(InlineChatConfigKeys.HoldToSpeech) // enabled
			&& speechService.hasSpeechProvider // possible
		) {
			holdForSpeech(accessor, InlineChatController.get(editor), this.desc.id);
		}

		let options: InlineChatRunOptions | undefined;
		const arg = _args[0];
		if (arg && InlineChatRunOptions.isInteractiveEditorOptions(arg)) {
			options = arg;
		}
		InlineChatController.get(editor)?.run({ ...options });
	}
}

export class HoldToSpeak extends AbstractInlineChatAction {

	constructor() {
		super({
			id: 'inlineChat.holdForSpeech',
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_INLINE_CHAT_VISIBLE),
			title: localize2('holdForSpeech', "Hold for Speech"),
			keybinding: {
				when: EditorContextKeys.textInputFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
			},
		});
	}

	override runInlineChatCommand(accessor: ServicesAccessor, ctrl: InlineChatController, editor: ICodeEditor, ...args: any[]): void {
		holdForSpeech(accessor, ctrl, this.desc.id);
	}
}

function holdForSpeech(accessor: ServicesAccessor, ctrl: InlineChatController | null, commandId: string): void {
	const keybindingService = accessor.get(IKeybindingService);
	const commandService = accessor.get(ICommandService);
	if (!ctrl) {
		return;
	}
	const holdMode = keybindingService.enableKeybindingHoldMode(commandId);
	if (!holdMode) {
		return;
	}
	let listening = false;
	const handle = disposableTimeout(() => {
		// start VOICE input
		commandService.executeCommand(StartVoiceChatAction.ID);
		listening = true;
	}, 250);

	holdMode.finally(() => {
		if (listening) {
			commandService.executeCommand(StopListeningAction.ID).finally(() => {
				ctrl!.acceptInput();
			});
		}
		handle.dispose();
	});
}
