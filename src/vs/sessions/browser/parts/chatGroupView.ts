/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, size, trackFocus } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize } from '../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording } from '../../../platform/chat/common/sessionArchiveActions.js';
import { ChatInteractivity, IChat, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { UNARCHIVE_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ChatCompositeBar, IChatCompositeBarDelegate } from './chatCompositeBar.js';
import { SessionReadOnlyBanner } from './sessionReadOnlyBanner.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from './chatView.js';

/**
 * The data + callbacks a {@link ChatGroupView} needs from its owning
 * {@link ChatGroupsView}. Each group renders a subset of the session's chats.
 */
export interface IChatGroupContext {

	/** The session whose chats are partitioned across groups. */
	readonly session: IActiveSession;

	/** Options forwarded to the new-chat views the group creates. */
	readonly options: IChatViewOptions;

	/** The chats assigned to this group, in tab order. */
	readonly chats: IObservable<readonly IChat[]>;

	/** The resource (as a string) of the chat shown by this group. */
	readonly activeChatResource: IObservable<string>;

	/** The session's main chat resource (as a string); its tab is not closeable. */
	readonly mainChatResource: IObservable<string>;

	/** Whether the group's tab strip should be shown. */
	readonly tabsVisible: IObservable<boolean>;

	/** Whether this group's tab row replaces the session header and shows its actions. */
	readonly showSessionActions: IObservable<boolean>;

	/** Activate (show + focus) the given chat within this group. */
	openChat(resource: URI): void;

	/** A chat tab drag has started for the given chat. */
	onTabDragStart(resource: URI): void;

	/** A chat tab drag has ended. */
	onTabDragEnd(): void;
}

/**
 * A single leaf in the {@link ChatGroupsView} grid. Hosts a
 * {@link ChatCompositeBar} (this group's chats) on top of a kind-switched
 * {@link AbstractChatView} that renders the group's active chat.
 */
export class ChatGroupView extends Disposable implements ISerializableView {

	static readonly TYPE = 'sessions.chatGroupView';

	readonly element: HTMLElement = $('.chat-group-view');

	readonly minimumWidth = 200;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 200;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	/** Fires when keyboard focus enters this group (any of its descendants). */
	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private readonly _compositeBar: ChatCompositeBar;
	private readonly _barContainer: HTMLElement;
	private readonly _readOnlyBanner: SessionReadOnlyBanner;
	private readonly _contentContainer: HTMLElement;

	private readonly _currentView = this._register(new MutableDisposable<AbstractChatView>());
	private readonly _contextDisposables = this._register(new DisposableStore());

	/** The configured wording for the archive/unarchive action (Archive vs Delete). */
	private readonly _archiveActionWording: IObservable<ReturnType<typeof getChatSessionArchiveActionWording>>;

	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	/** Whether this group is the active (focused) group within the session. */
	private _groupActive = false;
	/** Whether this group's session is the active session in the sessions part. */
	private _sessionActive = true;
	/** Whether this group's session is currently visible in the sessions part. */
	private _sessionVisible = true;
	/** Index of this group within the persisted layout, written into {@link toJSON}. */
	private _serializationIndex = 0;

	constructor(
		@IChatViewFactory private readonly _chatViewFactory: IChatViewFactory,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._archiveActionWording = observableFromEvent(
			this,
			configurationService.onDidChangeConfiguration,
			() => getChatSessionArchiveActionWording(configurationService),
		);

		this._barContainer = $('.chat-group-view-bar');
		this.element.appendChild(this._barContainer);

		this._compositeBar = this._register(instantiationService.createInstance(ChatCompositeBar, undefined));
		this._barContainer.appendChild(this._compositeBar.element);

		// Read-only status banner, shown flush below this group's tab bar when the
		// group's active chat is non-interactive, in place of the composer which
		// is hidden for read-only chats.
		this._readOnlyBanner = this._register(new SessionReadOnlyBanner());
		this._barContainer.appendChild(this._readOnlyBanner.domNode);

		this._contentContainer = $('.chat-group-view-content');
		this.element.appendChild(this._contentContainer);

		this._register(this._compositeBar.onDidChangeVisibility(() => this._layoutChildren()));
		this._register(this._compositeBar.onDidChangeHeight(() => this._layoutChildren()));

		const focusTracker = this._register(trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
	}

	setGroupPosition(index: number, count: number): void {
		if (count <= 1) {
			this.element.removeAttribute('role');
			this.element.removeAttribute('aria-label');
			this._compositeBar.setAriaLabel(localize('chatTabsAriaLabel', "Chats"));
			return;
		}

		this.element.setAttribute('role', 'region');
		this.element.setAttribute('aria-label', localize('chatGroupAriaLabel', "Chat Group {0} of {1}", index + 1, count));
		this._compositeBar.setAriaLabel(localize('chatGroupTabsAriaLabel', "Chats, Group {0} of {1}", index + 1, count));
	}

	/** Sets (or clears) the group this view renders. */
	setContext(context: IChatGroupContext | undefined): void {
		this._contextDisposables.clear();

		if (!context) {
			this._compositeBar.setGroup(undefined);
			this._currentView.clear();
			this._contentContainer.replaceChildren();
			return;
		}

		const delegate: IChatCompositeBarDelegate = {
			session: context.session,
			chats: context.chats,
			activeChatResource: context.activeChatResource,
			mainChatResource: context.mainChatResource,
			visible: context.tabsVisible,
			showSessionActions: context.showSessionActions,
			openChat: resource => context.openChat(resource),
			onTabDragStart: resource => context.onTabDragStart(resource),
			onTabDragEnd: () => context.onTabDragEnd(),
		};
		this._compositeBar.setGroup(delegate);

		const activeChat = derived(reader => {
			const activeResource = context.activeChatResource.read(reader);
			return context.chats.read(reader).find(c => c.resource.toString() === activeResource);
		});

		this._contextDisposables.add(autorun(reader => {
			const session = context.session;
			const chat = activeChat.read(reader);

			let desiredKind: ChatViewKind;
			if (session.isCreated.read(reader) === false) {
				desiredKind = session.isNewSessionRequestInProgress?.read(reader) === true
					? 'chat'
					: 'newSession';
			} else if (!chat || (chat.status.read(reader) === SessionStatus.Untitled && chat.interactivity.read(reader) === ChatInteractivity.Full)) {
				desiredKind = 'newChatInSession';
			} else {
				desiredKind = 'chat';
			}

			let view = this._currentView.value;
			if (!view || view.kind !== desiredKind) {
				view = desiredKind === 'chat'
					? this._chatViewFactory.createChatView()
					: this._chatViewFactory.createNewChatView(desiredKind === 'newChatInSession', context.options);
				this._contentContainer.replaceChildren(view.element);
				this._currentView.value = view;
				view.setActive(this._sessionActive);
				view.setVisible(this._sessionVisible);
				this._layoutChildren();
			}

			if (chat) {
				view.setChat(chat, session.sessionId, session);
			}

			// Show the read-only banner in place of the composer when the group's
			// active chat is non-interactive (e.g. a subagent transcript or an
			// archived session).
			const readOnly = !!chat && chat.interactivity.read(reader) !== ChatInteractivity.Full;
			if (readOnly) {
				const archived = session.isArchived.read(reader);
				if (archived) {
					const action = getChatSessionArchiveActionPresentation(this._archiveActionWording.read(reader)).unarchive;
					this._readOnlyBanner.setContent({
						message: localize('sessionReadOnlyBanner.archived', "Archived sessions are read-only."),
						action: {
							label: action.title.value,
							run: () => this._commandService.executeCommand(UNARCHIVE_SESSION_COMMAND_ID, session),
						},
					});
				} else {
					this._readOnlyBanner.setContent({ message: localize('sessionReadOnlyBanner.message', "This chat is read-only") });
				}
			}
			// Only re-layout when the banner's visibility (and thus its
			// contribution to the bar height) actually changes.
			if (this._readOnlyBanner.visible !== readOnly) {
				this._readOnlyBanner.setVisible(readOnly);
				this._layoutChildren();
			}
		}));
	}

	/** Whether this group is the active (focused) group within the session. */
	setGroupActive(active: boolean): void {
		this._groupActive = active;
		this.element.classList.toggle('active-group', active);
	}

	get groupActive(): boolean {
		return this._groupActive;
	}

	/** Whether this group's session is the active session in the sessions part. */
	setSessionActive(active: boolean): void {
		if (this._sessionActive === active) {
			return;
		}
		this._sessionActive = active;
		this._currentView.value?.setActive(active);
	}

	/** Whether this group's session is currently visible in the sessions part. */
	setSessionVisible(visible: boolean): void {
		if (this._sessionVisible === visible) {
			return;
		}
		this._sessionVisible = visible;
		this._currentView.value?.setVisible(visible);
	}

	submitInput(): Promise<boolean> {
		return this._currentView.value?.submitInput() ?? Promise.resolve(false);
	}

	selectWorkspace(folderUri: URI, providerId?: string): void {
		this._currentView.value?.selectWorkspace(folderUri, providerId);
	}

	prefillInput(text: string): void {
		this._currentView.value?.prefillInput(text);
	}

	sendQuery(text: string): void {
		this._currentView.value?.sendQuery(text);
	}

	attach(uris: URI[]): void {
		this._currentView.value?.attach(uris);
	}

	layout(width: number, height: number, top: number, left: number): void {
		size(this.element, width, height);
		this._lastLayout = { width, height, top, left };
		this._layoutChildren();
	}

	private _layoutChildren(): void {
		if (!this._lastLayout) {
			return;
		}
		const { width, height, top, left } = this._lastLayout;
		const tabsHeight = this._compositeBar.visible ? this._compositeBar.height : 0;
		const bannerHeight = this._readOnlyBanner.visible ? this._readOnlyBanner.domNode.offsetHeight : 0;
		const barHeight = tabsHeight + bannerHeight;
		size(this._barContainer, width, barHeight);
		this._currentView.value?.layout(width, height - barHeight, top + barHeight, left);
	}

	/** Sets the index this group serializes as, so the grid deserializer can map nodes back to groups. */
	setSerializationIndex(index: number): void {
		this._serializationIndex = index;
	}

	toJSON(): object {
		return { type: ChatGroupView.TYPE, index: this._serializationIndex };
	}

	focus(): void {
		this._currentView.value?.focus();
	}
}
