/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentSessionInputNeededNotification.css';
import { $, addDisposableListener, EventType, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionStatus, IAgentSession } from './agentSessionsModel.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { openSession } from './agentSessionsOpener.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

/**
 * Widget that displays a notification badge in the command center when agent sessions need user input.
 * Shows report icon + count and clicking opens the most urgent session needing attention.
 * Enabled by default for all users.
 */
export class AgentSessionInputNeededNotificationWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	/** The currently displayed session needing attention */
	private _displayedSession: IAgentSession | undefined;

	/** First focusable element for keyboard navigation */
	private _firstFocusableElement: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(undefined, action, options);

		// Re-render when sessions change
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._render();
		}));

		// Re-render when chat widgets are added or backgrounded
		this._register(this.chatWidgetService.onDidAddWidget(() => {
			this._render();
		}));

		this._register(this.chatWidgetService.onDidBackgroundSession(() => {
			this._render();
		}));

		// Re-render when configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentSessionInputNeededNotification)) {
				this._render();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._container = container;
		container.classList.add('agent-session-input-needed-notification-container');
		container.tabIndex = -1;

		// Initial render
		this._render();
	}

	override focus(): void {
		this._firstFocusableElement?.focus();
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		// Clear previous render
		this._dynamicDisposables.clear();
		reset(this._container);
		this._firstFocusableElement = undefined;
		this._displayedSession = undefined;

		// Check if feature is enabled
		const isEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentSessionInputNeededNotification) !== false;
		if (!isEnabled) {
			return;
		}

		// Get sessions needing input (excluding those with open widgets)
		const attentionNeededSessions = this._getSessionsNeedingAttention();
		if (attentionNeededSessions.length === 0) {
			return;
		}

		// Get the most urgent session
		const { session, description } = this._getMostUrgentSession(attentionNeededSessions);
		this._displayedSession = session;

		// Create notification badge
		const badge = $('div.input-needed-badge');
		badge.setAttribute('role', 'button');
		badge.tabIndex = 0;
		this._firstFocusableElement = badge;
		this._container.appendChild(badge);

		// Report icon
		const icon = $('span.input-needed-icon');
		reset(icon, renderIcon(Codicon.report));
		badge.appendChild(icon);

		// Count
		const count = $('span.input-needed-count');
		count.textContent = String(attentionNeededSessions.length);
		badge.appendChild(count);

		// Description text (if available)
		if (description) {
			const text = $('span.input-needed-text');
			text.textContent = description;
			badge.appendChild(text);
		}

		// Setup hover tooltip
		const hoverDelegate = getDefaultHoverDelegate('mouse');
		const tooltip = attentionNeededSessions.length === 1
			? (description
				? localize('openSessionTooltip', "Click to open session: {0}", description)
				: localize('needsInputTooltip1Simple', "Session needs input"))
			: localize('needsInputTooltip', "{0} sessions need input", attentionNeededSessions.length);
		this._dynamicDisposables.add(this.hoverService.setupManagedHover(hoverDelegate, badge, tooltip));

		// Click handler
		this._dynamicDisposables.add(addDisposableListener(badge, EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._handleClick();
		}));

		// Keyboard handler
		this._dynamicDisposables.add(addDisposableListener(badge, EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._handleClick();
			}
		}));
	}

	/**
	 * Get sessions that need user input and don't have an open widget
	 */
	private _getSessionsNeedingAttention(): IAgentSession[] {
		const sessions = this.agentSessionsService.model.sessions;
		return sessions.filter(s =>
			s.status === AgentSessionStatus.NeedsInput &&
			!s.isArchived() &&
			!this.chatWidgetService.getWidgetBySessionResource(s.resource)
		);
	}

	/**
	 * Get the session most urgently needing attention (most recently started)
	 */
	private _getMostUrgentSession(sessions: IAgentSession[]): { session: IAgentSession; description: string | undefined } {
		// Sort by most recently started request
		const sorted = [...sessions].sort((a, b) => {
			const timeA = a.timing.lastRequestStarted ?? a.timing.created;
			const timeB = b.timing.lastRequestStarted ?? b.timing.created;
			return timeB - timeA;
		});

		const mostRecent = sorted[0];
		let description: string | undefined;

		if (mostRecent.description) {
			// Convert markdown to plain text if needed
			description = typeof mostRecent.description === 'string'
				? mostRecent.description
				: renderAsPlaintext(mostRecent.description);
		} else {
			description = mostRecent.label;
		}

		return { session: mostRecent, description };
	}

	/**
	 * Handle click - opens the displayed session
	 */
	private _handleClick(): void {
		if (this._displayedSession) {
			this.instantiationService.invokeFunction(openSession, this._displayedSession);
		}
	}
}

/**
 * Contribution that renders the input needed notification widget in the command center
 */
export class AgentSessionInputNeededNotificationRendering extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.agentSessionInputNeededNotification';

	private readonly _hasSessionsNeedingInputContext: IContextKey<boolean>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IHoverService hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// Create context key for controlling visibility
		this._hasSessionsNeedingInputContext = ChatContextKeys.hasAgentSessionsNeedingInput.bindTo(contextKeyService);

		// Check if AI features are hidden - if so, don't show notification
		if (chatEntitlementService.sentiment.hidden) {
			return;
		}

		// Update context key when sessions change
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._updateContextKey();
		}));

		// Update context key when chat widgets are added or backgrounded
		this._register(this.chatWidgetService.onDidAddWidget(() => {
			this._updateContextKey();
		}));

		this._register(this.chatWidgetService.onDidBackgroundSession(() => {
			this._updateContextKey();
		}));

		// Initial update
		this._updateContextKey();

		// React to sentiment changes to hide UI if AI features become disabled
		this._register(chatEntitlementService.onDidChangeSentiment(() => {
			if (chatEntitlementService.sentiment.hidden) {
				this._hasSessionsNeedingInputContext.set(false);
			}
		}));
	}

	private _updateContextKey(): void {
		// Get sessions needing input (excluding those with open widgets)
		const attentionNeededSessions = this.agentSessionsService.model.sessions.filter(s =>
			s.status === AgentSessionStatus.NeedsInput &&
			!s.isArchived() &&
			!this.chatWidgetService.getWidgetBySessionResource(s.resource)
		);

		this._hasSessionsNeedingInputContext.set(attentionNeededSessions.length > 0);
	}
}
