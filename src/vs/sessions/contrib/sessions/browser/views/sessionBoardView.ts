/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionBoardView.css';
import { $, addDisposableListener, Dimension, EventType, isAncestorOfActiveElement, trackFocus } from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ResizableHTMLElement } from '../../../../../base/browser/ui/resizable/resizable.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { equals } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { autorun, constObservable, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { getSessionConversationStatusLabel } from '../../../../browser/sessionConversationGroups.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsBoardCardExpandedContext, SessionsBoardCardFocusContext, SessionsBoardFocusContext } from '../../../../common/contextkeys.js';
import { AbstractCustomView } from '../../../../services/customView/browser/customView.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionsBoardOptions, ISessionsBoardService, ISessionsBoardView } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache, readSessionChangesStats } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { setActiveSessionContextKeys } from '../../../../services/sessions/common/sessionContextKeys.js';
import { SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { getSessionReviewPullRequests } from '../../common/sessionReviewResources.js';

interface ICardSize { readonly width: number; readonly height: number }
interface IBoardSection { readonly id: string; readonly label: string; readonly sessions: readonly IActiveSession[] }

const CARD_GAP = 16;
const CARD_MIN_WIDTH = 300;
const BOARD_PADDING = 8;
const quietButtonStyles = {
	...defaultButtonStyles,
	buttonSecondaryBackground: 'transparent',
	buttonSecondaryHoverBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryBorder: undefined,
};

function cardColumns(width: number): number {
	return Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)));
}

function cardWidth(width: number): number {
	return Math.max(0, (width - (cardColumns(width) - 1) * CARD_GAP) / cardColumns(width));
}

/** A metadata card; the existing SessionView is created only after explicit expansion. */
export class SessionBoardCard extends Disposable {
	readonly resizable = this._register(new ResizableHTMLElement());
	readonly element = this.resizable.domNode;
	private readonly _metadata = $('.session-board-card-metadata');
	private readonly _chatContainer = $('.session-board-card-chat');
	private readonly _input: InputBox;
	private readonly _send: Button;
	private readonly _title: Button;
	private readonly _draftContext: Button;
	private readonly _expandedKey: IContextKey<boolean>;
	private readonly _view = this._register(new MutableDisposable<SessionView>());
	private readonly _viewStore = this._register(new DisposableStore());
	private readonly _scopedInstantiation: IInstantiationService;
	private _expanded = false;
	private _requestedExpanded = false;
	private _expansionVersion = 0;
	private _updatingInput = false;
	private _sending = false;
	private _availableWidth = 0;
	private _savedSize: ICardSize | undefined;
	private _resizing = false;

	get view(): SessionView | undefined { return this._view.value; }
	get expanded(): boolean { return this._requestedExpanded; }

	constructor(
		readonly session: IActiveSession,
		private readonly options: IObservable<ISessionsBoardOptions>,
		onResize: (size: ICardSize) => void,
		onFocus: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextViewService contextViewService: IContextViewService,
		@ISessionInputDraftService private readonly drafts: ISessionInputDraftService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@ISessionChangesStatsCache changesCache: ISessionChangesStatsCache,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element.classList.add('session-board-card');
		this.element.setAttribute('role', 'group');
		const context = this._register(contextKeyService.createScoped(this.element));
		this._expandedKey = SessionsBoardCardExpandedContext.bindTo(context);
		this._scopedInstantiation = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, context],
			[ISessionContext, new SessionContext(constObservable(session))],
		)));
		const header = $('.session-board-card-header');
		const status = $('.session-board-card-status');
		const statusLabel = $('.session-board-card-status-label');
		const statusIcon = renderIcon(Codicon.circleSmallFilled);
		statusIcon.setAttribute('aria-hidden', 'true');
		status.append(statusIcon, statusLabel);
		const age = $('.session-board-card-age');
		const actions = $('.session-board-card-actions');
		header.append(status, age, actions);
		this.element.append(header, this._metadata, this._chatContainer);
		const headerContext = this._register(context.createScoped(header));
		SessionsBoardCardFocusContext.bindTo(headerContext).set(true);
		const headerInstantiation = this._register(this._scopedInstantiation.createChild(new ServiceCollection([IContextKeyService, headerContext])));
		const toolbar = this._register(headerInstantiation.createInstance(MenuWorkbenchToolBar, actions, Menus.SessionsBoardCard, { menuOptions: { shouldForwardArgs: true } }));
		toolbar.context = session;
		this._title = this._register(new Button(this._metadata, { ...quietButtonStyles, secondary: true }));
		this._title.element.classList.add('session-board-card-title');
		this._register(this._title.onDidClick(() => this._openReview(SessionReviewSection.Conversation)));
		const description = $('.session-board-card-description');
		const resources = $('.session-board-card-resources');
		const resourcesActions = $('.session-board-card-resource-actions');
		const diffStats = $('.session-board-card-diff-stats');
		const insertions = $('.session-board-card-insertions');
		const deletions = $('.session-board-card-deletions');
		diffStats.append(insertions, deletions);
		resources.append(resourcesActions, diffStats);
		const draftContext = $('.session-board-card-draft-context');
		const reply = $('.session-board-card-reply');
		this._metadata.append(description, resources, draftContext, reply);
		this._draftContext = this._register(new Button(draftContext, { ...quietButtonStyles, secondary: true }));
		this._register(this._draftContext.onDidClick(() => this._openReview(SessionReviewSection.Artifacts)));
		const inputContainer = $('.session-board-card-input');
		reply.appendChild(inputContainer);
		this._input = this._register(new InputBox(inputContainer, contextViewService, {
			inputBoxStyles: { ...defaultInputBoxStyles, inputBackground: 'transparent', inputBorder: 'transparent' },
			placeholder: localize('sessionBoard.reply', "Ask a follow-up..."),
			ariaLabel: localize('sessionBoard.replyLabel', "Reply to {0}", session.title.get()),
			flexibleHeight: true,
			flexibleMaxHeight: 64,
		}));
		this._send = this._register(new Button(reply, { ...quietButtonStyles, secondary: true, title: localize('sessionBoard.send', "Send"), ariaLabel: localize('sessionBoard.send', "Send") }));
		this._send.icon = Codicon.arrowUpCompact;
		this._register(this._send.onDidClick(() => { void this._submit(); }));
		this._register(addDisposableListener(this._input.inputElement, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) && !event.isComposing) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				void this._submit();
			}
		}));
		this._register(this._input.onDidChange(inputText => {
			if (!this._updatingInput) {
				const resource = session.activeChat.get().resource;
				const draft = this.drafts.getDraft(resource).get();
				this.drafts.setDraft(resource, { inputText, attachments: draft.attachments });
			}
		}));
		const focus = this._register(trackFocus(this.element));
		this._register(focus.onDidFocus(onFocus));
		this._register(this.resizable.onDidWillResize(() => { this._resizing = true; }));
		this._register(this.resizable.onDidResize(event => {
			this._savedSize = event.dimension;
			if (event.done) {
				this._resizing = false;
				this._layout();
				onResize(this.resizable.size);
			} else {
				this._view.value?.layout(Math.max(0, event.dimension.width - 2), Math.max(0, event.dimension.height - 42), 0, 0);
			}
		}));
		const resourceToolbar = this._register(this._scopedInstantiation.createInstance(WorkbenchToolBar, resourcesActions, {
			actionViewItemProvider: (action, options) => new ActionViewItem(undefined, action, { ...options, label: true, icon: false }),
		}));
		const changes = this._register(new Action('sessionBoard.changes', '', ThemeIcon.asClassName(Codicon.gitCompare), true, () => this._openReview(SessionReviewSection.Changes)));
		const artifacts = this._register(new Action('sessionBoard.artifacts', '', ThemeIcon.asClassName(Codicon.file), true, () => this._openReview(SessionReviewSection.Artifacts)));
		const pullRequest = this._register(new Action('sessionBoard.pullRequest', '', ThemeIcon.asClassName(Codicon.gitPullRequest), true, () => this._openReview(SessionReviewSection.PullRequest)));
		let resourceActions: readonly IAction[] = [];
		const hover = this._register(new MutableDisposable());
		const contextHover = this._register(new MutableDisposable());
		const descriptionHover = this._register(new MutableDisposable());
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			setActiveSessionContextKeys(session, context, reader, changesCache);
			const title = session.title.read(reader);
			this._title.label = title;
			this.element.setAttribute('aria-label', title);
			this._input.setAriaLabel(configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsBoard)
				? localize('sessionBoard.replyHelp', "Reply to {0}. Use Open Accessibility Help for session board navigation and review instructions.", title)
				: localize('sessionBoard.replyLabel', "Reply to {0}", title));
			hover.value = hoverService.setupDelayedHover(this._title.element, { content: title });
			const options = this.options.read(reader);
			const workspace = session.workspace.read(reader);
			this.element.classList.toggle('comfortable', !options.compact);
			const project = options.grouping === 'collection' ? workspace?.label : undefined;
			const branch = options.showBranch ? workspace?.folders[0]?.gitRepository?.branchName : undefined;
			description.textContent = project && branch ? localize('sessionBoard.projectBranch', "{0} · {1}", project, branch) : project ?? branch ?? '';
			description.hidden = !description.textContent;
			descriptionHover.value = hoverService.setupDelayedHover(description, { content: description.textContent });
			const sessionStatus = session.status.read(reader);
			statusLabel.textContent = getSessionConversationStatusLabel(sessionStatus);
			status.classList.toggle('needs-input', sessionStatus === SessionStatus.NeedsInput);
			status.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
			status.classList.toggle('failed', sessionStatus === SessionStatus.Error);
			age.textContent = fromNow(session.updatedAt.read(reader), true);
			const stats = readSessionChangesStats(session, reader) ?? changesCache.get(session.sessionId, reader);
			changes.label = stats?.files === 1 ? localize('sessionBoard.oneFile', "1 file") : localize('sessionBoard.changesLabel', "{0} files", stats?.files ?? 0);
			insertions.textContent = stats?.insertions ? `+${stats.insertions}` : '';
			deletions.textContent = stats?.deletions ? `-${stats.deletions}` : '';
			diffStats.hidden = !options.showChanges || !stats?.files || !stats.insertions && !stats.deletions;
			diffStats.setAttribute('aria-label', localize('sessionBoard.diffStats', "{0} lines added, {1} lines deleted", stats?.insertions ?? 0, stats?.deletions ?? 0));
			const recorded = session.artifacts?.read(reader) ?? [];
			const artifactCount = recorded.filter(artifact => artifact.isArtifact).length;
			artifacts.label = artifactCount === 1 ? localize('sessionBoard.oneArtifact', "1 artifact") : artifactCount
				? localize('sessionBoard.artifactsLabel', "{0} artifacts", artifactCount)
				: recorded.length === 1 ? localize('sessionBoard.oneReference', "1 reference") : localize('sessionBoard.referencesLabel', "{0} references", recorded.length);
			const prs = getSessionReviewPullRequests(session, reader);
			pullRequest.label = prs.length === 1 ? localize('sessionBoard.prLabel', "PR #{0}", prs[0].number) : localize('sessionBoard.prsLabel', "{0} pull requests", prs.length);
			const primary: IAction[] = [];
			if (options.showChanges && stats?.files) { primary.push(changes); }
			if (options.showArtifacts && recorded.length) { primary.push(artifacts); }
			if (options.showPullRequest && prs.length) { primary.push(pullRequest); }
			if (!equals(resourceActions, primary)) {
				resourceActions = primary;
				resourceToolbar.setActions(primary);
			}
			resources.hidden = primary.length === 0;
		}));
		this._register(autorun(reader => {
			const options = this.options.read(reader);
			reply.hidden = !options.showReply;
			const chat = session.activeChat.read(reader);
			const draft = this.drafts.getDraft(chat.resource).read(reader);
			this._draftContext.label = draft.attachments.length === 1
				? localize('sessionBoard.replyContext', "About: {0}", draft.attachments[0].name)
				: localize('sessionBoard.replyContexts', "{0} reply references", draft.attachments.length);
			this._draftContext.enabled = draft.attachments.length > 0;
			draftContext.hidden = !draft.attachments.length || !options.showReply;
			contextHover.value = hoverService.setupDelayedHover(this._draftContext.element, { content: draft.attachments.map(attachment => attachment.name).join('\n') });
			this._updatingInput = true;
			this._input.value = draft.inputText;
			this._updatingInput = false;
			const canSend = !this._sending && chat.interactivity.read(reader) === ChatInteractivity.Full && !session.isArchived.read(reader);
			this._input.setEnabled(canSend);
			this._send.enabled = canSend && !!draft.inputText.trim();
		}));
	}

	private async _openReview(section: SessionReviewSection): Promise<void> {
		try {
			await this.sessionsService.openSessionReview(this.session, section);
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private async _submit(): Promise<void> {
		if (this._sending || !this._input.value.trim()) { return; }
		this._sending = true;
		this._input.disable();
		this._send.enabled = false;
		try {
			await this.commandService.executeCommand('sessions.board.sendReply', this.session);
		} catch (error) {
			this.notificationService.error(error);
		} finally {
			this._sending = false;
			if (!this._store.isDisposed) {
				const canSend = this.session.activeChat.get().interactivity.get() === ChatInteractivity.Full && !this.session.isArchived.get();
				this._input.setEnabled(canSend);
				this._send.enabled = canSend && !!this._input.value.trim();
			}
		}
	}

	async setExpanded(expanded: boolean): Promise<void> {
		if (expanded === this._requestedExpanded) { return; }
		this._requestedExpanded = expanded;
		const version = ++this._expansionVersion;
		if (expanded && !await this.sessionsService.canOpenSession(this.session)) {
			if (version === this._expansionVersion) { this._requestedExpanded = false; }
			return;
		}
		if (this._store.isDisposed || version !== this._expansionVersion) { return; }
		this._expanded = expanded;
		this.element.classList.toggle('expanded', expanded);
		this._expandedKey.set(expanded);
		this._viewStore.clear();
		this._view.clear();
		this._chatContainer.replaceChildren();
		this._metadata.style.display = expanded ? 'none' : '';
		if (expanded) {
			const view = this._scopedInstantiation.createInstance(SessionView);
			this._view.value = view;
			this._chatContainer.appendChild(view.element);
			view.openSession(this.session, {});
			this._viewStore.add(addDisposableListener(view.element, EventType.FOCUS_IN, () => this.sessionsService.setActive(this.session), true));
		}
		this._layout();
	}

	layout(availableWidth: number, savedSize?: ICardSize): void {
		this._availableWidth = availableWidth;
		this._savedSize = savedSize;
		this._layout();
	}

	private _layout(): void {
		if (this._resizing) { return; }
		const columnWidth = cardWidth(this._availableWidth);
		const defaultExpandedWidth = Math.min(2, cardColumns(this._availableWidth)) * (columnWidth + CARD_GAP) - CARD_GAP;
		const span = this._expanded ? Math.min(cardColumns(this._availableWidth), Math.max(1, Math.round(((this._savedSize?.width ?? defaultExpandedWidth) + CARD_GAP) / (columnWidth + CARD_GAP)))) : 1;
		const width = Math.max(0, span * (columnWidth + CARD_GAP) - CARD_GAP);
		this.element.style.gridColumn = `span ${span}`;
		const height = this._expanded ? Math.max(300, this._savedSize?.height ?? 480) : 0;
		this.resizable.minSize = new Dimension(Math.min(CARD_MIN_WIDTH, this._availableWidth), this._expanded ? 300 : 0);
		this.resizable.maxSize = new Dimension(this._availableWidth, this._expanded ? Number.MAX_SAFE_INTEGER : 0);
		this.resizable.enableSashes(false, this._expanded, this._expanded, false);
		this.resizable.layout(height, width);
		if (!this._expanded) { this.element.style.height = 'auto'; }
		this._input.layout();
		this._view.value?.layout(Math.max(0, width - 2), Math.max(0, height - 42), 0, 0);
	}

	focus(): void {
		if (this._view.value) { this._view.value.focus(); } else if (this.options.get().showReply) { this._input.focus(); } else { this._title.focus(); }
	}
}

/** Contributes the board through the workbench's full-surface custom-view API. */
export class SessionBoardView extends AbstractCustomView implements ISessionsBoardView {
	readonly title = constObservable(localize('sessionsBoard.title', "Session board"));
	override readonly maxWidth = Number.POSITIVE_INFINITY;
	private readonly _cards = this._register(new DisposableMap<string, SessionBoardCard>());
	private readonly _sectionLabels = this._register(new DisposableMap<string, IconLabel>());
	private readonly _sectionsById = new Map<string, { readonly element: HTMLElement; readonly label: IconLabel; readonly count: HTMLElement; readonly cards: HTMLElement }>();
	private readonly _sizes = new ResourceMap<ICardSize>();
	private _element: HTMLElement | undefined;
	private _content: HTMLElement | undefined;
	private _empty: HTMLElement | undefined;
	private _search: InputBox | undefined;
	private _scopedInstantiation: IInstantiationService | undefined;
	private _sessions: readonly IActiveSession[] = [];
	private _focusedSession: string | undefined;
	private _width = 0;
	get sessions(): readonly IActiveSession[] { return this._sessions; }

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsBoardService private readonly boardService: ISessionsBoardService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@ISessionsListModelService private readonly listModelService: ISessionsListModelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		const raw = this.storageService.get('sessions.board.cardSizes', StorageScope.WORKSPACE);
		if (raw) {
			try {
				const sizes: { resource: string; width: number; height: number }[] = JSON.parse(raw);
				for (const value of sizes) {
					if (!Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width <= 0 || value.height <= 0) { throw new Error('Invalid board card size'); }
					this._sizes.set(URI.parse(value.resource), value);
				}
			} catch (error) {
				this.logService.warn('[SessionBoardView] Failed to restore card sizes', error);
			}
		}
		this._register(this.boardService.registerView(this));
	}

	render(container: HTMLElement): void {
		this._element = $('.sessions-board-view');
		container.appendChild(this._element);
		const context = this._register(this.contextKeyService.createScoped(this._element));
		SessionsBoardFocusContext.bindTo(context).set(true);
		this._scopedInstantiation = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
		const controls = $('.sessions-board-controls');
		const groupingContainer = $('.sessions-board-grouping');
		const searchContainer = $('.sessions-board-search');
		const statusContainer = $('.sessions-board-status-filter');
		const savedViewsContainer = $('.sessions-board-saved-views');
		const actionsContainer = $('.sessions-board-options');
		controls.append(groupingContainer, searchContainer, statusContainer, savedViewsContainer, actionsContainer);
		const grouping = this._register(new SelectBox([
			{ text: localize('sessionsBoard.byProject', "By project") },
			{ text: localize('sessionsBoard.byCollection', "My collections") },
		], this.boardService.options.get().grouping === 'project' ? 0 : 1, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize('sessionsBoard.grouping', "Group sessions") }));
		grouping.render(groupingContainer);
		this._register(grouping.onDidSelect(event => this.boardService.updateOptions({ grouping: event.index === 0 ? 'project' : 'collection' })));
		const statuses = [undefined, SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Completed, SessionStatus.Error];
		const status = this._register(new SelectBox(statuses.map(status => ({ text: status === undefined ? localize('sessionsBoard.allStatuses', "All statuses") : getSessionConversationStatusLabel(status) })),
			0, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize('sessionsBoard.filterStatus', "Filter sessions by status") }));
		status.render(statusContainer);
		this._register(status.onDidSelect(event => this.boardService.updateOptions({ status: statuses[event.index] })));
		const savedViews = this._register(new SelectBox([], 0, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: localize('sessionsBoard.savedViews', "Saved board views") }));
		savedViews.render(savedViewsContainer);
		this._register(savedViews.onDidSelect(event => {
			const selected = this.boardService.savedViews.get()[event.index - 1];
			if (selected) { this.boardService.selectView(selected.id); }
		}));
		this._register(autorun(reader => {
			const views = this.boardService.savedViews.read(reader);
			const options = this.boardService.options.read(reader);
			savedViewsContainer.hidden = views.length === 0;
			savedViews.setOptions([
				{ text: localize('sessionsBoard.currentView', "Current view"), isDisabled: true },
				...views.map(view => ({ text: view.name })),
			], views.findIndex(view => objectsEqual(view.options, options)) + 1);
		}));
		this._register(this._scopedInstantiation.createInstance(MenuWorkbenchToolBar, actionsContainer, Menus.SessionsBoardControls, {
			actionViewItemProvider: (action, options) => new ActionViewItem(undefined, action, { ...options, label: true, icon: false }),
		}));
		this._content = $('.sessions-board-sections');
		this._empty = $('.sessions-board-empty');
		this._empty.textContent = localize('sessionBoard.empty', "No matching sessions.");
		this._element.append(controls, this._content, this._empty);
		const search = this._register(new InputBox(searchContainer, this.contextViewService, {
			inputBoxStyles: defaultInputBoxStyles,
			placeholder: localize('sessionsBoard.search', "Find a session"),
			ariaLabel: localize('sessionsBoard.searchLabel', "Find a session on the board"),
		}));
		this._search = search;
		search.value = this.boardService.options.get().filter;
		this._register(search.onDidChange(filter => {
			if (filter !== this.boardService.options.get().filter) { this.boardService.updateOptions({ filter }); }
		}));
		const groupsChanged = observableSignalFromEvent(this, this.groupsService.onDidChange);
		const orderChanged = observableSignalFromEvent(this, this.listModelService.onDidChange);
		this._register(autorun(reader => {
			if (this.sessionsService.sessionReview.read(reader)) {
				return;
			}
			groupsChanged.read(reader);
			orderChanged.read(reader);
			const options = this.boardService.options.read(reader);
			grouping.select(options.grouping === 'project' ? 0 : 1);
			status.select(statuses.indexOf(options.status));
			if (search.value !== options.filter) { search.value = options.filter; }
			const sessions = this.sessionsService.visibleSessions.read(reader).filter((session): session is IActiveSession => !!session);
			const query = options.filter.trim().toLowerCase();
			const filtered = sessions.filter(session => {
				const title = session.title.read(reader);
				const workspace = session.workspace.read(reader);
				if (options.sort === 'updated') { session.updatedAt.read(reader); }
				return (options.status === undefined || session.status.read(reader) === options.status)
					&& (!query || `${title} ${workspace?.label ?? ''}`.toLowerCase().includes(query));
			});
			filtered.sort((a, b) => this.listModelService.getSortKey(b, options.sort) - this.listModelService.getSortKey(a, options.sort));
			this._sessions = filtered;
			this._renderSections(this._sections(filtered, options));
		}));
	}

	private _sections(sessions: readonly IActiveSession[], options: ISessionsBoardOptions): readonly IBoardSection[] {
		if (options.grouping === 'collection') {
			const groups = this.groupsService.getGroups();
			return [...groups.map(group => ({ id: group.id, label: group.name, sessions: sessions.filter(session => this.groupsService.getGroupOfSession(session.sessionId) === group.id) })),
			{ id: 'ungrouped', label: localize('sessionBoard.ungrouped', "Ungrouped"), sessions: sessions.filter(session => !this.groupsService.getGroupOfSession(session.sessionId)) }];
		}
		const groups = new Map<string, { label: string; sessions: IActiveSession[] }>();
		for (const session of sessions) {
			const workspace = session.workspace.get();
			const key = workspace ? getComparisonKey(workspace.uri) : 'other';
			let group = groups.get(key);
			if (!group) {
				group = { label: workspace?.label ?? localize('sessionBoard.otherSessions', "Other Sessions"), sessions: [] };
				groups.set(key, group);
			}
			group.sessions.push(session);
		}
		return [...groups].map(([id, group]) => ({ id, ...group }));
	}

	private _renderSections(sections: readonly IBoardSection[]): void {
		if (!this._content || !this._scopedInstantiation) { return; }
		const visibleSections = sections.filter(section => section.sessions.length > 0);
		const sessionIds = new Set(visibleSections.flatMap(section => section.sessions.map(session => session.sessionId)));
		for (const id of [...this._cards.keys()]) {
			if (!sessionIds.has(id)) { this._cards.deleteAndDispose(id); }
		}
		const sectionIds = new Set(visibleSections.map(section => section.id));
		for (const [id, section] of this._sectionsById) {
			if (!sectionIds.has(id)) {
				section.element.remove();
				this._sectionLabels.deleteAndDispose(id);
				this._sectionsById.delete(id);
			}
		}
		let sectionIndex = 0;
		for (const section of sections) {
			if (!section.sessions.length) { continue; }
			let elements = this._sectionsById.get(section.id);
			if (!elements) {
				const element = $('.session-board-section');
				const heading = $('h3');
				const labelContainer = $('span.session-board-section-label');
				const count = $('span.session-board-section-count');
				const label = new IconLabel(labelContainer);
				this._sectionLabels.set(section.id, label);
				heading.append(renderIcon(this.boardService.options.get().grouping === 'project' ? Codicon.folder : Codicon.library), labelContainer, count);
				const cards = $('.session-board-cards');
				element.append(heading, cards);
				elements = { element, label, count, cards };
				this._sectionsById.set(section.id, elements);
			}
			elements.label.setLabel(section.label, undefined, { title: section.label });
			elements.count.textContent = String(section.sessions.length);
			if (this._content.children[sectionIndex] !== elements.element) {
				this._content.insertBefore(elements.element, this._content.children[sectionIndex] ?? null);
			}
			sectionIndex++;
			for (const [index, session] of section.sessions.entries()) {
				let card = this._cards.get(session.sessionId);
				if (card && card.session !== session) {
					this._cards.deleteAndDispose(session.sessionId);
					card = undefined;
				}
				// Preserve controls so native modal focus restoration can return to the initiating card.
				if (!card) {
					card = this._scopedInstantiation.createInstance(SessionBoardCard, session, this.boardService.options, size => {
						this._sizes.set(session.resource, size);
						this._saveSizes();
					}, () => { this._focusedSession = session.sessionId; });
					this._cards.set(session.sessionId, card);
				}
				if (elements.cards.children[index] !== card.element) {
					elements.cards.insertBefore(card.element, elements.cards.children[index] ?? null);
				}
			}
		}
		if (this._empty) { this._empty.style.display = this._sessions.length ? 'none' : ''; }
		this._layoutCards();
	}

	layout(width: number, _height: number): void {
		this._width = Math.max(0, (this._element?.clientWidth || width) - BOARD_PADDING * 2);
		this._layoutCards();
	}
	private _layoutCards(): void {
		for (const section of this._sectionsById.values()) {
			section.cards.style.gridTemplateColumns = `repeat(${cardColumns(this._width)}, minmax(0, 1fr))`;
		}
		for (const card of this._cards.values()) { card.layout(this._width, this._sizes.get(card.session.resource)); }
	}
	override focus(): void { this.focusSession(this._focusedSession ?? this._sessions[0]?.sessionId); }
	focusSession(sessionId: string | undefined): void {
		const card = this._cards.get(sessionId ?? this._focusedSession ?? this._sessions[0]?.sessionId ?? '');
		if (card) {
			card.element.scrollIntoView({ block: 'nearest' });
			card.focus();
		} else {
			this._search?.focus();
		}
	}
	getSessionView(sessionId: string | undefined): SessionView | undefined { return sessionId ? this._cards.get(sessionId)?.view : undefined; }
	getFocusedSessionView(): SessionView | undefined { return [...this._cards.values()].find(card => isAncestorOfActiveElement(card.element))?.view; }
	toggleMaximizeSession(sessionId: string | undefined): boolean | undefined {
		const card = this._cards.get(sessionId ?? this._focusedSession ?? '');
		if (!card) { return undefined; }
		const expanded = !card.expanded;
		void card.setExpanded(expanded).catch(error => this.notificationService.error(error));
		return expanded;
	}
	resizeCard(sessionId: string | undefined, widthChange: number, heightChange: number): void {
		const card = this._cards.get(sessionId ?? this._focusedSession ?? '');
		if (!card) { return; }
		const current = card.resizable.size;
		const widthStep = widthChange ? Math.sign(widthChange) * (cardWidth(this._width) + CARD_GAP) : 0;
		const next = { width: Math.max(CARD_MIN_WIDTH, current.width + widthStep), height: Math.max(300, (current.height || this._sizes.get(card.session.resource)?.height || 480) + heightChange) };
		this._sizes.set(card.session.resource, next);
		if (!card.expanded) { void card.setExpanded(true).catch(error => this.notificationService.error(error)); }
		this._layoutCards();
		this._saveSizes();
	}
	resetLayout(): void {
		this._sizes.clear();
		this.storageService.remove('sessions.board.cardSizes', StorageScope.WORKSPACE);
		this._layoutCards();
	}
	private _saveSizes(): void {
		this.storageService.store('sessions.board.cardSizes', JSON.stringify([...this._sizes].map(([resource, size]) => ({ resource: resource.toString(), ...size }))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
