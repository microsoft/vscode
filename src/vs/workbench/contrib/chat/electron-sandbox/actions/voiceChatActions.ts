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
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget, IChatWidgetService, IQuickChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST, MENU_INLINE_CHAT_INPUT } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { HasSpeechProvider, ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BADGE_BACKGROUND } from 'vs/workbench/common/theme';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { Color } from 'vs/base/common/color';
import { contrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isNumber } from 'vs/base/common/types';
import { AccessibilityVoiceSettingId, SpeechTimeoutDefault } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IChatExecuteActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';

const CONTEXT_VOICE_CHAT_GETTING_READY = new RawContextKey<boolean>('voiceChatGettingReady', false, { type: 'boolean', description: localize('voiceChatGettingReady', "True when getting ready for receiving voice input from the microphone for voice chat.") });
const CONTEXT_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInProgress', false, { type: 'boolean', description: localize('voiceChatInProgress', "True when voice recording from microphone is in progress for voice chat.") });

const CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('quickVoiceChatInProgress', false, { type: 'boolean', description: localize('quickVoiceChatInProgress', "True when voice recording from microphone is in progress for quick chat.") });
const CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('inlineVoiceChatInProgress', false, { type: 'boolean', description: localize('inlineVoiceChatInProgress', "True when voice recording from microphone is in progress for inline chat.") });
const CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInViewInProgress', false, { type: 'boolean', description: localize('voiceChatInViewInProgress', "True when voice recording from microphone is in progress in the chat view.") });
const CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInEditorInProgress', false, { type: 'boolean', description: localize('voiceChatInEditorInProgress', "True when voice recording from microphone is in progress in the chat editor.") });

type VoiceChatSessionContext = 'inline' | 'quick' | 'view' | 'editor';

interface IVoiceChatSessionController {

	readonly onDidAcceptInput: Event<unknown>;
	readonly onDidCancelInput: Event<unknown>;

	readonly context: VoiceChatSessionContext;

	focusInput(): void;
	acceptInput(): void;
	updateInput(text: string): void;
	getInput(): string;

	setInputPlaceholder(text: string): void;
	clearInputPlaceholder(): void;
}

class VoiceChatSessionControllerFactory {

	static create(accessor: ServicesAccessor, context: 'inline'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'quick'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'view'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'focused'): Promise<IVoiceChatSessionController | undefined>;
	static async create(accessor: ServicesAccessor, context: 'inline' | 'quick' | 'view' | 'focused'): Promise<IVoiceChatSessionController | undefined> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatService = accessor.get(IChatService);
		const viewsService = accessor.get(IViewsService);
		const chatContributionService = accessor.get(IChatContributionService);
		const editorService = accessor.get(IEditorService);
		const quickChatService = accessor.get(IQuickChatService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// Currently Focused Context
		if (context === 'focused') {

			// Try with the chat widget service, which currently
			// only supports the chat view and quick chat
			// https://github.com/microsoft/vscode/issues/191191
			const chatInput = chatWidgetService.lastFocusedWidget;
			if (chatInput?.hasInputFocus()) {
				// Unfortunately there does not seem to be a better way
				// to figure out if the chat widget is in a part or picker
				if (
					layoutService.hasFocus(Parts.SIDEBAR_PART) ||
					layoutService.hasFocus(Parts.PANEL_PART) ||
					layoutService.hasFocus(Parts.AUXILIARYBAR_PART)
				) {
					return VoiceChatSessionControllerFactory.doCreateForChatView(chatInput, viewsService, chatContributionService);
				}

				if (layoutService.hasFocus(Parts.EDITOR_PART)) {
					return VoiceChatSessionControllerFactory.doCreateForChatEditor(chatInput, viewsService, chatContributionService);
				}

				return VoiceChatSessionControllerFactory.doCreateForQuickChat(chatInput, quickChatService);
			}

			// Try with the inline chat
			const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
			if (activeCodeEditor) {
				const inlineChat = InlineChatController.get(activeCodeEditor);
				if (inlineChat?.hasFocus()) {
					return VoiceChatSessionControllerFactory.doCreateForInlineChat(inlineChat);
				}
			}
		}

		// View Chat
		if (context === 'view') {
			const provider = firstOrDefault(chatService.getProviderInfos());
			if (provider) {
				const chatView = await chatWidgetService.revealViewForProvider(provider.id);
				if (chatView) {
					return VoiceChatSessionControllerFactory.doCreateForChatView(chatView, viewsService, chatContributionService);
				}
			}
		}

		// Inline Chat
		if (context === 'inline') {
			const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
			if (activeCodeEditor) {
				const inlineChat = InlineChatController.get(activeCodeEditor);
				if (inlineChat) {
					return VoiceChatSessionControllerFactory.doCreateForInlineChat(inlineChat);
				}
			}
		}

		// Quick Chat
		if (context === 'quick') {
			quickChatService.open();

			const quickChat = chatWidgetService.lastFocusedWidget;
			if (quickChat) {
				return VoiceChatSessionControllerFactory.doCreateForQuickChat(quickChat, quickChatService);
			}
		}

		return undefined;
	}

	private static doCreateForChatView(chatView: IChatWidget, viewsService: IViewsService, chatContributionService: IChatContributionService): IVoiceChatSessionController {
		return VoiceChatSessionControllerFactory.doCreateForChatViewOrEditor('view', chatView, viewsService, chatContributionService);
	}

	private static doCreateForChatEditor(chatView: IChatWidget, viewsService: IViewsService, chatContributionService: IChatContributionService): IVoiceChatSessionController {
		return VoiceChatSessionControllerFactory.doCreateForChatViewOrEditor('editor', chatView, viewsService, chatContributionService);
	}

	private static doCreateForChatViewOrEditor(context: 'view' | 'editor', chatView: IChatWidget, viewsService: IViewsService, chatContributionService: IChatContributionService): IVoiceChatSessionController {
		return {
			context,
			onDidAcceptInput: chatView.onDidAcceptInput,
			// TODO@bpasero cancellation needs to work better for chat editors that are not view bound
			onDidCancelInput: Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === chatContributionService.getViewIdForProvider(chatView.providerId)),
			focusInput: () => chatView.focusInput(),
			acceptInput: () => chatView.acceptInput(),
			updateInput: text => chatView.setInput(text),
			getInput: () => chatView.getInput(),
			setInputPlaceholder: text => chatView.setInputPlaceholder(text),
			clearInputPlaceholder: () => chatView.resetInputPlaceholder()
		};
	}

	private static doCreateForQuickChat(quickChat: IChatWidget, quickChatService: IQuickChatService): IVoiceChatSessionController {
		return {
			context: 'quick',
			onDidAcceptInput: quickChat.onDidAcceptInput,
			onDidCancelInput: quickChatService.onDidClose,
			focusInput: () => quickChat.focusInput(),
			acceptInput: () => quickChat.acceptInput(),
			updateInput: text => quickChat.setInput(text),
			getInput: () => quickChat.getInput(),
			setInputPlaceholder: text => quickChat.setInputPlaceholder(text),
			clearInputPlaceholder: () => quickChat.resetInputPlaceholder()
		};
	}

	private static doCreateForInlineChat(inlineChat: InlineChatController): IVoiceChatSessionController {
		const inlineChatSession = inlineChat.joinCurrentRun() ?? inlineChat.run();

		return {
			context: 'inline',
			onDidAcceptInput: inlineChat.onDidAcceptInput,
			onDidCancelInput: Event.any(
				inlineChat.onDidCancelInput,
				Event.fromPromise(inlineChatSession)
			),
			focusInput: () => inlineChat.focus(),
			acceptInput: () => inlineChat.acceptInput(),
			updateInput: text => inlineChat.updateInput(text, false),
			getInput: () => inlineChat.getInput(),
			setInputPlaceholder: text => inlineChat.setPlaceholder(text),
			clearInputPlaceholder: () => inlineChat.resetPlaceholder()
		};
	}
}

interface ActiveVoiceChatSession {
	readonly id: number;
	readonly controller: IVoiceChatSessionController;
	readonly disposables: DisposableStore;
}

class VoiceChatSessions {

	private static instance: VoiceChatSessions | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService): VoiceChatSessions {
		if (!VoiceChatSessions.instance) {
			VoiceChatSessions.instance = instantiationService.createInstance(VoiceChatSessions);
		}

		return VoiceChatSessions.instance;
	}

	private voiceChatInProgressKey = CONTEXT_VOICE_CHAT_IN_PROGRESS.bindTo(this.contextKeyService);
	private voiceChatGettingReadyKey = CONTEXT_VOICE_CHAT_GETTING_READY.bindTo(this.contextKeyService);

	private quickVoiceChatInProgressKey = CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS.bindTo(this.contextKeyService);
	private inlineVoiceChatInProgressKey = CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS.bindTo(this.contextKeyService);
	private voiceChatInViewInProgressKey = CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS.bindTo(this.contextKeyService);
	private voiceChatInEditorInProgressKey = CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS.bindTo(this.contextKeyService);

	private currentVoiceChatSession: ActiveVoiceChatSession | undefined = undefined;
	private voiceChatSessionIds = 0;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISpeechService private readonly speechService: ISpeechService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) { }

	async start(controller: IVoiceChatSessionController): Promise<void> {
		this.stop();

		const sessionId = ++this.voiceChatSessionIds;
		const session = this.currentVoiceChatSession = {
			id: sessionId,
			controller,
			disposables: new DisposableStore()
		};

		const cts = new CancellationTokenSource();
		session.disposables.add(toDisposable(() => cts.dispose(true)));

		session.disposables.add(controller.onDidAcceptInput(() => this.stop(sessionId, controller.context)));
		session.disposables.add(controller.onDidCancelInput(() => this.stop(sessionId, controller.context)));

		controller.focusInput();

		this.voiceChatGettingReadyKey.set(true);

		const speechToTextSession = session.disposables.add(this.speechService.createSpeechToTextSession(cts.token));

		let inputValue = controller.getInput();

		let voiceChatTimeout = this.configurationService.getValue<number>(AccessibilityVoiceSettingId.SpeechTimeout);
		if (!isNumber(voiceChatTimeout) || voiceChatTimeout < 0) {
			voiceChatTimeout = SpeechTimeoutDefault;
		}

		const acceptTranscriptionScheduler = session.disposables.add(new RunOnceScheduler(() => session.controller.acceptInput(), voiceChatTimeout));
		session.disposables.add(speechToTextSession.onDidChange(({ status, text }) => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			switch (status) {
				case SpeechToTextStatus.Started:
					this.onDidSpeechToTextSessionStart(controller, session.disposables);
					break;
				case SpeechToTextStatus.Recognizing:
					if (text) {
						session.controller.updateInput([inputValue, text].join(' '));
						if (voiceChatTimeout > 0) {
							acceptTranscriptionScheduler.cancel();
						}
					}
					break;
				case SpeechToTextStatus.Recognized:
					if (text) {
						inputValue = [inputValue, text].join(' ');
						session.controller.updateInput(inputValue);
						if (voiceChatTimeout > 0) {
							acceptTranscriptionScheduler.schedule();
						}
					}
					break;
				case SpeechToTextStatus.Stopped:
					this.stop(session.id, controller.context);
					break;
			}
		}));
	}

	private onDidSpeechToTextSessionStart(controller: IVoiceChatSessionController, disposables: DisposableStore): void {
		this.voiceChatGettingReadyKey.set(false);
		this.voiceChatInProgressKey.set(true);

		switch (controller.context) {
			case 'inline':
				this.inlineVoiceChatInProgressKey.set(true);
				break;
			case 'quick':
				this.quickVoiceChatInProgressKey.set(true);
				break;
			case 'view':
				this.voiceChatInViewInProgressKey.set(true);
				break;
			case 'editor':
				this.voiceChatInEditorInProgressKey.set(true);
				break;
		}

		let dotCount = 0;

		const updatePlaceholder = () => {
			dotCount = (dotCount + 1) % 4;
			controller.setInputPlaceholder(`${localize('listening', "I'm listening")}${'.'.repeat(dotCount)}`);
			placeholderScheduler.schedule();
		};

		const placeholderScheduler = disposables.add(new RunOnceScheduler(updatePlaceholder, 500));
		updatePlaceholder();
	}

	stop(voiceChatSessionId = this.voiceChatSessionIds, context?: VoiceChatSessionContext): void {
		if (
			!this.currentVoiceChatSession ||
			this.voiceChatSessionIds !== voiceChatSessionId ||
			(context && this.currentVoiceChatSession.controller.context !== context)
		) {
			return;
		}

		this.currentVoiceChatSession.controller.clearInputPlaceholder();

		this.currentVoiceChatSession.disposables.dispose();
		this.currentVoiceChatSession = undefined;

		this.voiceChatGettingReadyKey.set(false);
		this.voiceChatInProgressKey.set(false);

		this.quickVoiceChatInProgressKey.set(false);
		this.inlineVoiceChatInProgressKey.set(false);
		this.voiceChatInViewInProgressKey.set(false);
		this.voiceChatInEditorInProgressKey.set(false);
	}

	accept(voiceChatSessionId = this.voiceChatSessionIds): void {
		if (
			!this.currentVoiceChatSession ||
			this.voiceChatSessionIds !== voiceChatSessionId
		) {
			return;
		}

		this.currentVoiceChatSession.controller.acceptInput();
	}
}

export class VoiceChatInChatViewAction extends Action2 {

	static readonly ID = 'workbench.action.chat.voiceChatInChatView';

	constructor() {
		super({
			id: VoiceChatInChatViewAction.ID,
			title: {
				value: localize('workbench.action.chat.voiceChatInView.label', "Voice Chat in Chat View"),
				original: 'Voice Chat in Chat View'
			},
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_PROVIDER_EXISTS, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'view');
		if (controller) {
			VoiceChatSessions.getInstance(instantiationService).start(controller);
		}
	}
}

export class InlineVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.inlineVoiceChat';

	constructor() {
		super({
			id: InlineVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.inlineVoiceChat', "Inline Voice Chat"),
				original: 'Inline Voice Chat'
			},
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_PROVIDER_EXISTS, ActiveEditorContext, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'inline');
		if (controller) {
			VoiceChatSessions.getInstance(instantiationService).start(controller);
		}
	}
}

export class QuickVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.quickVoiceChat';

	constructor() {
		super({
			id: QuickVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.quickVoiceChat.label', "Quick Voice Chat"),
				original: 'Quick Voice Chat'
			},
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_PROVIDER_EXISTS, CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'quick');
		if (controller) {
			VoiceChatSessions.getInstance(instantiationService).start(controller);
		}
	}
}

export class StartVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.startVoiceChat';

	constructor() {
		super({
			id: StartVoiceChatAction.ID,
			title: {
				value: localize('workbench.action.chat.startVoiceChat.label', "Use Microphone"),
				original: 'Use Microphone'
			},
			category: CHAT_CATEGORY,
			icon: Codicon.mic,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_GETTING_READY.negate(), CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST.negate()),
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS.negate(), CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS.negate(), CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS.negate()),
				group: 'navigation',
				order: -1
			}, {
				id: MENU_INLINE_CHAT_INPUT,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS.negate()),
				group: 'main',
				order: -1
			}]
		});
	}

	async run(accessor: ServicesAccessor, context: unknown): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const commandService = accessor.get(ICommandService);

		const widget = (context as IChatExecuteActionContext)?.widget;
		if (widget) {
			// if we already get a context when the action is executed
			// from a toolbar within the chat widget, then make sure
			// to move focus into the input field so that the controller
			// is properly retrieved
			// TODO@bpasero this will actually not work if the button
			// is clicked from the inline editor while focus is in a
			// chat input field in a view or picker
			widget.focusInput();
		}

		const controller = await VoiceChatSessionControllerFactory.create(accessor, 'focused');
		if (controller) {
			VoiceChatSessions.getInstance(instantiationService).start(controller);
		} else {
			// fallback to Quick Voice Chat command
			commandService.executeCommand(QuickVoiceChatAction.ID);
		}
	}
}

export class StopListeningAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListening';

	constructor() {
		super({
			id: StopListeningAction.ID,
			title: {
				value: localize('workbench.action.chat.stopListening.label', "Stop Listening"),
				original: 'Stop Listening'
			},
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_PROGRESS),
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_PROGRESS)
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

export class StopListeningInChatViewAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListeningInChatView';

	constructor() {
		super({
			id: StopListeningInChatViewAction.ID,
			title: {
				value: localize('workbench.action.chat.stopListeningInChatView.label', "Stop Listening"),
				original: 'Stop Listening'
			},
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS),
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS),
			icon: spinningLoading,
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS),
				group: 'navigation',
				order: -1
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop(undefined, 'view');
	}
}

export class StopListeningInChatEditorAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListeningInChatEditor';

	constructor() {
		super({
			id: StopListeningInChatEditorAction.ID,
			title: {
				value: localize('workbench.action.chat.stopListeningInChatEditor.label', "Stop Listening"),
				original: 'Stop Listening'
			},
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS),
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS),
			icon: spinningLoading,
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS),
				group: 'navigation',
				order: -1
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop(undefined, 'editor');
	}
}

export class StopListeningInQuickChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListeningInQuickChat';

	constructor() {
		super({
			id: StopListeningInQuickChatAction.ID,
			title: {
				value: localize('workbench.action.chat.stopListeningInQuickChat.label', "Stop Listening"),
				original: 'Stop Listening'
			},
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS),
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS),
			icon: spinningLoading,
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS),
				group: 'navigation',
				order: -1
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop(undefined, 'quick');
	}
}

export class StopListeningInInlineChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListeningInInlineChat';

	constructor() {
		super({
			id: StopListeningInInlineChatAction.ID,
			title: {
				value: localize('workbench.action.chat.stopListeningInInlineChat.label', "Stop Listening"),
				original: 'Stop Listening'
			},
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS),
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS),
			icon: spinningLoading,
			menu: [{
				id: MENU_INLINE_CHAT_INPUT,
				when: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS),
				group: 'main',
				order: -1
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop(undefined, 'inline');
	}
}

export class StopListeningAndSubmitAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListeningAndSubmit';

	constructor() {
		super({
			id: StopListeningAndSubmitAction.ID,
			title: {
				value: localize('workbench.action.chat.stopListeningAndSubmit.label', "Stop Listening and Submit"),
				original: 'Stop Listening and Submit'
			},
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(HasSpeechProvider, CONTEXT_VOICE_CHAT_IN_PROGRESS)
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).accept();
	}
}

registerThemingParticipant((theme, collector) => {
	let activeRecordingColor: Color | undefined;
	let activeRecordingDimmedColor: Color | undefined;
	if (theme.type === ColorScheme.LIGHT || theme.type === ColorScheme.DARK) {
		activeRecordingColor = theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND) ?? theme.getColor(focusBorder);
		activeRecordingDimmedColor = activeRecordingColor?.transparent(0.2);
	} else {
		activeRecordingColor = theme.getColor(contrastBorder);
		activeRecordingDimmedColor = theme.getColor(contrastBorder);
	}

	// Show a "microphone" icon when recording is in progress that glows via outline.
	collector.addRule(`
		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled),
		.monaco-workbench:not(.reduce-motion) .inline-chat .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled) {
			color: ${activeRecordingColor};
			outline: 1px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1s infinite;
			border-radius: 50%;
		}

		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::before,
		.monaco-workbench:not(.reduce-motion) .inline-chat .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::before {
			position: absolute;
			outline: 1px solid ${activeRecordingColor};
			outline-offset: 2px;
			border-radius: 50%;
			width: 16px;
			height: 16px;
		}

		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::after,
		.monaco-workbench:not(.reduce-motion) .inline-chat .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::after {
			content: '';
			position: absolute;
			outline: 1px solid ${activeRecordingDimmedColor};
			outline-offset: 3px;
			animation: pulseAnimation 1s infinite;
			border-radius: 50%;
			width: 16px;
			height: 16px;
		}

		@keyframes pulseAnimation {
			0% {
				outline-width: 1px;
			}
			50% {
				outline-width: 3px;
				outline-color: ${activeRecordingDimmedColor};
			}
			100% {
				outline-width: 1px;
			}
		}
	`);
});
