/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { DeferredPromise, raceTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableFromEvent, observableValue, runOnChange } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatViewSessionsListService } from '../../../common/chatViewSessionsListService.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatViewId, IChatWidget } from '../../chat.js';
import { getChatViewHostOpenReason, IChatViewHost, IChatViewHostOpenOptions, IChatViewHostRevealOptions, IChatViewHostService, IChatViewHostSessionStart, IChatViewHostSessionStartOptions, IChatViewHostNewChatOptions, IChatViewHostShownSession, IChatViewNewChatTarget, IChatViewContribution } from '../../chatViewHost.js';
import { IChatViewSessionsListProvider } from './chatViewSessionsList.js';
import { ChatViewPane } from './chatViewPane.js';

/** The Chat view, as the host of its chats. */
export class ChatViewPaneHost implements IChatViewHost {

	/** How long {@link reveal} waits for the Chat view's widget, which it creates as its body first renders. */
	private static readonly WIDGET_TIMEOUT = 10_000;

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		// The view exists once it first shows; it keeps its chat while hidden
		const view = observableFromEvent(this, viewsService.onDidChangeViewVisibility, () => viewsService.getViewWithId<ChatViewPane>(ChatViewId));
		this.shownSession = derived(this, reader => view.read(reader)?.shownSession.read(reader));
	}

	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;

	async reveal(preserveFocus?: boolean, options?: IChatViewHostRevealOptions): Promise<IChatWidget | undefined> {
		const view = await this.viewsService.openView<ChatViewPane>(ChatViewId, !preserveFocus);
		if (view && !view.widget && options?.waitForWidget) {
			return raceTimeout(view.whenWidget, ChatViewPaneHost.WIDGET_TIMEOUT);
		}
		return view?.widget;
	}

	async revealIfShowing(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const chatView = this.viewsService.getViewWithId<ChatViewPane>(ChatViewId);
		if (!isEqual(chatView?.widget.viewModel?.sessionResource, sessionResource)) {
			return undefined;
		}
		const view = await this.viewsService.openView<ChatViewPane>(ChatViewId, !options?.preserveFocus);
		if (view && !options?.preserveFocus) {
			view.focus();
		}
		view?.reportShown(sessionResource, getChatViewHostOpenReason(options));
		return view?.widget;
	}

	async openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const chatView = await this.viewsService.openView<ChatViewPane>(ChatViewId, !options?.preserveFocus);
		if (chatView) {
			const reason = getChatViewHostOpenReason(options);
			// Loading reports the chat once, also one it showed already, unless a later open supersedes it
			await chatView.loadSession(sessionResource, options?.sessionTypeSelectionReason, reason);
			if (!options?.preserveFocus) {
				chatView.focusInput();
			}
		}
		return chatView?.widget;
	}

	async newChat(target?: IChatViewNewChatTarget, options?: IChatViewHostNewChatOptions): Promise<boolean> {
		if (options?.ownChat) {
			const view = await this.viewsService.openView<ChatViewPane>(ChatViewId, !options.preserveFocus);
			// A later request, such as an open, superseded it while the view opened: its new chat would replace what that shows
			if (options.token?.isCancellationRequested) {
				return false;
			}
			return !!view && await view.newChat(target, options);
		}
		const view = this.viewsService.isViewVisible(ChatViewId) ? this.viewsService.getViewWithId<ChatViewPane>(ChatViewId) : undefined;
		return !!view && await view.newChat(target, options);
	}

	async toggle(): Promise<boolean> {
		const visible = !this.viewsService.isViewVisible(ChatViewId);
		this.updatePartVisibility(this.viewDescriptorService.getViewLocationById(ChatViewId), visible);
		return visible;
	}

	private updatePartVisibility(location: ViewContainerLocation | null, visible: boolean): void {
		let part: Parts.PANEL_PART | Parts.SIDEBAR_PART | Parts.AUXILIARYBAR_PART | undefined;
		switch (location) {
			case ViewContainerLocation.Panel:
				part = Parts.PANEL_PART;
				break;
			case ViewContainerLocation.Sidebar:
				part = Parts.SIDEBAR_PART;
				break;
			case ViewContainerLocation.AuxiliaryBar:
				part = Parts.AUXILIARYBAR_PART;
				break;
		}

		if (part) {
			this.layoutService.setPartHidden(!visible, part);
		}
	}

	async startSession(sessionResource: URI, options: IChatViewHostSessionStartOptions): Promise<IChatViewHostSessionStart> {
		const view = await this.viewsService.openView(ChatViewId) as ChatViewPane;
		options.beforeOpen?.();
		const transition = new DisposableStore();
		if (options.importingConversation) {
			// The transition spans loading, sending and moving to the real session, during which the chat widget is
			// transiently empty: the sessions list stays suppressed so it never flashes, and the view shows that it works.
			transition.add(view.beginSessionsListSuppression());
			const progress = new DeferredPromise<void>();
			transition.add(toDisposable(() => progress.complete()));
			this.progressService.withProgress({ location: ChatViewId }, () => progress.p);
		}
		try {
			if (options.local) {
				await view.startNewLocalSession();
			} else {
				await view.loadSession(sessionResource, 'explicitOverride');
			}
			view.focus();
		} catch (error) {
			transition.dispose();
			throw error;
		}
		return {
			moved: async movedSessionResource => {
				const movedView = await this.viewsService.openView(ChatViewId) as ChatViewPane;
				// The session that the first request made: shown as committed, not as one the user opened
				await movedView.loadSession(movedSessionResource, undefined, 'commit');
			},
			complete: async () => {
				transition.dispose();
				return true;
			},
			createComposer: async () => undefined,
			dispose: () => transition.dispose(),
		};
	}
}

/** What shows the Chat view's chats now: the host that showed something last. */
export interface IChatViewHostState {
	readonly host: IChatViewHost;
	/** Whether the host shows a new chat that New Chat started, until it shows a chat. */
	readonly newChat: boolean;
	/** Counts what asked to show something, such as an open or a New Chat: a New Chat under way completes only while it is the latest. */
	readonly request: number;
}

/** What changes {@link IChatViewHostState}. */
export type ChatViewHostEvent =
	/** Something asked `host` to show something, such as an open, a reveal, or a host that registers or goes. */
	| { readonly kind: 'request'; readonly host: IChatViewHost }
	/** A New Chat starts: it supersedes one under way. */
	| { readonly kind: 'newChatStart' }
	/** `host` took the New Chat that started with `request`. */
	| { readonly kind: 'newChatTaken'; readonly host: IChatViewHost; readonly request: number }
	/** `host` shows the chat of `resource` on its own, such as one it restores. */
	| { readonly kind: 'shown'; readonly host: IChatViewHost; readonly resource: URI };

/** What {@link stepChatViewHostState} knows of the hosts. */
export interface IChatViewHostStepContext {
	readonly chatViewHost: IChatViewHost;
	/** The host registered last, or the Chat view's while none is. */
	readonly hostInUse: IChatViewHost;
	isRegistered(host: IChatViewHost): boolean;
}

/** The state after `event`: the same state when the event changes nothing. */
export function stepChatViewHostState(state: IChatViewHostState, event: ChatViewHostEvent, context: IChatViewHostStepContext): IChatViewHostState {
	if (event.kind === 'newChatStart') {
		return { ...state, request: state.request + 1 };
	}
	// A host no longer registered, such as one that completes a reveal after it was removed, shows nothing of the Chat view's,
	// and supersedes nothing
	if (event.host !== context.chatViewHost && !context.isRegistered(event.host)) {
		return state;
	}
	switch (event.kind) {
		case 'request':
			return { host: event.host, newChat: false, request: state.request + 1 };
		case 'newChatTaken':
			// Superseded meanwhile, such as by an open or a later New Chat, it takes nothing
			return event.request === state.request ? { host: event.host, newChat: true, request: state.request } : state;
		case 'shown': {
			// A chat that the Chat view shows while another host showed last, one that the host in use shows instead, such as one
			// it restores of a session, does not make the Chat view the host that showed last: it stays sessions-only. What
			// concludes something of the Chat view's own, such as the commit of its New Chat, still does
			if (event.host === context.chatViewHost && state.host !== context.chatViewHost && context.hostInUse !== context.chatViewHost && context.hostInUse.canShow?.(event.resource) !== false) {
				return state;
			}
			return state.host === event.host && !state.newChat ? state : { host: event.host, newChat: false, request: state.request };
		}
	}
}

export class ChatViewHostService extends Disposable implements IChatViewHostService {

	declare readonly _serviceBrand: undefined;

	private readonly chatViewHost: IChatViewHost;
	/** The registrations of the hosts that replace the Chat view, the one in use last: one each, also of the same host. */
	private readonly registrations: { readonly host: IChatViewHost }[] = [];
	private readonly hostInUse: ISettableObservable<IChatViewHost>;
	/** What shows the Chat view's chats now, whose shown chat the service reports: none while it shows a new chat of New Chat. */
	private readonly state: ISettableObservable<IChatViewHostState>;

	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;
	readonly chatViewHosts: IObservable<boolean>;
	readonly requests: IObservable<number>;

	/** The registered contributions, the one registered last at the end: one each, also of the same contribution. */
	private readonly contributions = observableValue<readonly IChatViewContribution[]>(this, []);
	readonly sessionsList: IObservable<IChatViewSessionsListProvider | undefined>;
	readonly sessionsOnly: IObservable<boolean>;
	readonly chatsOpenElsewhere: IObservable<boolean>;
	readonly sessionsListExpected: IObservable<boolean>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatViewSessionsListService chatViewSessionsListService: IChatViewSessionsListService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.chatViewHost = instantiationService.createInstance(ChatViewPaneHost);
		this.hostInUse = observableValue<IChatViewHost>(this, this.chatViewHost);
		this.state = observableValue<IChatViewHostState>(this, { host: this.chatViewHost, newChat: false, request: 0 });
		this.chatViewHosts = derived(this, reader => this.state.read(reader).host === this.chatViewHost);
		this.requests = derived(this, reader => this.state.read(reader).request);
		this.shownSession = derived(this, reader => {
			const state = this.state.read(reader);
			return state.newChat ? undefined : state.host.shownSession?.read(reader);
		});
		this.sessionsList = derived(this, reader => this.contributions.read(reader).findLast(contribution => contribution.sessionsList)?.sessionsList);
		// Remote windows and the Agents window keep the Chat view's own list: nothing there provides another
		const providable = !environmentService.isSessionsWindow && !environmentService.remoteAuthority;
		this.sessionsListExpected = derived(this, reader => providable && chatViewSessionsListService.enabled.read(reader) && !this.sessionsList.read(reader));
		this.chatsOpenElsewhere = derived(this, reader => this.contributions.read(reader).some(contribution => contribution.chatsOpenElsewhere));
		this.sessionsOnly = derived(this, reader => {
			const contributions = this.contributions.read(reader);
			const replaced = this._replaced.read(reader);
			const chatViewHosts = this.chatViewHosts.read(reader);
			// A new chat that the Chat view started shows its composer, whose session then opens elsewhere
			const hostsNewChat = chatViewHosts && this.state.read(reader).newChat;
			return (replaced && !chatViewHosts && contributions.some(contribution => contribution.sessionsOnly))
				|| (!(replaced && chatViewHosts) && !hostsNewChat && this.chatsOpenElsewhere.read(reader));
		});
	}

	register(contribution: IChatViewContribution): IDisposable {
		const store = new DisposableStore();
		const entry = { ...contribution };
		this.contributions.set([...this.contributions.get(), entry], undefined);
		store.add(toDisposable(() => this.contributions.set(this.contributions.get().filter(other => other !== entry), undefined)));
		if (contribution.host) {
			store.add(this.registerHost(contribution.host));
		}
		return store;
	}

	/** Tracks the chats that the Chat view shows (see {@link updateChatViewTracking}); otherwise it is the latest host, as it shows them. */
	private readonly chatViewTracking = this._register(new MutableDisposable());

	/** Steps the state whenever `host` shows another chat, such as one it restores or one opened in it directly. */
	private trackShownSession(host: IChatViewHost): IDisposable {
		return host.shownSession ? runOnChange(host.shownSession, shown => {
			if (shown) {
				this.step({ kind: 'shown', host, resource: shown.resource });
			}
		}) : Disposable.None;
	}

	private readonly _replaced = observableValue(this, false);
	readonly replaced: IObservable<boolean> = this._replaced;

	private step(event: ChatViewHostEvent): void {
		const state = this.state.get();
		const next = stepChatViewHostState(state, event, {
			chatViewHost: this.chatViewHost,
			hostInUse: this.host,
			isRegistered: host => this.registrations.some(registration => registration.host === host),
		});
		if (next !== state) {
			this.state.set(next, undefined);
			this.updateChatViewTracking();
		}
	}

	/** Steps the state as something asks `host` to show something. */
	private claim(host: IChatViewHost): void {
		this.step({ kind: 'request', host });
	}

	/** Tracks the Chat view's shown chat while it may be other than the latest host's, or ends a new chat it shows. */
	private updateChatViewTracking(): void {
		if (this.registrations.length === 0 && !this.state.get().newChat) {
			this.chatViewTracking.clear();
		} else if (!this.chatViewTracking.value) {
			this.chatViewTracking.value = this.trackShownSession(this.chatViewHost);
		}
	}

	private get host(): IChatViewHost {
		return this.hostInUse.get();
	}

	/** The host of the chat of `sessionResource`: the Chat view, for a chat the host in use leaves to it. */
	private hostOf(sessionResource: URI): IChatViewHost {
		const host = this.host;
		return host.canShow?.(sessionResource) === false ? this.chatViewHost : host;
	}

	private registerHost(host: IChatViewHost): IDisposable {
		const registration = { host };
		this.registrations.push(registration);
		this.updateHostInUse();
		// A host that shows no chat yet does not take the chat that the Chat view shows, when it leaves that chat to the Chat view:
		// also a new chat of New Chat that the Chat view shows, such as a draft typed but not sent
		const shown = this.state.get();
		const shownResource = shown.host === this.chatViewHost ? shown.host.shownSession?.get()?.resource : undefined;
		if (!shownResource || host.shownSession?.get() || host.canShow?.(shownResource) !== false) {
			this.claim(host);
		}
		const tracking = this.trackShownSession(host);
		return toDisposable(() => {
			tracking.dispose();
			const index = this.registrations.indexOf(registration);
			if (index >= 0) {
				this.registrations.splice(index, 1);
				this.updateHostInUse();
				// The host that showed something last reports it until it is no longer registered: then the host in use does
				if (this.state.get().host === host && !this.registrations.some(other => other.host === host)) {
					this.claim(this.host);
				}
			}
		});
	}

	private updateHostInUse(): void {
		const host = this.registrations.at(-1)?.host ?? this.chatViewHost;
		this.hostInUse.set(host, undefined);
		this._replaced.set(this.registrations.length > 0, undefined);
		this.updateChatViewTracking();
	}

	async reveal(preserveFocus?: boolean, options?: IChatViewHostRevealOptions): Promise<IChatWidget | undefined> {
		const host = this.host;
		const widget = await host.reveal(preserveFocus, options);
		this.claim(host);
		return widget;
	}

	async revealIfShowing(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const host = this.hostOf(sessionResource);
		const widget = await host.revealIfShowing?.(sessionResource, options);
		if (widget) {
			this.claim(host);
		}
		return widget;
	}

	openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const host = this.hostOf(sessionResource);
		this.claim(host);
		return host.openSession(sessionResource, options);
	}

	async toggle(): Promise<boolean> {
		const host = this.host;
		const shows = await host.toggle();
		if (shows) {
			this.claim(host);
		}
		return shows;
	}

	startSession(sessionResource: URI, options: IChatViewHostSessionStartOptions): Promise<IChatViewHostSessionStart> {
		const host = this.hostOf(sessionResource);
		this.claim(host);
		return host.startSession(sessionResource, options);
	}

	async newChat(target?: IChatViewNewChatTarget, options?: IChatViewHostNewChatOptions): Promise<boolean> {
		// An open or other request that completes meanwhile shows what it asked for, and a later New Chat its new chat: the New
		// Chat, superseded, claims nothing
		this.step({ kind: 'newChatStart' });
		const request = this.state.get().request;
		const superseded = () => this.state.get().request !== request;
		// Tells the hosts, as they start the new chat, once a later request superseded it
		const cts = new CancellationTokenSource();
		const supersession = runOnChange(this.state, state => {
			if (state.request !== request) {
				cts.cancel();
			}
		});
		const hostOptions = { ...options, token: cts.token };
		let host = this.host;
		let taken: boolean;
		try {
			taken = await host.newChat?.(target, hostOptions) ?? false;
			if (!taken && options?.ownChat && host !== this.chatViewHost && !superseded()) {
				host = this.chatViewHost;
				taken = await host.newChat?.(target, hostOptions) ?? false;
			}
		} finally {
			supersession.dispose();
			cts.dispose();
		}
		// Superseded meanwhile, a New Chat is handled, whether or not a host took it: neither the Chat view nor the chat widget
		// that New Chat acts on starts a new chat, which would replace what a later request shows, and it claims nothing
		if (superseded()) {
			return true;
		}
		if (taken) {
			this.step({ kind: 'newChatTaken', host, request });
		}
		return taken;
	}
}
