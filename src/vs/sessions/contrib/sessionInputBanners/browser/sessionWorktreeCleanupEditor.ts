/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
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
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, CLEANUP_THRESHOLD_BYTES, CLEANUP_THRESHOLD_WORKTREES, ISessionWorktree, ISessionWorktreeCleanupCandidate, ISessionWorktreeCleanupService } from './sessionWorktreeCleanupService.js';
import { SessionWorktreeCleanupEditorInput } from './sessionWorktreeCleanupEditorInput.js';
import './media/sessionWorktreeCleanupEditor.css';

const MINIMUM_AGE_OPTIONS = [7, 15, 30, 60, 90];

export class SessionWorktreeCleanupEditor extends EditorPane {

	static readonly ID = 'sessions.editor.sessionWorktreeCleanup';

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly rowDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;
	private list: HTMLElement | undefined;
	private summary: HTMLElement | undefined;
	private cleanupButton: Button | undefined;
	private scrollableElement: DomScrollableElement | undefined;
	private layoutDimension: dom.Dimension | undefined;
	private minimumAgeDays = 15;
	private worktreesOnly = true;
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
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super(SessionWorktreeCleanupEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.$('.session-worktree-cleanup-editor');
		this.scrollableElement = this._register(new DomScrollableElement(this.container, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: true,
		}));
		parent.appendChild(this.scrollableElement.getDomNode());
		const content = dom.append(this.container, dom.$('.session-worktree-cleanup-content'));

		dom.append(content, dom.$('h1', undefined, localize('sessionWorktreeCleanup.heading', "Manage Agent Session Storage")));
		dom.append(content, dom.$('p.session-worktree-cleanup-intro', undefined,
			localize('sessionWorktreeCleanup.intro', "Inactive, unpinned sessions older than the selected period can be marked as done to clean up their worktrees. Active, running, needs-input, and pinned sessions are always protected.")));
		dom.append(content, dom.$('p.session-worktree-cleanup-intro', undefined,
			localize('sessionWorktreeCleanup.reopen', "Return here any time from the Sessions More Actions (...) menu, a session's context menu, or by running Manage Agent Session Storage from the Command Palette.")));

		this.renderAutomaticCleanup(content);

		const controls = dom.append(content, dom.$('.session-worktree-cleanup-controls'));
		const ageLabel = dom.append(controls, dom.$('label', undefined, localize('sessionWorktreeCleanup.ageLabel', "Untouched for")));
		const ageSelect = dom.append(ageLabel, dom.$('select.session-worktree-cleanup-age')) as HTMLSelectElement;
		for (const days of MINIMUM_AGE_OPTIONS) {
			const option = dom.append(ageSelect, dom.$('option')) as HTMLOptionElement;
			option.value = String(days);
			option.textContent = localize('sessionWorktreeCleanup.days', "{0} days", days);
			option.selected = days === this.minimumAgeDays;
		}
		this.editorDisposables.add(dom.addDisposableListener(ageSelect, dom.EventType.CHANGE, () => {
			this.minimumAgeDays = Number(ageSelect.value);
			void this.load();
		}));
		const worktreesOnlyLabel = dom.append(controls, dom.$('label.session-worktree-cleanup-filter'));
		const worktreesOnlyCheckbox = this.editorDisposables.add(new Checkbox(localize('sessionWorktreeCleanup.worktreesOnly', "Sessions with worktrees only"), this.worktreesOnly, defaultCheckboxStyles));
		worktreesOnlyLabel.appendChild(worktreesOnlyCheckbox.domNode);
		dom.append(worktreesOnlyLabel, dom.$('span', undefined, localize('sessionWorktreeCleanup.worktreesOnly', "Sessions with worktrees only")));
		this.editorDisposables.add(worktreesOnlyCheckbox.onChange(() => {
			this.worktreesOnly = worktreesOnlyCheckbox.checked;
			void this.load();
		}));

		this.summary = dom.append(content, dom.$('.session-worktree-cleanup-summary'));

		const footer = dom.append(content, dom.$('.session-worktree-cleanup-footer'));
		this.cleanupButton = this.editorDisposables.add(new Button(footer, defaultButtonStyles));
		this.cleanupButton.label = localize('sessionWorktreeCleanup.cleanupButton', "Mark as Done and Clean Up");
		this.cleanupButton.enabled = false;
		this.editorDisposables.add(this.cleanupButton.onDidClick(() => void this.cleanupSelected()));

		this.list = dom.append(content, dom.$('.session-worktree-cleanup-list', { role: 'table', 'aria-label': localize('sessionWorktreeCleanup.tableLabel', "Agent session worktrees") }));
	}

	override async setInput(input: SessionWorktreeCleanupEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		await this.load();
	}

	focusAutomaticCleanup(): void {
		this.automaticCleanupInput?.focus();
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
		if (this.summary) {
			dom.clearNode(this.summary);
			dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }, localize('sessionWorktreeCleanup.loading', "Measuring worktree storage...")));
		}
		try {
			const worktrees = await this.cleanupService.getWorktrees(this.minimumAgeDays, !this.worktreesOnly);
			if (version !== this.renderVersion || !this.list || !this.summary) {
				return;
			}
			this.worktrees = worktrees;
			this.selectedSessionIds = new Set(this.worktrees.filter(worktree => worktree.cleanupState === 'eligible').map(worktree => worktree.session.sessionId));
			this.renderRows();
		} catch (error) {
			if (version === this.renderVersion && this.summary) {
				dom.clearNode(this.summary);
				dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }, localize('sessionWorktreeCleanup.loadFailed', "Worktree storage could not be measured.")));
			}
			this.notificationService.error(error);
		}
	}

	private renderRows(): void {
		if (!this.list || !this.summary) {
			return;
		}
		this.rowDisposables.clear();
		dom.clearNode(this.list);
		const eligible = this.worktrees.filter(worktree => worktree.cleanupState === 'eligible');
		const tooRecent = this.worktrees.filter(worktree => worktree.cleanupState === 'recent').length;
		const worktreeCount = this.worktrees.filter(worktree => worktree.hasWorktree).length;
		const reclaimableBytes = eligible.reduce((total, worktree) => total + (worktree.sizeBytes ?? 0), 0);
		const summary = this.worktreesOnly
			? localize('sessionWorktreeCleanup.worktreeSummary', "{0} of {1} worktrees inactive for at least {2} days can be cleaned up, reclaiming about {3}.", eligible.length, worktreeCount, this.minimumAgeDays, ByteSize.formatSize(reclaimableBytes))
			: localize('sessionWorktreeCleanup.sessionSummary', "{0} of {1} sessions inactive for at least {2} days can be marked as done. {3} worktrees can reclaim about {4}.", eligible.length, this.worktrees.length, this.minimumAgeDays, worktreeCount, ByteSize.formatSize(reclaimableBytes));
		const recentNote = tooRecent === 0
			? undefined
			: tooRecent === 1
				? localize('sessionWorktreeCleanup.tooRecentOne', " 1 more was used within the last {0} days.", this.minimumAgeDays)
				: localize('sessionWorktreeCleanup.tooRecentMany', " {0} more were used within the last {1} days.", tooRecent, this.minimumAgeDays);
		const eligibilityDescription = localize(
			'sessionWorktreeCleanup.eligibilityDescription',
			"Includes sessions untouched for at least {0} days that are not active, running, waiting for input, pinned, already done, untitled, or in an error state.",
			this.minimumAgeDays,
		);
		dom.clearNode(this.summary);
		dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }, recentNote ? summary + recentNote : summary));
		const eligibilityInfo = dom.append(this.summary, dom.$('button.session-worktree-cleanup-info', {
			type: 'button',
			'aria-label': localize('sessionWorktreeCleanup.eligibilityInfo', "Why these sessions can be marked as done"),
		}));
		eligibilityInfo.appendChild(renderIcon(Codicon.info));
		this.rowDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), eligibilityInfo, eligibilityDescription));

		const header = dom.append(this.list, dom.$('.session-worktree-cleanup-row.header', { role: 'row' }));
		const selectAll = this.rowDisposables.add(new Checkbox(
			localize('sessionWorktreeCleanup.selectAll', "Select all eligible sessions"),
			eligible.length > 0 && eligible.every(worktree => this.selectedSessionIds.has(worktree.session.sessionId)),
			defaultCheckboxStyles,
		));
		header.appendChild(selectAll.domNode);
		this.rowDisposables.add(selectAll.onChange(() => {
			this.selectedSessionIds = selectAll.checked ? new Set(eligible.map(worktree => worktree.session.sessionId)) : new Set();
			this.renderRows();
		}));
		dom.append(header, dom.$('span.title', { role: 'columnheader' }, localize('sessionWorktreeCleanup.sessionColumn', "Session")));
		dom.append(header, dom.$('span', { role: 'columnheader' }, localize('sessionWorktreeCleanup.lastUsedColumn', "Last Used")));
		dom.append(header, dom.$('span', { role: 'columnheader' }, localize('sessionWorktreeCleanup.storageColumn', "Storage")));
		dom.append(header, dom.$('span', { role: 'columnheader' }, localize('sessionWorktreeCleanup.actionsColumn', "Actions")));

		// Only list rows that meet every cleanup criterion; the summary reports how many were excluded.
		for (const worktree of [...eligible].sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1))) {
			const row = dom.append(this.list, dom.$('.session-worktree-cleanup-row', { role: 'row' }));
			const title = worktree.session.title.get() || localize('sessionWorktreeCleanup.untitled', "Untitled session");
			const checkbox = this.rowDisposables.add(new Checkbox(
				localize('sessionWorktreeCleanup.selectSession', "Select {0}", title),
				this.selectedSessionIds.has(worktree.session.sessionId),
				defaultCheckboxStyles,
			));
			row.appendChild(checkbox.domNode);
			this.rowDisposables.add(checkbox.onChange(() => {
				if (checkbox.checked) {
					this.selectedSessionIds.add(worktree.session.sessionId);
				} else {
					this.selectedSessionIds.delete(worktree.session.sessionId);
				}
				this.updateCleanupButton();
				this.updateScrollDimensions();
			}));
			const titleElement = dom.append(row, dom.$('span.title', { role: 'cell', title }, title));
			titleElement.tabIndex = 0;
			dom.append(row, dom.$('span', { role: 'cell', title: worktree.session.updatedAt.get().toLocaleString() }, fromNow(worktree.session.updatedAt.get(), true, true)));
			dom.append(row, dom.$('span', { role: 'cell' }, worktree.hasWorktree ? ByteSize.formatSize(worktree.sizeBytes ?? 0) : localize('sessionWorktreeCleanup.noWorktree', "No worktree")));
			const actions = dom.append(row, dom.$('span', { role: 'cell' }));
			const openButton = this.rowDisposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
			openButton.label = localize('sessionWorktreeCleanup.openSession', "Open Session");
			this.rowDisposables.add(openButton.onDidClick(() => {
				void this.sessionsService.openSession(worktree.session.resource).catch(error => this.notificationService.error(error));
			}));
		}
		this.updateCleanupButton();
		this.updateScrollDimensions();
	}

	private updateCleanupButton(): void {
		if (!this.cleanupButton) {
			return;
		}
		const selected = this.getSelected();
		const selectedBytes = selected.reduce((total, candidate) => total + candidate.sizeBytes, 0);
		this.cleanupButton.label = selected.length === 0
			? localize('sessionWorktreeCleanup.cleanupButton', "Mark as Done and Clean Up")
			: localize('sessionWorktreeCleanup.cleanupSelection', "Mark {0} as Done and Reclaim About {1}", selected.length, ByteSize.formatSize(selectedBytes));
		this.cleanupButton.enabled = selected.length > 0;
	}

	private getSelected(): ISessionWorktreeCleanupCandidate[] {
		return this.worktrees
			.filter((worktree): worktree is ISessionWorktree & { readonly sizeBytes: number } => worktree.cleanupState === 'eligible' && worktree.sizeBytes !== undefined && this.selectedSessionIds.has(worktree.session.sessionId))
			.map(worktree => ({ session: worktree.session, sizeBytes: worktree.sizeBytes }));
	}

	private async cleanupSelected(): Promise<void> {
		if (await this.cleanupService.cleanupWorktrees(this.getSelected())) {
			await this.load();
		}
	}

	private renderAutomaticCleanup(content: HTMLElement): void {
		const section = dom.append(content, dom.$('.session-worktree-cleanup-automatic'));
		dom.append(section, dom.$('h2', undefined, localize('sessionWorktreeCleanup.automaticHeading', "Automatic Cleanup")));
		dom.append(section, dom.$('p', undefined, localize('sessionWorktreeCleanup.automaticDescription', "For merged pull requests, automatically mark inactive sessions as done first, then optionally delete them after an additional retention period.")));
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
		const descriptionId = 'session-worktree-cleanup-suggestion-description';
		checkbox.domNode.setAttribute('aria-describedby', descriptionId);
		dom.append(container, dom.$('.session-worktree-cleanup-setting-description', { id: descriptionId }, localize(
			'sessionWorktreeCleanup.suggestionDescription',
			"Checked when the Agents window opens and after sessions change, measuring disk usage at most once an hour. A suggestion appears below the Sessions list when at least {0} inactive worktrees are eligible for cleanup or eligible worktrees use at least {1}. Dismissing it hides it until the window reloads.",
			CLEANUP_THRESHOLD_WORKTREES,
			ByteSize.formatSize(CLEANUP_THRESHOLD_BYTES),
		)));
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
		const text = dom.append(row, dom.$('span', undefined, label));
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
			text.classList.toggle('disabled', !checkbox.checked);
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
