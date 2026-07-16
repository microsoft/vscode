/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, getWindow } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { spinningLoading } from '../../../../../platform/theme/common/iconRegistry.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatExecuteActionContext } from './chatExecuteActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../speechToText/chatSpeechToTextService.js';
import { cancelDictation, isDictating, startDictation, stopDictation } from '../speechToText/dictationSession.js';

export const ChatSpeechToTextConfigured = ContextKeyExpr.has(ChatContextKeys.speechToTextConfigured.key);
/** True while the on-device model is downloading/loading (the mic shows a spinner instead). */
export const ChatSpeechToTextPreparing = ContextKeyExpr.has(ChatContextKeys.speechToTextPreparing.key);


/** Releases shorter than this are treated as an accidental tap and discarded. */
const HOLD_TO_TALK_THRESHOLD_MS = 500;

class ToggleChatSpeechToTextAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleSpeechToText';

	constructor() {
		super({
			id: ToggleChatSpeechToTextAction.ID,
			title: localize2('chat.speechToText.start', "Dictate (Speech to Text)"),
			category: CHAT_CATEGORY,
			icon: Codicon.mic,
			f1: false,
			toggled: {
				condition: ChatContextKeys.speechToTextRecording,
				icon: Codicon.stopCircle,
				title: localize2('chat.speechToText.stop', "Stop Dictation").value,
			},
			menu: [{
				id: MenuId.ChatExecute,
				order: -11,
				when: ContextKeyExpr.and(ChatSpeechToTextConfigured, ChatSpeechToTextPreparing.negate()),
				group: 'navigation',
			}],
			keybinding: {
				// Outrank the legacy "Start Voice Chat" action, which binds the
				// same Cmd+I in the chat input at WorkbenchContrib weight. When
				// dictation is configured it should win the chord.
				weight: KeybindingWeight.WorkbenchContrib + 1,
				// Dedicated chord scoped to the chat input. Kept distinct from
				// Voice Mode's Cmd+Shift+Space so the two never contend.
				when: ContextKeyExpr.and(
					ChatSpeechToTextConfigured,
					ChatContextKeys.inChatInput,
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const context = args[0] as IChatExecuteActionContext | undefined;
		const widgetService = accessor.get(IChatWidgetService);
		const speechService = accessor.get(IChatSpeechToTextService);

		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		if (isDictating()) {
			await stopDictation();
			return;
		}

		if (speechService.state !== ChatSpeechToTextState.Idle) {
			return;
		}

		const window = getWindow(widget.domNode) ?? getActiveWindow();
		await startDictation(speechService, widget.inputEditor, window);
	}
}

/**
 * Shown in place of the mic button while the on-device model is downloading/loading.
 * Renders a spinner; clicking it cancels an in-flight dictation (if any).
 */
class ChatSpeechToTextPreparingAction extends Action2 {
	static readonly ID = 'workbench.action.chat.speechToTextPreparing';

	constructor() {
		super({
			id: ChatSpeechToTextPreparingAction.ID,
			title: localize2('chat.speechToText.preparing', "Preparing Speech to Text Model…"),
			category: CHAT_CATEGORY,
			f1: false,
			icon: spinningLoading,
			precondition: ChatSpeechToTextPreparing,
			menu: [{
				id: MenuId.ChatExecute,
				order: -11,
				when: ContextKeyExpr.and(ChatSpeechToTextConfigured, ChatSpeechToTextPreparing),
				group: 'navigation',
			}],
		});
	}

	async run(): Promise<void> {
		if (isDictating()) {
			cancelDictation();
		}
	}
}

class HoldToSpeechToTextAction extends Action2 {
	static readonly ID = 'workbench.action.chat.holdToSpeechToText';

	constructor() {
		super({
			id: HoldToSpeechToTextAction.ID,
			title: localize2('chat.speechToText.hold', "Hold to Dictate (Speech to Text)"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const context = args[0] as IChatExecuteActionContext | undefined;
		const widgetService = accessor.get(IChatWidgetService);
		const speechService = accessor.get(IChatSpeechToTextService);
		const keybindingService = accessor.get(IKeybindingService);

		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget || speechService.state !== ChatSpeechToTextState.Idle) {
			return;
		}

		// Resolves when the triggering key is released.
		const holdMode = keybindingService.enableKeybindingHoldMode(HoldToSpeechToTextAction.ID);
		if (!holdMode) {
			return;
		}

		const window = getWindow(widget.domNode) ?? getActiveWindow();
		const heldFrom = Date.now();
		await startDictation(speechService, widget.inputEditor, window);

		await holdMode;

		// Treat a quick tap as accidental: discard instead of transcribing.
		if (Date.now() - heldFrom < HOLD_TO_TALK_THRESHOLD_MS) {
			cancelDictation();
			return;
		}

		await stopDictation();
	}
}

class SelectSpeechToTextMicrophoneAction extends Action2 {
	static readonly ID = 'workbench.action.chat.selectSpeechToTextMicrophone';

	constructor() {
		super({
			id: SelectSpeechToTextMicrophoneAction.ID,
			title: localize2('chat.speechToText.selectMicrophone', "Dictate: Select Microphone"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatSpeechToTextConfigured,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const storageService = accessor.get(IStorageService);

		const devices = await navigator.mediaDevices.enumerateDevices();

		// Filter out the virtual "default"/"communications" entries (which duplicate a real
		// device) and de-duplicate by deviceId so a single microphone shows up only once.
		const seenDeviceIds = new Set<string>();
		const audioInputs = devices.filter(d => {
			if (d.kind !== 'audioinput' || d.deviceId === 'default' || d.deviceId === 'communications') {
				return false;
			}
			if (seenDeviceIds.has(d.deviceId)) {
				return false;
			}
			seenDeviceIds.add(d.deviceId);
			return true;
		});

		if (audioInputs.length === 0) {
			quickInputService.pick([{ label: localize('chatStt.noMicrophones', "No microphones found") }]);
			return;
		}

		// Shares the Voice Mode microphone selection so both features use the same device.
		const currentDeviceId = storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, '');

		type DevicePickItem = { label: string; description?: string; deviceId: string };
		const items: DevicePickItem[] = [{
			label: localize('chatStt.systemDefault', "System Default"),
			description: currentDeviceId === '' ? localize('chatStt.current', "(current)") : undefined,
			deviceId: '',
		}];
		for (const d of audioInputs) {
			const label = d.label || localize('chatStt.unknownDevice', "Unknown Device ({0})", d.deviceId.slice(0, 8));
			items.push({
				label,
				description: d.deviceId === currentDeviceId ? localize('chatStt.current', "(current)") : undefined,
				deviceId: d.deviceId,
			});
		}

		const picked = await quickInputService.pick(items, {
			placeHolder: localize('chatStt.selectMic', "Select a microphone for dictation"),
		});

		if (picked) {
			const selection = picked as DevicePickItem;
			if (selection.deviceId) {
				storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, selection.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
			} else {
				storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
			}
		}
	}
}

class CancelChatSpeechToTextAction extends Action2 {
	static readonly ID = 'workbench.action.chat.cancelSpeechToText';

	constructor() {
		super({
			id: CancelChatSpeechToTextAction.ID,
			title: localize2('chat.speechToText.cancel', "Cancel Dictation (Speech to Text)"),
			category: CHAT_CATEGORY,
			f1: false,
			keybinding: {
				// Escape aborts an in-progress dictation, discarding what was
				// recorded. Scoped to the chat input while recording and ranked
				// above the input's other Escape handlers so it wins the chord.
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ContextKeyExpr.and(
					ChatContextKeys.speechToTextRecording,
					ChatContextKeys.inChatInput,
				),
				primary: KeyCode.Escape,
			},
		});
	}

	async run(): Promise<void> {
		if (isDictating()) {
			cancelDictation();
		}
	}
}

export function registerChatSpeechToTextActions(): DisposableStore {
	const store = new DisposableStore();
	store.add(registerAction2(ToggleChatSpeechToTextAction));
	store.add(registerAction2(ChatSpeechToTextPreparingAction));
	store.add(registerAction2(HoldToSpeechToTextAction));
	store.add(registerAction2(CancelChatSpeechToTextAction));
	store.add(registerAction2(SelectSpeechToTextMicrophoneAction));
	return store;
}
