/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { IWorkbenchVoiceRecognitionService } from 'vs/workbench/services/voiceRecognition/electron-sandbox/workbenchVoiceRecognitionService';

const CONTEXT_CHAT_VOICE_INPUT_GETTING_READY = new RawContextKey<boolean>('chatVoiceInputGettingReady', false, { type: 'boolean', description: localize('chatVoiceInputGettingReady', "True when there is voice input for chat getting ready.") });
const CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS = new RawContextKey<boolean>('chatVoiceInputInProgress', false, { type: 'boolean', description: localize('chatVoiceInputInProgress', "True when there is voice input for chat in progress.") });

interface IChatVoiceInputActionContext {
	readonly widget: IChatWidget;
	readonly inputValue?: string;
}

function isVoiceInputActionContext(thing: unknown): thing is IChatVoiceInputActionContext {
	return typeof thing === 'object' && thing !== null && 'widget' in thing;
}

class ChatVoiceInputSession {

	private static instance: ChatVoiceInputSession | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService): ChatVoiceInputSession {
		if (!ChatVoiceInputSession.instance) {
			ChatVoiceInputSession.instance = instantiationService.createInstance(ChatVoiceInputSession);
		}

		return ChatVoiceInputSession.instance;
	}

	private chatVoiceInputInProgressKey = CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS.bindTo(this.contextKeyService);
	private chatVoiceInputGettingReadyKey = CONTEXT_CHAT_VOICE_INPUT_GETTING_READY.bindTo(this.contextKeyService);

	private currentChatVoiceInputSession: DisposableStore | undefined = undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchVoiceRecognitionService private readonly voiceRecognitionService: IWorkbenchVoiceRecognitionService
	) { }

	async start(context: IChatVoiceInputActionContext): Promise<void> {
		this.stop();

		this.chatVoiceInputGettingReadyKey.set(true);
		this.currentChatVoiceInputSession = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.currentChatVoiceInputSession.add(toDisposable(() => cts.dispose(true)));

		context.widget.focusInput();

		const onDidTranscribe = await this.voiceRecognitionService.transcribe(cts.token);
		if (cts.token.isCancellationRequested) {
			return;
		}

		this.chatVoiceInputGettingReadyKey.set(false);
		this.chatVoiceInputInProgressKey.set(true);

		let lastText: string | undefined = undefined;
		let lastTextEqualCount = 0;

		this.currentChatVoiceInputSession.add(onDidTranscribe(text => {
			if (text) {
				if (lastText && equalsIgnoreCase(text, lastText)) {
					lastTextEqualCount++;

					if (lastTextEqualCount >= 2) {
						context.widget.acceptInput();
					}
				} else {
					lastTextEqualCount = 0;
					lastText = text;

					context.widget.updateInput(text);
				}
			}
		}));

		this.currentChatVoiceInputSession.add(context.widget.onDidAcceptInput(() => {
			this.stop();
		}));
	}

	stop(): void {
		if (!this.currentChatVoiceInputSession) {
			return;
		}

		this.currentChatVoiceInputSession.dispose();
		this.currentChatVoiceInputSession = undefined;

		this.chatVoiceInputGettingReadyKey.set(false);
		this.chatVoiceInputInProgressKey.set(false);
	}
}

class StartChatVoiceInputAction extends Action2 {
	static readonly ID = 'workbench.action.chat.startVoiceInput';

	constructor() {
		super({
			id: StartChatVoiceInputAction.ID,
			title: {
				value: localize('interactive.voiceInput.label', "Start Voice Input"),
				original: 'Start Voice Input'
			},
			icon: Codicon.record,
			precondition: CONTEXT_CHAT_VOICE_INPUT_GETTING_READY.negate(),
			menu: {
				id: MenuId.ChatExecute,
				when: CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS.negate(),
				group: 'navigation',
				order: -1
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context = args[0];
		if (!isVoiceInputActionContext(context)) {
			return;
		}

		ChatVoiceInputSession.getInstance(accessor.get(IInstantiationService)).start(context);
	}
}

class StopChatVoiceInputAction extends Action2 {
	static readonly ID = 'workbench.action.chat.stopVoiceInput';

	constructor() {
		super({
			id: StopChatVoiceInputAction.ID,
			title: {
				value: localize('interactive.stopVoiceInput.label', "Stop Voice Input"),
				original: 'Stop Voice Input'
			},
			icon: spinningLoading,
			menu: {
				id: MenuId.ChatExecute,
				when: CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS,
				group: 'navigation',
				order: -1
			}
		});
	}

	run(accessor: ServicesAccessor) {
		ChatVoiceInputSession.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

export function registerChatVoiceInputActions() {
	registerAction2(StartChatVoiceInputAction);
	registerAction2(StopChatVoiceInputAction);
}
