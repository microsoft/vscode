/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindowService, IAuxiliaryWindow } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IRectangle } from '../../../../../platform/window/common/window.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { inputBackground, inputBorder } from '../../../../../platform/theme/common/colors/inputColors.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../../nls.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatMode } from '../../common/chatModes.js';
import { ChatModeKind } from '../../common/constants.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IAgentSession, AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { ISessionRouter, IRoutableSession, ISessionRouteResult } from '../../common/sessionRouter.js';
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_WIDTH, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT } from '../../common/chatInputWindow.js';

/**
 * Minimum confidence for a candidate to be treated as a real match. Below this
 * for every candidate, the request starts a brand-new session instead.
 */
const ROUTE_CONFIDENCE_THRESHOLD = 0.5;

/**
 * When two or more matches are within this confidence margin of the top match,
 * the result is treated as ambiguous and the user is asked to choose.
 */
const ROUTE_AMBIGUITY_MARGIN = 0.2;

/** Maximum number of options shown in the disambiguation picker. */
const ROUTE_MAX_CHOICES = 6;

/**
 * Hosts a frameless, always-on-top auxiliary window containing (eventually) the
 * full chat input box — dictation, voice mode, and the glow animation. Step 1
 * opens an empty themed container so the window shell can be verified visually.
 */
export class ChatInputWindowService extends Disposable implements IChatInputWindowService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeOpen = this._register(new Emitter<boolean>());
	readonly onDidChangeOpen: Event<boolean> = this._onDidChangeOpen.event;

	private readonly _auxiliaryWindowRef = this._register(new MutableDisposable());
	private _window: IAuxiliaryWindow | undefined;
	private readonly _windowDisposables = this._register(new DisposableStore());
	private readonly _ownershipChannel: BroadcastChannel;
	private _widget: ChatWidget | undefined;
	private _modelRef: IChatModelReference | undefined;
	/** Sessions loaded or spawned by routing; disposed when the window closes. */
	private readonly _routedSessionRefs: IChatModelReference[] = [];

	get isOpen(): boolean {
		return !!this._window;
	}

	constructor(
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ISessionRouter private readonly sessionRouter: ISessionRouter,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const ownershipChannel = new BroadcastChannel('chat-input-window-ownership');
		ownershipChannel.onmessage = (e) => {
			if (e.data?.type === 'claim' && this._window) {
				this.closeWindow();
			}
		};
		this._register({ dispose: () => ownershipChannel.close() });
		this._ownershipChannel = ownershipChannel;

		const onBeforeUnload = () => {
			if (this._window) {
				this.closeWindow();
			}
		};
		this._register(dom.addDisposableListener(mainWindow, 'beforeunload', onBeforeUnload));

		const wasOpen = this.storageService.getBoolean(ChatInputWindowStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
		if (wasOpen) {
			this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	async openWindow(): Promise<void> {
		if (this._window) {
			return;
		}

		const bounds = this._defaultBounds();

		const auxiliaryWindow = await this.auxiliaryWindowService.open({
			bounds,
			alwaysOnTop: true,
			frameless: true,
			transparent: false,
			disableFullscreen: true,
			nativeTitlebar: false,
			noBackgroundThrottling: true,
			backgroundColor: this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? '#1e1e1e',
		});

		this._window = auxiliaryWindow;
		this._auxiliaryWindowRef.value = auxiliaryWindow;

		const workspace = this.workspaceContextService.getWorkspace();
		const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : '';
		auxiliaryWindow.window.document.title = projectName ? `Chat Input — ${projectName}` : 'Chat Input';

		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');

		// Resolve theme colors so the aux window matches the chat input box.
		const theme = this.themeService.getColorTheme();
		const bgColor = theme.getColor(editorBackground)?.toString() ?? '#1e1e1e';
		const inputBg = theme.getColor(inputBackground)?.toString() ?? '#3C3C3C';
		const inputBd = theme.getColor(inputBorder)?.toString() ?? 'transparent';

		auxiliaryWindow.container.style.setProperty('--vscode-chat-input-window-background', bgColor);
		auxiliaryWindow.container.style.backgroundColor = inputBg;
		auxiliaryWindow.container.style.border = `1px solid ${inputBd}`;
		auxiliaryWindow.container.style.boxSizing = 'border-box';
		auxiliaryWindow.window.document.body.style.setProperty('background-color', inputBg, 'important');

		this._windowDisposables.clear();

		// Host the real chat input (dictation, voice mode, glow) by rendering a
		// compact ChatWidget. The response list is filtered out so only the input
		// box shows. Submission is intercepted via submitHandler (the routing
		// seam) and currently dispatched to this window's dedicated session.
		this._renderChatWidget(auxiliaryWindow);

		// Clean up when the user closes the window via OS controls.
		Event.once(auxiliaryWindow.onUnload)(() => {
			this._disposeWidget();
			this._window = undefined;
			this._windowDisposables.clear();
			this._auxiliaryWindowRef.value = undefined;
			this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this._onDidChangeOpen.fire(false);
		});

		this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this._onDidChangeOpen.fire(true);
	}

	closeWindow(): void {
		if (!this._window) { return; }

		this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);

		this._disposeWidget();
		this._window = undefined;
		this._windowDisposables.clear();
		this._auxiliaryWindowRef.value = undefined;
		this._onDidChangeOpen.fire(false);
	}

	async toggleWindow(): Promise<void> {
		if (this.isOpen) {
			this.closeWindow();
		} else {
			this._ownershipChannel.postMessage({ type: 'claim' });
			await this.openWindow();
		}
	}

	private _renderChatWidget(auxiliaryWindow: IAuxiliaryWindow): void {
		// The glow CSS keys off `.monaco-workbench .interactive-session
		// .chat-input-container` — the aux container already tracks the
		// `monaco-workbench` class, so we only need the `.interactive-session`
		// wrapper here.
		const parent = dom.append(auxiliaryWindow.container, dom.$('.interactive-session'));
		parent.style.height = '100%';
		parent.style.width = '100%';

		const scopedInstantiationService = this._windowDisposables.add(this.instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				this._windowDisposables.add(this.contextKeyService.createScoped(parent)),
			])
		));

		const widget = this._windowDisposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ isQuickChat: true },
			{
				autoScroll: true,
				renderInputOnTop: true,
				renderStyle: 'compact',
				// Show only the input box — drop every response list item.
				filter: () => false,
				enableImplicitContext: false,
				defaultMode: ChatMode.Ask,
				menus: { inputSideToolbar: MenuId.ChatInputSide, telemetrySource: 'chatInputWindow' },
				// Routing seam: intercept submission before local execution. For
				// now dispatch to this window's dedicated session; ISessionRouter
				// will replace this to fan out to the best-matching session.
				submitHandler: (query, mode) => this._handleSubmit(query, mode),
			},
			{
				inputEditorBackground: inputBackground,
				resultEditorBackground: editorBackground,
				listBackground: editorBackground,
				listForeground: editorBackground,
				overlayBackground: editorBackground,
			}
		));
		widget.render(parent);
		widget.setVisible(true);

		const modelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: 'ChatInputWindow' });
		this._modelRef = modelRef;
		widget.setModel(modelRef.object);
		this._widget = widget;

		const layout = () => widget.layout(parent.offsetHeight, parent.offsetWidth);
		layout();
		this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, 'resize', layout));
		this._windowDisposables.add(widget.onDidChangeHeight(() => layout()));
	}

	/**
	 * Routing seam with three outcomes:
	 *  1. No confident match → start a brand-new session for the request.
	 *  2. Several comparable high matches → ask the user which session to use.
	 *  3. A single clear high match → dispatch straight to it.
	 * Always returns `true` (handled) so the input-only widget never runs the
	 * request on its own scratch session.
	 */
	private async _handleSubmit(query: string, _mode: ChatModeKind): Promise<boolean> {
		const utterance = query.trim();
		if (!utterance) {
			return false;
		}

		const candidates = this._collectCandidateSessions();
		if (!candidates.length) {
			// Nothing to route to — this is the first request; make a new session.
			return this._dispatchToNewSession(utterance);
		}

		const cts = new CancellationTokenSource();
		let results: ISessionRouteResult[];
		try {
			results = await this.sessionRouter.route({ utterance, sessions: candidates }, cts.token);
		} catch (err) {
			this.logService.warn('[chatInputWindow] session routing failed:', err);
			return this._dispatchToNewSession(utterance);
		} finally {
			cts.dispose();
		}

		const top = results[0];

		// State 1: low confidence across the board → new session.
		if (!top || top.confidence < ROUTE_CONFIDENCE_THRESHOLD) {
			return this._dispatchToNewSession(utterance);
		}

		// Candidates that are both above threshold and close to the top match.
		const closeMatches = results.filter(r =>
			r.confidence >= ROUTE_CONFIDENCE_THRESHOLD && (top.confidence - r.confidence) <= ROUTE_AMBIGUITY_MARGIN);

		// State 2: ambiguous — several comparable matches → ask the user.
		if (closeMatches.length >= 2) {
			const labelById = new Map(candidates.map(c => [c.sessionId, c.label]));
			const choice = await this._promptSessionChoice(closeMatches, labelById);
			if (choice === undefined) {
				// User dismissed the picker — leave the input untouched to retry.
				return true;
			}
			if (choice === 'new') {
				return this._dispatchToNewSession(utterance);
			}
			return this._dispatchToSession(choice, utterance);
		}

		// State 3: a single clear winner → dispatch directly.
		return this._dispatchToSession(top.sessionId, utterance);
	}

	/**
	 * Snapshot the current agent sessions as routing candidates, excluding this
	 * window's own scratch session so it can never route to itself.
	 */
	private _collectCandidateSessions(): IRoutableSession[] {
		const ownResource = this._modelRef?.object.sessionResource.toString();
		this.agentSessionsService.model.resolve(undefined);
		return this.agentSessionsService.model.sessions
			.filter(session => session.resource.toString() !== ownResource)
			.map(session => this._toRoutableSession(session));
	}

	private _toRoutableSession(session: IAgentSession): IRoutableSession {
		return {
			sessionId: session.resource.toString(),
			label: session.label,
			status: statusToString(session.status),
			lastActivity: session.timing?.lastRequestEnded ?? session.timing?.lastRequestStarted ?? session.timing?.created,
		};
	}

	/**
	 * Ask the user to pick a target when several sessions match with comparable
	 * confidence. Returns the chosen session id, `'new'` for a new session, or
	 * `undefined` if the picker was dismissed.
	 */
	private async _promptSessionChoice(matches: ISessionRouteResult[], labelById: Map<string, string>): Promise<string | 'new' | undefined> {
		type RouteChoiceItem = IQuickPickItem & { sessionId?: string; isNew?: boolean };
		const items: RouteChoiceItem[] = matches.slice(0, ROUTE_MAX_CHOICES).map(match => ({
			label: labelById.get(match.sessionId) ?? match.sessionId,
			description: localize('chatInputWindow.matchPercent', "{0}% match", Math.round(match.confidence * 100)),
			detail: match.reason,
			sessionId: match.sessionId,
		}));
		items.push({
			label: localize('chatInputWindow.newSession', "$(add) Start a new session"),
			isNew: true,
		});

		const picked = await this.quickInputService.pick(items, {
			placeHolder: localize('chatInputWindow.choosePlaceholder', "Multiple sessions match — choose where to send this request"),
		});
		if (!picked) {
			return undefined;
		}
		return picked.isNew ? 'new' : picked.sessionId;
	}

	private async _dispatchToSession(sessionId: string, utterance: string): Promise<boolean> {
		let target: URI;
		try {
			target = URI.parse(sessionId);
		} catch (err) {
			this.logService.warn('[chatInputWindow] invalid session id for routing:', sessionId, err);
			return this._dispatchToNewSession(utterance);
		}

		const cts = new CancellationTokenSource();
		try {
			const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, cts.token, 'chatInputWindow-route');
			if (!ref) {
				this.logService.warn('[chatInputWindow] could not load routed session, starting a new one:', sessionId);
				return this._dispatchToNewSession(utterance);
			}
			this._routedSessionRefs.push(ref);
			const result = await this.chatService.sendRequest(target, utterance);
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatInputWindow] routed session rejected the request, starting a new one:', sessionId);
				return this._dispatchToNewSession(utterance);
			}
			this._widget?.inputEditor.setValue('');
			return true;
		} catch (err) {
			this.logService.warn('[chatInputWindow] error dispatching to routed session, starting a new one:', err);
			return this._dispatchToNewSession(utterance);
		} finally {
			cts.dispose();
		}
	}

	private async _dispatchToNewSession(utterance: string): Promise<boolean> {
		try {
			const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'chatInputWindow-new' });
			this._routedSessionRefs.push(ref);
			const result = await this.chatService.sendRequest(ref.object.sessionResource, utterance);
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatInputWindow] new session rejected the request, running locally');
				return false;
			}
			this._widget?.inputEditor.setValue('');
			return true;
		} catch (err) {
			this.logService.warn('[chatInputWindow] error starting a new session, running locally:', err);
			return false;
		}
	}

	private _disposeWidget(): void {
		this._widget = undefined;
		this._modelRef?.dispose();
		this._modelRef = undefined;
		for (const ref of this._routedSessionRefs) {
			ref.dispose();
		}
		this._routedSessionRefs.length = 0;
	}

	private _defaultBounds(): IRectangle {
		// Center horizontally within the main VS Code window, near the bottom.
		const x = Math.round(mainWindow.screenX + (mainWindow.outerWidth - CHAT_INPUT_WINDOW_DEFAULT_WIDTH) / 2);
		const y = mainWindow.screenY + mainWindow.outerHeight - CHAT_INPUT_WINDOW_DEFAULT_HEIGHT - 100;
		return {
			x,
			y,
			width: CHAT_INPUT_WINDOW_DEFAULT_WIDTH,
			height: CHAT_INPUT_WINDOW_DEFAULT_HEIGHT,
		};
	}
}

registerSingleton(IChatInputWindowService, ChatInputWindowService, InstantiationType.Delayed);

function statusToString(status: AgentSessionStatus): string {
	switch (status) {
		case AgentSessionStatus.Failed: return 'failed';
		case AgentSessionStatus.Completed: return 'idle';
		case AgentSessionStatus.InProgress: return 'working';
		default: return 'unknown';
	}
}
