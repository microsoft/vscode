/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableFromEvent, observableValue, runOnChange } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatViewId, IChatWidget } from '../../chat.js';
import { IChatViewHost, IChatViewHostOpenOptions, IChatViewHostRevealOptions, IChatViewHostService, IChatViewHostSessionStart, IChatViewHostSessionStartOptions, IChatViewHostShownSession } from '../../chatViewHost.js';
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
		view?.reportOpened(sessionResource);
		return view?.widget;
	}

	async openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const chatView = await this.viewsService.openView<ChatViewPane>(ChatViewId, !options?.preserveFocus);
		if (chatView) {
			await chatView.loadSession(sessionResource, options?.sessionTypeSelectionReason);
			// Also a chat it showed already, which loading does not set again
			chatView.reportOpened(sessionResource);
			if (!options?.preserveFocus) {
				chatView.focusInput();
			}
		}
		return chatView?.widget;
	}

	newChat(): boolean {
		return this.viewsService.isViewVisible(ChatViewId) && !!this.viewsService.getViewWithId<ChatViewPane>(ChatViewId)?.newChat();
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
				await movedView.loadSession(movedSessionResource);
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

export class ChatViewHostService extends Disposable implements IChatViewHostService {

	declare readonly _serviceBrand: undefined;

	private readonly chatViewHost: IChatViewHost;
	/** The registrations of the hosts that replace the Chat view, the one in use last: one each, also of the same host. */
	private readonly registrations: { readonly host: IChatViewHost }[] = [];
	private readonly hostInUse: ISettableObservable<IChatViewHost>;
	/** The host that showed a chat last, whose shown chat the service reports. */
	private readonly latestHost: ISettableObservable<IChatViewHost>;

	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.chatViewHost = instantiationService.createInstance(ChatViewPaneHost);
		this.hostInUse = observableValue<IChatViewHost>(this, this.chatViewHost);
		this.latestHost = observableValue<IChatViewHost>(this, this.chatViewHost);
		this.shownSession = derived(this, reader => this.latestHost.read(reader).shownSession?.read(reader));
	}

	/** Tracks the chats that the Chat view shows while a host replaces it; without one, the Chat view is always the latest host. */
	private readonly chatViewTracking = this._register(new MutableDisposable());

	/** Makes `host` the latest host whenever it shows another chat, such as one it restores or one opened in it directly. */
	private trackShownSession(host: IChatViewHost): IDisposable {
		return host.shownSession ? runOnChange(host.shownSession, shown => {
			if (shown) {
				this.latestHost.set(host, undefined);
			}
		}) : Disposable.None;
	}

	private readonly _replaced = observableValue(this, false);
	readonly replaced: IObservable<boolean> = this._replaced;

	private get host(): IChatViewHost {
		return this.hostInUse.get();
	}

	/** The host of the chat of `sessionResource`: the Chat view, for a chat the host in use leaves to it. */
	private hostOf(sessionResource: URI): IChatViewHost {
		const host = this.host;
		return host.canShow?.(sessionResource) === false ? this.chatViewHost : host;
	}

	registerHost(host: IChatViewHost): IDisposable {
		const registration = { host };
		this.registrations.push(registration);
		this.updateHostInUse();
		const tracking = this.trackShownSession(host);
		return toDisposable(() => {
			tracking.dispose();
			const index = this.registrations.indexOf(registration);
			if (index >= 0) {
				this.registrations.splice(index, 1);
				this.updateHostInUse();
			}
		});
	}

	private updateHostInUse(): void {
		const host = this.registrations.at(-1)?.host ?? this.chatViewHost;
		this.hostInUse.set(host, undefined);
		this.latestHost.set(host, undefined);
		this._replaced.set(this.registrations.length > 0, undefined);
		if (this.registrations.length === 0) {
			this.chatViewTracking.clear();
		} else if (!this.chatViewTracking.value) {
			this.chatViewTracking.value = this.trackShownSession(this.chatViewHost);
		}
	}

	reveal(preserveFocus?: boolean, options?: IChatViewHostRevealOptions): Promise<IChatWidget | undefined> {
		return this.host.reveal(preserveFocus, options);
	}

	async revealIfShowing(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const host = this.hostOf(sessionResource);
		const widget = await host.revealIfShowing?.(sessionResource, options);
		if (widget) {
			this.latestHost.set(host, undefined);
		}
		return widget;
	}

	openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const host = this.hostOf(sessionResource);
		this.latestHost.set(host, undefined);
		return host.openSession(sessionResource, options);
	}

	toggle(): Promise<boolean> {
		return this.host.toggle();
	}

	startSession(sessionResource: URI, options: IChatViewHostSessionStartOptions): Promise<IChatViewHostSessionStart> {
		const host = this.hostOf(sessionResource);
		this.latestHost.set(host, undefined);
		return host.startSession(sessionResource, options);
	}

	newChat(): boolean {
		return this.host.newChat?.() ?? false;
	}
}
