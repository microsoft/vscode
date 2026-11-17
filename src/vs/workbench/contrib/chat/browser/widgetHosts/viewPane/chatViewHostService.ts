/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../../../base/common/async.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatViewId, IChatWidget } from '../../chat.js';
import { getChatViewHostOpenReason, IChatViewHost, IChatViewHostOpenOptions, IChatViewHostRevealOptions, IChatViewHostService, IChatViewHostSessionStart, IChatViewHostSessionStartOptions, IChatViewHostShownSession } from '../../chatViewHost.js';
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

export class ChatViewHostService implements IChatViewHostService {

	declare readonly _serviceBrand: undefined;

	private readonly chatViewHost: IChatViewHost;
	/** The registrations of the hosts that replace the Chat view, the one in use last: one each, also of the same host. */
	private readonly registrations: { readonly host: IChatViewHost }[] = [];
	private readonly hostInUse: ISettableObservable<IChatViewHost>;

	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.chatViewHost = instantiationService.createInstance(ChatViewPaneHost);
		this.hostInUse = observableValue<IChatViewHost>(this, this.chatViewHost);
		this.shownSession = derived(this, reader => this.hostInUse.read(reader).shownSession?.read(reader));
	}

	private get host(): IChatViewHost {
		return this.hostInUse.get();
	}

	registerHost(host: IChatViewHost): IDisposable {
		const registration = { host };
		this.registrations.push(registration);
		this.updateHostInUse();
		return toDisposable(() => {
			const index = this.registrations.indexOf(registration);
			if (index >= 0) {
				this.registrations.splice(index, 1);
				this.updateHostInUse();
			}
		});
	}

	private updateHostInUse(): void {
		this.hostInUse.set(this.registrations.at(-1)?.host ?? this.chatViewHost, undefined);
	}

	reveal(preserveFocus?: boolean, options?: IChatViewHostRevealOptions): Promise<IChatWidget | undefined> {
		return this.host.reveal(preserveFocus, options);
	}

	async revealIfShowing(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		return this.host.revealIfShowing?.(sessionResource, options);
	}

	openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		return this.host.openSession(sessionResource, options);
	}

	toggle(): Promise<boolean> {
		return this.host.toggle();
	}

	startSession(sessionResource: URI, options: IChatViewHostSessionStartOptions): Promise<IChatViewHostSessionStart> {
		return this.host.startSession(sessionResource, options);
	}
}
