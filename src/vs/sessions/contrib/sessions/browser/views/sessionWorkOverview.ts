/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionWorkOverview.css';
import { $, addDisposableListener, AnimationFrameScheduler, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button, ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader, observableSignal, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ICustomViewViewport } from '../../../../services/customView/browser/customView.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionWorkTrackingService } from '../../../../services/sessions/browser/sessionWorkTrackingService.js';
import { ISessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { getSessionWorkViewLabel, matchesSessionWorkQuery, PromotableSessionWorkView, SessionWorkView } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { readSessionWorkSummary } from '../../../../services/sessions/common/sessionWorkSummary.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionCardBoardState, SessionCardBoard } from './sessionCardBoard.js';
import { ISessionWorkCardData } from './sessionWorkCard.js';
import { SessionWorkDragAndDrop } from './sessionWorkDragAndDrop.js';

interface IWorkSection {
	readonly id: string;
	readonly label: string;
	readonly entries: readonly ISessionWorkCardData[];
	readonly canonical: readonly ISessionWorkCardData[];
	readonly children: readonly IWorkSection[];
	readonly view?: PromotableSessionWorkView;
	readonly collection?: string;
	readonly defaultCollapsed?: boolean;
	readonly collapsedInSearch?: boolean;
	readonly hideHeader?: boolean;
}

interface ISectionView {
	spec: IWorkSection;
	parent: ISectionView | undefined;
	collapsed: boolean;
	visible: boolean;
	readonly element: HTMLElement;
	readonly header: HTMLElement;
	readonly toggle: ButtonWithIcon;
	readonly count: HTMLElement;
	readonly pin: Action;
	readonly content: HTMLElement;
	readonly children: HTMLElement;
	readonly board: MutableDisposable<SessionCardBoard>;
	readonly boardListeners: DisposableStore;
}

/** Native section headers and wrapping card boards sharing the custom-view host's viewport. */
export class SessionWorkOverview extends Disposable {
	readonly element = $('.session-work-overview');
	private readonly sectionContainer = $('.session-work-sections');
	private readonly description = $('.session-work-overview-description');
	private readonly batch = $('.session-work-batch');
	private readonly selectionLabel = $('.session-work-selection-label');
	private readonly empty = $('.session-work-empty');
	private readonly search: InputBox;
	private readonly ageSelect: SelectBox;
	private readonly archiveButton: Button;
	private readonly keepButton: Button;
	private readonly sectionStores = this._register(new DisposableMap<string, DisposableStore>());
	private readonly sections = new Map<string, ISectionView>();
	private readonly pendingRequestsChanged = observableSignal(this);
	private readonly refresh = observableSignal(this);
	private readonly viewportScheduler = this._register(new AnimationFrameScheduler(this.element, () => this.updateViewports()));
	private readonly collectionDrop: SessionWorkDragAndDrop<string>;
	private readonly searchCollapse = new Map<string, boolean>();
	private viewport: ICustomViewViewport | undefined;
	private lastFilter = '';
	private lastView = '';
	private focusedSection: string | undefined;
	private entries: readonly ISessionWorkCardData[] = [];
	private canonical: readonly ISessionWorkCardData[] = [];
	private selected = new Set<string>();
	private archiving = false;
	private width = 0;

	get sessions(): readonly ISession[] { return this.entries.map(entry => entry.session); }

	constructor(
		@IInstantiationService private readonly instantiation: IInstantiationService,
		@ISessionsBoardService private readonly boardService: ISessionsBoardService,
		@ISessionsManagementService private readonly management: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@ISessionsListModelService private readonly listModel: ISessionsListModelService,
		@ISessionWorkTrackingService private readonly tracking: ISessionWorkTrackingService,
		@ISessionInputDraftService private readonly drafts: ISessionInputDraftService,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IChatEntitlementService private readonly entitlement: IChatEntitlementService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
		const controls = $('.session-work-controls');
		const searchContainer = $('.session-work-search');
		const ageContainer = $('.session-work-age-filter');
		const toolbarContainer = $('.session-work-controls-actions');
		controls.append(searchContainer, ageContainer, toolbarContainer);
		this.search = this._register(new InputBox(searchContainer, contextViewService, {
			inputBoxStyles: defaultInputBoxStyles,
			placeholder: localize('sessionsWork.search', "Find work by title or workspace"),
			ariaLabel: localize('sessionsWork.searchAria', "Filter work by title or workspace. This search does not perform actions."),
		}));
		let ages = [14, 30, 60, 90];
		this.ageSelect = this._register(new SelectBox(ages.map(age => ({ text: localize('sessionsWork.inactivity', "Last opened here {0}+ days ago", age) })), 1, contextViewService, defaultSelectBoxStyles, {
			ariaLabel: localize('sessionsWork.inactivityLabel', "Minimum time since this session was opened here"),
		}));
		this.ageSelect.render(ageContainer);
		const toolbar = this._register(instantiation.createInstance(WorkbenchToolBar, toolbarContainer, {}));
		const command = (id: string) => async () => {
			try { await this.commandService.executeCommand(id); } catch (error) { this.notificationService.error(error); }
		};
		toolbar.setActions([
			this._register(new Action('sessions.work.newSession', localize('sessionsWork.newSession', "New Work"), ThemeIcon.asClassName(Codicon.add), true, command('sessions.work.newSession'))),
		], [
			this._register(new Action('sessions.board.viewOptions', localize('sessionsWork.viewOptions', "View Options"), ThemeIcon.asClassName(Codicon.settingsGear), true, command('sessions.board.viewOptions'))),
			this._register(new Action('sessions.work.createCollection', localize('sessionsWork.createCollection', "Create Collection"), ThemeIcon.asClassName(Codicon.newFolder), true, command('sessions.work.createCollection'))),
			this._register(new Action('sessions.board.saveView', localize('sessionsWork.saveView', "Save View"), ThemeIcon.asClassName(Codicon.bookmark), true, command('sessions.board.saveView'))),
			this._register(new Action('sessions.work.archive', getSessionWorkViewLabel('archive'), ThemeIcon.asClassName(Codicon.archive), true, () => this.boardService.updateOptions({ view: 'archive', collection: undefined, filter: '' }))),
			this._register(new Action('sessions.work.archived', getSessionWorkViewLabel('archived'), ThemeIcon.asClassName(Codicon.history), true, () => this.boardService.updateOptions({ view: 'archived', collection: undefined, filter: '' }))),
			this._register(new Action('sessions.work.resetLayout', localize('sessionsWork.resetLayout', "Reset View Layout"), ThemeIcon.asClassName(Codicon.discard), true, () => this.resetLayout())),
		]);
		this.collectionDrop = this._register(instantiation.createInstance(SessionWorkDragAndDrop<string>, () => undefined, collection => collection));
		this.archiveButton = this._register(new Button(this.batch, defaultButtonStyles));
		this.archiveButton.label = localize('sessionsWork.archiveSelected', "Archive Selected");
		this.keepButton = this._register(new Button(this.batch, { ...defaultButtonStyles, secondary: true }));
		this.keepButton.label = localize('sessionsWork.keepSelected', "Keep Selected");
		this.batch.prepend(this.selectionLabel);
		this.element.append(controls, this.description, this.sectionContainer, this.empty, this.batch);
		this._register(this.search.onDidChange(filter => this.boardService.updateOptions({ filter })));
		this._register(this.ageSelect.onDidSelect(event => this.boardService.updateOptions({ inactivityDays: ages[event.index] })));
		this._register(this.archiveButton.onDidClick(() => void this.archiveSelection().catch(error => this.notificationService.error(error))));
		this._register(this.keepButton.onDidClick(() => {
			for (const entry of this.entries) {
				if (this.selected.has(entry.session.sessionId)) { this.tracking.keep(entry.session.resource, true); }
			}
			this.selected.clear();
			this.updateSelection();
			status(localize('sessionsWork.kept', "Archive suggestions dismissed. The sessions remain in All sessions."));
		}));
		this._register(addDisposableListener(this.search.inputElement, EventType.KEY_DOWN, event => {
			if (event.key === 'ArrowDown') { event.preventDefault(); this.focus(); }
		}));
		const catalog = observableSignalFromEvent(this, this.management.onDidChangeSessions);
		const groups = observableSignalFromEvent(this, this.groupsService.onDidChange);
		const ordering = observableSignalFromEvent(this, this.listModel.onDidChange);
		this._register(autorun(reader => {
			const review = this.sessionsService.sessionReview.read(reader);
			if (review) {
				for (const section of this.sections.values()) { section.board.value?.setSuspended(true); }
				return;
			}
			const options = this.boardService.options.read(reader);
			catalog.read(reader);
			groups.read(reader);
			ordering.read(reader);
			this.refresh.read(reader);
			this.boardService.cardLayouts.read(reader);
			this.boardService.collapsedSections.read(reader);
			this.boardService.promotedViews.read(reader);
			const viewIdentity = `${options.view ?? 'overview'}:${options.collection ?? ''}:${options.filter}:${options.status ?? ''}:${options.sort}`;
			if (options.filter !== this.lastFilter) { this.searchCollapse.clear(); this.lastFilter = options.filter; }
			const sameView = viewIdentity === this.lastView;
			this.lastView = viewIdentity;
			const active = this.sessionsService.activeSession.read(reader);
			if (options.view === 'archive') {
				this.pendingRequestsChanged.read(reader);
				for (const model of this.chatService.chatModels.read(reader)) {
					reader.store.add(model.onDidChangePendingRequests(() => this.pendingRequestsChanged.trigger(undefined)));
				}
			}
			const entries = this.management.getSessions().map(session => {
				const pinned = this.listModel.isSessionPinned(session);
				const summary = readSessionWorkSummary(session, this.tracking.getState(session.resource).read(reader), {
					now: Date.now(), inactivityDays: options.inactivityDays ?? 30, pinned,
					active: isEqual(active?.resource, session.resource),
					pendingRequestCount: options.view === 'archive' ? this.readPendingRequestCount(session, reader) : undefined,
				}, reader);
				const inputChat = summary.attention === 'input' ? session.chats.read(reader).find(chat => chat.status.read(reader) === SessionStatus.NeedsInput && chat.interactivity.read(reader) !== ChatInteractivity.Hidden) : undefined;
				const description = options.view === 'archive' ? summary.archiveReason
					: summary.attention === 'connection' ? localize('sessionsWork.disconnected', "Connection unavailable; last known execution state may be stale.")
						: summary.attention === 'input' ? inputChat?.description.read(reader)?.value ?? localize('sessionsWork.inputNeeded', "{0} needs your input.", inputChat?.title.read(reader) ?? session.title.read(reader))
							: summary.attention === 'error' ? localize('sessionsWork.error', "Work reported an error. Open the conversation to inspect it.")
								: summary.running ? localize('sessionsWork.working', "Work is in progress.")
									: summary.hasUnreviewedResults ? summary.hasReviewCheckpoint
										? localize('sessionsWork.results', "New recorded results since you last marked this work reviewed.")
										: localize('sessionsWork.reviewUnknown', "Recorded results are available; review status has not been recorded here.")
										: localize('sessionsWork.idle', "No active request reported.");
				session.title.read(reader);
				session.workspace.read(reader);
				if (options.sort === 'updated') { session.updatedAt.read(reader); }
				return { session, summary, pinned, collection: this.groupsService.getGroupOfSession(session.sessionId), description, archive: options.view === 'archive' };
			}).sort((a, b) => this.listModel.getSortKey(b.session, options.sort) - this.listModel.getSortKey(a.session, options.sort) || a.session.sessionId.localeCompare(b.session.sessionId));
			this.canonical = entries.filter(entry => matchesSessionWorkQuery(entry, { view: options.view === 'archived' ? 'archived' : 'all', collection: options.collection, filter: '' }, reader));
			const filtered = entries.filter(entry => matchesSessionWorkQuery(entry, options, reader));
			const interacting = [...this.sections.values()].some(section => section.board.value?.isInteracting);
			const canonicalIds = new Set(this.canonical.map(entry => entry.session.sessionId));
			if (sameView && interacting && this.entries.every(entry => canonicalIds.has(entry.session.sessionId))) {
				const latest = new Map(entries.map(entry => [entry.session.sessionId, entry]));
				this.entries = this.entries.map(entry => latest.get(entry.session.sessionId) ?? entry);
				for (const section of this.sections.values()) {
					section.spec = { ...section.spec, entries: section.spec.entries.map(entry => latest.get(entry.session.sessionId) ?? entry) };
					section.board.value?.setItems(section.spec.entries);
					section.board.value?.setLayoutState(this.stateFor(section.spec));
					section.board.value?.setSuspended(false);
				}
				return;
			}
			this.entries = filtered;
			this.selected = new Set([...this.selected].filter(id => filtered.some(entry => entry.session.sessionId === id)));
			if (this.search.value !== options.filter) { this.search.value = options.filter; }
			const age = options.inactivityDays ?? 30;
			if (!ages.includes(age)) {
				ages = [...ages, age].sort((a, b) => a - b);
				this.ageSelect.setOptions(ages.map(value => ({ text: localize('sessionsWork.inactivity', "Last opened here {0}+ days ago", value) })), ages.indexOf(age));
			} else { this.ageSelect.select(ages.indexOf(age)); }
			ageContainer.hidden = options.view !== 'archive';
			this.description.hidden = options.view !== 'archive';
			this.description.textContent = localize('sessionsWork.archiveDescription', "Suggestions use recorded activity here and known results, not age alone. Select cards using their checkboxes. Unknown or unreviewed work requires inspection.");
			const desired = this.createSections(options.view ?? 'overview', options.collection);
			const ids = new Set<string>();
			this.reconcile(desired, this.sectionContainer, undefined, true, ids);
			for (const id of this.sectionStores.keys()) { if (!ids.has(id)) { this.sectionStores.deleteAndDispose(id); } }
			this.empty.hidden = filtered.length > 0 || !!options.collection;
			this.empty.textContent = localize('sessionsWork.empty', "No matching work. Choose All sessions or adjust the filters.");
			this.updateSelection();
			this.layout(this.width, 0);
			for (const section of this.sections.values()) { section.board.value?.setSuspended(false); }
		}));
	}

	private createSections(view: SessionWorkView, collection: string | undefined): IWorkSection[] {
		const make = (id: string, label: string, predicate: (entry: ISessionWorkCardData) => boolean, options: Partial<IWorkSection> = {}): IWorkSection => ({
			id, label, entries: this.entries.filter(predicate), canonical: this.canonical.filter(predicate), children: [], ...options,
		});
		if (view === 'archive') {
			return [
				make('archive:suggested', localize('sessionsWork.archiveSuggested', "Suggested for archiving"), entry => entry.summary.archiveKind === 'suggested'),
				make('archive:inspect', localize('sessionsWork.archiveInspect', "Needs inspection"), entry => entry.summary.archiveKind === 'inspect'),
			];
		}
		if (collection) {
			return [make(`collection:${collection}`, this.groupsService.getGroup(collection)?.name ?? getSessionWorkViewLabel(view), () => true, { collection, hideHeader: true })];
		}
		const needs = make('status:needsInput', getSessionWorkViewLabel('needsInput'), entry => entry.summary.attention === 'input' || entry.summary.attention === 'error', {
			view: 'needsInput', hideHeader: view === 'needsInput',
			children: [make('status:unavailable', localize('sessionsWork.unavailableConnections', "Unavailable connections"), entry => entry.summary.attention === 'connection', { defaultCollapsed: true })],
		});
		const unreviewed = (entry: ISessionWorkCardData) => !entry.summary.attention && !entry.summary.running && entry.summary.hasUnreviewedResults;
		const review = make('status:review', getSessionWorkViewLabel('review'), unreviewed, {
			view: 'review', hideHeader: view === 'review',
		});
		if (view === 'needsInput') { return [needs]; }
		if (view === 'review') { return [review]; }
		if (view === 'overview') {
			return [
				needs,
				review,
				make('status:inProgress', getSessionWorkViewLabel('inProgress'), entry => entry.summary.running && !entry.summary.attention, { view: 'inProgress' }),
				make('status:all', getSessionWorkViewLabel('all'), () => true, {
					view: 'all', defaultCollapsed: true,
					collapsedInSearch: this.entries.every(entry => !!entry.summary.attention || entry.summary.running || entry.summary.hasUnreviewedResults),
				}),
			];
		}
		return [make(`status:${view}`, getSessionWorkViewLabel(view), () => true, {
			hideHeader: true, view: view === 'all' || view === 'inProgress' ? view : undefined,
		})];
	}

	private layoutKey(spec: IWorkSection): string { return `${spec.id}:${this.boardService.options.get().sort}`; }
	private sectionCount(spec: IWorkSection): number { return spec.entries.length + spec.children.reduce((count, child) => count + this.sectionCount(child), 0); }

	private reconcile(specs: readonly IWorkSection[], parentElement: HTMLElement, parent: ISectionView | undefined, parentVisible: boolean, ids: Set<string>): void {
		let index = 0;
		for (const spec of specs) {
			if (parent && !this.sectionCount(spec)) { continue; }
			ids.add(spec.id);
			let record = this.sections.get(spec.id);
			if (!record) { record = this.createSection(spec); }
			record.spec = spec;
			record.parent = parent;
			record.collapsed = spec.hideHeader ? false : this.lastFilter.trim()
				? this.searchCollapse.get(spec.id) ?? spec.collapsedInSearch ?? false
				: this.boardService.collapsedSections.get().get(spec.id) ?? spec.defaultCollapsed ?? false;
			record.visible = parentVisible && !record.collapsed;
			if (parentElement.children[index] !== record.element) { parentElement.insertBefore(record.element, parentElement.children[index] ?? null); }
			index++;
			record.header.hidden = !!spec.hideHeader;
			record.element.classList.toggle('nested', !!parent);
			record.toggle.label = spec.label;
			record.toggle.icon = record.collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			record.toggle.element.setAttribute('aria-expanded', String(!record.collapsed));
			const count = this.sectionCount(spec);
			record.toggle.element.setAttribute('aria-label', count === 1
				? localize('sessionsWork.sectionAriaOne', "{0}, 1 session", spec.label)
				: localize('sessionsWork.sectionAria', "{0}, {1} sessions", spec.label, count));
			record.count.textContent = String(count);
			const promoted = !!spec.view && this.boardService.promotedViews.get().includes(spec.view);
			record.pin.label = promoted ? localize('sessionsWork.unpinSection', "Unpin from Sidebar") : localize('sessionsWork.pinSection', "Pin as Automatic Collection");
			record.pin.class = ThemeIcon.asClassName(promoted ? Codicon.pinned : Codicon.pin);
			record.content.hidden = !record.visible;
			record.children.hidden = !record.visible;
			if (record.visible && (spec.entries.length || spec.collection)) {
				if (!record.board.value) {
					const section = record;
					record.board.value = this.instantiation.createInstance(SessionCardBoard, spec.entries, {
						initialState: this.stateFor(spec),
						getViewport: () => this.viewportFor(section),
						scrollBy: delta => this.viewport?.scrollBy(delta),
						selectable: this.boardService.options.get().view === 'archive',
						getActions: (entry, layoutActions) => this.cardActions(entry, layoutActions),
						onOpen: entry => { void this.open(entry.session.sessionId).catch(error => this.notificationService.error(error)); },
						externalDrop: spec.collection ? {
							canDrop: event => this.collectionDrop.canDropIntoCollection(section.spec.collection!, event),
							drop: event => {
								const moved = this.collectionDrop.dropIntoCollection(section.spec.collection!, event);
								if (moved?.length) { this.boardService.updateOptions({ filter: '' }); this.focusSession(moved[0].sessionId); }
							},
						} : undefined,
					});
					record.content.appendChild(record.board.value.element);
					record.boardListeners.add(record.board.value.onDidChangeHeight(() => this.viewportScheduler.schedule()));
					record.boardListeners.add(record.board.value.onDidFocusSession(() => { this.focusedSection = section.spec.id; }));
					record.boardListeners.add(record.board.value.onDidChangeFocus(focused => { if (!focused) { this.refresh.trigger(undefined); } }));
					record.boardListeners.add(record.board.value.onDidChangeLayout(state => this.boardService.setCardLayout(
						this.layoutKey(section.spec), state, section.spec.canonical.map(entry => entry.session.sessionId),
					)));
					record.boardListeners.add(record.board.value.onDidChangeSelection(selection => {
						for (const entry of section.spec.entries) { this.selected.delete(entry.session.sessionId); }
						for (const id of selection) { this.selected.add(id); }
						this.updateSelection();
					}));
				}
				record.board.value.setItems(spec.entries);
				record.board.value.setLayoutState(this.stateFor(spec));
				record.board.value.layout(Math.max(0, record.content.clientWidth), 0);
			} else {
				record.boardListeners.clear();
				record.board.clear();
			}
			this.reconcile(spec.children, record.children, record, record.visible, ids);
		}
	}

	private stateFor(spec: IWorkSection): ISessionCardBoardState {
		return this.boardService.getCardLayout(this.layoutKey(spec)) ?? { order: spec.canonical.map(entry => entry.session.sessionId), sizes: [] };
	}

	private createSection(spec: IWorkSection): ISectionView {
		const store = new DisposableStore();
		this.sectionStores.set(spec.id, store);
		const element = $('.session-work-section');
		const header = $('.session-work-section-header');
		const toggle = store.add(new ButtonWithIcon(header, {
			...defaultButtonStyles, secondary: true, buttonSecondaryBackground: 'transparent', buttonSecondaryBorder: 'transparent',
			buttonSecondaryForeground: asCssVariable('foreground'),
		}));
		toggle.element.classList.add('session-work-section-toggle');
		toggle.iconElement.setAttribute('aria-hidden', 'true');
		const count = $('.session-work-section-count', { 'aria-hidden': 'true' });
		const actionsContainer = $('.session-work-section-actions');
		header.append(count, actionsContainer);
		const content = $('.session-work-section-cards');
		const children = $('.session-work-section-children');
		content.id = generateUuid();
		toggle.element.setAttribute('aria-controls', content.id);
		element.append(header, content, children);
		const board = store.add(new MutableDisposable<SessionCardBoard>());
		const boardListeners = store.add(new DisposableStore());
		const pin = store.add(new Action('sessions.work.promoteSection', '', '', true, () => {
			const view = record.spec.view;
			if (view) {
				const promoted = this.boardService.promotedViews.get().includes(view);
				this.boardService.setViewPromoted(view, !promoted);
				status(promoted ? localize('sessionsWork.unpinned', "Removed the sidebar shortcut. The section remains in My work.")
					: localize('sessionsWork.pinned', "Added an automatic collection to the sidebar. Its sessions stay up to date."));
			}
		}));
		const toolbar = store.add(this.instantiation.createInstance(WorkbenchToolBar, actionsContainer, {}));
		toolbar.setActions(spec.view ? [pin] : []);
		const record: ISectionView = { spec, parent: undefined, visible: false, collapsed: false, element, header, toggle, count, pin, content, children, board, boardListeners };
		this.sections.set(spec.id, record);
		store.add(toggle.onDidClick(() => this.setCollapsed(record, !record.collapsed)));
		store.add(addDisposableListener(header, EventType.CONTEXT_MENU, event => {
			event.preventDefault();
			const actions = [
				...(record.spec.view ? [pin] : []),
				new Action('sessions.work.resetSectionLayout', localize('sessionsWork.resetSectionLayout', "Reset Section Layout"), undefined, true, () => this.boardService.resetCardLayout(this.layoutKey(record.spec))),
			];
			this.contextMenuService.showContextMenu({
				getAnchor: () => new StandardMouseEvent(getWindow(element), event), getActions: () => actions,
				onHide: () => { for (const action of actions) { if (action !== pin) { action.dispose(); } } },
			});
		}));
		store.add(this.hoverService.setupDelayedHover(toggle.element, () => ({ content: record.spec.label })));
		store.add(toDisposable(() => { element.remove(); this.sections.delete(spec.id); }));
		return record;
	}

	private setCollapsed(record: ISectionView, collapsed: boolean): void {
		if (this.lastFilter.trim()) { this.searchCollapse.set(record.spec.id, collapsed); this.refresh.trigger(undefined); }
		else { this.boardService.setSectionCollapsed(record.spec.id, collapsed); }
	}

	private viewportFor(section: ISectionView): { top: number; height: number } {
		if (!this.viewport || !section.visible || !section.content.isConnected) { return { top: 0, height: 0 }; }
		const offset = section.content.getBoundingClientRect().top - this.element.getBoundingClientRect().top;
		return { top: this.viewport.top - offset, height: this.viewport.height };
	}

	setViewport(viewport: ICustomViewViewport): void { this.viewport = viewport; this.updateViewports(); }
	private updateViewports(): void {
		for (const section of this.sections.values()) {
			const range = this.viewportFor(section);
			section.board.value?.setViewport(range.top, range.height);
		}
	}
	layout(width: number, _height: number): void {
		this.width = width;
		for (const section of this.sections.values()) { section.board.value?.layout(Math.max(0, section.content.clientWidth), 0); }
		this.updateViewports();
	}
	focus(): void {
		const first = [...this.sections.values()].find(section => !section.spec.hideHeader && !section.parent);
		if (first) { first.toggle.focus(); } else { this.search.focus(); }
	}
	focusSearch(): void { this.search.focus(); }
	focusSession(id: string | undefined): void {
		const records = [...this.sections.values()];
		const section = records.find(section => section.spec.id === this.focusedSection && section.spec.entries.some(entry => id === undefined || entry.session.sessionId === id))
			?? records.find(section => section.visible && section.spec.entries.some(entry => id === undefined || entry.session.sessionId === id))
			?? records.find(section => section.spec.entries.some(entry => id === undefined || entry.session.sessionId === id));
		if (!section) { this.focus(); return; }
		const parents: ISectionView[] = [];
		for (let current: ISectionView | undefined = section; current; current = current.parent) { parents.unshift(current); }
		for (const current of parents) { if (current.collapsed) { this.setCollapsed(current, false); } }
		this.focusedSection = section.spec.id;
		section.board.value?.focusSession(id ?? section.spec.entries[0]?.session.sessionId);
	}
	private targetBoard(id: string | undefined): SessionCardBoard | undefined {
		return [...this.sections.values()].find(section => section.board.value?.hasFocus && (id === undefined || section.spec.entries.some(entry => entry.session.sessionId === id)))?.board.value
			?? (id === undefined ? this.sections.get(this.focusedSection ?? '')?.board.value : [...this.sections.values()].find(section => section.board.value && section.spec.entries.some(entry => entry.session.sessionId === id))?.board.value);
	}
	resizeCard(id: string | undefined, width: number, height: number): void { this.targetBoard(id)?.resizeCard(id, width, height); }
	toggleMaximizeSession(id: string | undefined): boolean | undefined { return this.targetBoard(id)?.toggleMaximizeSession(id); }
	resetLayout(): void {
		for (const section of this.sections.values()) { this.boardService.resetCardLayout(this.layoutKey(section.spec)); }
	}
	getAccessibilityHelp(): string {
		return localize('sessionsWork.wrappingHelp', "My work groups native cards into Needs you, Needs review, In progress, and All sessions. Activate a section header to expand or collapse it. Pin as Automatic Collection keeps a section in the sidebar without removing it from My work. Cards wrap into columns: drag a header to reorder, drag an edge or corner to resize, press Escape to cancel, or double-click an edge to reset it. With a card header focused, Left and Right Arrow move focus, Alt+Left and Alt+Right reorder, and Alt+Shift+Arrow resize. Enter or the title opens focused review; Tab reaches the reply and actions. Card layout is saved for the view and sort mode. Search filters metadata without starting work. Visible cards waiting for input load the real request controls; decisions always require an explicit action. Only manual collections accept membership drops. In Consider archiving, use checkboxes to select cards; Space also toggles selection from a card header. Archive Selected previews effects and rechecks each session. Keep Selected dismisses suggestions.");
	}
	getAccessibleContent(): string {
		const details = [...this.sections.values()].filter(section => section.visible).map(section => section.board.value?.getAccessibleContent() ?? '').filter(Boolean);
		return [getSessionWorkViewLabel(this.boardService.options.get().view ?? 'overview'), ...details,
		...this.entries.filter(entry => ![...this.sections.values()].some(section => section.visible && section.spec.entries.includes(entry))).map(entry => localize('sessionsWork.accessibleEntry', "{0}. {1}", entry.session.title.get(), entry.description)),
		].join('\n\n');
	}

	private cardActions(data: ISessionWorkCardData, layout: readonly Action[]): readonly Action[] {
		const id = data.session.sessionId;
		const action = (suffix: string, label: string, glyph: ThemeIcon, run: (entry: ISessionWorkCardData) => void | Promise<void>, enabled = true) =>
			new Action(`sessions.work.${suffix}`, label, ThemeIcon.asClassName(glyph), enabled, async () => {
				try {
					const current = this.entries.find(entry => entry.session.sessionId === id);
					if (!current) { throw new Error(localize('sessionsWork.unavailable', "This session is no longer available in the view.")); }
					await run(current);
				} catch (error) { this.notificationService.error(error); }
			});
		const open = action('open', localize('sessionsWork.open', "Open Work"), Codicon.linkExternal, entry => this.open(entry.session.sessionId));
		const actions: Action[] = [layout[0], open, ...layout.slice(1)];
		if (data.session.isArchived.get()) {
			actions.push(action('restore', localize('sessionsWork.restore', "Restore Session"), Codicon.discard, async entry => {
				await this.management.unarchiveSession(entry.session);
				if (entry.session.isArchived.get()) { throw new Error(localize('sessionsWork.restoreFailed', "The session was not restored. Check its connection and try again.")); }
			}));
			return actions;
		}
		if (data.summary.hasUnreviewedResults) {
			actions.push(action('reviewed', localize('sessionsWork.markReviewed', "Mark Results Reviewed"), Codicon.checkAll, entry => {
				if (entry.summary.running || entry.summary.attention) { throw new Error(localize('sessionsWork.reviewStateChanged', "This session is working or needs attention. Inspect its current state before marking results reviewed.")); }
				this.tracking.markReviewed(entry.session);
				status(localize('sessionsWork.reviewRecorded', "Recorded results marked reviewed. This does not approve or complete the work."));
			}, !data.summary.running && !data.summary.attention));
		}
		actions.push(action('move', localize('sessionsWork.move', "Move to Collection"), Codicon.folder, async entry => {
			await this.commandService.executeCommand('sessions.board.moveToGroup', entry.session);
		}));
		actions.push(action('pin', data.pinned ? localize('sessionsWork.unpin', "Unpin") : localize('sessionsWork.pin', "Pin"), data.pinned ? Codicon.pinned : Codicon.pin, entry => {
			if (this.listModel.isSessionPinned(entry.session)) { this.listModel.unpinSession(entry.session); } else { this.listModel.pinSession(entry.session); }
		}));
		if (this.tracking.getState(data.session.resource).get().keepArchiveSuggestion) {
			actions.push(action('allowSuggestion', localize('sessionsWork.allowSuggestion', "Allow Archive Suggestions"), Codicon.archive, entry => this.tracking.keep(entry.session.resource, false)));
		}
		return actions;
	}

	private async open(id: string): Promise<void> {
		if (this.entitlement.sentiment.hidden) { return; }
		const entry = this.entries.find(entry => entry.session.sessionId === id);
		if (!entry) { throw new Error(localize('sessionsWork.unavailable', "This session is no longer available in the view.")); }
		const { session, summary } = entry;
		if (session.isArchived.get()) { await this.sessionsService.openSession(session.resource); return; }
		let section = SessionReviewSection.Conversation;
		if (!summary.attention && !summary.running && summary.hasUnreviewedResults) {
			if (session.changes.get().length || session.changesSummary?.get()?.files) { section = SessionReviewSection.Changes; }
			else if (session.artifacts?.get().some(artifact => artifact.isArtifact)) { section = SessionReviewSection.Artifacts; }
		}
		const chat = summary.attention === 'input' || summary.attention === 'error'
			? session.chats.get().find(chat => chat.status.get() === (summary.attention === 'input' ? SessionStatus.NeedsInput : SessionStatus.Error) && chat.interactivity.get() !== ChatInteractivity.Hidden) : undefined;
		await this.sessionsService.openSessionReview(session, section, chat ? { chatResource: chat.resource } : undefined);
	}

	private updateSelection(): void {
		for (const section of this.sections.values()) { section.board.value?.setSelection([...this.selected]); }
		this.batch.hidden = this.boardService.options.get().view !== 'archive';
		const count = this.entries.filter(entry => this.selected.has(entry.session.sessionId) && entry.summary.archiveKind === 'suggested').length;
		this.selectionLabel.textContent = localize('sessionsWork.selection', "{0} archive suggestions selected. Work needing inspection is excluded.", count);
		this.archiveButton.enabled = count > 0 && !this.archiving;
		this.keepButton.enabled = this.selected.size > 0 && !this.archiving;
	}

	private async archiveSelection(): Promise<void> {
		if (this.archiving || this.entitlement.sentiment.hidden) { return; }
		const captured = this.entries.filter(entry => this.selected.has(entry.session.sessionId) && entry.summary.archiveKind === 'suggested').map(entry => entry.session);
		const inactivityDays = this.boardService.options.get().inactivityDays ?? 30;
		if (!captured.length) { return; }
		this.archiving = true;
		this.updateSelection();
		try {
			const confirmation = await this.dialogService.confirm({
				type: 'warning',
				message: captured.length === 1 ? localize('sessionsWork.archiveConfirmOne', "Archive the selected session?") : localize('sessionsWork.archiveConfirm', "Archive {0} selected sessions?", captured.length),
				detail: localize('sessionsWork.archiveEffects', "{0}\n\nConversations remain in Archived sessions. Collection membership is removed. Providers may save changes in a commit and clean up managed worktrees. Archiving does not guarantee that cloud compute stops.", captured.map(session => session.title.get()).join('\n')),
				primaryButton: localize('sessionsWork.archiveConfirmButton', "Archive Selected"),
			});
			if (!confirmation.confirmed || this.entitlement.sentiment.hidden || this._store.isDisposed) { return; }
			const failures: string[] = [];
			let archived = 0;
			for (const original of captured) {
				const session = this.management.getSession(original.resource);
				if (!session) { failures.push(localize('sessionsWork.missingArchive', "{0}: session is no longer available.", original.title.get())); continue; }
				const summary = readSessionWorkSummary(session, this.tracking.getState(session.resource).get(), {
					now: Date.now(), inactivityDays, pinned: this.listModel.isSessionPinned(session),
					active: isEqual(this.sessionsService.activeSession.get()?.resource, session.resource), pendingRequestCount: this.readPendingRequestCount(session),
				});
				const hasDraft = session.chats.get().some(chat => {
					const draft = this.drafts.getDraft(chat.resource).get();
					return !!draft.inputText.trim() || draft.attachments.length > 0;
				});
				if (summary.archiveKind !== 'suggested' || hasDraft || this.entitlement.sentiment.hidden) {
					failures.push(localize('sessionsWork.skippedArchive', "{0}: state changed or an unsent draft needs attention.", session.title.get()));
					continue;
				}
				try {
					await this.management.archiveSession(session);
					if (!session.isArchived.get()) { throw new Error(localize('sessionsWork.notArchived', "The provider did not archive this session.")); }
					archived++;
					this.selected.delete(session.sessionId);
				} catch (error) { failures.push(localize('sessionsWork.archiveError', "{0}: {1}", session.title.get(), toErrorMessage(error))); }
			}
			const message = localize('sessionsWork.archiveResult', "Archived {0} sessions. Skipped or failed: {1}.", archived, failures.length);
			if (failures.length) { this.notificationService.warn(`${message}\n${failures.join('\n')}`); } else { this.notificationService.info(message); }
			status(message);
		} finally {
			this.archiving = false;
			if (!this._store.isDisposed) { this.updateSelection(); }
		}
	}

	private readPendingRequestCount(session: ISession, reader?: IReader): number | undefined {
		const main = session.mainChat.read(reader);
		const chats = session.chats.read(reader);
		let count = 0;
		for (const chat of chats.some(chat => isEqual(chat.resource, main.resource)) ? chats : [...chats, main]) {
			const model = this.chatService.getSession(chat.resource);
			if (!model) { return undefined; }
			count += model.getPendingRequests().length;
			if (model.hasActiveRequest.read(reader)) { count++; }
		}
		return count;
	}
}
