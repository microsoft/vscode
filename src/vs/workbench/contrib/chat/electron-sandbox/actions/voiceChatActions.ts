/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/voiceChatActions';
import { Event } from 'vs/base/common/event';
import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import product from 'vs/platform/product/common/product';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';

const CONTEXT_VOICE_CHAT_GETTING_READY = new RawContextKey<boolean>('voiceChatGettingReady', false, { type: 'boolean', description: localize('voiceChatGettingReady', "True when getting ready for receiving voice input from the microphone.") });
const CONTEXT_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInProgress', false, { type: 'boolean', description: localize('voiceChatInProgress', "True when voice recording from microphone is in progress.") });

interface IVoiceChatSessionController {

	readonly onDidAcceptInput: Event<unknown>;
	readonly onDidCancelInput: Event<unknown>;

	focusInput(): void;
	acceptInput(): void;
	updateInput(text: string): void;
}

class VoiceChatSessionControllerFactory {

	static create(accessor: ServicesAccessor, context: 'inline'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'quick'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'view'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'focussed'): Promise<IVoiceChatSessionController | undefined>;
	static async create(accessor: ServicesAccessor, context: 'inline' | 'quick' | 'view' | 'focussed'): Promise<IVoiceChatSessionController | undefined> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatService = accessor.get(IChatService);
		const viewsService = accessor.get(IViewsService);
		const chatContributionService = accessor.get(IChatContributionService);
		const editorService = accessor.get(IEditorService);
		const quickChatService = accessor.get(IQuickChatService);

		// Currently Focussed Context
		if (context === 'focussed') {

			// Try with the chat widget service, which currently
			// only supports the chat view and quick chat
			// https://github.com/microsoft/vscode/issues/191191
			const chatInput = chatWidgetService.lastFocusedWidget;
			if (chatInput?.hasInputFocus()) {
				return {
					onDidAcceptInput: chatInput.onDidAcceptInput,
					onDidCancelInput: Event.any(
						// Since we do not know if the view or the quick chat
						// is container of the chat input, we need to listen
						// to both events here...
						Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === chatContributionService.getViewIdForProvider(chatInput.providerId)),
						quickChatService.onDidClose
					),
					focusInput: () => chatInput.focusInput(),
					acceptInput: () => chatInput.acceptInput(),
					updateInput: text => chatInput.updateInput(text)
				};
			}

			// Try with the inline chat
			const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
			if (activeCodeEditor) {
				const inlineChat = InlineChatController.get(activeCodeEditor);
				if (inlineChat?.hasFocus()) {
					return {
						onDidAcceptInput: inlineChat.onDidAcceptInput,
						onDidCancelInput: inlineChat.onDidCancelInput,
						focusInput: () => inlineChat.focus(),
						acceptInput: () => inlineChat.acceptInput(),
						updateInput: text => inlineChat.updateInput(text)
					};
				}
			}
		}

		// View Chat
		if (context === 'view') {
			const provider = firstOrDefault(chatService.getProviderInfos());
			if (provider) {
				const chatView = await chatWidgetService.revealViewForProvider(provider.id);
				if (chatView) {
					return {
						onDidAcceptInput: chatView.onDidAcceptInput,
						onDidCancelInput: Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === chatContributionService.getViewIdForProvider(provider.id)),
						focusInput: () => chatView.focusInput(),
						acceptInput: () => chatView.acceptInput(),
						updateInput: text => chatView.updateInput(text)
					};
				}
			}
		}

		// Inline Chat
		if (context === 'inline') {
			const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
			if (activeCodeEditor) {
				const inlineChat = InlineChatController.get(activeCodeEditor);
				if (inlineChat) {
					const inlineChatSession = inlineChat.run();

					return {
						onDidAcceptInput: inlineChat.onDidAcceptInput,
						onDidCancelInput: Event.any(
							inlineChat.onDidCancelInput,
							Event.fromPromise(inlineChatSession)
						),
						focusInput: () => inlineChat.focus(),
						acceptInput: () => inlineChat.acceptInput(),
						updateInput: text => inlineChat.updateInput(text)
					};
				}
			}
		}

		// Quick Chat
		if (context === 'quick') {
			quickChatService.open();

			const quickChat = chatWidgetService.lastFocusedWidget;
			if (quickChat) {
				return {
					onDidAcceptInput: quickChat.onDidAcceptInput,
					onDidCancelInput: quickChatService.onDidClose,
					focusInput: () => quickChat.focusInput(),
					acceptInput: () => quickChat.acceptInput(),
					updateInput: text => quickChat.updateInput(text)
				};
			}
		}

		return undefined;
	}
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

	async start(controller: IVoiceChatSessionController): Promise<void> {
		this.stop();

		const voiceChatSessionId = ++this.voiceChatSessionIds;
		this.currentVoiceChatSession = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.currentVoiceChatSession.add(toDisposable(() => cts.dispose(true)));

		this.currentVoiceChatSession.add(controller.onDidAcceptInput(() => this.stop(voiceChatSessionId)));
		this.currentVoiceChatSession.add(controller.onDidCancelInput(() => this.stop(voiceChatSessionId)));

		controller.focusInput();

		this.voiceChatGettingReadyKey.set(true);

		const onDidTranscribe = await this.voiceRecognitionService.transcribe(cts.token, {
			onDidCancel: () => this.stop(voiceChatSessionId)
		});

		if (cts.token.isCancellationRequested) {
			return;
		}

		this.voiceChatGettingReadyKey.set(false);
		this.voiceChatInProgressKey.set(true);

		this.registerTranscriptionListener(controller, onDidTranscribe, this.currentVoiceChatSession);
	}

	private registerTranscriptionListener(controller: IVoiceChatSessionController, onDidTranscribe: Event<string>, disposables: DisposableStore) {
		let lastText: string | undefined = undefined;
		let lastTextSimilarCount = 0;

		disposables.add(onDidTranscribe(text => {
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
					controller.acceptInput();
				} else {
					controller.updateInput(text);
				}

			}
		}));
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
		if (
			!this.currentVoiceChatSession ||
			this.voiceChatSessionIds !== voiceChatSessionId
		) {
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
		const instantiationService = accessor.get(IInstantiationService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'view');
		if (controller) {
			VoiceChatSession.getInstance(instantiationService).start(controller);
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
		const instantiationService = accessor.get(IInstantiationService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'inline');
		if (controller) {
			VoiceChatSession.getInstance(instantiationService).start(controller);
		}
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
		const instantiationService = accessor.get(IInstantiationService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'quick');
		if (controller) {
			VoiceChatSession.getInstance(instantiationService).start(controller);
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

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const commandService = accessor.get(ICommandService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'focussed');
		if (controller) {
			VoiceChatSession.getInstance(instantiationService).start(controller);
		} else {
			// fallback to Quick Voice Chat command
			commandService.executeCommand(QuickVoiceChatAction.ID);
		}
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
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: CONTEXT_VOICE_CHAT_IN_PROGRESS,
				primary: KeyCode.Escape
			},
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
