/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { extUri } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { localize } from '../../../../nls.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { SessionWorktreeCleanupEditorFocusedContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, CLEANUP_THRESHOLD_BYTES, CLEANUP_THRESHOLD_WORKTREES, ISessionWorktree, ISessionWorktreeCleanupCandidate, ISessionWorktreeCleanupService, SessionWorktreeCleanupState } from './sessionWorktreeCleanupService.js';
import { SessionWorktreeCleanupEditorInput } from './sessionWorktreeCleanupEditorInput.js';
import './media/sessionWorktreeCleanupEditor.css';

const MINIMUM_AGE_OPTIONS = [0, 1, 3, 7, 15, 30, 60, 90];

export class SessionWorktreeCleanupEditor extends EditorPane {

	static readonly ID = 'sessions.editor.sessionWorktreeCleanup';

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly rowDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;
	private list: HTMLElement | undefined;
	private summary: HTMLElement | undefined;
	private summaryRow: HTMLElement | undefined;
	private emptyState: HTMLElement | undefined;
	private cleanupButton: Button | undefined;
	private ageSelect: HTMLSelectElement | undefined;
	private workspaceSelect: HTMLSelectElement | undefined;
	private selectedWorkspace = '';
	private scrollableElement: DomScrollableElement | undefined;
	private layoutDimension: dom.Dimension | undefined;
	private minimumAgeDays = 0;
	private worktrees: readonly ISessionWorktree[] = [];
	private selectedSessionIds = new Set<string>();
	private renderVersion = 0;
	private automaticCleanupInput: Checkbox | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ISessionWorktreeCleanupService private readonly cleanupService: ISessionWorktreeCleanupService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super(SessionWorktreeCleanupEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.$('.session-worktree-cleanup-editor');
		const focusedContext = SessionWorktreeCleanupEditorFocusedContext.bindTo(this.contextKeyService);
		const focusTracker = this.editorDisposables.add(dom.trackFocus(this.container));
		this.editorDisposables.add(focusTracker.onDidFocus(() => focusedContext.set(true)));
		this.editorDisposables.add(focusTracker.onDidBlur(() => focusedContext.set(false)));
		this.editorDisposables.add(toDisposable(() => focusedContext.reset()));
		this.scrollableElement = this._register(new DomScrollableElement(this.container, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: true,
		}));
		parent.appendChild(this.scrollableElement.getDomNode());
		const content = dom.append(this.container, dom.$('.session-worktree-cleanup-content'));

		dom.append(content, dom.$('p.session-worktree-cleanup-intro', undefined,
			localize('sessionWorktreeCleanup.filteredIntro', "Review all agent session worktrees, or filter by workspace and inactivity period. Inactive, unpinned sessions can be cleaned up to reclaim disk space, including recently used sessions. Any uncommitted changes are committed before the worktree is removed. Cleaning up a session marks it as done; you can restore the session later to recreate its worktree. Protected sessions are shown but cannot be selected.")));
		dom.append(content, dom.$('p', undefined,
			dom.$('strong', undefined, localize('sessionWorktreeCleanup.reopen', "You can return to this editor at any time by running Open Worktree Cleanup from the Command Palette."))));

		this.renderAutomaticCleanup(content);

		const controls = dom.append(content, dom.$('.session-worktree-cleanup-controls'));
		const ageLabel = dom.append(controls, dom.$('label', undefined, localize('sessionWorktreeCleanup.ageLabel', "Untouched for")));
		const ageSelect = dom.append(ageLabel, dom.$('select.session-worktree-cleanup-age')) as HTMLSelectElement;
		this.ageSelect = ageSelect;
		for (const days of MINIMUM_AGE_OPTIONS) {
			const option = dom.append(ageSelect, dom.$('option')) as HTMLOptionElement;
			option.value = String(days);
			option.textContent = days === 0
				? localize('sessionWorktreeCleanup.anyTime', "Any time")
				: days === 1
					? localize('sessionWorktreeCleanup.oneDay', "1 day")
					: localize('sessionWorktreeCleanup.days', "{0} days", days);
			option.selected = days === this.minimumAgeDays;
		}
		this.editorDisposables.add(dom.addDisposableListener(ageSelect, dom.EventType.CHANGE, () => {
			this.minimumAgeDays = Number(ageSelect.value);
			void this.load();
		}));
		const workspaceLabel = dom.append(controls, dom.$('label', undefined, localize('sessionWorktreeCleanup.workspaceLabel', "Workspace")));
		this.workspaceSelect = dom.append(workspaceLabel, dom.$('select.session-worktree-cleanup-workspace'));
		this.renderWorkspaceOptions();
		this.editorDisposables.add(dom.addDisposableListener(this.workspaceSelect, dom.EventType.CHANGE, () => {
			this.selectedWorkspace = this.workspaceSelect!.value;
			this.selectedSessionIds.clear();
			this.renderRows();
		}));

		const summaryRow = this.summaryRow = dom.append(content, dom.$('.session-worktree-cleanup-summary-row'));
		this.summary = dom.append(summaryRow, dom.$('.session-worktree-cleanup-summary'));
		this.cleanupButton = this.editorDisposables.add(new Button(summaryRow, defaultButtonStyles));
		this.cleanupButton.label = localize('sessionWorktreeCleanup.cleanupButton', "Clean Up Worktrees");
		this.cleanupButton.element.classList.add('session-worktree-cleanup-action');
		this.cleanupButton.enabled = false;
		this.editorDisposables.add(this.cleanupButton.onDidClick(() => void this.cleanupSelected()));

		this.list = dom.append(content, dom.$('.session-worktree-cleanup-list', { role: 'table', 'aria-label': localize('sessionWorktreeCleanup.tableLabel', "Agent session worktrees") }));
		this.emptyState = dom.append(content, dom.$('.session-worktree-cleanup-empty', { role: 'status' }));
		const emptyStateIcon = dom.append(this.emptyState, renderIcon(Codicon.info));
		emptyStateIcon.setAttribute('aria-hidden', 'true');
		dom.append(this.emptyState, dom.$('span', undefined, localize('sessionWorktreeCleanup.noMatchingWorktrees', "No worktrees match the selected filters.")));
		this.emptyState.classList.add('hidden');
	}

	override async setInput(input: SessionWorktreeCleanupEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		void this.load();
	}

	focusAutomaticCleanup(): void {
		this.automaticCleanupInput?.focus();
	}

	showAllWorktrees(): void {
		this.minimumAgeDays = 0;
		if (this.ageSelect) {
			this.ageSelect.value = '0';
		}
		void this.load();
	}

	override layout(dimension: dom.Dimension): void {
		this.layoutDimension = dimension;
		if (this.scrollableElement) {
			const scrollableNode = this.scrollableElement.getDomNode();
			scrollableNode.style.width = `${dimension.width}px`;
			scrollableNode.style.height = `${dimension.height}px`;
			this.updateScrollDimensions();
		}
	}

	private updateScrollDimensions(): void {
		if (!this.container || !this.scrollableElement || !this.layoutDimension) {
			return;
		}
		this.scrollableElement.setScrollDimensions({
			width: this.layoutDimension.width,
			height: this.layoutDimension.height,
			scrollWidth: this.container.scrollWidth,
			scrollHeight: this.container.scrollHeight,
		});
	}

	private async load(): Promise<void> {
		const version = ++this.renderVersion;
		if (this.ageSelect) {
			this.ageSelect.disabled = true;
		}
		if (this.workspaceSelect) {
			this.workspaceSelect.disabled = true;
		}
		if (this.cleanupButton) {
			this.cleanupButton.enabled = false;
		}
		this.summaryRow?.classList.remove('hidden');
		this.list?.classList.remove('hidden');
		this.rowDisposables.clear();
		if (this.list) {
			dom.clearNode(this.list);
		}
		this.selectedSessionIds.clear();
		this.emptyState?.classList.add('hidden');
		if (this.summary) {
			dom.clearNode(this.summary);
			dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }, localize('sessionWorktreeCleanup.loading', "Measuring worktree storage...")));
		}
		try {
			const worktrees = await this.cleanupService.getWorktrees(this.minimumAgeDays);
			if (version !== this.renderVersion || !this.list || !this.summary) {
				return;
			}
			this.worktrees = worktrees;
			this.renderWorkspaceOptions();
			this.selectedSessionIds = new Set(this.getVisibleWorktrees().filter(worktree => worktree.cleanupState === 'eligible').map(worktree => worktree.session.sessionId));
			this.renderRows();
		} catch (error) {
			if (version === this.renderVersion && this.summary) {
				dom.clearNode(this.summary);
				dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }, isCancellationError(error)
					? localize('sessionWorktreeCleanup.loadCanceled', "Worktree measurement canceled.")
					: localize('sessionWorktreeCleanup.loadFailed', "Worktree storage could not be measured.")));
			}
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		} finally {
			if (version === this.renderVersion && this.ageSelect) {
				this.ageSelect.disabled = false;
				if (this.workspaceSelect) {
					this.workspaceSelect.disabled = false;
				}
				this.updateScrollDimensions();
			}
		}
	}

	private renderWorkspaceOptions(): void {
		if (!this.workspaceSelect) {
			return;
		}
		const workspaces = new Map(this.worktrees.flatMap(worktree => {
			const workspace = worktree.session.workspace.get();
			return workspace ? [[extUri.getComparisonKey(workspace.uri), workspace] as const] : [];
		}));
		dom.setVisibility(workspaces.size > 1, this.workspaceSelect.parentElement!);
		if (workspaces.size <= 1 || !workspaces.has(this.selectedWorkspace)) {
			this.selectedWorkspace = '';
		}
		dom.clearNode(this.workspaceSelect);
		dom.append(this.workspaceSelect, dom.$('option', { value: '' }, localize('sessionWorktreeCleanup.allWorkspaces', "All workspaces")));
		const labelCounts = new Map<string, number>();
		for (const workspace of workspaces.values()) {
			labelCounts.set(workspace.label, (labelCounts.get(workspace.label) ?? 0) + 1);
		}
		const sortedWorkspaces = [...workspaces].sort((a, b) => a[1].label.localeCompare(b[1].label));
		for (const [key, workspace] of sortedWorkspaces) {
			const label = labelCounts.get(workspace.label)! > 1
				? localize('sessionWorktreeCleanup.workspaceWithPath', "{0} ({1})", workspace.label, workspace.uri.toString(true))
				: workspace.label;
			dom.append(this.workspaceSelect, dom.$('option', { value: key }, label));
		}
		this.workspaceSelect.value = this.selectedWorkspace;
	}

	private getVisibleWorktrees(): readonly ISessionWorktree[] {
		const cutoff = Date.now() - this.minimumAgeDays * 24 * 60 * 60 * 1000;
		return this.worktrees.filter(worktree => {
			const workspace = worktree.session.workspace.get();
			return (!this.selectedWorkspace || (workspace && extUri.getComparisonKey(workspace.uri) === this.selectedWorkspace))
				&& (this.minimumAgeDays === 0 || worktree.session.updatedAt.get().getTime() <= cutoff);
		});
	}

	private renderRows(): void {
		if (!this.list || !this.summary) {
			return;
		}
		this.rowDisposables.clear();
		dom.clearNode(this.list);
		const visible = this.getVisibleWorktrees();
		const eligible = visible.filter(worktree => worktree.cleanupState === 'eligible');
		const reclaimableBytes = eligible.reduce((total, worktree) => total + (worktree.sizeBytes ?? 0), 0);
		const eligibleWorktrees = eligible.reduce((total, worktree) => total + worktree.worktreeCount, 0);
		const totalWorktrees = visible.reduce((total, worktree) => total + worktree.worktreeCount, 0);
		const isEmpty = visible.length === 0;
		this.summaryRow?.classList.toggle('hidden', isEmpty);
		this.list.classList.toggle('hidden', isEmpty);
		this.emptyState?.classList.toggle('hidden', !isEmpty);
		const summary = localize('sessionWorktreeCleanup.matchingWorktreeSummary', "{0} of {1} matching worktrees can be cleaned up, reclaiming about {2}.", eligibleWorktrees, totalWorktrees, ByteSize.formatSize(reclaimableBytes));
		const eligibilityDescription = localize(
			'sessionWorktreeCleanup.filteredEligibilityDescription',
			"Only sessions that are not active, running, waiting for input, pinned, already done, untitled, or in an error state can be selected. Storage must have been measured successfully. The filters limit the table and cleanup selection.",
		);
		dom.clearNode(this.summary);
		dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }, summary));
		const eligibilityInfo = dom.append(this.summary, dom.$('button.session-worktree-cleanup-info', {
			type: 'button',
			'aria-label': localize('sessionWorktreeCleanup.eligibilityInfo', "Show cleanup eligibility details"),
		}));
		eligibilityInfo.appendChild(renderIcon(Codicon.info));
		const eligibilityHover = this.rowDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), eligibilityInfo, eligibilityDescription));
		this.rowDisposables.add(dom.addDisposableListener(eligibilityInfo, dom.EventType.CLICK, () => eligibilityHover.show(true)));

		const header = dom.append(this.list, dom.$('.session-worktree-cleanup-row.header', { role: 'row' }));
		const selectAll = this.rowDisposables.add(new Checkbox(
			localize('sessionWorktreeCleanup.selectAll', "Select all eligible sessions"),
			eligible.length > 0 && eligible.every(worktree => this.selectedSessionIds.has(worktree.session.sessionId)),
			defaultCheckboxStyles,
		));
		header.appendChild(selectAll.domNode);
		if (eligible.length === 0) {
			selectAll.disable();
		}
		this.rowDisposables.add(selectAll.onChange(() => {
			this.selectedSessionIds = selectAll.checked ? new Set(eligible.map(worktree => worktree.session.sessionId)) : new Set();
			this.renderRows();
		}));
		dom.append(header, dom.$('span.title', { role: 'columnheader' }, localize('sessionWorktreeCleanup.sessionColumn', "Session")));
		dom.append(header, dom.$('span', { role: 'columnheader' }, localize('sessionWorktreeCleanup.workspaceColumn', "Workspace")));
		dom.append(header, dom.$('span', { role: 'columnheader' }, localize('sessionWorktreeCleanup.lastUsedColumn', "Last Used")));
		dom.append(header, dom.$('span', { role: 'columnheader' }, localize('sessionWorktreeCleanup.storageColumn', "Storage")));

		for (const worktree of [...visible].sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1))) {
			const row = dom.append(this.list, dom.$('.session-worktree-cleanup-row', { role: 'row' }));
			const title = worktree.session.title.get() || localize('sessionWorktreeCleanup.untitled', "Untitled session");
			const checkbox = this.rowDisposables.add(new Checkbox(
				localize('sessionWorktreeCleanup.selectSession', "Select {0}", title),
				this.selectedSessionIds.has(worktree.session.sessionId),
				defaultCheckboxStyles,
			));
			row.appendChild(checkbox.domNode);
			if (worktree.cleanupState !== 'eligible') {
				checkbox.disable();
			}
			this.rowDisposables.add(checkbox.onChange(() => {
				if (checkbox.checked) {
					this.selectedSessionIds.add(worktree.session.sessionId);
				} else {
					this.selectedSessionIds.delete(worktree.session.sessionId);
				}
				this.updateCleanupButton();
				this.updateScrollDimensions();
			}));
			const titleCell = dom.append(row, dom.$('span.title', { role: 'cell' }));
			const openSession = () => void this.sessionsService.openSession(worktree.session.resource).catch(error => this.notificationService.error(error));
			const titleLink = dom.append(titleCell, dom.$('a.session-worktree-cleanup-session-link', {
				role: 'link',
				tabIndex: 0,
				title: localize('sessionWorktreeCleanup.openSession', "Open {0}", title),
			}, title));
			this.rowDisposables.add(dom.addDisposableListener(titleLink, dom.EventType.CLICK, () => openSession()));
			this.rowDisposables.add(dom.addDisposableListener(titleLink, dom.EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
					keyboardEvent.preventDefault();
					openSession();
				}
			}));
			if (worktree.cleanupState !== 'eligible') {
				const reason = dom.append(titleCell, dom.$('span.session-worktree-cleanup-reason', undefined, this.getCleanupStateLabel(worktree.cleanupState)));
				this.rowDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), reason, reason.textContent ?? ''));
			}
			const workspace = worktree.session.workspace.get();
			const workspaceCell = dom.append(row, dom.$('span.workspace', { role: 'cell' }, workspace?.label ?? localize('sessionWorktreeCleanup.unknownWorkspace', "Unknown workspace")));
			if (workspace) {
				this.rowDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), workspaceCell, workspace.description ? `${workspace.label}\n${workspace.description}\n${workspace.uri.toString(true)}` : workspace.uri.toString(true)));
			}
			dom.append(row, dom.$('span', { role: 'cell', title: worktree.session.updatedAt.get().toLocaleString() }, fromNow(worktree.session.updatedAt.get(), true, true)));
			dom.append(row, dom.$('span', { role: 'cell' }, worktree.sizeBytes === undefined ? localize('sessionWorktreeCleanup.unknownStorage', "Unknown") : ByteSize.formatSize(worktree.sizeBytes)));
		}
		this.updateCleanupButton();
		this.updateScrollDimensions();
	}

	private getCleanupStateLabel(state: Exclude<SessionWorktreeCleanupState, 'eligible'>): string {
		switch (state) {
			case 'active': return localize('sessionWorktreeCleanup.active', "Active session");
			case 'running': return localize('sessionWorktreeCleanup.running', "Running");
			case 'needsInput': return localize('sessionWorktreeCleanup.needsInput', "Waiting for input");
			case 'pinned': return localize('sessionWorktreeCleanup.pinned', "Pinned");
			case 'recent': return localize('sessionWorktreeCleanup.recent', "Recently used");
			case 'archived': return localize('sessionWorktreeCleanup.archived', "Already done");
			case 'untitled': return localize('sessionWorktreeCleanup.untitledState', "Untitled");
			case 'error': return localize('sessionWorktreeCleanup.error', "Session error");
			case 'unavailable': return localize('sessionWorktreeCleanup.unavailable', "Storage unavailable");
		}
	}

	private updateCleanupButton(): void {
		if (!this.cleanupButton) {
			return;
		}
		const selected = this.getSelected();
		const selectedWorktrees = selected.reduce((total, candidate) => total + candidate.worktreeCount, 0);
		this.cleanupButton.label = selected.length === 0
			? localize('sessionWorktreeCleanup.cleanupButton', "Clean Up Worktrees")
			: localize('sessionWorktreeCleanup.cleanupSelection', "Clean Up {0} Worktrees", selectedWorktrees);
		this.cleanupButton.enabled = selected.length > 0;
	}

	private getSelected(): ISessionWorktreeCleanupCandidate[] {
		return this.getVisibleWorktrees()
			.filter((worktree): worktree is ISessionWorktree & { readonly sizeBytes: number } => worktree.cleanupState === 'eligible' && worktree.sizeBytes !== undefined && this.selectedSessionIds.has(worktree.session.sessionId))
			.map(worktree => ({ session: worktree.session, sizeBytes: worktree.sizeBytes, worktreeCount: worktree.worktreeCount }));
	}

	private async cleanupSelected(): Promise<void> {
		try {
			if (await this.cleanupService.cleanupWorktrees(this.getSelected())) {
				await this.load();
			}
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private renderAutomaticCleanup(content: HTMLElement): void {
		const section = dom.append(content, dom.$('.session-worktree-cleanup-automatic'));
		dom.append(section, dom.$('h2', undefined, localize('sessionWorktreeCleanup.automaticHeading', "Cleanup Settings")));
		dom.append(section, dom.$('p', undefined, localize('sessionWorktreeCleanup.automaticDescription', "Changes to these settings are saved immediately. Background cleanup evaluates existing and future sessions after confirming their eligibility. For merged pull requests, inactive sessions are marked as done first, then optionally deleted after an additional retention period.")));
		this.renderAutomaticSetting(section, ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
			localize('sessionWorktreeCleanup.autoMark', "Mark merged sessions as done after"),
			localize('sessionWorktreeCleanup.autoMarkAria', "Automatically mark merged sessions as done"));
		this.renderAutomaticSetting(section, ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays,
			localize('sessionWorktreeCleanup.autoDelete', "Permanently delete automatically completed sessions after"),
			localize('sessionWorktreeCleanup.autoDeleteAria', "Automatically delete completed merged sessions"));
		this.renderSuggestionSetting(section);
	}

	/**
	 * Renders the toggle that controls whether the storage cleanup suggestion is surfaced. This is
	 * the durable, keyboard reachable equivalent of the suggestion's own "Don't Show Again" button,
	 * so users who only hear the suggestion announced can still turn it off.
	 */
	private renderSuggestionSetting(container: HTMLElement): void {
		const row = dom.append(container, dom.$('.session-worktree-cleanup-setting'));
		const label = localize('sessionWorktreeCleanup.suggestion', "Suggest cleaning up session storage when it grows large");
		const checkbox = this.editorDisposables.add(new Checkbox(label, false, defaultCheckboxStyles));
		row.appendChild(checkbox.domNode);
		dom.append(row, dom.$('span', undefined, label));
		const description = localize(
			'sessionWorktreeCleanup.suggestionDescription',
			"Checked when the Agents window opens and after sessions change, measuring disk usage at most once an hour. A suggestion appears below the Sessions list when at least {0} inactive worktrees are eligible for cleanup or eligible worktrees use at least {1}. Available disk space is also checked every five minutes. If a local worktree's disk has less than 5 GB available, the same suggestion offers cleanup regardless of worktree age or count. Dismissing it hides it until the window reloads.",
			CLEANUP_THRESHOLD_WORKTREES,
			ByteSize.formatSize(CLEANUP_THRESHOLD_BYTES),
		);
		const information = dom.append(row, dom.$('button.session-worktree-cleanup-info', {
			type: 'button',
			'aria-label': localize('sessionWorktreeCleanup.suggestionInfo', "Show storage cleanup suggestion details"),
		}));
		information.appendChild(renderIcon(Codicon.info));
		const informationHover = this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), information, description));
		this.editorDisposables.add(dom.addDisposableListener(information, dom.EventType.CLICK, () => informationHover.show(true)));
		const update = () => {
			checkbox.checked = this.configurationService.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING) === true;
		};
		update();
		this.editorDisposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING)) {
				update();
			}
		}));
		this.editorDisposables.add(checkbox.onChange(() => {
			void this.configurationService.updateValue(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, checkbox.checked, ConfigurationTarget.APPLICATION).then(update, error => this.notificationService.error(error));
		}));
	}

	private renderAutomaticSetting(container: HTMLElement, setting: string, label: string, ariaLabel: string): void {
		const row = dom.append(container, dom.$('.session-worktree-cleanup-setting'));
		const checkbox = this.editorDisposables.add(new Checkbox(ariaLabel, false, defaultCheckboxStyles));
		this.automaticCleanupInput ??= checkbox;
		row.appendChild(checkbox.domNode);
		dom.append(row, dom.$('span', undefined, label));
		const days = dom.append(row, dom.$('input')) as HTMLInputElement;
		days.type = 'number';
		days.min = '1';
		days.step = '1';
		days.setAttribute('aria-label', localize('sessionWorktreeCleanup.settingDays', "{0} days", label));
		dom.append(row, dom.$('span', undefined, localize('sessionWorktreeCleanup.daysSuffix', "days")));
		const update = () => {
			const value = this.configurationService.getValue<number>(setting) ?? 0;
			checkbox.checked = value > 0;
			days.disabled = !checkbox.checked;
			days.value = String(value > 0 ? value : 15);
		};
		update();
		this.editorDisposables.add(checkbox.onChange(() => {
			const value = checkbox.checked ? Math.max(1, Number(days.value) || 15) : 0;
			void this.configurationService.updateValue(setting, value, ConfigurationTarget.APPLICATION).then(update, error => this.notificationService.error(error));
		}));
		const saveDays = (normalize: boolean) => {
			if (!checkbox.checked) {
				return;
			}
			const value = Number(days.value);
			if (!Number.isInteger(value) || value < 1) {
				if (!normalize) {
					return;
				}
				days.value = '1';
				void this.configurationService.updateValue(setting, 1, ConfigurationTarget.APPLICATION).then(update, error => this.notificationService.error(error));
				return;
			}
			void this.configurationService.updateValue(setting, value, ConfigurationTarget.APPLICATION).then(update, error => this.notificationService.error(error));
		};
		this.editorDisposables.add(dom.addDisposableListener(days, dom.EventType.INPUT, () => saveDays(false)));
		this.editorDisposables.add(dom.addDisposableListener(days, dom.EventType.CHANGE, () => saveDays(true)));
	}
}
