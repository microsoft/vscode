/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/voiceChatActions';
import { RunOnceScheduler, disposableTimeout } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { isNumber } from 'vs/base/common/types';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize, localize2 } from 'vs/nls';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ProgressLocation } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { contrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { spinningLoading, syncing } from 'vs/platform/theme/common/iconRegistry';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ACTIVITY_BAR_BADGE_BACKGROUND } from 'vs/workbench/common/theme';
import { AccessibilityVoiceSettingId, SpeechTimeoutDefault, accessibilityConfigurationNodeBase } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { CHAT_CATEGORY, stringifyItem } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatExecuteActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { CHAT_VIEW_ID, IChatWidget, IChatWidgetService, IQuickChatService, showChatView } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAgentLocation, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT, CONTEXT_CHAT_ENABLED, CONTEXT_RESPONSE, CONTEXT_RESPONSE_FILTERED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatService, KEYWORD_ACTIVIATION_SETTING_ID } from 'vs/workbench/contrib/chat/common/chatService';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IVoiceChatService } from 'vs/workbench/contrib/chat/common/voiceChat';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { HasSpeechProvider, ISpeechService, KeywordRecognitionStatus, SpeechToTextInProgress, SpeechToTextStatus, TextToSpeechInProgress } from 'vs/workbench/contrib/speech/common/speechService';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalChatContextKeys, TerminalChatController } from 'vs/workbench/contrib/terminal/browser/terminalContribExports';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

//#region Speech to Text

const CONTEXT_VOICE_CHAT_GETTING_READY = new RawContextKey<boolean>('voiceChatGettingReady', false, { type: 'boolean', description: localize('voiceChatGettingReady', "True when getting ready for receiving voice input from the microphone for voice chat.") });
const CONTEXT_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInProgress', false, { type: 'boolean', description: localize('voiceChatInProgress', "True when voice recording from microphone is in progress for voice chat.") });

const CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('quickVoiceChatInProgress', false, { type: 'boolean', description: localize('quickVoiceChatInProgress', "True when voice recording from microphone is in progress for quick chat.") });
const CONTEXT_INLINE_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('inlineVoiceChatInProgress', false, { type: 'boolean', description: localize('inlineVoiceChatInProgress', "True when voice recording from microphone is in progress for inline chat.") });
const CONTEXT_TERMINAL_VOICE_CHAT_IN_PROGRESS = new RawContextKey<boolean>('terminalVoiceChatInProgress', false, { type: 'boolean', description: localize('terminalVoiceChatInProgress', "True when voice recording from microphone is in progress for terminal chat.") });
const CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInViewInProgress', false, { type: 'boolean', description: localize('voiceChatInViewInProgress', "True when voice recording from microphone is in progress in the chat view.") });
const CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS = new RawContextKey<boolean>('voiceChatInEditorInProgress', false, { type: 'boolean', description: localize('voiceChatInEditorInProgress', "True when voice recording from microphone is in progress in the chat editor.") });

const CanVoiceChat = ContextKeyExpr.and(CONTEXT_CHAT_ENABLED, HasSpeechProvider);
const FocusInChatInput = ContextKeyExpr.or(CTX_INLINE_CHAT_FOCUSED, CONTEXT_IN_CHAT_INPUT);

const AnyChatRequestInProgress = ContextKeyExpr.or(CONTEXT_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST, TerminalChatContextKeys.requestActive);

type VoiceChatSessionContext = 'inline' | 'terminal' | 'quick' | 'view' | 'editor';

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
	static create(accessor: ServicesAccessor, context: 'terminal'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'focused'): Promise<IVoiceChatSessionController | undefined>;
	static create(accessor: ServicesAccessor, context: 'inline' | 'quick' | 'view' | 'terminal' | 'focused'): Promise<IVoiceChatSessionController | undefined>;
	static async create(accessor: ServicesAccessor, context: 'inline' | 'quick' | 'view' | 'terminal' | 'focused'): Promise<IVoiceChatSessionController | undefined> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const viewsService = accessor.get(IViewsService);
		const quickChatService = accessor.get(IQuickChatService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const editorService = accessor.get(IEditorService);
		const terminalService = accessor.get(ITerminalService);

		// Currently Focused Context
		if (context === 'focused') {

			// Try with the terminal chat
			const activeInstance = terminalService.activeInstance;
			if (activeInstance) {
				const terminalChat = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
				if (terminalChat?.hasFocus()) {
					return VoiceChatSessionControllerFactory.doCreateForTerminalChat(terminalChat);
				}
			}

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
					return VoiceChatSessionControllerFactory.doCreateForChatView(chatInput, viewsService);
				}

				if (layoutService.hasFocus(Parts.EDITOR_PART)) {
					return VoiceChatSessionControllerFactory.doCreateForChatEditor(chatInput, viewsService);
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
		if (context === 'view' || context === 'focused' /* fallback in case 'focused' was not successful */) {
			const chatView = await VoiceChatSessionControllerFactory.revealChatView(accessor);
			if (chatView) {
				return VoiceChatSessionControllerFactory.doCreateForChatView(chatView, viewsService);
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

		// Terminal Chat
		if (context === 'terminal') {
			const activeInstance = terminalService.activeInstance;
			if (activeInstance) {
				const terminalChat = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
				if (terminalChat) {
					return VoiceChatSessionControllerFactory.doCreateForTerminalChat(terminalChat);
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

	static async revealChatView(accessor: ServicesAccessor): Promise<IChatWidget | undefined> {
		const chatService = accessor.get(IChatService);
		const viewsService = accessor.get(IViewsService);
		if (chatService.isEnabled(ChatAgentLocation.Panel)) {
			return showChatView(viewsService);
		}

		return undefined;
	}

	private static doCreateForChatView(chatView: IChatWidget, viewsService: IViewsService): IVoiceChatSessionController {
		return VoiceChatSessionControllerFactory.doCreateForChatViewOrEditor('view', chatView, viewsService);
	}

	private static doCreateForChatEditor(chatView: IChatWidget, viewsService: IViewsService): IVoiceChatSessionController {
		return VoiceChatSessionControllerFactory.doCreateForChatViewOrEditor('editor', chatView, viewsService);
	}

	private static doCreateForChatViewOrEditor(context: 'view' | 'editor', chatView: IChatWidget, viewsService: IViewsService): IVoiceChatSessionController {
		return {
			context,
			onDidAcceptInput: chatView.onDidAcceptInput,
			// TODO@bpasero cancellation needs to work better for chat editors that are not view bound
			onDidCancelInput: Event.filter(viewsService.onDidChangeViewVisibility, e => e.id === CHAT_VIEW_ID),
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

	private static doCreateForTerminalChat(terminalChat: TerminalChatController): IVoiceChatSessionController {
		return {
			context: 'terminal',
			onDidAcceptInput: terminalChat.onDidAcceptInput,
			onDidCancelInput: terminalChat.onDidCancelInput,
			focusInput: () => terminalChat.focus(),
			acceptInput: () => terminalChat.acceptInput(),
			updateInput: text => terminalChat.updateInput(text, false),
			getInput: () => terminalChat.getInput(),
			setInputPlaceholder: text => terminalChat.setPlaceholder(text),
			clearInputPlaceholder: () => terminalChat.resetPlaceholder()
		};
	}
}

interface IVoiceChatSession {
	setTimeoutDisabled(disabled: boolean): void;

	accept(): void;
	stop(): void;
}

interface IActiveVoiceChatSession extends IVoiceChatSession {
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
	private terminalVoiceChatInProgressKey = CONTEXT_TERMINAL_VOICE_CHAT_IN_PROGRESS.bindTo(this.contextKeyService);
	private voiceChatInViewInProgressKey = CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS.bindTo(this.contextKeyService);
	private voiceChatInEditorInProgressKey = CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS.bindTo(this.contextKeyService);

	private currentVoiceChatSession: IActiveVoiceChatSession | undefined = undefined;
	private voiceChatSessionIds = 0;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IVoiceChatService private readonly voiceChatService: IVoiceChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async start(controller: IVoiceChatSessionController, context?: IChatExecuteActionContext): Promise<IVoiceChatSession> {

		// Stop running text-to-speech or speech-to-text sessions in chats
		this.stop();
		ChatSynthesizerSessions.getInstance(this.instantiationService).stop();

		let disableTimeout = false;

		const sessionId = ++this.voiceChatSessionIds;
		const session: IActiveVoiceChatSession = this.currentVoiceChatSession = {
			id: sessionId,
			controller,
			disposables: new DisposableStore(),
			setTimeoutDisabled: (disabled: boolean) => { disableTimeout = disabled; },
			accept: () => session.controller.acceptInput(),
			stop: () => this.stop(sessionId, controller.context)
		};

		const cts = new CancellationTokenSource();
		session.disposables.add(toDisposable(() => cts.dispose(true)));

		session.disposables.add(controller.onDidAcceptInput(() => this.stop(sessionId, controller.context)));
		session.disposables.add(controller.onDidCancelInput(() => this.stop(sessionId, controller.context)));

		controller.focusInput();

		this.voiceChatGettingReadyKey.set(true);

		const voiceChatSession = await this.voiceChatService.createVoiceChatSession(cts.token, { usesAgents: controller.context !== 'inline', model: context?.widget?.viewModel?.model });

		let inputValue = controller.getInput();

		let voiceChatTimeout = this.configurationService.getValue<number>(AccessibilityVoiceSettingId.SpeechTimeout);
		if (!isNumber(voiceChatTimeout) || voiceChatTimeout < 0) {
			voiceChatTimeout = SpeechTimeoutDefault;
		}

		const acceptTranscriptionScheduler = session.disposables.add(new RunOnceScheduler(() => session.controller.acceptInput(), voiceChatTimeout));
		session.disposables.add(voiceChatSession.onDidChange(({ status, text, waitingForInput }) => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			switch (status) {
				case SpeechToTextStatus.Started:
					this.onDidSpeechToTextSessionStart(controller, session.disposables);
					break;
				case SpeechToTextStatus.Recognizing:
					if (text) {
						session.controller.updateInput(inputValue ? [inputValue, text].join(' ') : text);
						if (voiceChatTimeout > 0 && context?.voice?.disableTimeout !== true && !disableTimeout) {
							acceptTranscriptionScheduler.cancel();
						}
					}
					break;
				case SpeechToTextStatus.Recognized:
					if (text) {
						inputValue = inputValue ? [inputValue, text].join(' ') : text;
						session.controller.updateInput(inputValue);
						if (voiceChatTimeout > 0 && context?.voice?.disableTimeout !== true && !waitingForInput && !disableTimeout) {
							acceptTranscriptionScheduler.schedule();
						}
					}
					break;
				case SpeechToTextStatus.Stopped:
					this.stop(session.id, controller.context);
					break;
			}
		}));

		return session;
	}

	private onDidSpeechToTextSessionStart(controller: IVoiceChatSessionController, disposables: DisposableStore): void {
		this.voiceChatGettingReadyKey.set(false);
		this.voiceChatInProgressKey.set(true);

		switch (controller.context) {
			case 'inline':
				this.inlineVoiceChatInProgressKey.set(true);
				break;
			case 'terminal':
				this.terminalVoiceChatInProgressKey.set(true);
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
		this.terminalVoiceChatInProgressKey.set(false);
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

export const VOICE_KEY_HOLD_THRESHOLD = 500;

async function startVoiceChatWithHoldMode(id: string, accessor: ServicesAccessor, target: 'inline' | 'quick' | 'view' | 'focused', context?: IChatExecuteActionContext): Promise<void> {
	const instantiationService = accessor.get(IInstantiationService);
	const keybindingService = accessor.get(IKeybindingService);

	const holdMode = keybindingService.enableKeybindingHoldMode(id);

	const controller = await VoiceChatSessionControllerFactory.create(accessor, target);
	if (!controller) {
		return;
	}

	const session = await VoiceChatSessions.getInstance(instantiationService).start(controller, context);

	let acceptVoice = false;
	const handle = disposableTimeout(() => {
		acceptVoice = true;
		session?.setTimeoutDisabled(true); // disable accept on timeout when hold mode runs for VOICE_KEY_HOLD_THRESHOLD
	}, VOICE_KEY_HOLD_THRESHOLD);
	await holdMode;
	handle.dispose();

	if (acceptVoice) {
		session.accept();
	}
}

class VoiceChatWithHoldModeAction extends Action2 {

	constructor(desc: Readonly<IAction2Options>, private readonly target: 'inline' | 'quick' | 'view') {
		super(desc);
	}

	run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		return startVoiceChatWithHoldMode(this.desc.id, accessor, this.target, context);
	}
}

export class VoiceChatInChatViewAction extends VoiceChatWithHoldModeAction {

	static readonly ID = 'workbench.action.chat.voiceChatInChatView';

	constructor() {
		super({
			id: VoiceChatInChatViewAction.ID,
			title: localize2('workbench.action.chat.voiceChatInView.label', "Voice Chat in View"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				CanVoiceChat,
				CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate() // disable when a chat request is in progress
			),
			f1: true
		}, 'view');
	}
}

export class HoldToVoiceChatInChatViewAction extends Action2 {

	static readonly ID = 'workbench.action.chat.holdToVoiceChatInChatView';

	constructor() {
		super({
			id: HoldToVoiceChatInChatViewAction.ID,
			title: localize2('workbench.action.chat.holdToVoiceChatInChatView.label', "Hold to Voice Chat in View"),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(
					CanVoiceChat,
					CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), 	// disable when a chat request is in progress
					FocusInChatInput?.negate(),					// when already in chat input, disable this action and prefer to start voice chat directly
					EditorContextKeys.focus.negate(), 			// do not steal the inline-chat keybinding
					NOTEBOOK_EDITOR_FOCUSED.negate()			// do not steal the notebook keybinding
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			}
		});
	}

	override async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {

		// The intent of this action is to provide 2 modes to align with what `Ctrlcmd+I` in inline chat:
		// - if the user press and holds, we start voice chat in the chat view
		// - if the user press and releases quickly enough, we just open the chat view without voice chat

		const instantiationService = accessor.get(IInstantiationService);
		const keybindingService = accessor.get(IKeybindingService);

		const holdMode = keybindingService.enableKeybindingHoldMode(HoldToVoiceChatInChatViewAction.ID);

		let session: IVoiceChatSession | undefined;
		const handle = disposableTimeout(async () => {
			const controller = await VoiceChatSessionControllerFactory.create(accessor, 'view');
			if (controller) {
				session = await VoiceChatSessions.getInstance(instantiationService).start(controller, context);
				session.setTimeoutDisabled(true);
			}
		}, VOICE_KEY_HOLD_THRESHOLD);

		(await VoiceChatSessionControllerFactory.revealChatView(accessor))?.focusInput();

		await holdMode;
		handle.dispose();

		if (session) {
			session.accept();
		}
	}
}

export class InlineVoiceChatAction extends VoiceChatWithHoldModeAction {

	static readonly ID = 'workbench.action.chat.inlineVoiceChat';

	constructor() {
		super({
			id: InlineVoiceChatAction.ID,
			title: localize2('workbench.action.chat.inlineVoiceChat', "Inline Voice Chat"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				CanVoiceChat,
				ActiveEditorContext,
				CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate() // disable when a chat request is in progress
			),
			f1: true
		}, 'inline');
	}
}

export class QuickVoiceChatAction extends VoiceChatWithHoldModeAction {

	static readonly ID = 'workbench.action.chat.quickVoiceChat';

	constructor() {
		super({
			id: QuickVoiceChatAction.ID,
			title: localize2('workbench.action.chat.quickVoiceChat.label', "Quick Voice Chat"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				CanVoiceChat,
				CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate() // disable when a chat request is in progress
			),
			f1: true
		}, 'quick');
	}
}

export class StartVoiceChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.startVoiceChat';

	constructor() {
		super({
			id: StartVoiceChatAction.ID,
			title: localize2('workbench.action.chat.startVoiceChat.label', "Start Voice Chat"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(
					FocusInChatInput,							// scope this action to chat input fields only
					EditorContextKeys.focus.negate(), 			// do not steal the editor inline-chat keybinding
					NOTEBOOK_EDITOR_FOCUSED.negate()			// do not steal the notebook inline-chat keybinding
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			icon: Codicon.mic,
			precondition: ContextKeyExpr.and(
				CanVoiceChat,
				CONTEXT_VOICE_CHAT_GETTING_READY.negate(),		// disable when voice chat is getting ready
				AnyChatRequestInProgress?.negate(),				// disable when any chat request is in progress
				SpeechToTextInProgress.negate()					// disable when speech to text is in progress
			),
			menu: [{
				id: MenuId.ChatExecute,
				when: ContextKeyExpr.and(
					HasSpeechProvider,
					TextToSpeechInProgress.negate(),					// hide when text to speech is in progress
					CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS.negate(),	// hide when voice chat is in progress
					CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS.negate(),		// 				||
					CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS.negate(),	// 				||
				),
				group: 'navigation',
				order: -1
			}, {
				id: MenuId.for('terminalChatInput'),
				when: ContextKeyExpr.and(
					HasSpeechProvider,
					TextToSpeechInProgress.negate(),					// hide when text to speech is in progress
					CONTEXT_TERMINAL_VOICE_CHAT_IN_PROGRESS.negate(),	// hide when voice chat is in progress
				),
				group: 'navigation',
				order: -1
			}]
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		const widget = context?.widget;
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

		return startVoiceChatWithHoldMode(this.desc.id, accessor, 'focused', context);
	}
}

const InstallingSpeechProvider = new RawContextKey<boolean>('installingSpeechProvider', false, true);

abstract class BaseInstallSpeechProviderAction extends Action2 {

	private static readonly SPEECH_EXTENSION_ID = 'ms-vscode.vscode-speech';

	async run(accessor: ServicesAccessor): Promise<void> {
		const contextKeyService = accessor.get(IContextKeyService);
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		try {
			InstallingSpeechProvider.bindTo(contextKeyService).set(true);
			await extensionsWorkbenchService.install(BaseInstallSpeechProviderAction.SPEECH_EXTENSION_ID, {
				justification: this.getJustification(),
				enable: true
			}, ProgressLocation.Notification);
		} finally {
			InstallingSpeechProvider.bindTo(contextKeyService).set(false);
		}
	}

	protected abstract getJustification(): string;
}

export class InstallSpeechProviderForVoiceChatAction extends BaseInstallSpeechProviderAction {

	static readonly ID = 'workbench.action.chat.installProviderForVoiceChat';

	constructor() {
		super({
			id: InstallSpeechProviderForVoiceChatAction.ID,
			title: localize2('workbench.action.chat.installProviderForVoiceChat.label', "Start Voice Chat"),
			icon: Codicon.mic,
			precondition: InstallingSpeechProvider.negate(),
			menu: [{
				id: MenuId.ChatExecute,
				when: HasSpeechProvider.negate(),
				group: 'navigation',
				order: -1
			}, {
				id: MenuId.for('terminalChatInput'),
				when: HasSpeechProvider.negate(),
				group: 'navigation',
				order: -1
			}]
		});
	}

	protected getJustification(): string {
		return localize('installProviderForVoiceChat.justification', "Microphone support requires this extension.");
	}
}

class BaseStopListeningAction extends Action2 {

	constructor(
		desc: { id: string; icon?: ThemeIcon; f1?: boolean },
		private readonly target: 'inline' | 'terminal' | 'quick' | 'view' | 'editor' | undefined,
		context: RawContextKey<boolean>,
		menu: MenuId | undefined,
	) {
		super({
			...desc,
			title: localize2('workbench.action.chat.stopListening.label', "Stop Listening"),
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyCode.Escape
			},
			precondition: ContextKeyExpr.and(CanVoiceChat, context),
			menu: menu ? [{
				id: menu,
				when: ContextKeyExpr.and(CanVoiceChat, context),
				group: 'navigation',
				order: -1
			}] : undefined
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop(undefined, this.target);
	}
}

export class StopListeningAction extends BaseStopListeningAction {

	static readonly ID = 'workbench.action.chat.stopListening';

	constructor() {
		super({ id: StopListeningAction.ID, f1: true }, undefined, CONTEXT_VOICE_CHAT_IN_PROGRESS, undefined);
	}
}

export class StopListeningInChatViewAction extends BaseStopListeningAction {

	static readonly ID = 'workbench.action.chat.stopListeningInChatView';

	constructor() {
		super({ id: StopListeningInChatViewAction.ID, icon: spinningLoading }, 'view', CONTEXT_VOICE_CHAT_IN_VIEW_IN_PROGRESS, MenuId.ChatExecute);
	}
}

export class StopListeningInChatEditorAction extends BaseStopListeningAction {

	static readonly ID = 'workbench.action.chat.stopListeningInChatEditor';

	constructor() {
		super({ id: StopListeningInChatEditorAction.ID, icon: spinningLoading }, 'editor', CONTEXT_VOICE_CHAT_IN_EDITOR_IN_PROGRESS, MenuId.ChatExecute);
	}
}

export class StopListeningInQuickChatAction extends BaseStopListeningAction {

	static readonly ID = 'workbench.action.chat.stopListeningInQuickChat';

	constructor() {
		super({ id: StopListeningInQuickChatAction.ID, icon: spinningLoading }, 'quick', CONTEXT_QUICK_VOICE_CHAT_IN_PROGRESS, MenuId.ChatExecute);
	}
}

export class StopListeningInTerminalChatAction extends BaseStopListeningAction {

	static readonly ID = 'workbench.action.chat.stopListeningInTerminalChat';

	constructor() {
		super({ id: StopListeningInTerminalChatAction.ID, icon: spinningLoading }, 'terminal', CONTEXT_TERMINAL_VOICE_CHAT_IN_PROGRESS, MenuId.for('terminalChatInput'));
	}
}

export class StopListeningAndSubmitAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListeningAndSubmit';

	constructor() {
		super({
			id: StopListeningAndSubmitAction.ID,
			title: localize2('workbench.action.chat.stopListeningAndSubmit.label', "Stop Listening and Submit"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: FocusInChatInput,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			precondition: ContextKeyExpr.and(CanVoiceChat, CONTEXT_VOICE_CHAT_IN_PROGRESS)
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).accept();
	}
}

//#endregion

//#region Text to Speech

class ChatSynthesizerSessions {

	private static instance: ChatSynthesizerSessions | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService): ChatSynthesizerSessions {
		if (!ChatSynthesizerSessions.instance) {
			ChatSynthesizerSessions.instance = instantiationService.createInstance(ChatSynthesizerSessions);
		}

		return ChatSynthesizerSessions.instance;
	}

	private activeSession: CancellationTokenSource | undefined = undefined;

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async start(text: string): Promise<void> {

		// Stop running text-to-speech or speech-to-text sessions in chats
		this.stop();
		VoiceChatSessions.getInstance(this.instantiationService).stop();

		const activeSession = this.activeSession = new CancellationTokenSource();

		const session = await this.speechService.createTextToSpeechSession(activeSession.token, 'chat');
		session.synthesize(text);
	}

	stop(): void {
		this.activeSession?.dispose(true);
		this.activeSession = undefined;
	}
}

export class InstallSpeechProviderForSynthesizeChatAction extends BaseInstallSpeechProviderAction {

	static readonly ID = 'workbench.action.chat.installProviderForSynthesis';

	constructor() {
		super({
			id: InstallSpeechProviderForSynthesizeChatAction.ID,
			title: localize2('workbench.action.chat.installProviderForSynthesis.label', "Read Aloud"),
			icon: Codicon.unmute,
			precondition: InstallingSpeechProvider.negate(),
			menu: [{
				id: MenuId.ChatMessageTitle,
				when: HasSpeechProvider.negate(),
				group: 'navigation'
			}]
		});
	}

	protected getJustification(): string {
		return localize('installProviderForSynthesis.justification', "Speaker support requires this extension.");
	}
}

export class ReadChatItemAloud extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.readChatItemAloud',
			title: localize2('workbench.action.chat.readChatItemAloud', "Read Aloud"),
			f1: false,
			icon: Codicon.unmute,
			precondition: CanVoiceChat,
			menu: {
				id: MenuId.ChatMessageTitle,
				when: ContextKeyExpr.and(
					CanVoiceChat,
					CONTEXT_RESPONSE,					// only for responses
					TextToSpeechInProgress.negate(),	// but not when already in progress
					CONTEXT_RESPONSE_FILTERED.negate()	// and not when response is filtered
				),
				group: 'navigation'
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const item = args[0];
		if (!isResponseVM(item)) {
			return;
		}

		ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).start(stringifyItem(item, false));
	}
}

export class StopReadAloud extends Action2 {

	static readonly ID = 'workbench.action.speech.stopReadAloud';

	constructor() {
		super({
			id: StopReadAloud.ID,
			icon: syncing,
			title: localize2('workbench.action.speech.stopReadAloud', "Stop Reading Aloud"),
			f1: true,
			category: CHAT_CATEGORY,
			precondition: TextToSpeechInProgress,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyCode.Escape,
			},
			menu: [
				{
					id: MenuId.ChatExecute,
					when: TextToSpeechInProgress,
					group: 'navigation',
					order: -1
				},
				{
					id: MenuId.for('terminalChatInput'),
					when: TextToSpeechInProgress,
					group: 'navigation',
					order: -1
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

export class StopReadChatItemAloud extends Action2 {

	static readonly ID = 'workbench.action.chat.stopRadChatItemAloud';

	constructor() {
		super({
			id: StopReadChatItemAloud.ID,
			icon: Codicon.mute,
			title: localize2('workbench.action.chat.stopRadChatItemAloud', "Stop Reading Aloud"),
			precondition: TextToSpeechInProgress,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyCode.Escape,
			},
			menu: [
				{
					id: MenuId.ChatMessageTitle,
					when: ContextKeyExpr.and(
						TextToSpeechInProgress,				// only when in progress
						CONTEXT_RESPONSE,					// only for responses
						CONTEXT_RESPONSE_FILTERED.negate()	// but not when response is filtered
					),
					group: 'navigation'
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

//#endregion

//#region Keyword Recognition

function supportsKeywordActivation(configurationService: IConfigurationService, speechService: ISpeechService, chatAgentService: IChatAgentService): boolean {
	if (!speechService.hasSpeechProvider || !chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)) {
		return false;
	}

	const value = configurationService.getValue(KEYWORD_ACTIVIATION_SETTING_ID);

	return typeof value === 'string' && value !== KeywordActivationContribution.SETTINGS_VALUE.OFF;
}

export class KeywordActivationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.keywordActivation';

	static SETTINGS_VALUE = {
		OFF: 'off',
		INLINE_CHAT: 'inlineChat',
		QUICK_CHAT: 'quickChat',
		VIEW_CHAT: 'chatInView',
		CHAT_IN_CONTEXT: 'chatInContext'
	};

	private activeSession: CancellationTokenSource | undefined = undefined;

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IHostService private readonly hostService: IHostService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
	) {
		super();

		this._register(instantiationService.createInstance(KeywordActivationStatusEntry));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(Event.runAndSubscribe(this.speechService.onDidChangeHasSpeechProvider, () => {
			this.updateConfiguration();
			this.handleKeywordActivation();
		}));

		const onDidAddDefaultAgent = this._register(this.chatAgentService.onDidChangeAgents(() => {
			if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)) {
				this.updateConfiguration();
				this.handleKeywordActivation();

				onDidAddDefaultAgent.dispose();
			}
		}));

		this._register(this.speechService.onDidStartSpeechToTextSession(() => this.handleKeywordActivation()));
		this._register(this.speechService.onDidEndSpeechToTextSession(() => this.handleKeywordActivation()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(KEYWORD_ACTIVIATION_SETTING_ID)) {
				this.handleKeywordActivation();
			}
		}));
	}

	private updateConfiguration(): void {
		if (!this.speechService.hasSpeechProvider || !this.chatAgentService.getDefaultAgent(ChatAgentLocation.Panel)) {
			return; // these settings require a speech and chat provider
		}

		const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		registry.registerConfiguration({
			...accessibilityConfigurationNodeBase,
			properties: {
				[KEYWORD_ACTIVIATION_SETTING_ID]: {
					'type': 'string',
					'enum': [
						KeywordActivationContribution.SETTINGS_VALUE.OFF,
						KeywordActivationContribution.SETTINGS_VALUE.VIEW_CHAT,
						KeywordActivationContribution.SETTINGS_VALUE.QUICK_CHAT,
						KeywordActivationContribution.SETTINGS_VALUE.INLINE_CHAT,
						KeywordActivationContribution.SETTINGS_VALUE.CHAT_IN_CONTEXT
					],
					'enumDescriptions': [
						localize('voice.keywordActivation.off', "Keyword activation is disabled."),
						localize('voice.keywordActivation.chatInView', "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the chat view."),
						localize('voice.keywordActivation.quickChat', "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the quick chat."),
						localize('voice.keywordActivation.inlineChat', "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the active editor if possible."),
						localize('voice.keywordActivation.chatInContext', "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the active editor or view depending on keyboard focus.")
					],
					'description': localize('voice.keywordActivation', "Controls whether the keyword phrase 'Hey Code' is recognized to start a voice chat session. Enabling this will start recording from the microphone but the audio is processed locally and never sent to a server."),
					'default': 'off',
					'tags': ['accessibility']
				}
			}
		});
	}

	private handleKeywordActivation(): void {
		const enabled =
			supportsKeywordActivation(this.configurationService, this.speechService, this.chatAgentService) &&
			!this.speechService.hasActiveSpeechToTextSession;
		if (
			(enabled && this.activeSession) ||
			(!enabled && !this.activeSession)
		) {
			return; // already running or stopped
		}

		// Start keyword activation
		if (enabled) {
			this.enableKeywordActivation();
		}

		// Stop keyword activation
		else {
			this.disableKeywordActivation();
		}
	}

	private async enableKeywordActivation(): Promise<void> {
		const session = this.activeSession = new CancellationTokenSource();
		const result = await this.speechService.recognizeKeyword(session.token);
		if (session.token.isCancellationRequested || session !== this.activeSession) {
			return; // cancelled
		}

		this.activeSession = undefined;

		if (result === KeywordRecognitionStatus.Recognized) {
			if (this.hostService.hasFocus) {
				this.commandService.executeCommand(this.getKeywordCommand());
			}

			// Immediately start another keyboard activation session
			// because we cannot assume that the command we execute
			// will trigger a speech recognition session.

			this.handleKeywordActivation();
		}
	}

	private getKeywordCommand(): string {
		const setting = this.configurationService.getValue(KEYWORD_ACTIVIATION_SETTING_ID);
		switch (setting) {
			case KeywordActivationContribution.SETTINGS_VALUE.INLINE_CHAT:
				return InlineVoiceChatAction.ID;
			case KeywordActivationContribution.SETTINGS_VALUE.QUICK_CHAT:
				return QuickVoiceChatAction.ID;
			case KeywordActivationContribution.SETTINGS_VALUE.CHAT_IN_CONTEXT: {
				const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
				if (activeCodeEditor?.hasWidgetFocus()) {
					return InlineVoiceChatAction.ID;
				}
			}
			default:
				return VoiceChatInChatViewAction.ID;
		}
	}

	private disableKeywordActivation(): void {
		this.activeSession?.dispose(true);
		this.activeSession = undefined;
	}

	override dispose(): void {
		this.activeSession?.dispose();

		super.dispose();
	}
}

class KeywordActivationStatusEntry extends Disposable {

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	private static STATUS_NAME = localize('keywordActivation.status.name', "Voice Keyword Activation");
	private static STATUS_COMMAND = 'keywordActivation.status.command';
	private static STATUS_ACTIVE = localize('keywordActivation.status.active', "Listening to 'Hey Code'...");
	private static STATUS_INACTIVE = localize('keywordActivation.status.inactive', "Waiting for voice chat to end...");

	constructor(
		@ISpeechService private readonly speechService: ISpeechService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();

		this._register(CommandsRegistry.registerCommand(KeywordActivationStatusEntry.STATUS_COMMAND, () => this.commandService.executeCommand('workbench.action.openSettings', KEYWORD_ACTIVIATION_SETTING_ID)));

		this.registerListeners();
		this.updateStatusEntry();
	}

	private registerListeners(): void {
		this._register(this.speechService.onDidStartKeywordRecognition(() => this.updateStatusEntry()));
		this._register(this.speechService.onDidEndKeywordRecognition(() => this.updateStatusEntry()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(KEYWORD_ACTIVIATION_SETTING_ID)) {
				this.updateStatusEntry();
			}
		}));
	}

	private updateStatusEntry(): void {
		const visible = supportsKeywordActivation(this.configurationService, this.speechService, this.chatAgentService);
		if (visible) {
			if (!this.entry.value) {
				this.createStatusEntry();
			}

			this.updateStatusLabel();
		} else {
			this.entry.clear();
		}
	}

	private createStatusEntry() {
		this.entry.value = this.statusbarService.addEntry(this.getStatusEntryProperties(), 'status.voiceKeywordActivation', StatusbarAlignment.RIGHT, 103);
	}

	private getStatusEntryProperties(): IStatusbarEntry {
		return {
			name: KeywordActivationStatusEntry.STATUS_NAME,
			text: this.speechService.hasActiveKeywordRecognition ? '$(mic-filled)' : '$(mic)',
			tooltip: this.speechService.hasActiveKeywordRecognition ? KeywordActivationStatusEntry.STATUS_ACTIVE : KeywordActivationStatusEntry.STATUS_INACTIVE,
			ariaLabel: this.speechService.hasActiveKeywordRecognition ? KeywordActivationStatusEntry.STATUS_ACTIVE : KeywordActivationStatusEntry.STATUS_INACTIVE,
			command: KeywordActivationStatusEntry.STATUS_COMMAND,
			kind: 'prominent',
			showInAllWindows: true
		};
	}

	private updateStatusLabel(): void {
		this.entry.value?.update(this.getStatusEntryProperties());
	}
}

//#endregion

registerThemingParticipant((theme, collector) => {
	let activeRecordingColor: Color | undefined;
	let activeRecordingDimmedColor: Color | undefined;
	if (theme.type === ColorScheme.LIGHT || theme.type === ColorScheme.DARK) {
		activeRecordingColor = theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND) ?? theme.getColor(focusBorder);
		activeRecordingDimmedColor = activeRecordingColor?.transparent(0.38);
	} else {
		activeRecordingColor = theme.getColor(contrastBorder);
		activeRecordingDimmedColor = theme.getColor(contrastBorder);
	}

	// Show a "microphone" or "pulse" icon when speech-to-text or text-to-speech is in progress that glows via outline.
	collector.addRule(`
		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled),
		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled) {
			color: ${activeRecordingColor};
			outline: 1px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1s infinite;
			border-radius: 50%;
		}

		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::before,
		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::before {
			position: absolute;
			outline: 1px solid ${activeRecordingColor};
			outline-offset: 2px;
			border-radius: 50%;
			width: 16px;
			height: 16px;
		}

		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::after,
		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::after {
			outline: 2px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1500ms cubic-bezier(0.75, 0, 0.25, 1) infinite;
		}

		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::before,
		.monaco-workbench:not(.reduce-motion) .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::before {
			position: absolute;
			outline: 1px solid ${activeRecordingColor};
			outline-offset: 2px;
			border-radius: 50%;
			width: 16px;
			height: 16px;
		}

		@keyframes pulseAnimation {
			0% {
				outline-width: 2px;
			}
			62% {
				outline-width: 5px;
				outline-color: ${activeRecordingDimmedColor};
			}
			100% {
				outline-width: 2px;
			}
		}
	`);
});
