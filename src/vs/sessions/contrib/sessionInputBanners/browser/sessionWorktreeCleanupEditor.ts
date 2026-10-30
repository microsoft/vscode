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
import { ITableColumn, ITableRenderer } from '../../../../base/browser/ui/table/table.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { fromNow } from '../../../../base/common/date.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
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
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, CLEANUP_THRESHOLD_BYTES, CLEANUP_THRESHOLD_WORKTREES, getWorktreeCleanupDiskUsage, getWorktreeCleanupId, getWorktreeCleanupTitle, ISessionWorktree, ISessionWorktreeCleanupCandidate, ISessionWorktreeCleanupService, ISessionWorktreeMeasurementProgress, isWorktreeCleanupBranchSupported, SessionWorktreeCleanupProgress, SessionWorktreeCleanupState } from './sessionWorktreeCleanupService.js';
import { SessionWorktreeCleanupEditorInput } from './sessionWorktreeCleanupEditorInput.js';
import './media/sessionWorktreeCleanupEditor.css';

const MINIMUM_AGE_OPTIONS = [0, 1, 3, 7, 15, 30, 60, 90];
const WORKTREE_ROW_HEIGHT = 44;
const WORKTREE_HEADER_HEIGHT = 36;
const WORKTREE_TABLE_MIN_WIDTH = 480;

type WorktreeColumn = 'selection' | 'title' | 'workspace' | 'lastUsed' | 'storage';

function getWorktreeWorkspace(worktree: ISessionWorktree): { uri: URI; label: string; description?: string } | undefined {
	if (worktree.session) {
		return worktree.session.workspace.get();
	}
	const uri = URI.parse(worktree.unlinkedWorktree.repository);
	return { uri, label: basename(uri) };
}

interface IWorktreeCellTemplate {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly render: (worktree: ISessionWorktree) => void;
	readonly focusTarget: HTMLElement | undefined;
	worktree: ISessionWorktree | undefined;
	signature: string;
}

interface ICleanupBatchEntry {
	readonly candidate: ISessionWorktreeCleanupCandidate;
	state: 'queued' | 'pending' | 'removed' | 'failed' | 'attention';
	schedulingError?: string;
}

export class SessionWorktreeCleanupEditor extends EditorPane {

	static readonly ID = 'sessions.editor.sessionWorktreeCleanup';

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly loadDisposables = this._register(new DisposableStore());
	private readonly renderedCells = new Map<string, Map<WorktreeColumn, IWorktreeCellTemplate>>();
	private displayWorktreesById = new Map<string, ISessionWorktree>();
	private mainWorktreeTable: WorkbenchTable<string> | undefined;
	private unavailableWorktreeTable: WorkbenchTable<string> | undefined;
	private progressWorktreeTable: WorkbenchTable<string> | undefined;
	private progressSection: HTMLElement | undefined;
	private progressHeading: HTMLElement | undefined;
	private availableHeading: HTMLElement | undefined;
	private sortOrder: 'size' | 'recent' = 'size';
	private readonly tableDimensions = new WeakMap<WorkbenchTable<string>, dom.Dimension>();
	private readonly tableFocusElements = new WeakMap<WorkbenchTable<string>, HTMLElement>();
	private readonly tableScrollables = new Map<WorkbenchTable<string>, DomScrollableElement>();
	private readonly cellHoverOptions = { groupId: generateUuid() };
	private selectAllCheckbox: Checkbox | undefined;
	private forceSelectAllCheckbox: Checkbox | undefined;
	private forceSelectionRow: HTMLElement | undefined;
	private forceCleanupButton: Button | undefined;
	private readonly selectedForceSessionIds = new Set<string>();
	private workspaceOptionsSignature = '';
	private container: HTMLElement | undefined;
	private list: HTMLElement | undefined;
	private unavailableSection: HTMLDetailsElement | undefined;
	private unavailableSummary: HTMLElement | undefined;
	private unavailableList: HTMLElement | undefined;
	private summary: HTMLElement | undefined;
	private summaryMessage: HTMLElement | undefined;
	private summaryRow: HTMLElement | undefined;
	private measurementProgress: HTMLElement | undefined;
	private emptyState: HTMLElement | undefined;
	private emptyStateMessage: HTMLElement | undefined;
	private cleanupButton: Button | undefined;
	private batchSummaryRow: HTMLElement | undefined;
	private batchSummary: HTMLElement | undefined;
	private retryButton: Button | undefined;
	private readonly cleanupBatch = new Map<string, ICleanupBatchEntry>();
	private isSchedulingCleanup = false;
	private cleanupGeneration = 0;
	private hasCleanupFailures = false;
	private ageSelect: HTMLSelectElement | undefined;
	private workspaceSelect: HTMLSelectElement | undefined;
	private selectedWorkspace = '';
	private scrollableElement: DomScrollableElement | undefined;
	private layoutDimension: dom.Dimension | undefined;
	private minimumAgeDays = 0;
	private worktrees: readonly ISessionWorktree[] = [];
	private selectedSessionIds = new Set<string>();
	private readonly explicitSelections = new Map<string, boolean>();
	private readonly cleaningSessionIds = new Map<string, number>();
	private displayedSessionIds: readonly string[] = [];
	private pinnedDisplayOrder: ReadonlyMap<string, number> | undefined;
	private renderVersion = 0;
	private loadToken = CancellationToken.None;
	private updateMeasuredWorktrees: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
	private pendingCleanupDelay = 2_000;
	private readonly pendingCleanupScheduler = this._register(new RunOnceScheduler(() => void this.refreshPendingCleanup(), 2_000));
	private readonly cleanupRenderScheduler = this._register(new RunOnceScheduler(() => this.renderRows(), 100));
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
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(SessionWorktreeCleanupEditor.ID, group, telemetryService, themeService, storageService);
		this._register(toDisposable(() => {
			this.renderedCells.clear();
			this.tableScrollables.clear();
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.$('.session-worktree-cleanup-editor');
		this.container.tabIndex = -1;
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
			localize('sessionWorktreeCleanup.filteredIntro', "Clean up worktrees to free disk space. Normal cleanup commits uncommitted changes and marks sessions as done; restore a session to recreate its worktree. Managed worktrees with no matching session can also be selected; their branches are kept. Force Remove permanently discards uncommitted changes and overrides usage by other sessions or chats after a separate confirmation.")));
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
			this.selectedForceSessionIds.clear();
			this.renderRows();
		}));
		const sortLabel = dom.append(controls, dom.$('label', undefined, localize('sessionWorktreeCleanup.sortBy', "Sort by")));
		const sortSelect = dom.append(sortLabel, dom.$<HTMLSelectElement>('select.session-worktree-cleanup-sort'));
		dom.append(sortSelect, dom.$('option', { value: 'size' }, localize('sessionWorktreeCleanup.largestFirst', "Size (Largest First)")));
		dom.append(sortSelect, dom.$('option', { value: 'recent' }, localize('sessionWorktreeCleanup.recentFirst', "Session Recency (Newest First)")));
		this.editorDisposables.add(dom.addDisposableListener(sortSelect, dom.EventType.CHANGE, () => {
			this.sortOrder = sortSelect.value === 'recent' ? 'recent' : 'size';
			this.pinnedDisplayOrder = undefined;
			this.renderRows();
		}));

		this.measurementProgress = dom.append(content, dom.$('p.session-worktree-cleanup-measurement-progress', { role: 'status', 'aria-live': 'polite' }));
		dom.hide(this.measurementProgress);
		this.progressSection = dom.append(content, dom.$('.session-worktree-cleanup-progress.hidden'));
		this.progressHeading = dom.append(this.progressSection, dom.$('h2'));
		const progressList = dom.append(this.progressSection, dom.$('.session-worktree-cleanup-list'));
		this.progressWorktreeTable = this.createWorktreeTable(progressList, localize('sessionWorktreeCleanup.progressTable', "Worktrees in progress"));
		this.availableHeading = dom.append(content, dom.$('h2.session-worktree-cleanup-available-heading'));
		const summaryRow = this.summaryRow = dom.append(content, dom.$('.session-worktree-cleanup-summary-row'));
		this.summary = dom.append(summaryRow, dom.$('.session-worktree-cleanup-summary'));
		this.summaryMessage = dom.append(this.summary, dom.$('span', { role: 'status', 'aria-live': 'polite' }));
		const eligibilityInfo = dom.append(this.summary, dom.$('button.session-worktree-cleanup-info', {
			type: 'button',
			'aria-label': localize('sessionWorktreeCleanup.eligibilityInfo', "Show cleanup eligibility details"),
		}));
		eligibilityInfo.appendChild(renderIcon(Codicon.info));
		const eligibilityHover = this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), eligibilityInfo, localize(
			'sessionWorktreeCleanup.unmeasuredEligibilityDescription',
			"Active sessions and sessions waiting for input can be selected manually but are not selected by default. Worktrees with no matching session are selected by default when they can be cleaned up, even if their disk usage is unknown. With an Untouched for filter, their age is unknown, so they must be selected manually. Sessions already marked as done are selected by default when their host supports retrying cleanup, unless removal failed or was deferred. Their disk usage is not measured and is shown as a dash. Needs attention has a separate, initially unchecked selection for forced removal on supported hosts. Scheduled or running cleanup cannot be selected again. Running, pinned, untitled, and error sessions cannot be selected. Other sessions require a successful disk usage measurement. The filters limit the table and cleanup selection. Estimated disk usage is not guaranteed freed space.",
		)));
		this.editorDisposables.add(dom.addDisposableListener(eligibilityInfo, dom.EventType.CLICK, () => eligibilityHover.show(true)));
		this.cleanupButton = this.editorDisposables.add(new Button(summaryRow, defaultButtonStyles));
		this.cleanupButton.label = localize('sessionWorktreeCleanup.cleanupButton', "Clean Up Worktrees");
		this.cleanupButton.element.classList.add('session-worktree-cleanup-action');
		this.cleanupButton.enabled = false;
		this.editorDisposables.add(this.cleanupButton.onDidClick(() => void this.cleanupSelected()));

		this.batchSummaryRow = dom.append(content, dom.$('.session-worktree-cleanup-summary-row.session-worktree-cleanup-batch.hidden'));
		this.batchSummary = dom.append(this.batchSummaryRow, dom.$('span.session-worktree-cleanup-summary', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
		this.retryButton = this.editorDisposables.add(new Button(this.batchSummaryRow, { ...defaultButtonStyles, secondary: true }));
		this.retryButton.label = localize('sessionWorktreeCleanup.retryFailed', "Retry Failed Worktrees");
		this.retryButton.element.classList.add('session-worktree-cleanup-action', 'session-worktree-cleanup-retry');
		this.editorDisposables.add(this.retryButton.onDidClick(() => {
			const candidates = this.getRetryCandidates();
			void this.cleanupSelected(candidates, candidates.some(worktree => this.canForceCleanup(worktree)) ? candidates : undefined);
		}));

		const selection = dom.$('.session-worktree-cleanup-select-all');
		summaryRow.insertBefore(selection, this.cleanupButton.element);
		const selectAll = this.selectAllCheckbox = this.editorDisposables.add(new Checkbox(
			localize('sessionWorktreeCleanup.selectAll', "Select all worktrees that can be cleaned up"),
			false,
			defaultCheckboxStyles,
		));
		selection.appendChild(selectAll.domNode);
		const selectAllLabel = dom.append(selection, dom.$('span', undefined, localize('sessionWorktreeCleanup.selectAllLabel', "Select All")));
		this.editorDisposables.add(dom.addDisposableListener(selectAllLabel, dom.EventType.CLICK, () => selectAll.domNode.click()));
		this.editorDisposables.add(selectAll.onChange(() => {
			const selectable = this.getVisibleWorktrees().filter(worktree => this.isManuallySelectable(worktree));
			for (const worktree of selectable) {
				this.explicitSelections.set(getWorktreeCleanupId(worktree), selectAll.checked);
			}
			this.selectedSessionIds = selectAll.checked ? new Set(selectable.map(worktree => getWorktreeCleanupId(worktree))) : new Set();
			this.renderRows();
		}));
		this.list = dom.append(content, dom.$('.session-worktree-cleanup-list'));
		this.mainWorktreeTable = this.createWorktreeTable(this.list, localize('sessionWorktreeCleanup.tableLabel', "Agent session worktrees"));
		if (this.progressSection) {
			this.list.after(this.progressSection);
		}
		this.unavailableSection = dom.append(content, dom.$<HTMLDetailsElement>('details.session-worktree-cleanup-unavailable.hidden'));
		this.unavailableSummary = dom.append(this.unavailableSection, dom.$('summary'));
		this.forceSelectionRow = dom.append(this.unavailableSection, dom.$('.session-worktree-cleanup-summary-row'));
		const forceSelection = dom.append(this.forceSelectionRow, dom.$('.session-worktree-cleanup-select-all'));
		const forceSelectAll = this.forceSelectAllCheckbox = this.editorDisposables.add(new Checkbox(
			localize('sessionWorktreeCleanup.forceSelectAll', "Select all worktrees that can be forcibly removed in Needs attention"),
			false,
			defaultCheckboxStyles,
		));
		forceSelection.appendChild(forceSelectAll.domNode);
		const forceSelectAllLabel = dom.append(forceSelection, dom.$('span', undefined, localize('sessionWorktreeCleanup.selectAllLabel', "Select All")));
		this.editorDisposables.add(dom.addDisposableListener(forceSelectAllLabel, dom.EventType.CLICK, () => forceSelectAll.domNode.click()));
		this.editorDisposables.add(forceSelectAll.onChange(() => {
			for (const worktree of this.getVisibleWorktrees().filter(worktree => this.canForceCleanup(worktree))) {
				const id = getWorktreeCleanupId(worktree);
				if (forceSelectAll.checked) {
					this.selectedForceSessionIds.add(id);
				} else {
					this.selectedForceSessionIds.delete(id);
				}
			}
			this.renderRows();
		}));
		this.forceCleanupButton = this.editorDisposables.add(new Button(this.forceSelectionRow, { ...defaultButtonStyles, secondary: true }));
		this.forceCleanupButton.element.classList.add('session-worktree-cleanup-force-remove');
		this.editorDisposables.add(this.forceCleanupButton.onDidClick(() => {
			const selected = this.getSelectedForForceCleanup();
			void this.cleanupSelected(selected, selected);
		}));
		this.editorDisposables.add(dom.addDisposableListener(this.unavailableSection, 'toggle', () => {
			this.layoutWorktreeTables();
			this.updateScrollDimensions();
		}));
		this.unavailableList = dom.append(this.unavailableSection, dom.$('.session-worktree-cleanup-list.session-worktree-cleanup-unavailable-list'));
		this.unavailableWorktreeTable = this.createWorktreeTable(this.unavailableList, localize('sessionWorktreeCleanup.unavailableTableLabel', "Worktrees needing attention"));
		this.emptyState = dom.append(content, dom.$('.session-worktree-cleanup-empty', { role: 'status' }));
		const emptyStateIcon = dom.append(this.emptyState, renderIcon(Codicon.info));
		emptyStateIcon.setAttribute('aria-hidden', 'true');
		this.emptyStateMessage = dom.append(this.emptyState, dom.$('span'));
		this.emptyState.classList.add('hidden');
	}

	override async setInput(input: SessionWorktreeCleanupEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.explicitSelections.clear();
		this.selectedForceSessionIds.clear();
		void this.load(true);
	}

	override focus(): void {
		super.focus();
		this.container?.focus();
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
			this.layoutWorktreeTables();
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

	override clearInput(): void {
		this.renderVersion++;
		this.cleanupGeneration++;
		this.isSchedulingCleanup = false;
		this.cleanupBatch.clear();
		this.explicitSelections.clear();
		this.hasCleanupFailures = false;
		this.renderBatchSummary();
		this.pendingCleanupScheduler.cancel();
		this.cleanupRenderScheduler.cancel();
		this.updateMeasuredWorktrees = undefined;
		this.loadDisposables.clear();
		this.clearRenderedRows();
		this.displayWorktreesById.clear();
		this.pinnedDisplayOrder = undefined;
		super.clearInput();
	}

	private async load(forceRefresh = false, preserveDisplayOrder = false): Promise<void> {
		const version = ++this.renderVersion;
		if (!preserveDisplayOrder && this.cleanupBatch.size === 0) {
			this.pinnedDisplayOrder = undefined;
		}
		this.pendingCleanupScheduler.cancel();
		this.loadDisposables.clear();
		const cancellation = new CancellationTokenSource();
		this.loadToken = cancellation.token;
		this.loadDisposables.add(toDisposable(() => cancellation.dispose(true)));
		let measurementProgress: ISessionWorktreeMeasurementProgress | undefined;
		const update = (worktrees: readonly ISessionWorktree[]) => {
			if (version !== this.renderVersion || this._store.isDisposed || !this.list || !this.summary) {
				return;
			}
			this.worktrees = worktrees;
			if (this.measurementProgress) {
				const total = measurementProgress?.totalWorktrees ?? worktrees.reduce((count, worktree) => count + worktree.worktreeCount, 0);
				const processed = measurementProgress?.scannedWorktrees ?? worktrees.reduce((count, worktree) => count + (worktree.isMeasuring ? 0 : worktree.worktreeCount), 0);
				dom.setVisibility(total > 0, this.measurementProgress);
				const progress = processed < total
					? localize('sessionWorktreeCleanup.measurementProgress', "Measuring worktree storage: {0} of {1} worktrees processed.", processed, total)
					: localize('sessionWorktreeCleanup.measurementComplete', "Worktree storage scan complete: {0} of {1} worktrees processed.", processed, total);
				if (this.measurementProgress.textContent !== progress) {
					this.measurementProgress.textContent = progress;
				}
			}
			this.updateCleanupBatch();
			this.renderWorkspaceOptions();
			for (const worktree of this.getVisibleWorktrees()) {
				const sessionId = getWorktreeCleanupId(worktree);
				const selectByDefault = worktree.cleanupState === 'eligible' || worktree.cleanupState === 'archived' || (worktree.unlinkedWorktree && this.minimumAgeDays === 0);
				const selected = this.explicitSelections.get(sessionId) ?? selectByDefault;
				if (selected && this.isManuallySelectable(worktree) && !this.cleanupBatch.has(sessionId)) {
					this.selectedSessionIds.add(sessionId);
				} else {
					this.selectedSessionIds.delete(sessionId);
				}
			}
			if (this.ageSelect) {
				this.ageSelect.disabled = false;
			}
			if (this.workspaceSelect) {
				this.workspaceSelect.disabled = false;
			}
			this.renderRows();
		};
		// Publish the first and final snapshots immediately; combine intermediate results into
		// one render per interval rather than rebuilding the table for every measured session.
		let pendingUpdate: readonly ISessionWorktree[] | undefined;
		const renderScheduler = this.loadDisposables.add(new RunOnceScheduler(() => {
			if (pendingUpdate) {
				update(pendingUpdate);
				pendingUpdate = undefined;
			}
		}, 100));
		let publishedInitial = false;
		const scheduleUpdate = (worktrees: readonly ISessionWorktree[], progress?: ISessionWorktreeMeasurementProgress) => {
			if (version !== this.renderVersion || this._store.isDisposed) {
				return;
			}
			measurementProgress = progress ?? measurementProgress;
			if (!publishedInitial) {
				publishedInitial = true;
				update(worktrees);
			} else {
				pendingUpdate = worktrees;
				if (!renderScheduler.isScheduled()) {
					renderScheduler.schedule();
				}
			}
		};
		this.updateMeasuredWorktrees = scheduleUpdate;
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
		if (!preserveDisplayOrder) {
			this.unavailableSection?.classList.add('hidden');
			this.clearRenderedRows();
			this.selectedSessionIds.clear();
			this.emptyState?.classList.add('hidden');
			if (this.measurementProgress) {
				dom.hide(this.measurementProgress);
			}
			if (this.summaryMessage) {
				this.summaryMessage.textContent = localize('sessionWorktreeCleanup.loading', "Measuring worktree storage...");
			}
		}
		try {
			const worktrees = await this.cleanupService.getWorktrees(this.minimumAgeDays, scheduleUpdate, cancellation.token, forceRefresh);
			if (version !== this.renderVersion || this._store.isDisposed) {
				return;
			}
			renderScheduler.cancel();
			pendingUpdate = undefined;
			for (const id of this.cleaningSessionIds.keys()) {
				if (!worktrees.some(worktree => getWorktreeCleanupId(worktree) === id)) {
					this.cleaningSessionIds.delete(id);
				}
			}
			update(worktrees);
			if (version === this.renderVersion) {
				this.schedulePendingCleanup();
			}
		} catch (error) {
			if (version === this.renderVersion && !this._store.isDisposed && this.summaryMessage) {
				if (this.measurementProgress) {
					dom.hide(this.measurementProgress);
				}
				this.summaryMessage.textContent = isCancellationError(error)
					? localize('sessionWorktreeCleanup.loadCanceled', "Worktree measurement canceled.")
					: localize('sessionWorktreeCleanup.loadFailed', "Worktree storage could not be measured.");
			}
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		} finally {
			if (version === this.renderVersion && !this._store.isDisposed && this.ageSelect) {
				this.ageSelect.disabled = false;
				if (this.workspaceSelect) {
					this.workspaceSelect.disabled = false;
				}
				this.updateScrollDimensions();
			}
		}
	}

	private isCleaning(sessionId: string): boolean {
		const started = this.cleaningSessionIds.get(sessionId);
		return started !== undefined && Date.now() - started < 30_000;
	}

	private schedulePendingCleanup(): void {
		if (this.worktrees.some(worktree => this.hasPendingCleanup(worktree))) {
			const remaining = Math.min(30_000, ...this.worktrees.filter(worktree => (!worktree.cleanupStatus || worktree.cleanupStatus.state === 'unknown') && this.isCleaning(getWorktreeCleanupId(worktree))).map(worktree => 30_000 - (Date.now() - this.cleaningSessionIds.get(getWorktreeCleanupId(worktree))!)));
			this.pendingCleanupScheduler.schedule(Math.min(this.pendingCleanupDelay, remaining));
		}
	}

	private hasPendingCleanup(worktree: ISessionWorktree): boolean {
		return worktree.worktreeExists !== false && (worktree.unlinkedWorktree || worktree.cleanupState === 'archived' || worktree.measurementFailed === true) && (worktree.cleanupStatus && worktree.cleanupStatus.state !== 'unknown'
			? worktree.cleanupStatus.state === 'pending' || worktree.cleanupStatus.state === 'running'
			: this.isCleaning(getWorktreeCleanupId(worktree)));
	}

	private async refreshPendingCleanup(): Promise<void> {
		const update = this.updateMeasuredWorktrees;
		const token = this.loadToken;
		try {
			const pendingIds = this.worktrees.filter(worktree => this.hasPendingCleanup(worktree)).map(worktree => getWorktreeCleanupId(worktree));
			if (pendingIds.length === 0) {
				this.renderRows();
				return;
			}
			const worktrees = await this.cleanupService.refreshPendingCleanup(pendingIds, this.minimumAgeDays, update, token);
			if (!token.isCancellationRequested) {
				update?.(worktrees);
				this.pendingCleanupDelay = Math.min(this.pendingCleanupDelay * 2, 30_000);
				this.schedulePendingCleanup();
			}
		} catch (error) {
			if (!token.isCancellationRequested && !isCancellationError(error)) {
				this.notificationService.error(error);
			}
		}
	}

	private createWorktreeTable(container: HTMLElement, label: string): WorkbenchTable<string> {
		const columns: (ITableColumn<string, string> & { templateId: WorktreeColumn })[] = [
			{ label: '', weight: 0, minimumWidth: 40, maximumWidth: 40, templateId: 'selection', project: sessionId => sessionId },
			{ label: localize('sessionWorktreeCleanup.sessionColumn', "Session"), weight: 0.4, minimumWidth: 140, templateId: 'title', project: sessionId => sessionId },
			{ label: localize('sessionWorktreeCleanup.workspaceColumn', "Workspace"), weight: 0.2, minimumWidth: 100, templateId: 'workspace', project: sessionId => sessionId },
			{ label: localize('sessionWorktreeCleanup.lastUsedColumn', "Last Used"), weight: 0.2, minimumWidth: 100, templateId: 'lastUsed', project: sessionId => sessionId },
			{ label: localize('sessionWorktreeCleanup.diskUsageColumn', "Disk Usage"), weight: 0.2, minimumWidth: 100, templateId: 'storage', project: sessionId => sessionId },
		];
		const body = dom.$('.session-worktree-cleanup-table-body');
		const scrollable = this.editorDisposables.add(new DomScrollableElement(body, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			alwaysConsumeMouseWheel: false,
		}));
		container.appendChild(scrollable.getDomNode());
		const table = this.editorDisposables.add(this.instantiationService.createInstance(
			WorkbenchTable<string>,
			'SessionWorktreeCleanup',
			body,
			{ headerRowHeight: WORKTREE_HEADER_HEIGHT, getHeight: () => WORKTREE_ROW_HEIGHT },
			columns,
			columns.map(column => this.createWorktreeCellRenderer(column.templateId)),
			{
				identityProvider: { getId: sessionId => sessionId },
				accessibilityProvider: {
					getWidgetAriaLabel: () => label,
					getAriaLabel: sessionId => this.getWorktreeAriaLabel(this.displayWorktreesById.get(sessionId)!),
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: sessionId => getWorktreeCleanupTitle(this.displayWorktreesById.get(sessionId)!) },
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
			},
		));
		this.tableScrollables.set(table, scrollable);
		this.editorDisposables.add(table.onDidFocus(() => {
			const activeElement = dom.getActiveElement();
			if (!dom.isHTMLElement(activeElement) || activeElement.parentElement !== table.getHTMLElement()) {
				return;
			}
			this.tableFocusElements.set(table, activeElement);
			if (table.length > 0 && table.getFocus().length === 0) {
				table.setFocus([0]);
			}
		}));
		this.editorDisposables.add(dom.addDisposableListener(table.getHTMLElement(), dom.EventType.KEY_DOWN, event => {
			if (event.target !== this.tableFocusElements.get(table) || !new StandardKeyboardEvent(event).equals(KeyCode.Space)) {
				return;
			}
			const sessionId = table.getFocusedElements()[0];
			const worktree = this.displayWorktreesById.get(sessionId);
			if (worktree) {
				event.preventDefault();
				event.stopPropagation();
				this.setWorktreeSelected(worktree, !this.isWorktreeSelected(worktree));
			}
		}));
		this.editorDisposables.add(table.onDidOpen(event => {
			if (event.element && event.browserEvent instanceof dom.getWindow(container).KeyboardEvent && (!event.browserEvent.target || event.browserEvent.target === this.tableFocusElements.get(table))) {
				const worktree = this.displayWorktreesById.get(event.element)!;
				if (worktree.session) {
					void this.sessionsService.openSession(worktree.session.resource).catch(error => this.notificationService.error(error));
				}
			}
		}));
		return table;
	}

	private createWorktreeCellRenderer(column: WorktreeColumn): ITableRenderer<string, IWorktreeCellTemplate> {
		return {
			templateId: column,
			renderTemplate: container => this.createWorktreeCellTemplate(container, column),
			renderElement: (sessionId, _index, template) => {
				let cells = this.renderedCells.get(sessionId);
				if (!cells) {
					this.renderedCells.set(sessionId, cells = new Map());
				}
				cells.set(column, template);
				this.renderWorktreeCell(template, column, this.displayWorktreesById.get(sessionId)!);
			},
			disposeElement: (sessionId, _index, template) => {
				const cells = this.renderedCells.get(sessionId);
				if (cells?.get(column) === template) {
					cells.delete(column);
					if (cells.size === 0) {
						this.renderedCells.delete(sessionId);
					}
				}
			},
			disposeTemplate: template => template.disposables.dispose(),
		};
	}

	private getWorktreeAriaLabel(worktree: ISessionWorktree): string {
		return localize('sessionWorktreeCleanup.rowDiskUsageLabel', "{0}, workspace {1}, last used {2}, disk usage {3}. {4} {5}",
			worktree.unlinkedWorktree
				? localize('sessionWorktreeCleanup.titleAndPath', "{0}, worktree path {1}", getWorktreeCleanupTitle(worktree), URI.parse(worktree.unlinkedWorktree.worktree).path)
				: getWorktreeCleanupTitle(worktree),
			getWorktreeWorkspace(worktree)?.label ?? localize('sessionWorktreeCleanup.unknownWorkspace', "Unknown workspace"),
			worktree.session ? fromNow(worktree.session.updatedAt.get(), true, true) : localize('sessionWorktreeCleanup.unknownLastUsed', "Unknown"),
			this.getWorktreeStorageLabel(worktree, true),
			this.getWorktreeCleanupLabel(worktree, this.isWorktreeCleaning(worktree)) ?? '',
			this.canForceCleanup(worktree)
				? this.selectedForceSessionIds.has(getWorktreeCleanupId(worktree))
					? localize('sessionWorktreeCleanup.selectedForForceRemoval', "Selected for forced removal.")
					: localize('sessionWorktreeCleanup.notSelectedForForceRemoval', "Not selected for forced removal.")
				: this.isManuallySelectable(worktree)
					? this.selectedSessionIds.has(getWorktreeCleanupId(worktree))
						? localize('sessionWorktreeCleanup.selected', "Selected for cleanup.")
						: localize('sessionWorktreeCleanup.notSelected', "Not selected for cleanup.")
					: '',
		);
	}

	private layoutWorktreeTables(): void {
		const width = Math.max(WORKTREE_TABLE_MIN_WIDTH, this.list?.clientWidth || this.unavailableList?.clientWidth || this.layoutDimension?.width || 960);
		for (const [table, scrollable] of this.tableScrollables) {
			const height = WORKTREE_HEADER_HEIGHT + Math.min(table.length * WORKTREE_ROW_HEIGHT, Math.max(WORKTREE_ROW_HEIGHT * 3, Math.floor((this.layoutDimension?.height ?? 600) / 2)));
			const previousDimension = this.tableDimensions.get(table);
			if (previousDimension?.height !== height || previousDimension.width !== width) {
				table.getHTMLElement().style.width = `${width}px`;
				table.getHTMLElement().style.height = `${height}px`;
				table.layout(height, width);
				this.tableDimensions.set(table, new dom.Dimension(width, height));
			}
			scrollable.scanDomNode();
		}
	}

	private updateWorktreeTable(table: WorkbenchTable<string>, sessionIds: readonly string[]): void {
		let start = 0;
		while (start < table.length && start < sessionIds.length && table.row(start) === sessionIds[start]) {
			start++;
		}
		let end = table.length;
		let newEnd = sessionIds.length;
		while (end > start && newEnd > start && table.row(end - 1) === sessionIds[newEnd - 1]) {
			end--;
			newEnd--;
		}
		if (start !== end || start !== newEnd) {
			table.splice(start, end - start, sessionIds.slice(start, newEnd));
		}
	}

	private renderWorkspaceOptions(): void {
		if (!this.workspaceSelect) {
			return;
		}
		const workspaces = new Map(this.getDisplayWorktrees().flatMap(worktree => {
			const workspace = getWorktreeWorkspace(worktree);
			return workspace ? [[extUri.getComparisonKey(workspace.uri), workspace] as const] : [];
		}));
		dom.setVisibility(workspaces.size > 1, this.workspaceSelect.parentElement!);
		if (workspaces.size <= 1 || !workspaces.has(this.selectedWorkspace)) {
			this.selectedWorkspace = '';
		}
		const signature = JSON.stringify([...workspaces].map(([key, workspace]) => [key, workspace.label]));
		if (signature === this.workspaceOptionsSignature) {
			this.workspaceSelect.value = this.selectedWorkspace;
			return;
		}
		this.workspaceOptionsSignature = signature;
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

	private getDisplayWorktrees(): readonly ISessionWorktree[] {
		const worktrees = new Map(this.worktrees.filter(worktree => isWorktreeCleanupBranchSupported(worktree) && (worktree.worktreeExists !== false || this.cleanupBatch.has(getWorktreeCleanupId(worktree)))).map(worktree => [getWorktreeCleanupId(worktree), worktree]));
		for (const [sessionId, entry] of this.cleanupBatch) {
			if (!worktrees.has(sessionId) && isWorktreeCleanupBranchSupported(entry.candidate)) {
				worktrees.set(sessionId, { ...entry.candidate, sizeBytes: entry.state === 'removed' ? 0 : undefined, worktreeExists: entry.state === 'removed' ? false : undefined, cleanupState: 'archived' });
			}
		}
		return [...worktrees.values()].filter(worktree => worktree.isListedByHost !== false || worktree.worktreeExists === false);
	}

	private getMatchingWorktrees(): readonly ISessionWorktree[] {
		const cutoff = Date.now() - this.minimumAgeDays * 24 * 60 * 60 * 1000;
		return this.getDisplayWorktrees().filter(worktree => {
			const workspace = getWorktreeWorkspace(worktree);
			return (!this.selectedWorkspace || (workspace && extUri.getComparisonKey(workspace.uri) === this.selectedWorkspace))
				&& (this.minimumAgeDays === 0 || !worktree.session || worktree.session.updatedAt.get().getTime() <= cutoff);
		});
	}

	private getVisibleWorktrees(): readonly ISessionWorktree[] {
		return this.getMatchingWorktrees().filter(worktree => worktree.unlinkedWorktree || worktree.cleanupState === 'archived' || worktree.isMeasuring || worktree.measurementFailed || worktree.sizeBytes !== undefined || this.cleanupBatch.has(getWorktreeCleanupId(worktree)));
	}

	private renderRows(): void {
		if (!this.list || !this.summaryMessage || !this.selectAllCheckbox || !this.mainWorktreeTable || !this.unavailableWorktreeTable || !this.progressWorktreeTable || !this.unavailableSection || !this.unavailableSummary || !this.unavailableList) {
			return;
		}
		for (const [id, entry] of this.cleanupBatch) {
			if (!isWorktreeCleanupBranchSupported(entry.candidate)) {
				this.cleanupBatch.delete(id);
			}
		}
		const activeElement = dom.getActiveElement();
		const focusedTable = [this.mainWorktreeTable, this.unavailableWorktreeTable, this.progressWorktreeTable].find(table => this.tableFocusElements.get(table) === activeElement);
		const focusedRow = [...this.renderedCells].find(([, cells]) => [...cells.values()].some(cell => cell.container.contains(activeElement)));
		const focusedSessionId = focusedTable?.getFocusedElements()[0] ?? focusedRow?.[0];
		const focusedCheckbox = focusedRow?.[1].get('selection')?.container.contains(activeElement);
		this.updateCleanupBatch();
		this.renderWorkspaceOptions();
		const visible = this.getVisibleWorktrees();
		const selectable = visible.filter(worktree => this.isManuallySelectable(worktree));
		const isInProgress = (worktree: ISessionWorktree) => this.isWorktreeInProgress(worktree);
		const isInMainList = (worktree: ISessionWorktree) => !isInProgress(worktree) && !this.hasRemovalIssue(worktree) && this.isManuallySelectable(worktree);
		const unavailable = visible.filter(worktree => !isInProgress(worktree) && !isInMainList(worktree));
		const forceEligibleIds = new Set(this.worktrees.filter(worktree => this.canForceCleanup(worktree)).map(getWorktreeCleanupId));
		for (const id of this.selectedForceSessionIds) {
			if (!forceEligibleIds.has(id)) {
				this.selectedForceSessionIds.delete(id);
			}
		}
		if (this.progressSection && this.progressHeading) {
			this.progressSection.classList.toggle('hidden', !visible.some(isInProgress));
			this.progressHeading.textContent = localize('sessionWorktreeCleanup.inProgressHeading', "Progress and results ({0})", visible.filter(isInProgress).reduce((total, worktree) => total + worktree.worktreeCount, 0));
		}
		if (this.availableHeading) {
			this.availableHeading.classList.toggle('hidden', !visible.some(isInMainList));
			this.availableHeading.textContent = localize('sessionWorktreeCleanup.availableHeading', "Available for cleanup ({0})", visible.filter(isInMainList).reduce((total, worktree) => total + worktree.worktreeCount, 0));
		}
		const estimatedBytes = getWorktreeCleanupDiskUsage(selectable);
		const selectableWorktrees = selectable.reduce((total, worktree) => total + worktree.worktreeCount, 0);
		const totalWorktrees = visible.reduce((total, worktree) => total + (this.cleanupBatch.get(getWorktreeCleanupId(worktree))?.state === 'removed' ? 0 : worktree.worktreeCount), 0);
		const isEmpty = visible.length === 0;
		this.summaryRow?.classList.toggle('hidden', isEmpty);
		this.list.classList.toggle('hidden', !visible.some(isInMainList));
		this.unavailableSection.classList.toggle('hidden', unavailable.length === 0);
		if (unavailable.some(worktree => this.hasRemovalIssue(worktree))) {
			this.unavailableSection.open = true;
		}
		this.unavailableSummary.textContent = localize('sessionWorktreeCleanup.unavailableSection', "Needs attention ({0})", unavailable.reduce((total, worktree) => total + worktree.worktreeCount, 0));
		this.emptyState?.classList.toggle('hidden', !isEmpty);
		if (this.emptyStateMessage) {
			this.emptyStateMessage.textContent = this.getMatchingWorktrees().length > 0
				? localize('sessionWorktreeCleanup.noMeasuredStorage', "No worktrees with available storage measurements.")
				: this.minimumAgeDays === 0 && !this.selectedWorkspace
					? localize('sessionWorktreeCleanup.noWorktrees', "No worktrees to clean up.")
					: localize('sessionWorktreeCleanup.noMatchingWorktrees', "No worktrees match the selected filters.");
		}
		const summary = estimatedBytes !== undefined && estimatedBytes > 0
			? localize('sessionWorktreeCleanup.matchingWorktreeDiskUsageSummary', "{0} of {1} matching worktrees can be cleaned up. Estimated disk usage: {2}.", selectableWorktrees, totalWorktrees, ByteSize.formatSize(estimatedBytes))
			: localize('sessionWorktreeCleanup.matchingWorktreeSummaryNoStorage', "{0} of {1} matching worktrees can be cleaned up.", selectableWorktrees, totalWorktrees);
		if (this.summaryMessage.textContent !== summary) {
			this.summaryMessage.textContent = summary;
		}
		this.selectAllCheckbox.checked = selectable.length > 0 && selectable.every(worktree => this.selectedSessionIds.has(getWorktreeCleanupId(worktree)));
		if (selectable.length === 0) {
			this.selectAllCheckbox.disable();
		} else {
			this.selectAllCheckbox.enable();
		}

		const sortedVisible = [...visible].sort((a, b) => {
			const aPinnedIndex = this.pinnedDisplayOrder?.get(getWorktreeCleanupId(a));
			const bPinnedIndex = this.pinnedDisplayOrder?.get(getWorktreeCleanupId(b));
			if (aPinnedIndex !== undefined || bPinnedIndex !== undefined) {
				if (aPinnedIndex === undefined) {
					return 1;
				}
				if (bPinnedIndex === undefined) {
					return -1;
				}
				return aPinnedIndex - bPinnedIndex;
			}
			if (this.sortOrder === 'recent') {
				return (b.session?.updatedAt.get().getTime() ?? -1) - (a.session?.updatedAt.get().getTime() ?? -1);
			}
			return (b.cleanupState === 'archived' ? -1 : b.sizeBytes ?? -1) - (a.cleanupState === 'archived' ? -1 : a.sizeBytes ?? -1);
		});
		const ordered = [...sortedVisible.filter(isInMainList), ...sortedVisible.filter(isInProgress), ...sortedVisible.filter(worktree => !isInProgress(worktree) && !isInMainList(worktree))];
		this.displayedSessionIds = ordered.map(worktree => getWorktreeCleanupId(worktree));
		const nextWorktrees = new Map(visible.map(worktree => [getWorktreeCleanupId(worktree), worktree]));
		for (const [sessionId, worktree] of nextWorktrees) {
			this.displayWorktreesById.set(sessionId, worktree);
		}
		this.updateWorktreeTable(this.mainWorktreeTable, sortedVisible.filter(isInMainList).map(worktree => getWorktreeCleanupId(worktree)));
		this.updateWorktreeTable(this.progressWorktreeTable, sortedVisible.filter(isInProgress).map(worktree => getWorktreeCleanupId(worktree)));
		this.updateWorktreeTable(this.unavailableWorktreeTable, sortedVisible.filter(worktree => !isInProgress(worktree) && !isInMainList(worktree)).map(worktree => getWorktreeCleanupId(worktree)));
		this.displayWorktreesById = nextWorktrees;
		this.layoutWorktreeTables();
		for (const sessionId of this.renderedCells.keys()) {
			this.renderWorktreeCells(this.displayWorktreesById.get(sessionId)!);
		}
		if (focusedSessionId) {
			const worktree = nextWorktrees.get(focusedSessionId);
			if (worktree) {
				const table = isInProgress(worktree) ? this.progressWorktreeTable : isInMainList(worktree) ? this.mainWorktreeTable : this.unavailableWorktreeTable;
				if (table === this.unavailableWorktreeTable) {
					this.unavailableSection.open = true;
				}
				const index = table.indexOf(focusedSessionId);
				table.setFocus([index]);
				table.reveal(index);
				if (focusedTable) {
					table.domFocus();
				} else {
					const cells = this.renderedCells.get(focusedSessionId);
					const checkbox = focusedCheckbox ? cells?.get('selection')?.focusTarget : undefined;
					(checkbox?.isConnected ? checkbox : cells?.get('title')?.focusTarget)?.focus();
				}
			}
		}
		this.updateCleanupButton();
		this.renderBatchSummary();
		this.updateScrollDimensions();
	}

	private createWorktreeCellTemplate(container: HTMLElement, column: WorktreeColumn): IWorktreeCellTemplate {
		const disposables = new DisposableStore();
		const dynamicDisposables = disposables.add(new DisposableStore());
		container.classList.add(column);
		container.parentElement!.classList.add('session-worktree-cleanup-row');
		let render: (worktree: ISessionWorktree) => void;
		let focusTarget: HTMLElement | undefined;
		if (column === 'selection') {
			const checkbox = disposables.add(new Checkbox('', false, defaultCheckboxStyles));
			const progress = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
			progress.setAttribute('aria-hidden', 'true');
			focusTarget = checkbox.domNode;
			disposables.add(checkbox.onChange(() => this.setWorktreeSelected(template.worktree!, checkbox.checked)));
			render = worktree => {
				const title = getWorktreeCleanupTitle(worktree);
				checkbox.setTitle(this.canForceCleanup(worktree)
					? localize('sessionWorktreeCleanup.selectForceRemoval', "Select {0} for forced removal", title)
					: localize('sessionWorktreeCleanup.selectSession', "Select {0}", title));
				checkbox.checked = this.isWorktreeSelected(worktree);
				if (this.isManuallySelectable(worktree) || this.canForceCleanup(worktree)) {
					checkbox.enable();
					checkbox.domNode.removeAttribute('aria-disabled');
					if (!container.contains(checkbox.domNode)) {
						container.appendChild(checkbox.domNode);
					}
				} else {
					checkbox.disable();
					checkbox.domNode.remove();
				}
				if (this.isWorktreeCleaning(worktree)) {
					if (!container.contains(progress)) {
						container.appendChild(progress);
					}
				} else {
					progress.remove();
				}
				const reason = this.getWorktreeCleanupLabel(worktree, this.isWorktreeCleaning(worktree));
				if (reason) {
					checkbox.domNode.setAttribute('aria-description', reason);
				} else {
					checkbox.domNode.removeAttribute('aria-description');
				}
			};
		} else if (column === 'title') {
			const titleLink = dom.append(container, dom.$('a.session-worktree-cleanup-session-link', { role: 'link', tabIndex: 0 }));
			focusTarget = titleLink;
			let reason: HTMLElement | undefined;
			const openSession = () => {
				const session = template.worktree?.session;
				if (session) {
					void this.sessionsService.openSession(session.resource).catch(error => this.notificationService.error(error));
				} else if (template.worktree?.unlinkedWorktree) {
					this.hoverService.showInstantHover({ ...this.cellHoverOptions, target: titleLink, content: URI.parse(template.worktree.unlinkedWorktree.worktree).path }, true);
				}
			};
			disposables.add(dom.addDisposableListener(titleLink, dom.EventType.CLICK, openSession));
			disposables.add(dom.addDisposableListener(titleLink, dom.EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
					keyboardEvent.preventDefault();
					keyboardEvent.stopPropagation();
					openSession();
				}
			}));
			render = worktree => {
				dynamicDisposables.clear();
				const title = getWorktreeCleanupTitle(worktree);
				titleLink.textContent = title;
				titleLink.setAttribute('role', worktree.session ? 'link' : 'button');
				dynamicDisposables.add(this.hoverService.setupDelayedHoverAtMouse(titleLink, { content: worktree.unlinkedWorktree ? URI.parse(worktree.unlinkedWorktree.worktree).path : localize('sessionWorktreeCleanup.openSession', "Open {0}", title) }, this.cellHoverOptions));
				reason?.remove();
				reason = undefined;
				const cleanupLabel = this.getWorktreeCleanupLabel(worktree, this.isWorktreeCleaning(worktree));
				const label = worktree.unlinkedWorktree
					? localize('sessionWorktreeCleanup.reasonAndPath', "{0} - {1}", cleanupLabel ?? '', URI.parse(worktree.unlinkedWorktree.worktree).path)
					: cleanupLabel;
				if (label) {
					reason = dom.append(container, dom.$('span.session-worktree-cleanup-reason', undefined, label));
					dynamicDisposables.add(this.hoverService.setupDelayedHoverAtMouse(reason, { content: label }, this.cellHoverOptions));
					titleLink.setAttribute('aria-description', label);
				} else {
					titleLink.removeAttribute('aria-description');
				}
			};
		} else {
			render = worktree => {
				dynamicDisposables.clear();
				if (column === 'workspace') {
					const workspace = getWorktreeWorkspace(worktree);
					container.textContent = workspace?.label ?? localize('sessionWorktreeCleanup.unknownWorkspace', "Unknown workspace");
					if (workspace) {
						dynamicDisposables.add(this.hoverService.setupDelayedHoverAtMouse(container, { content: workspace.description ? `${workspace.label}\n${workspace.description}\n${workspace.uri.toString(true)}` : workspace.uri.toString(true) }, this.cellHoverOptions));
					}
				} else if (column === 'lastUsed') {
					const updatedAt = worktree.session?.updatedAt.get();
					container.textContent = updatedAt ? fromNow(updatedAt, true, true) : localize('sessionWorktreeCleanup.unknownLastUsed', "Unknown");
					if (updatedAt) {
						dynamicDisposables.add(this.hoverService.setupDelayedHoverAtMouse(container, { content: updatedAt.toLocaleString() }, this.cellHoverOptions));
					}
				} else {
					const storage = this.getWorktreeStorageLabel(worktree);
					container.textContent = storage;
					dynamicDisposables.add(this.hoverService.setupDelayedHoverAtMouse(container, { content: this.getWorktreeStorageLabel(worktree, true) }, this.cellHoverOptions));
				}
			};
		}
		const template: IWorktreeCellTemplate = { container, disposables, render, focusTarget, worktree: undefined, signature: '' };
		return template;
	}

	private setWorktreeSelected(worktree: ISessionWorktree, selected: boolean): void {
		const force = this.canForceCleanup(worktree);
		if (!force && !this.isManuallySelectable(worktree)) {
			return;
		}
		const sessionId = getWorktreeCleanupId(worktree);
		if (!force) {
			this.explicitSelections.set(sessionId, selected);
		}
		const selection = force ? this.selectedForceSessionIds : this.selectedSessionIds;
		if (selected) {
			selection.add(sessionId);
		} else {
			selection.delete(sessionId);
		}

		this.renderWorktreeCells(worktree);
		if (this.selectAllCheckbox) {
			const selectable = this.getVisibleWorktrees().filter(worktree => this.isManuallySelectable(worktree));
			this.selectAllCheckbox.checked = selectable.length > 0 && selectable.every(worktree => this.selectedSessionIds.has(getWorktreeCleanupId(worktree)));
		}
		this.updateCleanupButton();
		this.updateScrollDimensions();
	}

	private isWorktreeSelected(worktree: ISessionWorktree): boolean {
		return (this.canForceCleanup(worktree) ? this.selectedForceSessionIds : this.selectedSessionIds).has(getWorktreeCleanupId(worktree));
	}

	private renderWorktreeCells(worktree: ISessionWorktree): void {
		for (const [column, template] of this.renderedCells.get(getWorktreeCleanupId(worktree)) ?? []) {
			this.renderWorktreeCell(template, column, worktree);
		}
	}

	private renderWorktreeCell(template: IWorktreeCellTemplate, column: WorktreeColumn, worktree: ISessionWorktree): void {
		template.worktree = worktree;
		const signature = column === 'storage' ? this.getWorktreeStorageLabel(worktree) : this.getRenderedRowSignature(worktree);
		if (template.signature !== signature) {
			template.render(worktree);
			template.signature = signature;
		}
		if (column === 'selection') {
			const row = template.container.parentElement!;
			const label = this.getWorktreeAriaLabel(worktree);
			if (row.parentElement?.getAttribute('aria-label') !== label) {
				row.parentElement?.setAttribute('aria-label', label);
			}
			if (this.isWorktreeCleaning(worktree)) {
				row.setAttribute('aria-busy', 'true');
			} else {
				row.removeAttribute('aria-busy');
			}
		}
	}

	private isWorktreeCleaning(worktree: ISessionWorktree): boolean {
		const batch = this.cleanupBatch.get(getWorktreeCleanupId(worktree));
		return batch?.state === 'queued' || batch?.state === 'pending' || this.hasPendingCleanup(worktree);
	}

	private getWorktreeStorageLabel(worktree: ISessionWorktree, accessible = false): string {
		if (worktree.worktreeExists === false) {
			return ByteSize.formatSize(0);
		}
		return worktree.cleanupState === 'archived' || worktree.session?.isArchived.get()
			? accessible ? localize('sessionWorktreeCleanup.doneStorage', "not measured for done sessions") : '—'
			: worktree.isMeasuring
				? localize('sessionWorktreeCleanup.calculatingStorage', "Calculating…")
				: worktree.sizeBytes === undefined
					? localize('sessionWorktreeCleanup.unknownStorage', "Unknown")
					: ByteSize.formatSize(worktree.sizeBytes);
	}

	private getRenderedRowSignature(worktree: ISessionWorktree): string {
		const workspace = getWorktreeWorkspace(worktree);
		const batch = this.cleanupBatch.get(getWorktreeCleanupId(worktree));
		return [
			getWorktreeCleanupTitle(worktree),
			worktree.session?.updatedAt.get().getTime(),
			workspace?.label,
			workspace?.description,
			workspace?.uri.toString(),
			worktree.sizeBytes === undefined,
			worktree.worktreeCount,
			worktree.cleanupState,
			worktree.isMeasuring,
			worktree.cleanupStatus?.state,
			worktree.cleanupStatus?.message,
			worktree.cleanupStatusError,
			worktree.worktreeExists,
			worktree.worktreeCheckError,
			this.canForceCleanup(worktree),
			this.isSchedulingCleanup,
			batch?.state,
			batch?.schedulingError,
			this.isWorktreeSelected(worktree),
			worktree.cleanupState === 'archived' && this.isCleaning(getWorktreeCleanupId(worktree)),
		].join('\0');
	}

	private clearRenderedRows(): void {
		this.mainWorktreeTable?.splice(0, this.mainWorktreeTable.length);
		this.unavailableWorktreeTable?.splice(0, this.unavailableWorktreeTable.length);
		this.progressWorktreeTable?.splice(0, this.progressWorktreeTable.length);
		this.renderedCells.clear();
		this.displayedSessionIds = [];
	}

	private getWorktreeCleanupLabel(worktree: ISessionWorktree, cleaning: boolean): string | undefined {
		const batch = this.cleanupBatch.get(getWorktreeCleanupId(worktree));
		if (batch?.state === 'removed') {
			return localize('sessionWorktreeCleanup.removed', "Worktree removed");
		}
		if (batch?.schedulingError) {
			return localize('sessionWorktreeCleanup.scheduleFailed', "Couldn't schedule cleanup: {0}", batch.schedulingError);
		}
		if (batch?.state === 'queued') {
			return localize('sessionWorktreeCleanup.queued', "Queued for cleanup…");
		}
		if (batch && !worktree.unlinkedWorktree && worktree.cleanupState !== 'archived' && worktree.sizeBytes === undefined && !worktree.isMeasuring) {
			return localize('sessionWorktreeCleanup.unverifiedStorage', "Couldn't measure storage. Cleanup has not been confirmed.");
		}
		if (worktree.cleanupState === 'archived' || worktree.unlinkedWorktree) {
			if (worktree.cleanupStatusError) {
				return localize('sessionWorktreeCleanup.statusError', "Couldn't read cleanup status: {0}", worktree.cleanupStatusError);
			}
			if (worktree.worktreeCheckError) {
				return localize('sessionWorktreeCleanup.existenceError', "Couldn't check whether the worktree still exists: {0}", worktree.worktreeCheckError);
			}
			if (worktree.cleanupStatus && (worktree.cleanupStatus.state !== 'unknown' || (!cleaning && !worktree.unlinkedWorktree))) {
				return this.getArchivedCleanupLabel(worktree);
			}
		}
		if (cleaning) {
			return localize('sessionWorktreeCleanup.waitingForCleanup', "Waiting for cleanup…");
		}
		if (worktree.isMeasuring) {
			return localize('sessionWorktreeCleanup.calculating', "Calculating storage…");
		}
		if (worktree.cleanupState === 'archived' && worktree.worktreeExists === undefined) {
			return localize('sessionWorktreeCleanup.existenceUnavailable', "Couldn't verify whether the worktree still exists.");
		}
		if (worktree.cleanupState !== 'eligible') {
			return this.getCleanupStateLabel(worktree.cleanupState);
		}
		return batch ? localize('sessionWorktreeCleanup.unverifiedCleanup', "Cleanup has not been confirmed.") : undefined;
	}

	private requiresSessionRearchive(worktree: ISessionWorktree): boolean {
		return worktree.session?.isArchived.get() === true && worktree.cleanupStatus?.state === 'failed'
			&& /\bgit add exited with code 128\b/.test(worktree.cleanupStatus.message ?? '');
	}

	private getArchivedCleanupLabel(worktree: ISessionWorktree): string {
		switch (worktree.cleanupStatus?.state) {
			case 'pending': return localize('sessionWorktreeCleanup.scheduled', "Cleanup scheduled…");
			case 'running': return localize('sessionWorktreeCleanup.cleaning', "Cleaning up…");
			case 'inUse': return localize('sessionWorktreeCleanup.inUse', "Cleanup blocked: another session or chat uses this worktree.");
			case 'skipped': return localize('sessionWorktreeCleanup.doneSkipped', "Cleanup deferred: the worktree could not be safely removed.");
			case 'failed': return this.requiresSessionRearchive(worktree)
				? localize('sessionWorktreeCleanup.rearchiveRequired', "Unarchive and archive the session to remove this worktree.")
				: worktree.cleanupStatus.message
					? localize('sessionWorktreeCleanup.failedRetryReason', "Cleanup failed; retry scheduled: {0}", worktree.cleanupStatus.message)
					: localize('sessionWorktreeCleanup.failedRetry', "Cleanup failed; retry scheduled.");
			default: return worktree.worktreeExists === true
				? localize('sessionWorktreeCleanup.existsRetry', "Worktree still exists. Select to retry cleanup.")
				: localize('sessionWorktreeCleanup.unverifiedRetry', "Worktree removal has not been confirmed. Select to retry cleanup.");
		}
	}

	private getCleanupStateLabel(state: Exclude<SessionWorktreeCleanupState, 'eligible'>): string {
		switch (state) {
			case 'active': return localize('sessionWorktreeCleanup.active', "Active session");
			case 'running': return localize('sessionWorktreeCleanup.running', "Running");
			case 'needsInput': return localize('sessionWorktreeCleanup.needsInput', "Waiting for input");
			case 'pinned': return localize('sessionWorktreeCleanup.pinned', "Pinned");
			case 'recent': return localize('sessionWorktreeCleanup.recent', "Recently used");
			case 'archived': return localize('sessionWorktreeCleanup.done', "Done");
			case 'unlinked': return localize('sessionWorktreeCleanup.noMatchingSession', "No matching session");
			case 'untitled': return localize('sessionWorktreeCleanup.untitledState', "Untitled");
			case 'error': return localize('sessionWorktreeCleanup.error', "Session error");
			case 'unavailable': return localize('sessionWorktreeCleanup.unavailable', "Couldn't measure storage");
		}
	}

	private updateCleanupButton(): void {
		if (this.forceCleanupButton && this.forceSelectAllCheckbox) {
			const selectable = this.getVisibleWorktrees().filter(worktree => this.canForceCleanup(worktree));
			const selected = this.getSelectedForForceCleanup();
			const count = selected.reduce((total, worktree) => total + worktree.worktreeCount, 0);
			this.forceCleanupButton.label = count === 0
				? localize('sessionWorktreeCleanup.forceRemoveWorktrees', "Force Remove Worktrees")
				: count === 1
					? localize('sessionWorktreeCleanup.forceRemoveOne', "Force Remove 1 Worktree")
					: localize('sessionWorktreeCleanup.forceRemoveMany', "Force Remove {0} Worktrees", count);
			this.forceCleanupButton.enabled = !this.isSchedulingCleanup && count > 0;
			this.forceSelectAllCheckbox.checked = selectable.length > 0 && selected.length === selectable.length;
			if (selectable.length === 0 || this.isSchedulingCleanup) {
				this.forceSelectAllCheckbox.disable();
			} else {
				this.forceSelectAllCheckbox.enable();
			}
			if (this.forceSelectionRow) {
				if (selectable.length > 0) {
					if (this.forceSelectionRow.previousElementSibling !== this.unavailableSummary) {
						this.unavailableSummary?.after(this.forceSelectionRow);
					}
				} else {
					this.forceSelectionRow.remove();
				}
			}
		}
		if (!this.cleanupButton) {
			return;
		}
		const selected = this.getSelected();
		const selectedWorktrees = selected.reduce((total, candidate) => total + candidate.worktreeCount, 0);
		const selectedBytes = getWorktreeCleanupDiskUsage(selected);
		const selectedSize = selectedBytes === undefined ? undefined : ByteSize.formatSize(selectedBytes);
		this.cleanupButton.label = selected.length === 0
			? localize('sessionWorktreeCleanup.cleanupButton', "Clean Up Worktrees")
			: selectedSize === undefined
				? selectedWorktrees === 1
					? localize('sessionWorktreeCleanup.cleanupSelectionOne', "Clean Up 1 Worktree")
					: localize('sessionWorktreeCleanup.cleanupSelection', "Clean Up {0} Worktrees", selectedWorktrees)
				: selectedWorktrees === 1
					? localize('sessionWorktreeCleanup.cleanupSelectionWithSizeOne', "Clean Up 1 Worktree (~{0})", selectedSize)
					: localize('sessionWorktreeCleanup.cleanupSelectionWithSize', "Clean Up {0} Worktrees (~{1})", selectedWorktrees, selectedSize);
		this.cleanupButton.element.setAttribute('aria-label', selected.length === 0 || selectedSize === undefined
			? this.cleanupButton.label
			: selectedWorktrees === 1
				? localize('sessionWorktreeCleanup.cleanupSelectionDiskUsageOneAccessible', "Clean Up 1 Worktree, estimated disk usage {0}", selectedSize)
				: localize('sessionWorktreeCleanup.cleanupSelectionDiskUsageAccessible', "Clean Up {0} Worktrees, estimated disk usage {1}", selectedWorktrees, selectedSize));
		this.cleanupButton.enabled = !this.isSchedulingCleanup && selected.length > 0;
	}

	private getSelected(): ISessionWorktreeCleanupCandidate[] {
		return this.getVisibleWorktrees()
			.filter(worktree => this.isManuallySelectable(worktree) && this.selectedSessionIds.has(getWorktreeCleanupId(worktree)))
			.map(worktree => worktree.session
				? { session: worktree.session, sizeBytes: worktree.sizeBytes, worktreeCount: worktree.worktreeCount }
				: { unlinkedWorktree: worktree.unlinkedWorktree, sizeBytes: worktree.sizeBytes, worktreeCount: worktree.worktreeCount });
	}

	private isManuallySelectable(worktree: ISessionWorktree): boolean {
		return !worktree.isMeasuring && !this.hasRemovalIssue(worktree) && this.canScheduleCleanup(worktree);
	}

	private getSelectedForForceCleanup(): ISessionWorktree[] {
		return this.getVisibleWorktrees().filter(worktree => this.canForceCleanup(worktree) && this.selectedForceSessionIds.has(getWorktreeCleanupId(worktree)));
	}

	private canScheduleCleanup(worktree: ISessionWorktree): boolean {
		const batch = this.cleanupBatch.get(getWorktreeCleanupId(worktree));
		return worktree.worktreeExists !== false && !this.requiresSessionRearchive(worktree) && batch?.state !== 'queued' && batch?.state !== 'pending' && batch?.state !== 'removed'
			&& (worktree.unlinkedWorktree
				? !!worktree.unlinkedWorktree.branch && !worktree.cleanupStatusError && !worktree.worktreeCheckError && worktree.cleanupStatus?.state !== 'inUse' && !this.hasPendingCleanup(worktree)
				: worktree.cleanupState === 'archived'
					? !!worktree.cleanupStatus && !this.hasPendingCleanup(worktree)
					: !worktree.session.isArchived.get() && worktree.sizeBytes !== undefined && (worktree.cleanupState === 'eligible' || worktree.cleanupState === 'active' || worktree.cleanupState === 'needsInput'));
	}

	private isWorktreeInProgress(worktree: ISessionWorktree): boolean {
		const batch = this.cleanupBatch.get(getWorktreeCleanupId(worktree));
		return worktree.isMeasuring === true || this.hasPendingCleanup(worktree) || batch?.state === 'queued' || batch?.state === 'pending' || batch?.state === 'removed';
	}

	private hasRemovalIssue(worktree: ISessionWorktree): boolean {
		const batch = this.cleanupBatch.get(getWorktreeCleanupId(worktree));
		return worktree.cleanupStatus?.state === 'failed' || worktree.cleanupStatus?.state === 'skipped' || worktree.cleanupStatus?.state === 'inUse'
			|| !!worktree.worktreeCheckError || !!worktree.cleanupStatusError || worktree.measurementFailed === true
			|| batch?.state === 'failed' || batch?.state === 'attention';
	}

	private canForceCleanup(worktree: ISessionWorktree): boolean {
		return !this.isWorktreeInProgress(worktree) && this.hasRemovalIssue(worktree) && this.cleanupService.canForceCleanup?.(this.withSchedulingFailure(worktree)) === true;
	}

	private withSchedulingFailure(worktree: ISessionWorktree): ISessionWorktree {
		const message = this.cleanupBatch.get(getWorktreeCleanupId(worktree))?.schedulingError;
		return message ? { ...worktree, cleanupStatus: { state: 'failed', message } } : worktree;
	}

	private updateCleanupBatch(): void {
		if (this.isSchedulingCleanup) {
			return;
		}
		const worktrees = new Map(this.worktrees.map(worktree => [getWorktreeCleanupId(worktree), worktree]));
		for (let [sessionId, entry] of this.cleanupBatch) {
			const worktree = worktrees.get(sessionId);
			if (worktree && worktree.isListedByHost !== entry.candidate.isListedByHost) {
				entry = { ...entry, candidate: { ...entry.candidate, isListedByHost: worktree.isListedByHost } };
				this.cleanupBatch.set(sessionId, entry);
			}
			if (worktree?.isListedByHost === false && worktree.worktreeExists !== false) {
				entry.state = 'attention';
				continue;
			}
			if (entry.schedulingError) {
				continue;
			}
			if (!worktree) {
				if (entry.state !== 'removed') {
					entry.state = 'attention';
				}
			} else if (!worktree.isMeasuring) {
				entry.state = worktree.worktreeExists === false ? 'removed'
					: worktree.cleanupStatus?.state === 'failed' ? 'failed'
						: this.hasPendingCleanup(worktree) ? 'pending'
							: 'attention';
			}
		}
	}

	private getRetryCandidates(): ISessionWorktree[] {
		const failed = this.getVisibleWorktrees().filter(worktree => this.cleanupBatch.get(getWorktreeCleanupId(worktree))?.state === 'failed');
		const force = failed.filter(worktree => this.canForceCleanup(worktree));
		return force.length > 0 ? force : failed.filter(worktree => this.canScheduleCleanup(worktree));
	}

	private renderBatchSummary(): void {
		if (!this.batchSummaryRow || !this.batchSummary || !this.retryButton) {
			return;
		}
		this.batchSummaryRow.classList.toggle('hidden', this.cleanupBatch.size === 0);
		let total = 0;
		let done = 0;
		let pending = 0;
		let failed = 0;
		let attention = 0;
		for (const entry of this.cleanupBatch.values()) {
			const count = entry.candidate.worktreeCount;
			total += count;
			switch (entry.state) {
				case 'removed': done += count; break;
				case 'queued':
				case 'pending': pending += count; break;
				case 'failed': failed += count; break;
				case 'attention': attention += count; break;
			}
		}
		const message = pending > 0
			? localize('sessionWorktreeCleanup.batchProgress', "Cleanup: {0} of {1} worktrees removed, {2} pending, {3} failed, {4} need attention.", done, total, pending, failed, attention)
			: done === total
				? done === 1
					? localize('sessionWorktreeCleanup.batchCompleteOne', "Cleanup complete: 1 worktree removed.")
					: localize('sessionWorktreeCleanup.batchComplete', "Cleanup complete: {0} worktrees removed.", done)
				: localize('sessionWorktreeCleanup.batchResults', "Cleanup results: {0} of {1} worktrees removed, {2} failed, {3} need attention.", done, total, failed, attention);
		if (this.batchSummary.textContent !== message) {
			this.batchSummary.textContent = message;
		}
		this.hasCleanupFailures ||= failed > 0;
		dom.setVisibility(this.hasCleanupFailures, this.retryButton.element);
		const retryCandidates = this.getRetryCandidates();
		this.retryButton.label = retryCandidates.some(worktree => this.canForceCleanup(worktree))
			? localize('sessionWorktreeCleanup.forceRetryFailed', "Force Remove Failed Worktrees")
			: localize('sessionWorktreeCleanup.retryFailed', "Retry Failed Worktrees");
		this.retryButton.enabled = !this.isSchedulingCleanup && retryCandidates.length > 0;
	}

	private async cleanupSelected(selected = this.getSelected(), forceWorktrees?: readonly ISessionWorktree[]): Promise<void> {
		if (this.isSchedulingCleanup || selected.length === 0) {
			return;
		}
		this.isSchedulingCleanup = true;
		this.updateCleanupButton();
		this.renderBatchSummary();
		const generation = this.cleanupGeneration;
		let started = false;
		const start = () => {
			const focusForcedResult = forceWorktrees && dom.getActiveElement() === this.forceCleanupButton?.element;
			started = true;
			this.pendingCleanupDelay = 2_000;
			this.pinnedDisplayOrder = new Map(this.displayedSessionIds.map((sessionId, index) => [sessionId, index]));
			for (const candidate of selected) {
				this.selectedSessionIds.delete(getWorktreeCleanupId(candidate));
				this.selectedForceSessionIds.delete(getWorktreeCleanupId(candidate));
				this.cleanupBatch.set(getWorktreeCleanupId(candidate), { candidate, state: 'queued' });
			}
			this.renderRows();
			if (focusForcedResult) {
				this.renderedCells.get(getWorktreeCleanupId(selected[0]))?.get('title')?.focusTarget?.focus();
			}
		};
		try {
			const onProgress = (progress: SessionWorktreeCleanupProgress) => {
				if (generation !== this.cleanupGeneration || this._store.isDisposed) {
					return;
				}
				if (progress.state === 'started') {
					start();
				} else {
					const entry = this.cleanupBatch.get(getWorktreeCleanupId(progress.candidate))!;
					entry.state = progress.state === 'failed' ? 'failed' : 'pending';
					if (progress.state === 'failed') {
						entry.schedulingError = progress.message;
					}
					if (!this.cleanupRenderScheduler.isScheduled()) {
						this.cleanupRenderScheduler.schedule();
					}
				}
			};
			if (forceWorktrees) {
				await this.cleanupService.forceCleanupWorktrees(forceWorktrees.map(worktree => this.withSchedulingFailure(worktree)), onProgress);
			} else {
				await this.cleanupService.cleanupWorktrees(selected, onProgress);
			}
		} catch (error) {
			if (generation === this.cleanupGeneration) {
				for (const entry of this.cleanupBatch.values()) {
					if (entry.state === 'queued') {
						entry.state = 'failed';
						entry.schedulingError = getErrorMessage(error);
					}
				}
			}
			this.notificationService.error(error);
		} finally {
			if (generation === this.cleanupGeneration && !this._store.isDisposed) {
				this.cleanupRenderScheduler.cancel();
				for (const candidate of selected) {
					if (this.cleanupBatch.get(getWorktreeCleanupId(candidate))?.state === 'pending') {
						this.cleaningSessionIds.set(getWorktreeCleanupId(candidate), Date.now());
					}
				}
				this.renderRows();
				this.isSchedulingCleanup = false;
				if (started) {
					await this.load(false, true);
				}
				if (generation === this.cleanupGeneration && !this._store.isDisposed) {
					this.renderRows();
				}
			}
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
