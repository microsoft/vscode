/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { CancellationTokenSource, CancellationToken } from '../../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../../base/common/map.js';
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
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ChatMode } from '../../common/chatModes.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IAgentSession, AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
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
	/** Sessions loaded or spawned by routing, deduped by resource; disposed when the window closes. */
	private readonly _routedSessionRefs = new ResourceMap<IChatModelReference>();
	/** In-flight `openWindow()` operation, so concurrent toggles stay idempotent. */
	private _openOperation: Promise<void> | undefined;
	/** Cancellation for the in-flight submission; canceled when the window closes. */
	private readonly _submitCts = this._register(new MutableDisposable<CancellationTokenSource>());

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

		this._register(dom.addDisposableListener(mainWindow, 'beforeunload', () => {
			if (this._window) {
				this.closeWindow();
			}
		}));

		const wasOpen = this.storageService.getBoolean(ChatInputWindowStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
		if (wasOpen) {
			this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	async openWindow(): Promise<void> {
		if (this._window) {
			return;
		}
		// Coalesce concurrent open/toggle calls so we never create two aux windows.
		if (this._openOperation) {
			return this._openOperation;
		}
		this._openOperation = this._doOpenWindow();
		try {
			await this._openOperation;
		} finally {
			this._openOperation = undefined;
		}
	}

	private async _doOpenWindow(): Promise<void> {
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
		auxiliaryWindow.window.document.title = projectName
			? localize('chatInputWindow.titleWithProject', "Chat Input — {0}", projectName)
			: localize('chatInputWindow.title', "Chat Input");

		auxiliaryWindow.container.style.overflow = 'hidden';
		auxiliaryWindow.window.document.body.style.setProperty('margin', '0', 'important');

		this._windowDisposables.clear();

		// Resolve theme colors so the aux window matches the chat input box, and
		// re-apply them on theme changes (a light/dark/high-contrast switch would
		// otherwise leave the window on the old inline colors).
		const applyThemeColors = () => {
			const theme = this.themeService.getColorTheme();
			const bgColor = theme.getColor(editorBackground)?.toString() ?? '#1e1e1e';
			const inputBg = theme.getColor(inputBackground)?.toString() ?? '#3C3C3C';
			const inputBd = theme.getColor(inputBorder)?.toString() ?? 'transparent';

			auxiliaryWindow.container.style.setProperty('--vscode-chat-input-window-background', bgColor);
			auxiliaryWindow.container.style.backgroundColor = inputBg;
			auxiliaryWindow.container.style.border = `1px solid ${inputBd}`;
			auxiliaryWindow.container.style.boxSizing = 'border-box';
			auxiliaryWindow.window.document.body.style.setProperty('background-color', inputBg, 'important');
		};
		applyThemeColors();
		this._windowDisposables.add(this.themeService.onDidColorThemeChange(() => applyThemeColors()));

		// A frameless window can only be dragged through a `-webkit-app-region:
		// drag` region, so add a dedicated handle strip above the input. Its
		// interactive descendants are marked no-drag inside the widget below.
		const dragHandle = dom.append(auxiliaryWindow.container, dom.$('.chat-input-window-drag-handle'));
		dragHandle.style.setProperty('-webkit-app-region', 'drag');
		dragHandle.style.height = '6px';
		dragHandle.style.width = '100%';
		dragHandle.style.flexShrink = '0';
		dragHandle.style.cursor = 'grab';
		auxiliaryWindow.container.style.display = 'flex';
		auxiliaryWindow.container.style.flexDirection = 'column';

		// Host the real chat input (dictation, voice mode, glow) by rendering a
		// compact ChatWidget. The response list is filtered out so only the input
		// box shows. Submission is intercepted via submitHandler (the routing
		// seam) and routed to the best-matching existing session.
		this._renderChatWidget(auxiliaryWindow);

		// Clean up when the user closes the window via OS controls. Guard by window
		// identity so a stale unload after a quick reopen can't tear down the new one.
		Event.once(auxiliaryWindow.onUnload)(() => {
			if (this._window !== auxiliaryWindow) {
				return;
			}
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

		// Cancel any in-flight submission so routing can't dispatch after close.
		this._submitCts.value?.cancel();
		this._submitCts.clear();

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
		parent.style.flex = '1 1 auto';
		parent.style.minHeight = '0';
		parent.style.width = '100%';

		const scopedContextKeyService = this._windowDisposables.add(this.contextKeyService.createScoped(parent));
		// Mark this surface so its dedicated accessibility help (routing + how to
		// close) takes precedence over the generic Quick Chat help.
		ChatContextKeys.inChatInputWindow.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._windowDisposables.add(this.instantiationService.createChild(
			new ServiceCollection([
				IContextKeyService,
				scopedContextKeyService,
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
				menus: { inputSideToolbar: MenuId.ChatInputWindowSide, telemetrySource: 'chatInputWindow' },
				// Routing seam: intercept submission before local execution and
				// route it to the best-matching existing session (or a new one),
				// forwarding any explicit attachments on the input.
				submitHandler: (query, mode, attachedContext) => this._handleSubmit(query, mode, attachedContext),
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
	private async _handleSubmit(query: string, _mode: ChatModeKind, attachedContext?: IChatRequestVariableEntry[]): Promise<boolean> {
		const utterance = query.trim();
		if (!utterance) {
			return false;
		}

		// Window-scoped cancellation: replacing the value disposes any previous
		// source, and closing the window cancels the in-flight submission so we
		// never dispatch or mutate state after teardown.
		const cts = new CancellationTokenSource();
		this._submitCts.value = cts;
		const token = cts.token;

		const candidates = await this._collectCandidateSessions(token);
		if (token.isCancellationRequested) {
			return true;
		}
		if (!candidates.length) {
			// Nothing to route to — this is the first request; make a new session.
			return this._dispatchToNewSession(query, utterance, attachedContext, token);
		}

		let results: ISessionRouteResult[];
		try {
			results = await this.sessionRouter.route({ utterance, sessions: candidates }, token);
		} catch (err) {
			if (token.isCancellationRequested) {
				return true;
			}
			this.logService.warn('[chatInputWindow] session routing failed:', err);
			return this._dispatchToNewSession(query, utterance, attachedContext, token);
		}
		if (token.isCancellationRequested) {
			return true;
		}

		const top = results[0];

		// State 1: low confidence across the board → new session.
		if (!top || top.confidence < ROUTE_CONFIDENCE_THRESHOLD) {
			return this._dispatchToNewSession(query, utterance, attachedContext, token);
		}

		// Candidates that are both above threshold and close to the top match.
		const closeMatches = results.filter(r =>
			r.confidence >= ROUTE_CONFIDENCE_THRESHOLD && (top.confidence - r.confidence) <= ROUTE_AMBIGUITY_MARGIN);

		// State 2: ambiguous — several comparable matches → ask the user.
		if (closeMatches.length >= 2) {
			const labelById = new Map(candidates.map(c => [c.sessionId, c.label]));
			const choice = await this._promptSessionChoice(closeMatches, labelById);
			if (token.isCancellationRequested) {
				return true;
			}
			if (choice === undefined) {
				// User dismissed the picker — leave the input untouched to retry.
				return true;
			}
			if (choice === 'new') {
				return this._dispatchToNewSession(query, utterance, attachedContext, token);
			}
			return this._dispatchToSession(choice, query, utterance, attachedContext, token);
		}

		// State 3: a single clear winner → dispatch directly.
		return this._dispatchToSession(top.sessionId, query, utterance, attachedContext, token);
	}

	/**
	 * Snapshot the current agent sessions as routing candidates, excluding this
	 * window's own scratch session so it can never route to itself. Awaits the
	 * session model so a pending first-load/refresh isn't missed.
	 */
	private async _collectCandidateSessions(token: CancellationToken): Promise<IRoutableSession[]> {
		try {
			await this.agentSessionsService.model.resolve(undefined);
		} catch (err) {
			this.logService.warn('[chatInputWindow] resolving agent sessions failed:', err);
		}
		if (token.isCancellationRequested) {
			return [];
		}
		const ownResource = this._modelRef?.object.sessionResource.toString();
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
			label: `$(add) ${localize('chatInputWindow.newSession', "Start a new session")}`,
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

	private async _dispatchToSession(sessionId: string, submittedInput: string, utterance: string, attachedContext: IChatRequestVariableEntry[] | undefined, token: CancellationToken): Promise<boolean> {
		let target: URI;
		try {
			target = URI.parse(sessionId);
		} catch (err) {
			this.logService.warn('[chatInputWindow] invalid session id for routing:', sessionId, err);
			return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
		}

		try {
			const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, token, 'chatInputWindow-route');
			if (token.isCancellationRequested) {
				ref?.dispose();
				return true;
			}
			if (!ref) {
				this.logService.warn('[chatInputWindow] could not load routed session, starting a new one:', sessionId);
				return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
			}
			this._retainSessionRef(target, ref);
			const result = await this.chatService.sendRequest(target, utterance, attachedContext?.length ? { attachedContext } : undefined);
			if (token.isCancellationRequested) {
				return true;
			}
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatInputWindow] routed session rejected the request, starting a new one:', sessionId);
				return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
			}
			this._clearInputIfUnchanged(submittedInput);
			return true;
		} catch (err) {
			if (token.isCancellationRequested) {
				return true;
			}
			this.logService.warn('[chatInputWindow] error dispatching to routed session, starting a new one:', err);
			return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
		}
	}

	private async _dispatchToNewSession(submittedInput: string, utterance: string, attachedContext: IChatRequestVariableEntry[] | undefined, token: CancellationToken): Promise<boolean> {
		try {
			const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: 'chatInputWindow-new' });
			if (token.isCancellationRequested) {
				ref.dispose();
				return true;
			}
			this._retainSessionRef(ref.object.sessionResource, ref);
			const result = await this.chatService.sendRequest(ref.object.sessionResource, utterance, attachedContext?.length ? { attachedContext } : undefined);
			if (token.isCancellationRequested) {
				return true;
			}
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatInputWindow] new session rejected the request, running locally');
				return false;
			}
			this._clearInputIfUnchanged(submittedInput);
			return true;
		} catch (err) {
			if (token.isCancellationRequested) {
				return true;
			}
			this.logService.warn('[chatInputWindow] error starting a new session, running locally:', err);
			return false;
		}
	}

	/**
	 * Retain at most one reference per session resource so a long-lived window
	 * doesn't accumulate model references (and their sessions) as more requests
	 * are routed to the same target.
	 */
	private _retainSessionRef(resource: URI, ref: IChatModelReference): void {
		if (this._routedSessionRefs.has(resource)) {
			ref.dispose();
			return;
		}
		this._routedSessionRefs.set(resource, ref);
	}

	/**
	 * Clear the input (and its explicit attachments) only if the editor still
	 * holds exactly what was submitted, so a newer draft typed while the request
	 * was in flight is preserved.
	 */
	private _clearInputIfUnchanged(submittedInput: string): void {
		const editor = this._widget?.inputEditor;
		if (editor && editor.getValue() === submittedInput) {
			editor.setValue('');
			this._widget?.attachmentModel.clear();
		}
	}

	private _disposeWidget(): void {
		this._widget = undefined;
		this._modelRef?.dispose();
		this._modelRef = undefined;
		for (const ref of this._routedSessionRefs.values()) {
			ref.dispose();
		}
		this._routedSessionRefs.clear();
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
