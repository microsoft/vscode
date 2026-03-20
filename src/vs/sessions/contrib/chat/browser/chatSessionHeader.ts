/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatSessionHeader.css';
import { $, addDisposableListener, append, EventType } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionsPicker } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsPicker.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ChatViewId } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';

/**
 * Renders a PR-style header at the top of the chat messages area.
 * Displays: session title + folder name (no diff numbers).
 */
class ChatSessionHeaderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.chatSessionHeader';

	private readonly headerElement: HTMLElement;
	private readonly titleElement: HTMLElement;
	private readonly repoElement: HTMLElement;
	private readonly iconElement: HTMLElement;
	private readonly markDoneButton: Button;
	private readonly modelChangeListener = this._register(new MutableDisposable());
	private lastRenderState: string | undefined;
	private isRendering = false;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IChatService private readonly chatService: IChatService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		// Create header DOM (will be inserted when a chat container is found)
		this.headerElement = $('.chat-session-header');

		const headerContent = append(this.headerElement, $('.chat-session-header-content'));
		headerContent.setAttribute('role', 'button');
		headerContent.setAttribute('aria-label', localize('showSessions', "Show Sessions"));
		headerContent.tabIndex = 0;

		// Title row: title + done button
		const titleRow = append(headerContent, $('.chat-session-header-title-row'));
		this.titleElement = append(titleRow, $('span.chat-session-header-title'));

		// Mark as Done button
		const buttonContainer = append(titleRow, $('.chat-session-header-actions'));
		this._register(addDisposableListener(buttonContainer, EventType.CLICK, e => {
			e.stopPropagation();
		}));
		this.markDoneButton = this._register(new Button(buttonContainer, { supportIcons: true, ...defaultButtonStyles }));
		this.markDoneButton.label = `$(check) ${localize('markAsDone', "Mark as Done")}`;
		this._register(this.markDoneButton.onDidClick(() => this.markAsDone()));

		// Repo row: icon + folder name
		const repoRow = append(headerContent, $('span.chat-session-header-repo-row'));
		this.iconElement = append(repoRow, $('span.chat-session-header-icon'));
		this.repoElement = append(repoRow, $('span.chat-session-header-repo'));

		// Click handler — show sessions picker (same as titlebar)
		this._register(addDisposableListener(headerContent, EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			this.showSessionsPicker();
		}));

		this._register(addDisposableListener(headerContent, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.showSessionsPicker();
			}
		}));

		// Watch active session changes
		this._register(autorun(reader => {
			const activeSession = this.sessionsManagementService.activeSession.read(reader);
			this.trackModelChanges(activeSession?.resource);
			this.lastRenderState = undefined;
			this.render();
		}));

		// Watch session data changes
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this.lastRenderState = undefined;
			this.render();
		}));

		// Periodically try to inject into the DOM (chat widget may not exist yet)
		this.ensureInjected();
	}

	private tryInject(): boolean {
		const view = this.viewsService.getViewWithId<ViewPane>(ChatViewId);
		if (!view?.element) {
			return false;
		}
		// Re-inject if the header is not a child of the current view element
		// (view may have been recreated on session switch)
		if (this.headerElement.parentElement !== view.element) {
			view.element.insertBefore(this.headerElement, view.element.firstChild);
		}
		return true;
	}

	private ensureInjected(): void {
		if (!this.tryInject()) {
			// Retry when the chat view becomes visible
			this._register(this.viewsService.onDidChangeViewVisibility(e => {
				if (e.id === ChatViewId && e.visible) {
					this.tryInject();
				}
			}));
		}
	}

	private render(): void {
		if (this.isRendering) {
			return;
		}
		this.isRendering = true;
		try {
			// Ensure header is in the DOM (may have been created before the view mounted)
			this.tryInject();

			const label = this.getLabel();
			const icon = this.getIcon();
			const repoLabel = this.getRepoLabel();

			const renderState = `${icon?.id ?? ''}|${label}|${repoLabel ?? ''}`;
			if (this.lastRenderState === renderState) {
				return;
			}
			this.lastRenderState = renderState;

			// Icon
			this.iconElement.className = 'chat-session-header-icon';
			if (icon) {
				this.iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
				this.iconElement.style.display = '';
			} else {
				this.iconElement.style.display = 'none';
			}

			// Title
			this.titleElement.textContent = label;

			// Repo folder
			if (repoLabel) {
				this.repoElement.textContent = repoLabel;
				this.repoElement.style.display = '';
			} else {
				this.repoElement.style.display = 'none';
			}

			// Show the button only when there is an active session with an agent session
			const activeSession = this.sessionsManagementService.getActiveSession();
			const hasAgentSession = activeSession ? !!this.agentSessionsService.getSession(activeSession.resource) : false;
			this.markDoneButton.element.style.display = hasAgentSession ? '' : 'none';
		} finally {
			this.isRendering = false;
		}
	}

	private getLabel(): string {
		const activeSession = this.sessionsManagementService.getActiveSession();
		if (activeSession?.label) {
			return activeSession.label;
		}
		if (activeSession) {
			const model = this.chatService.getSession(activeSession.resource);
			if (model?.title) {
				return model.title;
			}
		}
		return localize('newSession', "New Session");
	}

	private getIcon(): ThemeIcon | undefined {
		const activeSession = this.sessionsManagementService.getActiveSession();
		if (!activeSession) {
			return undefined;
		}
		const agentSession = this.agentSessionsService.getSession(activeSession.resource);
		if (agentSession) {
			if (agentSession.providerType === AgentSessionProviders.Background) {
				const hasWorktree = typeof agentSession.metadata?.worktreePath === 'string';
				return hasWorktree ? Codicon.worktree : Codicon.folder;
			}
			return agentSession.icon;
		}
		const provider = getAgentSessionProvider(activeSession.resource);
		if (provider !== undefined) {
			return getAgentSessionProviderIcon(provider);
		}
		return undefined;
	}

	private getRepoLabel(): string | undefined {
		const activeSession = this.sessionsManagementService.getActiveSession();
		if (!activeSession?.repository) {
			return undefined;
		}
		return basename(activeSession.repository);
	}

	private markAsDone(): void {
		const activeSession = this.sessionsManagementService.getActiveSession();
		if (!activeSession) {
			return;
		}
		const agentSession = this.agentSessionsService.getSession(activeSession.resource);
		if (agentSession) {
			agentSession.setArchived(true);
		}
		this.sessionsManagementService.openNewSessionView();
	}

	private showSessionsPicker(): void {
		const picker = this.instantiationService.createInstance(AgentSessionsPicker, undefined, {
			overrideSessionOpen: (session, openOptions) => this.sessionsManagementService.openSession(session.resource, openOptions)
		});
		picker.pickAgentSession();
	}

	private trackModelChanges(resource: URI | undefined): void {
		this.modelChangeListener.clear();
		if (!resource) {
			return;
		}
		const model = this.chatService.getSession(resource);
		if (!model) {
			return;
		}
		this.modelChangeListener.value = model.onDidChange(e => {
			if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
				this.lastRenderState = undefined;
				this.render();
			}
		});
	}
}

registerWorkbenchContribution2(ChatSessionHeaderContribution.ID, ChatSessionHeaderContribution, WorkbenchPhase.AfterRestored);
