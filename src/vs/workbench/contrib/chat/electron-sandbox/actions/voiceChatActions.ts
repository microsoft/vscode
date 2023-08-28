/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService, IQuickChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IWorkbenchVoiceRecognitionService } from 'vs/workbench/services/voiceRecognition/electron-sandbox/workbenchVoiceRecognitionService';
import { MENU_INLINE_CHAT_WIDGET } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { isExecuteActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import product from 'vs/platform/product/common/product';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';

const CONTEXT_VOICE_CHAT_GETTING_READY = new RawContextKey<boolean>('voiceChatGettingReady', false, { type: 'boolean', description: localize('voiceChatGettingReady', "True when getting ready for receiving voice input from the microphone.") });
const CONTEXT_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInProgress', false, { type: 'boolean', description: localize('voiceChatInProgress', "True when voice recording from microphone is in progress.") });

interface IVoiceChatSessionController {

	readonly onDidAcceptInput: Event<unknown>;

	focusInput(): void;
	acceptInput(): void;
	updateInput(text: string): void;
}

function getController(controller: InlineChatController): IVoiceChatSessionController;
function getController(context: unknown): IVoiceChatSessionController | undefined;
function getController(context: unknown): IVoiceChatSessionController | undefined {
	if (context instanceof InlineChatController) {
		return {
			onDidAcceptInput: context.onDidAcceptInput,
			focusInput: () => context.focus(),
			acceptInput: () => context.acceptInput(),
			updateInput: text => context.updateInput(text)
		};
	}

	if (isExecuteActionContext(context)) {
		return context.widget;
	}

	return undefined;
}

class VoiceChatSession {

	private static instance: VoiceChatSession | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService): VoiceChatSession {
		if (!VoiceChatSession.instance) {
			VoiceChatSession.instance = instantiationService.createInstance(VoiceChatSession);
		}

		return VoiceChatSession.instance;
	}

	private voiceChatInProgressKey = CONTEXT_VOICE_CHAT_IN_PROGRESS.bindTo(this.contextKeyService);
	private voiceChatGettingReadyKey = CONTEXT_VOICE_CHAT_GETTING_READY.bindTo(this.contextKeyService);

	private currentVoiceChatSession: DisposableStore | undefined = undefined;
	private voiceChatSessionIds = 0;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchVoiceRecognitionService private readonly voiceRecognitionService: IWorkbenchVoiceRecognitionService
	) { }

	async start(context: IVoiceChatSessionController): Promise<IDisposable> {
		this.stop();

		this.voiceChatGettingReadyKey.set(true);
		this.currentVoiceChatSession = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.currentVoiceChatSession.add(toDisposable(() => cts.dispose(true)));

		context.focusInput();

		const onDidTranscribe = await this.voiceRecognitionService.transcribe(cts.token, {
			onDidCancel: () => this.stop(voiceChatSessionId)
		});
		if (cts.token.isCancellationRequested) {
			return Disposable.None;
		}

		const voiceChatSessionId = ++this.voiceChatSessionIds;

		this.voiceChatGettingReadyKey.set(false);
		this.voiceChatInProgressKey.set(true);

		let lastText: string | undefined = undefined;
		let lastTextSimilarCount = 0;

		this.currentVoiceChatSession.add(onDidTranscribe(text => {
			if (!text && lastText) {
				text = lastText;
			}

			if (text) {
				if (lastText && this.isSimilarTranscription(text, lastText)) {
					lastTextSimilarCount++;
				} else {
					lastTextSimilarCount = 0;
					lastText = text;
				}

				if (lastTextSimilarCount >= 2) {
					context.acceptInput();
				} else {
					context.updateInput(text);
				}

			}
		}));

		this.currentVoiceChatSession.add(context.onDidAcceptInput(() => this.stop(voiceChatSessionId)));

		return toDisposable(() => this.stop(voiceChatSessionId));
	}

	private isSimilarTranscription(textA: string, textB: string): boolean {

		// Attempt to compare the 2 strings in a way to see
		// if they are similar or not. As such we:
		// - ignore trailing punctuation
		// - collapse all whitespace
		// - compare case insensitive

		return equalsIgnoreCase(
			textA.replace(/[.,;:!?]+$/, '').replace(/\s+/g, ''),
			textB.replace(/[.,;:!?]+$/, '').replace(/\s+/g, '')
		);
	}

	stop(voiceChatSessionId = this.voiceChatSessionIds): void {
		if (!this.currentVoiceChatSession) {
			return;
		}

		if (this.voiceChatSessionIds !== voiceChatSessionId) {
			return;
		}

		this.currentVoiceChatSession.dispose();
		this.currentVoiceChatSession = undefined;

		this.voiceChatGettingReadyKey.set(false);
		this.voiceChatInProgressKey.set(false);
	}
}

class VoiceChatInChatViewAction extends Action2 {

	static readonly ID = 'workbench.action.chat.voiceChatInChatView';

	constructor() {
		super({
			id: VoiceChatInChatViewAction.ID,
			title: {
				value: localize('workbench.action.chat.voiceChatInView.label', "Voice Chat in Chat View"),
				original: 'Voice Chat in Chat View'
			},
			category: CHAT_CATEGORY,
			precondition: CONTEXT_PROVIDER_EXISTS,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatService = accessor.get(IChatService);
		const instantiationService = accessor.get(IInstantiationService);

		const provider = firstOrDefault(chatService.getProviderInfos());
		if (provider) {
			const controller = await chatWidgetService.revealViewForProvider(provider.id);
			if (controller) {
				VoiceChatSession.getInstance(instantiationService).start(controller);
			}
		}
	}
}

class InlineVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.inlineVoiceChat';

	constructor() {
		super({
			id: InlineVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.inlineVoiceChat', "Inline Voice Chat"),
				original: 'Inline Voice Chat'
			},
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(CONTEXT_PROVIDER_EXISTS, ActiveEditorContext),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
		if (!activeCodeEditor) {
			return;
		}

		const controller = InlineChatController.get(activeCodeEditor);
		if (!controller) {
			return;
		}

		const inlineChatSession = controller.run();

		const disposable = await VoiceChatSession.getInstance(instantiationService).start(getController(controller));
		inlineChatSession.finally(() => disposable.dispose());
	}
}

class QuickVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.quickVoiceChat';

	constructor() {
		super({
			id: QuickVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.quickVoiceChat.label', "Quick Voice Chat"),
				original: 'Quick Voice Chat'
			},
			category: CHAT_CATEGORY,
			precondition: CONTEXT_PROVIDER_EXISTS,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickChatService = accessor.get(IQuickChatService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);

		quickChatService.open();

		const controller = chatWidgetService.lastFocusedWidget;
		if (controller) {
			const disposable = await VoiceChatSession.getInstance(instantiationService).start(controller);
			Event.once(quickChatService.onDidClose)(() => disposable.dispose());
		}
	}
}

class StartVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.startVoiceChat';

	constructor() {
		super({
			id: StartVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.startVoiceChat', "Start Voice Chat"),
				original: 'Start Voice Chat'
			},
			icon: Codicon.record,
			precondition: CONTEXT_VOICE_CHAT_GETTING_READY.negate(),
			menu: [{
				id: MenuId.ChatExecute,
				when: CONTEXT_VOICE_CHAT_IN_PROGRESS.negate(),
				group: 'navigation',
				order: -1
			}, {
				id: MENU_INLINE_CHAT_WIDGET,
				when: CONTEXT_VOICE_CHAT_IN_PROGRESS.negate(),
				group: 'main',
				order: -1
			}]
		});
	}

	async run(accessor: ServicesAccessor, context: unknown): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const instantiationService = accessor.get(IInstantiationService);
		const commandService = accessor.get(ICommandService);

		let controller = getController(context);
		if (!controller) {

			// Without a controller, this action potentially executed from
			// a global keybinding, and thus we have to find the chat
			// input that is currently focussed, or have a fallback

			// 1.) a chat input widget has focus
			if (chatWidgetService.lastFocusedWidget?.hasInputFocus()) {
				controller = chatWidgetService.lastFocusedWidget;
			}

			// 2.) a inline chat input widget has focus
			if (!controller) {
				const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
				if (activeCodeEditor) {
					const chatInput = InlineChatController.get(activeCodeEditor);
					if (chatInput?.hasFocus()) {
						controller = getController(chatInput);
					}
				}
			}

			// 3.) open a quick chat view
			if (!controller) {
				return commandService.executeCommand(QuickVoiceChatAction.ID);
			}
		}

		if (!controller) {
			return;
		}

		VoiceChatSession.getInstance(instantiationService).start(controller);
	}
}

class StopVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopVoiceChat';

	constructor() {
		super({
			id: StopVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.stopVoiceChat.label', "Stop Voice Chat"),
				original: 'Stop Voice Chat'
			},
			category: CHAT_CATEGORY,
			f1: true,
			precondition: CONTEXT_VOICE_CHAT_IN_PROGRESS,
			icon: spinningLoading,
			menu: [{
				id: MenuId.ChatExecute,
				when: CONTEXT_VOICE_CHAT_IN_PROGRESS,
				group: 'navigation',
				order: -1
			}, {
				id: MENU_INLINE_CHAT_WIDGET,
				when: CONTEXT_VOICE_CHAT_IN_PROGRESS,
				group: 'main',
				order: -1
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSession.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

export function registerVoiceChatActions() {
	if (typeof process.env.VSCODE_VOICE_MODULE_PATH === 'string' && product.quality !== 'stable') { // TODO@bpasero package
		registerAction2(VoiceChatInChatViewAction);
		registerAction2(QuickVoiceChatAction);
		registerAction2(InlineVoiceChatAction);

		registerAction2(StartVoiceChatAction);
		registerAction2(StopVoiceChatAction);
	}
}
