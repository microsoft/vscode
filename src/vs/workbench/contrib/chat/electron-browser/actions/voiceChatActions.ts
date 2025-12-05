/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { RunOnceScheduler, disposableTimeout, raceCancellation } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Color } from '../../../../../base/common/color.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../../base/common/types.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, IAction2Options, MenuId } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { contrastBorder, focusBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { spinningLoading, syncing } from '../../../../../platform/theme/common/iconRegistry.js';
import { isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { registerThemingParticipant } from '../../../../../platform/theme/common/themeService.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND } from '../../../../common/theme.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { AccessibilityVoiceSettingId, SpeechTimeoutDefault, accessibilityConfigurationNodeBase } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { InlineChatController } from '../../../inlineChat/browser/inlineChatController.js';
import { CTX_INLINE_CHAT_FOCUSED, MENU_INLINE_CHAT_WIDGET_SECONDARY } from '../../../inlineChat/common/inlineChat.js';
import { NOTEBOOK_EDITOR_FOCUSED } from '../../../notebook/common/notebookContextKeys.js';
import { CONTEXT_SETTINGS_EDITOR } from '../../../preferences/common/preferences.js';
import { SearchContext } from '../../../search/common/constants.js';
import { TextToSpeechInProgress as GlobalTextToSpeechInProgress, HasSpeechProvider, ISpeechService, KeywordRecognitionStatus, SpeechToTextInProgress, SpeechToTextStatus, TextToSpeechStatus } from '../../../speech/common/speechService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IChatExecuteActionContext } from '../../browser/actions/chatExecuteActions.js';
import { IChatWidget, IChatWidgetService, IQuickChatService } from '../../browser/chat.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { KEYWORD_ACTIVIATION_SETTING_ID } from '../../common/chatService.js';
import { ChatResponseViewModel, IChatResponseViewModel, isResponseVM } from '../../common/chatViewModel.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { VoiceChatInProgress as GlobalVoiceChatInProgress, IVoiceChatService } from '../../common/voiceChatService.js';
import './media/voiceChatActions.css';

//#region Speech to Text

type VoiceChatSessionContext = 'view' | 'inline' | 'quick' | 'editor';
const VoiceChatSessionContexts: VoiceChatSessionContext[] = ['view', 'inline', 'quick', 'editor'];

// Global Context Keys (set on global context key service)
const CanVoiceChat = ContextKeyExpr.and(ChatContextKeys.enabled, HasSpeechProvider);
const FocusInChatInput = ContextKeyExpr.or(CTX_INLINE_CHAT_FOCUSED, ChatContextKeys.inChatInput);
const AnyChatRequestInProgress = ChatContextKeys.requestInProgress;

// Scoped Context Keys (set on per-chat-context scoped context key service)
const ScopedVoiceChatGettingReady = new RawContextKey<boolean>('scopedVoiceChatGettingReady', false, { type: 'boolean', description: localize('scopedVoiceChatGettingReady', "True when getting ready for receiving voice input from the microphone for voice chat. This key is only defined scoped, per chat context.") });
const ScopedVoiceChatInProgress = new RawContextKey<VoiceChatSessionContext | undefined>('scopedVoiceChatInProgress', undefined, { type: 'string', description: localize('scopedVoiceChatInProgress', "Defined as a location where voice recording from microphone is in progress for voice chat. This key is only defined scoped, per chat context.") });
const AnyScopedVoiceChatInProgress = ContextKeyExpr.or(...VoiceChatSessionContexts.map(context => ScopedVoiceChatInProgress.isEqualTo(context)));

enum VoiceChatSessionState {
	Stopped = 1,
	GettingReady,
	Started
}

interface IVoiceChatSessionController {

	readonly onDidAcceptInput: Event<unknown>;
	readonly onDidHideInput: Event<unknown>;

	readonly context: VoiceChatSessionContext;
	readonly scopedContextKeyService: IContextKeyService;

	updateState(state: VoiceChatSessionState): void;

	focusInput(): void;
	acceptInput(): Promise<IChatResponseModel | undefined>;
	updateInput(text: string): void;
	getInput(): string;

	setInputPlaceholder(text: string): void;
	clearInputPlaceholder(): void;
}

class VoiceChatSessionControllerFactory {

	static async create(accessor: ServicesAccessor, context: 'view' | 'inline' | 'quick' | 'focused'): Promise<IVoiceChatSessionController | undefined> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const quickChatService = accessor.get(IQuickChatService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const editorService = accessor.get(IEditorService);

		switch (context) {
			case 'focused': {
				const controller = VoiceChatSessionControllerFactory.doCreateForFocusedChat(chatWidgetService, layoutService);
				return controller ?? VoiceChatSessionControllerFactory.create(accessor, 'view'); // fallback to 'view'
			}
			case 'view': {
				const chatWidget = await chatWidgetService.revealWidget();
				if (chatWidget) {
					return VoiceChatSessionControllerFactory.doCreateForChatWidget('view', chatWidget);
				}
				break;
			}
			case 'inline': {
				const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
				if (activeCodeEditor) {
					const inlineChat = InlineChatController.get(activeCodeEditor);
					if (inlineChat) {
						if (!inlineChat.isActive) {
							inlineChat.run();
						}
						return VoiceChatSessionControllerFactory.doCreateForChatWidget('inline', inlineChat.widget.chatWidget);
					}
				}
				break;
			}
			case 'quick': {
				quickChatService.open(); // this will populate focused chat widget in the chat widget service
				return VoiceChatSessionControllerFactory.create(accessor, 'focused');
			}
		}

		return undefined;
	}

	private static doCreateForFocusedChat(chatWidgetService: IChatWidgetService, layoutService: IWorkbenchLayoutService): IVoiceChatSessionController | undefined {
		const chatWidget = chatWidgetService.lastFocusedWidget;
		if (chatWidget?.hasInputFocus()) {

			// Figure out the context of the chat widget by asking
			// layout service for the part that has focus. Unfortunately
			// there is no better way because the widget does not know
			// its location.

			let context: VoiceChatSessionContext;
			if (layoutService.hasFocus(Parts.EDITOR_PART)) {
				context = chatWidget.location === ChatAgentLocation.Chat ? 'editor' : 'inline';
			} else if (
				[Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.TITLEBAR_PART, Parts.STATUSBAR_PART, Parts.BANNER_PART, Parts.ACTIVITYBAR_PART].some(part => layoutService.hasFocus(part))
			) {
				context = 'view';
			} else {
				context = 'quick';
			}

			return VoiceChatSessionControllerFactory.doCreateForChatWidget(context, chatWidget);
		}

		return undefined;
	}

	private static createChatContextKeyController(contextKeyService: IContextKeyService, context: VoiceChatSessionContext): (state: VoiceChatSessionState) => void {
		const contextVoiceChatGettingReady = ScopedVoiceChatGettingReady.bindTo(contextKeyService);
		const contextVoiceChatInProgress = ScopedVoiceChatInProgress.bindTo(contextKeyService);

		return (state: VoiceChatSessionState) => {
			switch (state) {
				case VoiceChatSessionState.GettingReady:
					contextVoiceChatGettingReady.set(true);
					contextVoiceChatInProgress.reset();
					break;
				case VoiceChatSessionState.Started:
					contextVoiceChatGettingReady.reset();
					contextVoiceChatInProgress.set(context);
					break;
				case VoiceChatSessionState.Stopped:
					contextVoiceChatGettingReady.reset();
					contextVoiceChatInProgress.reset();
					break;
			}
		};
	}

	private static doCreateForChatWidget(context: VoiceChatSessionContext, chatWidget: IChatWidget): IVoiceChatSessionController {
		return {
			context,
			scopedContextKeyService: chatWidget.scopedContextKeyService,
			onDidAcceptInput: chatWidget.onDidAcceptInput,
			onDidHideInput: chatWidget.onDidHide,
			focusInput: () => chatWidget.focusInput(),
			acceptInput: () => chatWidget.acceptInput(undefined, { isVoiceInput: true }),
			updateInput: text => chatWidget.setInput(text),
			getInput: () => chatWidget.getInput(),
			setInputPlaceholder: text => chatWidget.setInputPlaceholder(text),
			clearInputPlaceholder: () => chatWidget.resetInputPlaceholder(),
			updateState: VoiceChatSessionControllerFactory.createChatContextKeyController(chatWidget.scopedContextKeyService, context)
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

	hasRecognizedInput: boolean;
}

class VoiceChatSessions {

	private static instance: VoiceChatSessions | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService): VoiceChatSessions {
		if (!VoiceChatSessions.instance) {
			VoiceChatSessions.instance = instantiationService.createInstance(VoiceChatSessions);
		}

		return VoiceChatSessions.instance;
	}

	private currentVoiceChatSession: IActiveVoiceChatSession | undefined = undefined;
	private voiceChatSessionIds = 0;

	constructor(
		@IVoiceChatService private readonly voiceChatService: IVoiceChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
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
			hasRecognizedInput: false,
			disposables: new DisposableStore(),
			setTimeoutDisabled: (disabled: boolean) => { disableTimeout = disabled; },
			accept: () => this.accept(sessionId),
			stop: () => this.stop(sessionId, controller.context)
		};

		const cts = new CancellationTokenSource();
		session.disposables.add(toDisposable(() => cts.dispose(true)));

		session.disposables.add(controller.onDidAcceptInput(() => this.stop(sessionId, controller.context)));
		session.disposables.add(controller.onDidHideInput(() => this.stop(sessionId, controller.context)));

		controller.focusInput();

		controller.updateState(VoiceChatSessionState.GettingReady);

		const voiceChatSession = await this.voiceChatService.createVoiceChatSession(cts.token, { usesAgents: controller.context !== 'inline', model: context?.widget?.viewModel?.model });

		let inputValue = controller.getInput();

		let voiceChatTimeout = this.configurationService.getValue<number>(AccessibilityVoiceSettingId.SpeechTimeout);
		if (!isNumber(voiceChatTimeout) || voiceChatTimeout < 0) {
			voiceChatTimeout = SpeechTimeoutDefault;
		}

		const acceptTranscriptionScheduler = session.disposables.add(new RunOnceScheduler(() => this.accept(sessionId), voiceChatTimeout));
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
						session.hasRecognizedInput = true;
						session.controller.updateInput(inputValue ? [inputValue, text].join(' ') : text);
						if (voiceChatTimeout > 0 && context?.voice?.disableTimeout !== true && !disableTimeout) {
							acceptTranscriptionScheduler.cancel();
						}
					}
					break;
				case SpeechToTextStatus.Recognized:
					if (text) {
						session.hasRecognizedInput = true;
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
		controller.updateState(VoiceChatSessionState.Started);

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

		this.currentVoiceChatSession.controller.updateState(VoiceChatSessionState.Stopped);

		this.currentVoiceChatSession.disposables.dispose();
		this.currentVoiceChatSession = undefined;
	}

	async accept(voiceChatSessionId = this.voiceChatSessionIds): Promise<void> {
		if (
			!this.currentVoiceChatSession ||
			this.voiceChatSessionIds !== voiceChatSessionId
		) {
			return;
		}

		if (!this.currentVoiceChatSession.hasRecognizedInput) {
			// If we have an active session but without recognized
			// input, we do not want to just accept the input that
			// was maybe typed before. But we still want to stop the
			// voice session because `acceptInput` would do that.
			this.stop(voiceChatSessionId, this.currentVoiceChatSession.controller.context);
			return;
		}

		const controller = this.currentVoiceChatSession.controller;
		const response = await controller.acceptInput();
		if (!response) {
			return;
		}
		const autoSynthesize = this.configurationService.getValue<'on' | 'off'>(AccessibilityVoiceSettingId.AutoSynthesize);
		if (autoSynthesize === 'on' || (autoSynthesize !== 'off' && !this.accessibilityService.isScreenReaderOptimized())) {
			let context: IVoiceChatSessionController | 'focused';
			if (controller.context === 'inline') {
				// This is ugly, but the lightweight inline chat turns into
				// a different widget as soon as a response comes in, so we fallback to
				// picking up from the focused chat widget
				context = 'focused';
			} else {
				context = controller;
			}
			ChatSynthesizerSessions.getInstance(this.instantiationService).start(this.instantiationService.invokeFunction(accessor => ChatSynthesizerSessionController.create(accessor, context, response)));
		}
	}
}

export const VOICE_KEY_HOLD_THRESHOLD = 500;

async function startVoiceChatWithHoldMode(id: string, accessor: ServicesAccessor, target: 'view' | 'inline' | 'quick' | 'focused', context?: IChatExecuteActionContext): Promise<void> {
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

	constructor(desc: Readonly<IAction2Options>, private readonly target: 'view' | 'inline' | 'quick') {
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
			title: localize2('workbench.action.chat.voiceChatInView.label', "Voice Chat in Chat View"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(
				CanVoiceChat,
				ChatContextKeys.requestInProgress.negate() // disable when a chat request is in progress
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
			title: localize2('workbench.action.chat.holdToVoiceChatInChatView.label', "Hold to Voice Chat in Chat View"),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(
					CanVoiceChat,
					ChatContextKeys.requestInProgress.negate(), 	// disable when a chat request is in progress
					FocusInChatInput?.negate(),						// when already in chat input, disable this action and prefer to start voice chat directly
					EditorContextKeys.focus.negate(), 				// do not steal the inline-chat keybinding
					NOTEBOOK_EDITOR_FOCUSED.negate(),				// do not steal the notebook keybinding
					SearchContext.SearchViewFocusedKey.negate(),	// do not steal the search keybinding
					CONTEXT_SETTINGS_EDITOR.negate(),				// do not steal the settings editor keybinding
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
		const widgetService = accessor.get(IChatWidgetService);

		const holdMode = keybindingService.enableKeybindingHoldMode(HoldToVoiceChatInChatViewAction.ID);

		let session: IVoiceChatSession | undefined;
		const handle = disposableTimeout(async () => {
			const controller = await VoiceChatSessionControllerFactory.create(accessor, 'view');
			if (controller) {
				session = await VoiceChatSessions.getInstance(instantiationService).start(controller, context);
				session.setTimeoutDisabled(true);
			}
		}, VOICE_KEY_HOLD_THRESHOLD);

		(await widgetService.revealWidget())?.focusInput();

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
				ChatContextKeys.requestInProgress.negate() // disable when a chat request is in progress
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
				ChatContextKeys.requestInProgress.negate() // disable when a chat request is in progress
			),
			f1: true
		}, 'quick');
	}
}

const primaryVoiceActionMenu = (when: ContextKeyExpression | undefined) => {
	return [
		{
			id: MenuId.ChatExecute,
			when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), when),
			group: 'navigation',
			order: 3
		},
		{
			id: MenuId.ChatExecute,
			when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat).negate(), when),
			group: 'navigation',
			order: 2
		}
	];
};

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
					FocusInChatInput,					// scope this action to chat input fields only
					EditorContextKeys.focus.negate(), 	// do not steal the editor inline-chat keybinding
					NOTEBOOK_EDITOR_FOCUSED.negate()	// do not steal the notebook inline-chat keybinding
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			icon: Codicon.mic,
			precondition: ContextKeyExpr.and(
				CanVoiceChat,
				ScopedVoiceChatGettingReady.negate(),	// disable when voice chat is getting ready
				AnyChatRequestInProgress?.negate(),		// disable when any chat request is in progress
				SpeechToTextInProgress.negate()			// disable when speech to text is in progress
			),
			menu: primaryVoiceActionMenu(ContextKeyExpr.and(
				HasSpeechProvider,
				ScopedChatSynthesisInProgress.negate(),	// hide when text to speech is in progress
				AnyScopedVoiceChatInProgress?.negate(),	// hide when voice chat is in progress
			))
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): Promise<void> {
		const widget = context?.widget;
		if (widget) {
			// if we already get a context when the action is executed
			// from a toolbar within the chat widget, then make sure
			// to move focus into the input field so that the controller
			// is properly retrieved
			widget.focusInput();
		}

		return startVoiceChatWithHoldMode(this.desc.id, accessor, 'focused', context);
	}
}

export class StopListeningAction extends Action2 {

	static readonly ID = 'workbench.action.chat.stopListening';

	constructor() {
		super({
			id: StopListeningAction.ID,
			title: localize2('workbench.action.chat.stopListening.label', "Stop Listening"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyCode.Escape,
				when: AnyScopedVoiceChatInProgress
			},
			icon: spinningLoading,
			precondition: GlobalVoiceChatInProgress, // need global context here because of `f1: true`
			menu: primaryVoiceActionMenu(AnyScopedVoiceChatInProgress)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop();
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
				when: ContextKeyExpr.and(
					FocusInChatInput,
					AnyScopedVoiceChatInProgress
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyI
			},
			precondition: GlobalVoiceChatInProgress // need global context here because of `f1: true`
		});
	}

	run(accessor: ServicesAccessor): void {
		VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).accept();
	}
}

//#endregion

//#region Text to Speech

const ScopedChatSynthesisInProgress = new RawContextKey<boolean>('scopedChatSynthesisInProgress', false, { type: 'boolean', description: localize('scopedChatSynthesisInProgress', "Defined as a location where voice recording from microphone is in progress for voice chat. This key is only defined scoped, per chat context.") });

interface IChatSynthesizerSessionController {

	readonly onDidHideChat: Event<unknown>;

	readonly contextKeyService: IContextKeyService;
	readonly response: IChatResponseModel;
}

class ChatSynthesizerSessionController {

	static create(accessor: ServicesAccessor, context: IVoiceChatSessionController | 'focused', response: IChatResponseModel): IChatSynthesizerSessionController {
		if (context === 'focused') {
			return ChatSynthesizerSessionController.doCreateForFocusedChat(accessor, response);
		} else {
			return {
				onDidHideChat: context.onDidHideInput,
				contextKeyService: context.scopedContextKeyService,
				response
			};
		}
	}

	private static doCreateForFocusedChat(accessor: ServicesAccessor, response: IChatResponseModel): IChatSynthesizerSessionController {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const contextKeyService = accessor.get(IContextKeyService);
		let chatWidget = chatWidgetService.getWidgetBySessionResource(response.session.sessionResource);
		if (chatWidget?.location === ChatAgentLocation.EditorInline) {
			// workaround for https://github.com/microsoft/vscode/issues/212785
			chatWidget = chatWidgetService.lastFocusedWidget;
		}

		return {
			onDidHideChat: chatWidget?.onDidHide ?? Event.None,
			contextKeyService: chatWidget?.scopedContextKeyService ?? contextKeyService,
			response
		};
	}
}

interface IChatSynthesizerContext {
	readonly ignoreCodeBlocks: boolean;
	insideCodeBlock: boolean;
}

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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async start(controller: IChatSynthesizerSessionController): Promise<void> {

		// Stop running text-to-speech or speech-to-text sessions in chats
		this.stop();
		VoiceChatSessions.getInstance(this.instantiationService).stop();

		const activeSession = this.activeSession = new CancellationTokenSource();

		const disposables = new DisposableStore();
		disposables.add(activeSession.token.onCancellationRequested(() => disposables.dispose()));

		const session = await this.speechService.createTextToSpeechSession(activeSession.token, 'chat');

		if (activeSession.token.isCancellationRequested) {
			return;
		}

		disposables.add(controller.onDidHideChat(() => this.stop()));

		const scopedChatToSpeechInProgress = ScopedChatSynthesisInProgress.bindTo(controller.contextKeyService);
		disposables.add(toDisposable(() => scopedChatToSpeechInProgress.reset()));

		disposables.add(session.onDidChange(e => {
			switch (e.status) {
				case TextToSpeechStatus.Started:
					scopedChatToSpeechInProgress.set(true);
					break;
				case TextToSpeechStatus.Stopped:
					scopedChatToSpeechInProgress.reset();
					break;
			}
		}));

		for await (const chunk of this.nextChatResponseChunk(controller.response, activeSession.token)) {
			if (activeSession.token.isCancellationRequested) {
				return;
			}

			await raceCancellation(session.synthesize(chunk), activeSession.token);
		}
	}

	private async *nextChatResponseChunk(response: IChatResponseModel, token: CancellationToken): AsyncIterable<string> {
		const context: IChatSynthesizerContext = {
			ignoreCodeBlocks: this.configurationService.getValue<boolean>(AccessibilityVoiceSettingId.IgnoreCodeBlocks),
			insideCodeBlock: false
		};

		let totalOffset = 0;
		let complete = false;
		do {
			const responseLength = response.response.toString().length;
			const { chunk, offset } = this.parseNextChatResponseChunk(response, totalOffset, context);
			totalOffset = offset;
			complete = response.isComplete;

			if (chunk) {
				yield chunk;
			}

			if (token.isCancellationRequested) {
				return;
			}

			if (!complete && responseLength === response.response.toString().length) {
				await raceCancellation(Event.toPromise(response.onDidChange), token); // wait for the response to change
			}
		} while (!token.isCancellationRequested && !complete);
	}

	private parseNextChatResponseChunk(response: IChatResponseModel, offset: number, context: IChatSynthesizerContext): { readonly chunk: string | undefined; readonly offset: number } {
		let chunk: string | undefined = undefined;

		const text = response.response.toString();

		if (response.isComplete) {
			chunk = text.substring(offset);
			offset = text.length + 1;
		} else {
			const res = parseNextChatResponseChunk(text, offset);
			chunk = res.chunk;
			offset = res.offset;
		}

		if (chunk && context.ignoreCodeBlocks) {
			chunk = this.filterCodeBlocks(chunk, context);
		}

		return {
			chunk: chunk ? renderAsPlaintext({ value: chunk }) : chunk, // convert markdown to plain text
			offset
		};
	}

	private filterCodeBlocks(chunk: string, context: IChatSynthesizerContext): string {
		return chunk.split('\n')
			.filter(line => {
				if (line.trimStart().startsWith('```')) {
					context.insideCodeBlock = !context.insideCodeBlock;
					return false;
				}
				return !context.insideCodeBlock;
			})
			.join('\n');
	}

	stop(): void {
		this.activeSession?.dispose(true);
		this.activeSession = undefined;
	}
}

const sentenceDelimiter = ['.', '!', '?', ':'];
const lineDelimiter = '\n';
const wordDelimiter = ' ';

export function parseNextChatResponseChunk(text: string, offset: number): { readonly chunk: string | undefined; readonly offset: number } {
	let chunk: string | undefined = undefined;

	for (let i = text.length - 1; i >= offset; i--) { // going from end to start to produce largest chunks
		const cur = text[i];
		const next = text[i + 1];
		if (
			sentenceDelimiter.includes(cur) && next === wordDelimiter ||	// end of sentence
			lineDelimiter === cur											// end of line
		) {
			chunk = text.substring(offset, i + 1).trim();
			offset = i + 1;
			break;
		}
	}

	return { chunk, offset };
}

export class ReadChatResponseAloud extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.readChatResponseAloud',
			title: localize2('workbench.action.chat.readChatResponseAloud', "Read Aloud"),
			icon: Codicon.unmute,
			precondition: CanVoiceChat,
			menu: [{
				id: MenuId.ChatMessageFooter,
				when: ContextKeyExpr.and(
					CanVoiceChat,
					ChatContextKeys.isResponse,						// only for responses
					ScopedChatSynthesisInProgress.negate(),	// but not when already in progress
					ChatContextKeys.responseIsFiltered.negate(),		// and not when response is filtered
				),
				group: 'navigation',
				order: -10 // first
			}, {
				id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
				when: ContextKeyExpr.and(
					CanVoiceChat,
					ChatContextKeys.isResponse,						// only for responses
					ScopedChatSynthesisInProgress.negate(),	// but not when already in progress
					ChatContextKeys.responseIsFiltered.negate()		// and not when response is filtered
				),
				group: 'navigation',
				order: -10 // first
			}]
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const instantiationService = accessor.get(IInstantiationService);
		const chatWidgetService = accessor.get(IChatWidgetService);

		let response: IChatResponseViewModel | undefined = undefined;
		if (args.length > 0) {
			const responseArg = args[0];
			if (isResponseVM(responseArg)) {
				response = responseArg;
			}
		} else {
			const chatWidget = chatWidgetService.lastFocusedWidget;
			if (chatWidget) {

				// pick focused response
				const focus = chatWidget.getFocus();
				if (focus instanceof ChatResponseViewModel) {
					response = focus;
				}

				// pick the last response
				else {
					const chatViewModel = chatWidget.viewModel;
					if (chatViewModel) {
						const items = chatViewModel.getItems();
						for (let i = items.length - 1; i >= 0; i--) {
							const item = items[i];
							if (isResponseVM(item)) {
								response = item;
								break;
							}
						}
					}
				}
			}
		}

		if (!response) {
			return;
		}

		const controller = ChatSynthesizerSessionController.create(accessor, 'focused', response.model);
		ChatSynthesizerSessions.getInstance(instantiationService).start(controller);
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
			precondition: GlobalTextToSpeechInProgress, // need global context here because of `f1: true`
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyCode.Escape,
				when: ScopedChatSynthesisInProgress
			},
			menu: primaryVoiceActionMenu(ScopedChatSynthesisInProgress)
		});
	}

	async run(accessor: ServicesAccessor) {
		ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

export class StopReadChatItemAloud extends Action2 {

	static readonly ID = 'workbench.action.chat.stopReadChatItemAloud';

	constructor() {
		super({
			id: StopReadChatItemAloud.ID,
			icon: Codicon.mute,
			title: localize2('workbench.action.chat.stopReadChatItemAloud', "Stop Reading Aloud"),
			precondition: ScopedChatSynthesisInProgress,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 100,
				primary: KeyCode.Escape,
			},
			menu: [
				{
					id: MenuId.ChatMessageFooter,
					when: ContextKeyExpr.and(
						ScopedChatSynthesisInProgress,		// only when in progress
						ChatContextKeys.isResponse,					// only for responses
						ChatContextKeys.responseIsFiltered.negate()	// but not when response is filtered
					),
					group: 'navigation',
					order: -10 // first
				},
				{
					id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
					when: ContextKeyExpr.and(
						ScopedChatSynthesisInProgress,		// only when in progress
						ChatContextKeys.isResponse,					// only for responses
						ChatContextKeys.responseIsFiltered.negate()	// but not when response is filtered
					),
					group: 'navigation',
					order: -10 // first
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).stop();
	}
}

//#endregion

//#region Keyword Recognition

function supportsKeywordActivation(configurationService: IConfigurationService, speechService: ISpeechService, chatAgentService: IChatAgentService): boolean {
	if (!speechService.hasSpeechProvider || !chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
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
			if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
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
		if (!this.speechService.hasSpeechProvider || !this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
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
	if (!isHighContrast(theme.type)) {
		activeRecordingColor = theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND) ?? theme.getColor(focusBorder);
		activeRecordingDimmedColor = activeRecordingColor?.transparent(0.38);
	} else {
		activeRecordingColor = theme.getColor(contrastBorder);
		activeRecordingDimmedColor = theme.getColor(contrastBorder);
	}

	// Show a "microphone" or "pulse" icon when speech-to-text or text-to-speech is in progress that glows via outline.
	collector.addRule(`
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled),
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled) {
			color: ${activeRecordingColor};
			outline: 1px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1s infinite;
			border-radius: 50%;
		}

		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::before,
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::before {
			position: absolute;
			outline: 1px solid ${activeRecordingColor};
			outline-offset: 2px;
			border-radius: 50%;
			width: 16px;
			height: 16px;
		}

		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::after,
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::after {
			outline: 2px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1500ms cubic-bezier(0.75, 0, 0.25, 1) infinite;
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
