/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../../../base/common/async.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatViewId, IChatWidget } from '../../chat.js';
import { IChatViewHost, IChatViewHostOpenOptions, IChatViewHostRevealOptions, IChatViewHostService, IChatViewHostSessionStart, IChatViewHostSessionStartOptions } from '../../chatViewHost.js';
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
	) { }

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
		return view?.widget;
	}

	async openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		const chatView = await this.viewsService.openView<ChatViewPane>(ChatViewId, !options?.preserveFocus);
		if (chatView) {
			await chatView.loadSession(sessionResource, options?.sessionTypeSelectionReason);
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

export class ChatViewHostService implements IChatViewHostService {

	declare readonly _serviceBrand: undefined;

	private readonly chatViewHost: IChatViewHost;
	/** The registrations of the hosts that replace the Chat view, the one in use last: one each, also of the same host. */
	private readonly registrations: { readonly host: IChatViewHost }[] = [];

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.chatViewHost = instantiationService.createInstance(ChatViewPaneHost);
	}

	private get host(): IChatViewHost {
		return this.registrations.at(-1)?.host ?? this.chatViewHost;
	}

	registerHost(host: IChatViewHost): IDisposable {
		const registration = { host };
		this.registrations.push(registration);
		return toDisposable(() => {
			const index = this.registrations.indexOf(registration);
			if (index >= 0) {
				this.registrations.splice(index, 1);
			}
		});
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
