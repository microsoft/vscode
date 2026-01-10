/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentSessionsStartPage.css';
import '../widget/media/chat.css';
import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext, IEditorSerializer } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { AgentSessionsStartEditorOptions, AgentSessionsStartInput } from './agentSessionsStartInput.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary, hasValidDiff, IAgentSession } from '../agentSessions/agentSessionsModel.js';
import { isSessionInProgressStatus } from '../../common/chatSessionsService.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { fromNow } from '../../../../../base/common/date.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { editorBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_FOREGROUND } from '../../../../common/theme.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';

export class AgentSessionsStartPage extends EditorPane {

	static readonly ID = 'agentSessionsStartPage';

	private container: HTMLElement | undefined;
	private contentContainer: HTMLElement | undefined;
	private tabsContainer: HTMLElement | undefined;
	private sessionsGrid: HTMLElement | undefined;
	private chatWidgetContainer: HTMLElement | undefined;
	private chatWidget: ChatWidget | undefined;
	private readonly chatWidgetDisposable = this._register(new MutableDisposable());
	private readonly sessionDisposables = this._register(new DisposableStore());
	// private selectedTab: 'agents' | 'code' | 'learn' = 'agents';

	// Track expanded state for each section
	private readonly expandedSections = new Map<string, boolean>();
	// Track how many items to show per section (for "show more")
	private readonly visibleCounts = new Map<string, number>();
	private static readonly INITIAL_VISIBLE_COUNT = 4;
	private static readonly SHOW_MORE_INCREMENT = 6;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(AgentSessionsStartPage.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, dom.$('.agent-sessions-start-page'));
		this.contentContainer = dom.append(this.container, dom.$('.content.interactive-session'));

		// Initial page structure is created here
		this.createPageStructure();
	}

	private createPageStructure(): void {
		if (!this.contentContainer) {
			return;
		}

		// Header
		const header = dom.append(this.contentContainer, dom.$('.header'));
		const title = dom.append(header, dom.$('h1'));
		title.textContent = 'Agent Sessions';

		// Chat widget for input
		this.renderInputBox(this.contentContainer);

		// Sessions grid
		this.sessionsGrid = dom.append(this.contentContainer, dom.$('.sessions-grid'));
		this.renderSessions();

		// Footer link
		const footerLink = dom.append(this.contentContainer, dom.$('button.footer-link'));
		footerLink.textContent = localize('openAgentsPanel', "Open agents panel...");
		footerLink.onclick = () => {
			this.commandService.executeCommand('workbench.action.chat.open');
		};

		// Listen for session changes
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this.renderSessions();
		}));
	}

	private renderPage(): void {
		// Update dynamic parts only (tabs and sessions)
		if (this.tabsContainer) {
			dom.clearNode(this.tabsContainer);
			this.renderTabs(this.tabsContainer);
		}
		this.renderSessions();
	}

	private renderTabs(container: HTMLElement): void {
		// const tabsConfig: Array<{ id: 'agents' | 'code' | 'learn'; label: string }> = [
		// 	{ id: 'agents', label: 'AGENTS' },
		// 	{ id: 'code', label: 'CODE' },
		// 	{ id: 'learn', label: 'LEARN' },
		// ];

		// for (const tab of tabsConfig) {
		// 	const tabButton = dom.append(container, dom.$('button.tab'));
		// 	tabButton.textContent = tab.label;
		// 	if (tab.id === this.selectedTab) {
		// 		tabButton.classList.add('active');
		// 	}
		// 	tabButton.onclick = () => {
		// 		this.selectedTab = tab.id;
		// 		// Re-render tabs to update active state
		// 		dom.clearNode(container);
		// 		this.renderTabs(container);
		// 	};
		// }
	}

	private renderInputBox(container: HTMLElement): void {
		// Create container for the chat widget
		this.chatWidgetContainer = dom.append(container, dom.$('.chat-widget-container'));

		// Create editor overflow widgets container
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(dom.getWindow(this.chatWidgetContainer)).appendChild(dom.$('.chat-editor-overflow.monaco-editor'));
		this.chatWidgetDisposable.value = toDisposable(() => editorOverflowWidgetsDomNode.remove());

		// Create ChatWidget with same options as ChatViewPane
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.chatWidgetContainer));
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		this.chatWidget = this._register(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			{ viewId: AgentSessionsStartPage.ID },
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: false,
				supportsFileReferences: true,
				rendererOptions: {
					renderTextEditsAsSummary: () => true,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				editorOverflowWidgetsDomNode,
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: editorBackground,
				overlayBackground: editorBackground,
				inputEditorBackground: editorBackground,
				resultEditorBackground: editorBackground,
			}
		));

		this.chatWidget.render(this.chatWidgetContainer);
		this.chatWidget.setVisible(true);
	}

	private renderSessions(): void {
		if (!this.sessionsGrid) {
			return;
		}

		this.sessionDisposables.clear();
		dom.clearNode(this.sessionsGrid);

		const sessions = this.agentSessionsService.model.sessions;

		if (sessions.length === 0) {
			const emptyState = dom.append(this.sessionsGrid, dom.$('.empty-state'));
			emptyState.appendChild(renderIcon(Codicon.comment));
			const emptyText = dom.append(emptyState, dom.$('p'));
			emptyText.textContent = localize('noSessions', "No agent sessions yet. Start a new chat to begin.");
			return;
		}

		// Group sessions by section
		const now = Date.now();
		const dayMs = 24 * 60 * 60 * 1000;
		const weekMs = 7 * dayMs;
		const monthMs = 30 * dayMs;

		const inProgress: IAgentSession[] = [];
		const recent: IAgentSession[] = [];
		const thisMonth: IAgentSession[] = [];
		const older: IAgentSession[] = [];
		const archived: IAgentSession[] = [];

		for (const session of sessions) {
			if (session.isArchived()) {
				archived.push(session);
			} else if (isSessionInProgressStatus(session.status)) {
				inProgress.push(session);
			} else {
				const sessionTime = session.timing.endTime || session.timing.startTime;
				const age = now - sessionTime;
				if (age < weekMs) {
					recent.push(session);
				} else if (age < monthMs) {
					thisMonth.push(session);
				} else {
					older.push(session);
				}
			}
		}

		// Sort each group by time (most recent first)
		const sortByTime = (a: IAgentSession, b: IAgentSession) => {
			const aTime = a.timing.endTime || a.timing.startTime;
			const bTime = b.timing.endTime || b.timing.startTime;
			return bTime - aTime;
		};
		recent.sort(sortByTime);
		thisMonth.sort(sortByTime);
		older.sort(sortByTime);
		archived.sort(sortByTime);

		// Render sections - Active sessions are always expanded
		if (inProgress.length > 0) {
			this.renderCollapsibleSection('inProgress', localize('inProgress', "Active"), inProgress, true, false);
		}
		if (recent.length > 0) {
			this.renderCollapsibleSection('recent', localize('recent', "Recent"), recent, true, true);
		}
		if (thisMonth.length > 0) {
			this.renderCollapsibleSection('thisMonth', localize('thisMonth', "This Month"), thisMonth, true, true);
		}
		if (older.length > 0) {
			this.renderCollapsibleSection('older', localize('older', "Older"), older, false, true);
		}
		if (archived.length > 0) {
			this.renderCollapsibleSection('archived', localize('archived', "Archived"), archived, false, true);
		}
	}

	private renderCollapsibleSection(
		sectionId: string,
		label: string,
		sessions: IAgentSession[],
		defaultExpanded: boolean,
		allowShowMore: boolean
	): void {
		if (!this.sessionsGrid) {
			return;
		}

		// Initialize state if not set
		if (!this.expandedSections.has(sectionId)) {
			this.expandedSections.set(sectionId, defaultExpanded);
		}
		if (!this.visibleCounts.has(sectionId)) {
			this.visibleCounts.set(sectionId, AgentSessionsStartPage.INITIAL_VISIBLE_COUNT);
		}

		const isExpanded = this.expandedSections.get(sectionId)!;
		const visibleCount = this.visibleCounts.get(sectionId)!;

		// Section container
		const sectionContainer = dom.append(this.sessionsGrid, dom.$('.session-section'));
		sectionContainer.classList.toggle('collapsed', !isExpanded);
		sectionContainer.classList.toggle('archived-section', sectionId === 'archived');

		// Header with chevron, label, and count
		const sectionHeader = dom.append(sectionContainer, dom.$('.section-header'));
		sectionHeader.onclick = () => {
			this.expandedSections.set(sectionId, !isExpanded);
			this.renderSessions();
		};

		const chevron = dom.append(sectionHeader, dom.$('.section-chevron'));
		chevron.appendChild(renderIcon(isExpanded ? Codicon.chevronDown : Codicon.chevronRight));

		const labelSpan = dom.append(sectionHeader, dom.$('.section-label'));
		labelSpan.textContent = label;

		const countBadge = dom.append(sectionHeader, dom.$('.section-count'));
		countBadge.textContent = `${sessions.length}`;

		// Content (only if expanded)
		if (isExpanded) {
			const sectionGrid = dom.append(sectionContainer, dom.$('.section-grid'));

			// Show limited number of sessions
			const sessionsToShow = allowShowMore ? sessions.slice(0, visibleCount) : sessions;
			for (const session of sessionsToShow) {
				this.renderSessionCard(session, sectionGrid);
			}

			// Show more / Show less buttons
			if (allowShowMore && sessions.length > AgentSessionsStartPage.INITIAL_VISIBLE_COUNT) {
				const actionsRow = dom.append(sectionContainer, dom.$('.section-actions'));

				if (visibleCount < sessions.length) {
					const showMoreBtn = dom.append(actionsRow, dom.$('button.show-more-btn'));
					const remaining = sessions.length - visibleCount;
					showMoreBtn.textContent = remaining > AgentSessionsStartPage.SHOW_MORE_INCREMENT
						? localize('showMore', "Show {0} more...", Math.min(remaining, AgentSessionsStartPage.SHOW_MORE_INCREMENT))
						: localize('showAll', "Show all ({0} more)", remaining);
					showMoreBtn.onclick = (e) => {
						e.stopPropagation();
						this.visibleCounts.set(sectionId, visibleCount + AgentSessionsStartPage.SHOW_MORE_INCREMENT);
						this.renderSessions();
					};
				}

				if (visibleCount > AgentSessionsStartPage.INITIAL_VISIBLE_COUNT) {
					const showLessBtn = dom.append(actionsRow, dom.$('button.show-less-btn'));
					showLessBtn.textContent = localize('showLess', "Show less");
					showLessBtn.onclick = (e) => {
						e.stopPropagation();
						this.visibleCounts.set(sectionId, AgentSessionsStartPage.INITIAL_VISIBLE_COUNT);
						this.renderSessions();
					};
				}
			}
		}
	}

	private renderSessionCard(session: IAgentSession, container: HTMLElement): void {
		const card = dom.append(container, dom.$('.session-card'));
		card.onclick = () => {
			this.commandService.executeCommand('workbench.action.chat.open', {
				sessionId: session.resource.toString()
			});
		};

		// Icon column
		const iconCol = dom.append(card, dom.$('.session-icon-col'));
		const icon = this.getSessionIcon(session);
		const iconEl = dom.append(iconCol, dom.$(`.session-icon.${ThemeIcon.asClassName(icon)}`));
		iconEl.classList.add('codicon');

		// Main content column
		const mainCol = dom.append(card, dom.$('.session-main-col'));

		// Title row
		const titleRow = dom.append(mainCol, dom.$('.session-title-row'));
		const title = dom.append(titleRow, dom.$('.session-title'));
		title.textContent = session.label || localize('untitledSession', "Untitled Session");
		title.title = session.label || '';

		// Details row
		const detailsRow = dom.append(mainCol, dom.$('.session-details-row'));

		// Diff container (if has changes)
		const changesSummary = getAgentChangesSummary(session.changes);
		if (!isSessionInProgressStatus(session.status) && changesSummary && hasValidDiff(session.changes)) {
			const diffContainer = dom.append(detailsRow, dom.$('.session-diff-container'));
			if (changesSummary.files > 0) {
				const filesSpan = dom.append(diffContainer, dom.$('span.diff-files'));
				filesSpan.textContent = changesSummary.files === 1
					? localize('diffFile', "1 file")
					: localize('diffFiles', "{0} files", changesSummary.files);
			}
			if (changesSummary.insertions >= 0) {
				const addSpan = dom.append(diffContainer, dom.$('span.diff-added'));
				addSpan.textContent = `+${changesSummary.insertions}`;
			}
			if (changesSummary.deletions >= 0) {
				const delSpan = dom.append(diffContainer, dom.$('span.diff-removed'));
				delSpan.textContent = `-${changesSummary.deletions}`;
			}
		}

		// Badge (from session.badge)
		if (!isSessionInProgressStatus(session.status) && session.badge) {
			const badge = dom.append(detailsRow, dom.$('.session-badge'));
			badge.textContent = typeof session.badge === 'string' ? session.badge : session.badge.value;
		}

		// Description
		const description = dom.append(detailsRow, dom.$('.session-description'));
		if (isSessionInProgressStatus(session.status)) {
			description.textContent = session.description?.toString() || localize('working', "Working...");
		} else if (session.status === AgentSessionStatus.NeedsInput) {
			description.textContent = localize('needsInput', "Input needed.");
		} else if (session.status === AgentSessionStatus.Failed) {
			description.textContent = localize('failed', "Failed");
		} else if (!changesSummary && !session.badge) {
			description.textContent = localize('completed', "Completed");
		}

		// Status (provider + time)
		const status = dom.append(detailsRow, dom.$('.session-status'));
		const timeLabel = fromNow(session.timing.endTime || session.timing.startTime);
		status.textContent = `${session.providerLabel} · ${timeLabel}`;
	}

	private getSessionIcon(session: IAgentSession): ThemeIcon {
		if (session.status === AgentSessionStatus.InProgress) {
			return Codicon.sessionInProgress;
		}
		if (session.status === AgentSessionStatus.NeedsInput) {
			return Codicon.report;
		}
		if (session.status === AgentSessionStatus.Failed) {
			return Codicon.error;
		}
		if (!session.isRead() && !session.isArchived()) {
			return Codicon.circleFilled;
		}
		return Codicon.circleSmallFilled;
	}

	override async setInput(input: AgentSessionsStartInput, options: AgentSessionsStartEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		// if (options?.selectedTab) {
		// 	this.selectedTab = options.selectedTab;
		// }

		this.renderPage();
	}

	override layout(dimension: dom.Dimension): void {
		// Layout the chat widget if it exists
		if (this.chatWidget && this.chatWidgetContainer) {
			// Chat widget needs a proper height to layout the input part correctly
			// Use a small height since we're hiding the list area
			this.chatWidget.layout(150, Math.max(300, dimension.width - 80));
		}
	}

	override focus(): void {
		super.focus();
		// Focus the chat widget input
		this.chatWidget?.focusInput();
	}
}

export class AgentSessionsStartInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: AgentSessionsStartInput): boolean {
		return true;
	}

	serialize(editorInput: AgentSessionsStartInput): string {
		return JSON.stringify({ selectedTab: editorInput.selectedTab });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): AgentSessionsStartInput {
		try {
			const data = JSON.parse(serializedEditorInput);
			return new AgentSessionsStartInput({ selectedTab: data.selectedTab });
		} catch {
			return new AgentSessionsStartInput({});
		}
	}
}
