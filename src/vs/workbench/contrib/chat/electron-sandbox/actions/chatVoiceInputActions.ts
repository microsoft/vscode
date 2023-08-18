/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_CHAT_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IWorkbenchVoiceRecognitionService } from 'vs/workbench/services/voiceRecognition/electron-sandbox/workbenchVoiceRecognitionService';

const CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS = new RawContextKey<boolean>('chatVoiceInputInProgress', false, { type: 'boolean', description: localize('interactiveSessionVoiceInputInProgress', "True when there is voice input for chat in progress.") });

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
	private currentChatVoiceInputSession: DisposableStore | undefined = undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchVoiceRecognitionService private readonly voiceRecognitionService: IWorkbenchVoiceRecognitionService
	) { }

	start(context: IChatVoiceInputActionContext): void {
		this.stop();

		this.chatVoiceInputInProgressKey.set(true);
		this.currentChatVoiceInputSession = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.currentChatVoiceInputSession.add(toDisposable(() => cts.dispose(true)));

		context.widget.focusInput();

		this.currentChatVoiceInputSession.add(this.voiceRecognitionService.transcribe(cts.token)(text => {
			if (text) {
				context.widget.updateInput(text);
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
			menu: {
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS.negate(), CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
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
			icon: Codicon.stop,
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
