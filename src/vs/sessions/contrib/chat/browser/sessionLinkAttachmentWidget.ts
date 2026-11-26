/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionLinkAttachment.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildExternalOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkConnectionAuthority, parseOpenSessionLinkTurnId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatAttachmentWidgetInstance, IChatAttachmentWidgetRegistry } from '../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { IChatRequestSessionLinkVariableEntry, isSessionLinkVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getChatCompletedStateIcon, getSessionAgentMergeConfigurationObservable, getSessionCompletedStateIcon } from '../../../../workbench/contrib/sessions/browser/sessionAgentMerge.js';
import { getSessionConversationStatusLabel } from '../../../../workbench/contrib/sessions/browser/sessionConversationGroups.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { SessionStatusIcon } from '../../../../workbench/contrib/sessions/browser/sessionStatusIcon.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { getUntitledSessionTitle, ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { findSessionForOpenSessionLink } from './openSessionLinkOpener.contribution.js';

/** What the pill of a session link shows of the session or chat that it links to. */
interface ISessionLinkState {
	/** The session or chat whose status the pill shows. */
	readonly resource: URI;
	readonly title: string;
	readonly status: SessionStatus;
	readonly isRead: boolean;
	readonly isArchived: boolean;
	readonly completedStateIcon: ThemeIcon | undefined;
}

/**
 * The pill of a link to an agent session in the chat input, see
 * {@link IChatRequestSessionLinkVariableEntry}. It shows the title of the
 * session, or of the chat that the link opens, with the status icon that the
 * sessions list shows beside it, and opens it when activated. Its context menu
 * copies the link.
 */
export class SessionLinkAttachmentWidget extends Disposable implements IChatAttachmentWidgetInstance {

	readonly element: HTMLElement;

	private readonly _onDidDelete = this._register(new Emitter<Event>());
	readonly onDidDelete = this._onDidDelete.event;

	private readonly _onDidOpen = this._register(new Emitter<void>());
	readonly onDidOpen = this._onDidOpen.event;

	private readonly _chatId: string | undefined;
	private _displayName: string;
	private _tooltip = '';

	/** The title of the linked session or chat, which changes along with it. */
	get displayName(): string {
		return this._displayName;
	}

	constructor(
		private readonly _attachment: IChatRequestSessionLinkVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IProductService private readonly _productService: IProductService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		const link = this._attachment.value;
		const backendSession = parseOpenSessionLinkUri(link);
		const connectionAuthority = parseOpenSessionLinkConnectionAuthority(link);
		this._chatId = parseOpenSessionLinkChatId(link);
		// What the pill is called while this window does not know the session that the link opens.
		const unknownName = this._chatId ? localize('sessionLinkAttachment.unknownChat', "Chat") : this._attachment.name;
		this._displayName = unknownName;

		this.element = dom.append(container, dom.$('.chat-attached-context-attachment.chat-session-link-attachment'));
		this.element.tabIndex = 0;
		this.element.role = 'button';
		this.element.style.cursor = 'pointer';
		if (options.supportsDeletion) {
			this._addRemoveHandlers(options.shouldFocusClearButton);
		}
		const iconContainer = dom.append(this.element, dom.$('span.chat-session-link-attachment-icon'));
		iconContainer.ariaHidden = 'true';
		const label = dom.append(this.element, dom.$('span.chat-attached-context-custom-text'));
		const statusIcon = this._register(instantiationService.createInstance(SessionStatusIcon, iconContainer));

		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		const session = derived(this, reader => {
			sessionsChanged.read(reader);
			return backendSession ? findSessionForOpenSessionLink(backendSession, sessionsManagementService, connectionsService, connectionAuthority) : undefined;
		});
		this._register(autorun(reader => {
			const current = session.read(reader);
			const state = current && this._readState(current, reader);
			this._displayName = state?.title ?? unknownName;
			label.textContent = this._displayName;
			if (state) {
				statusIcon.setStatus(state.status, state.isRead, state.isArchived, state.completedStateIcon, state.resource);
				const statusLabel = getSessionConversationStatusLabel(state.status);
				this._tooltip = localize('sessionLinkAttachment.tooltip', "{0} · {1}", state.title, statusLabel);
				this.element.ariaLabel = this._chatId
					? localize('sessionLinkAttachment.chatAriaLabel', "Link to chat {0}, {1}", state.title, statusLabel)
					: localize('sessionLinkAttachment.sessionAriaLabel', "Link to session {0}, {1}", state.title, statusLabel);
			} else {
				// The session is not one that this window knows, or not yet.
				statusIcon.reset();
				dom.append(iconContainer, dom.$(ThemeIcon.asCSSSelector(this._chatId ? Codicon.commentDiscussion : Codicon.agent)));
				this._tooltip = unknownName;
				this.element.ariaLabel = this._chatId
					? localize('sessionLinkAttachment.unknownChatAriaLabel', "Link to chat")
					: localize('sessionLinkAttachment.unknownSessionAriaLabel', "Link to session");
			}
		}));

		this._register(hoverService.setupDelayedHover(this.element, () => ({
			content: this._tooltip,
			style: HoverStyle.Pointer,
			position: { hoverPosition: HoverPosition.BELOW },
		}), { groupId: 'chat-attachments' }));

		this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, e => {
			if (dom.isHTMLElement(e.target) && e.target.closest('.monaco-button')) {
				return;
			}
			dom.EventHelper.stop(e, true);
			void this._open();
		}));
		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				void this._open();
			}
		}));
		this._register(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, e => {
			dom.EventHelper.stop(e, true);
			this._showContextMenu(new StandardMouseEvent(dom.getWindow(this.element), e));
		}));
	}

	/** The state of the chat that the link opens, as the sessions list shows it beside the chat, or else of the session. */
	private _readState(session: ISession, reader: IReader): ISessionLinkState {
		const chat = this._chatId ? session.chats.read(reader).find(candidate => candidate.resource.fragment === this._chatId) : undefined;
		// The Agent Merge configuration is cached per session and chat.
		const agentMergeConfiguration = () => getSessionAgentMergeConfigurationObservable(session, this._sessionsProvidersService, this._configurationService, chat);
		if (chat) {
			return {
				resource: chat.resource,
				title: chat.title.read(reader) || localize('sessionLinkAttachment.untitledChat', "Untitled Chat"),
				status: chat.status.read(reader),
				isRead: chat.isRead.read(reader),
				isArchived: chat.isArchived.read(reader),
				completedStateIcon: getChatCompletedStateIcon(session, chat, reader, agentMergeConfiguration),
			};
		}
		return {
			resource: session.resource,
			title: session.title.read(reader) || getUntitledSessionTitle(session.isQuickChat?.read(reader) ?? false),
			status: session.status.read(reader),
			// As the sessions list reads a session's row, whose peer chats are read in their own rows.
			isRead: session.mainChat.read(reader).isRead.read(reader),
			isArchived: session.isArchived.read(reader),
			completedStateIcon: getSessionCompletedStateIcon(session, reader, agentMergeConfiguration),
		};
	}

	/** Removes the pill as the other attachment pills do: with its clear button, Delete or Backspace, or a middle click. */
	private _addRemoveHandlers(shouldFocusClearButton: boolean): void {
		const hoverDelegate = this._register(createInstantHoverDelegate());
		const clearButton = this._register(new Button(this.element, {
			supportIcons: true,
			hoverDelegate,
			title: localize('sessionLinkAttachment.remove', "Remove"),
		}));
		clearButton.element.tabIndex = -1;
		clearButton.icon = Codicon.closeCompact;
		this._register(clearButton.onDidClick(e => this._onDidDelete.fire(e)));
		this._register(dom.addStandardDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
			if (e.keyCode === KeyCode.Backspace || e.keyCode === KeyCode.Delete) {
				dom.EventHelper.stop(e, true);
				this._onDidDelete.fire(e.browserEvent);
			}
		}));
		this._register(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e: MouseEvent) => {
			if (e.button === 1 /* Middle Button */) {
				dom.EventHelper.stop(e, true);
				this._onDidDelete.fire(e);
			}
		}));
		if (shouldFocusClearButton) {
			clearButton.focus();
		}
	}

	private async _open(): Promise<void> {
		await this._openerService.open(this._attachment.value, { fromUserGesture: true });
		this._onDidOpen.fire();
	}

	private _showContextMenu(anchor: StandardMouseEvent): void {
		const open = toAction({
			id: 'chat.sessionLinkAttachment.open',
			label: this._chatId ? localize('sessionLinkAttachment.openChat', "Open Chat") : localize('sessionLinkAttachment.openSession', "Open Session"),
			run: () => this._open(),
		});
		const copyLink = toAction({
			id: 'chat.sessionLinkAttachment.copyLink',
			label: localize('sessionLinkAttachment.copyLink', "Copy Link"),
			run: () => this._clipboardService.writeText(this._getShareableLink()),
		});
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => Separator.join([open], [copyLink]),
		});
	}

	/** The link that the sessions list copies for the session, which opens it from outside the window too. */
	private _getShareableLink(): string {
		const link = this._attachment.value;
		const backendSession = parseOpenSessionLinkUri(link);
		return backendSession
			? buildExternalOpenSessionLinkUri(this._productService.urlProtocol, backendSession, this._chatId, parseOpenSessionLinkTurnId(link), parseOpenSessionLinkConnectionAuthority(link))
			: link.toString();
	}
}

/** Shows the links to agent sessions in a chat input as {@link SessionLinkAttachmentWidget} pills. */
export class SessionLinkAttachmentWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.sessionLinkAttachmentWidget';

	constructor(
		@IChatAttachmentWidgetRegistry registry: IChatAttachmentWidgetRegistry,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(registry.registerFactory('sessionLink', (attachment, options, container) => {
			if (!isSessionLinkVariableEntry(attachment)) {
				throw new Error('Expected a session link attachment');
			}
			return instantiationService.createInstance(SessionLinkAttachmentWidget, attachment, options, container);
		}));
	}
}
