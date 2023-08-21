/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget, IChatWidgetService, IQuickChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
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

	async start(context: IChatVoiceInputActionContext, disposables?: IDisposable[]): Promise<void> {
		this.stop();

		this.chatVoiceInputGettingReadyKey.set(true);
		this.currentChatVoiceInputSession = new DisposableStore();
		for (const disposable of disposables ?? []) {
			this.currentChatVoiceInputSession.add(disposable);
		}

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
			category: CHAT_CATEGORY,
			f1: true,
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

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatService = accessor.get(IChatService);
		const instantiationService = accessor.get(IInstantiationService);

		let context = args[0];
		if (!isVoiceInputActionContext(context)) {
			if (chatWidgetService.lastFocusedWidget?.hasInputFocus()) {
				context = { widget: chatWidgetService.lastFocusedWidget };
			} else {
				const provider = firstOrDefault(chatService.getProviderInfos());
				if (provider) {
					context = { widget: await chatWidgetService.revealViewForProvider(provider.id) };
				}
			}
		}

		if (!isVoiceInputActionContext(context)) {
			return;
		}

		ChatVoiceInputSession.getInstance(instantiationService).start(context);
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
			category: CHAT_CATEGORY,
			f1: true,
			precondition: CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS,
			icon: spinningLoading,
			menu: {
				id: MenuId.ChatExecute,
				when: CONTEXT_CHAT_VOICE_INPUT_IN_PROGRESS,
				group: 'navigation',
				order: -1
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		ChatVoiceInputSession.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

class VoiceQuickChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.voiceQuickChat';

	constructor() {
		super({
			id: VoiceQuickChatAction.ID,
			title: {
				value: localize('interactive.voiceQuickChat.label', "Quick Chat with Voice Input"),
				original: 'Quick Chat with Voice Input'
			},
			category: CHAT_CATEGORY,
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const quickChatService = accessor.get(IQuickChatService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);

		quickChatService.open();

		const disposables: IDisposable[] = [];
		Event.once(quickChatService.onDidClose)(() => ChatVoiceInputSession.getInstance(instantiationService).stop(), undefined, disposables);

		const widget = chatWidgetService.lastFocusedWidget;
		if (widget) {
			ChatVoiceInputSession.getInstance(accessor.get(IInstantiationService)).start({ widget }, disposables);
		}
	}
}

export function registerChatVoiceInputActions() {
	registerAction2(StartChatVoiceInputAction);
	registerAction2(StopChatVoiceInputAction);
	registerAction2(VoiceQuickChatAction);
}
