/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { InlineChatController } from '../browser/inlineChatController.js';
import { AbstractInlineChatAction, setHoldForSpeech } from '../browser/inlineChatActions.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { StartVoiceChatAction, StopListeningAction, VOICE_KEY_HOLD_THRESHOLD } from '../../chat/electron-browser/actions/voiceChatActions.js';
import { IChatExecuteActionContext } from '../../chat/browser/actions/chatExecuteActions.js';
import { CTX_INLINE_CHAT_VISIBLE, InlineChatConfigKeys } from '../common/inlineChat.js';
import { HasSpeechProvider, ISpeechService } from '../../speech/common/speechService.js';
import { localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';

export class HoldToSpeak extends EditorAction2 {

	constructor() {
		super({
			id: 'inlineChat.holdForSpeech',
			category: AbstractInlineChatAction.category,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CTX_INLINE_CHAT_VISIBLE),
			title: localize2('holdForSpeech', "Hold for Speech"),
			keybinding: {
				when: EditorContextKeys.textInputFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
			},
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: unknown[]) {
		const ctrl = InlineChatController.get(editor);
		if (ctrl) {
			holdForSpeech(accessor, ctrl, this);
		}
	}
}

function holdForSpeech(accessor: ServicesAccessor, ctrl: InlineChatController, action: Action2): void {

	const configService = accessor.get(IConfigurationService);
	const speechService = accessor.get(ISpeechService);
	const keybindingService = accessor.get(IKeybindingService);
	const commandService = accessor.get(ICommandService);

	// enabled or possible?
	if (!configService.getValue<boolean>(InlineChatConfigKeys.HoldToSpeech || !speechService.hasSpeechProvider)) {
		return;
	}

	const holdMode = keybindingService.enableKeybindingHoldMode(action.desc.id);
	if (!holdMode) {
		return;
	}
	let listening = false;
	const handle = disposableTimeout(() => {
		// start VOICE input
		commandService.executeCommand(StartVoiceChatAction.ID, { voice: { disableTimeout: true } } satisfies IChatExecuteActionContext);
		listening = true;
	}, VOICE_KEY_HOLD_THRESHOLD);

	holdMode.finally(() => {
		if (listening) {
			commandService.executeCommand(StopListeningAction.ID).finally(() => {
				ctrl.widget.chatWidget.acceptInput();
			});
		}
		handle.dispose();
	});
}

// make this accessible to the chat actions from the browser layer
setHoldForSpeech(holdForSpeech);
