/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReview.css';
import { $, DisposableResizeObserver, getActiveElement, getWindow, isAncestorOfActiveElement, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { Menus } from '../../../browser/menus.js';
import { SessionReviewHasPullRequestContext, SessionReviewSectionContext, SessionReviewSidebarFocusContext } from '../../../common/contextkeys.js';
import { getSessionConversationStatusLabel } from '../../../browser/sessionConversationGroups.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionInputDraftService } from '../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesStatsCache, readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { SessionReviewSection } from '../../../services/sessions/common/sessionReview.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { NewChatInputWidget } from '../../chat/browser/newChatInput.js';
import { getSessionReviewPullRequests } from '../common/sessionReviewResources.js';

class ReviewActionViewItem extends ActionViewItem {
	private _countLabel: HTMLElement | undefined;

	constructor(
		private readonly menuAction: MenuItemAction,
		options: IActionViewItemOptions,
		private readonly count?: IObservable<number | undefined>,
		private readonly shortLabel?: string,
	) {
		super(undefined, menuAction, { ...options, icon: false, label: true });
		if (count) {
			this._register(autorun(reader => {
				count.read(reader);
				this._updateCount();
				this.updateTooltip();
			}));
		}
	}

	protected override updateLabel(): void {
		if (!this.label) { return; }
		this.label.classList.add('session-review-action');
		const name = $('span.session-review-action-name');
		name.textContent = this.shortLabel ?? this.menuAction.label;
		const icon = this.menuAction.item.icon;
		if (ThemeIcon.isThemeIcon(icon)) {
			const glyph = renderIcon(icon);
			glyph.setAttribute('aria-hidden', 'true');
			this.label.replaceChildren(glyph, name);
		} else {
			this.label.replaceChildren(name);
		}
		this._countLabel = $('span.session-review-action-count', { 'aria-hidden': 'true' });
		this.label.appendChild(this._countLabel);
		this._updateCount();
	}

	private _updateCount(): void {
		if (!this._countLabel) { return; }
		const count = this.count?.get();
		this._countLabel.textContent = count === undefined ? '' : String(count);
		this._countLabel.hidden = count === undefined;
	}

	protected override getTooltip(): string {
		const count = this.count?.get();
		return count === undefined ? this.menuAction.label : localize('sessionReview.actionCount', "{0} ({1})", this.menuAction.label, count);
	}
}

/** Renders only into the container provided by the native modal editor sidebar API. */
export class SessionReviewSidebar extends Disposable {
	private readonly _root: HTMLElement;
	private readonly _composerContainer: HTMLElement;
	private readonly _input = this._register(new MutableDisposable<NewChatInputWidget>());
	private readonly _maximumInputHeight = observableValue(this, 200);
	private readonly _compact = observableValue(this, false);
	private readonly _sectionToolbar = this._register(new MutableDisposable<MenuWorkbenchToolBar>());
	private _chatResource: URI | undefined;
	private _dimension = { width: 320, height: 600 };

	constructor(
		container: HTMLElement,
		onDidLayout: Event<{ readonly height: number; readonly width: number }>,
		session: IActiveSession,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionReviewService reviewService: ISessionReviewService,
		@ISessionInputDraftService drafts: ISessionInputDraftService,
		@IHoverService hoverService: IHoverService,
		@ISessionChangesStatsCache changesCache: ISessionChangesStatsCache,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		this._root = $('.session-review-sidebar');
		container.appendChild(this._root);
		const scopedContext = this._register(contextKeyService.createScoped(this._root));
		const focused = SessionReviewSidebarFocusContext.bindTo(scopedContext);
		const section = SessionReviewSectionContext.bindTo(scopedContext);
		const hasPullRequest = SessionReviewHasPullRequestContext.bindTo(scopedContext);
		section.set(reviewService.section.get() ?? sessionsService.sessionReview.get()?.section ?? '');
		hasPullRequest.set(getSessionReviewPullRequests(session).length > 0);
		const focusTracker = this._register(trackFocus(this._root));
		this._register(focusTracker.onDidFocus(() => focused.set(true)));
		this._register(focusTracker.onDidBlur(() => focused.set(false)));
		const scopedInstantiation = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContext],
			[ISessionContext, new SessionContext(constObservable(session))],
		)));
		const navigation = $('.session-review-navigation');
		const header = $('.session-review-header');
		const heading = $('.session-review-heading');
		const headingText = $('h2');
		heading.appendChild(headingText);
		const metadata = $('.session-review-metadata');
		const state = $('.session-review-status');
		const statusIcon = renderIcon(Codicon.circleSmallFilled);
		statusIcon.setAttribute('aria-hidden', 'true');
		const statusLabel = $('span');
		state.append(statusIcon, statusLabel);
		const summary = $('.session-review-summary');
		metadata.append(state, summary);
		const toolbar = $('.session-review-sections');
		const selected = $('.session-review-selected');
		const selectedTitle = $('.session-review-selected-title');
		selectedTitle.textContent = localize('sessionReview.reviewingTitle', "Current result");
		const selectedLabel = $('.session-review-selected-label');
		const selectedActions = $('.session-review-selected-actions');
		const selectedRow = $('.session-review-selected-row');
		selectedRow.append(selectedLabel, selectedActions);
		selected.append(selectedTitle, selectedRow);
		const reply = $('.session-review-reply');
		const replyTitle = $('.session-review-reply-title');
		replyTitle.textContent = localize('sessionReview.reply', "Reply to this session");
		this._composerContainer = $('.session-review-composer');
		const replyHint = $('.session-review-reply-hint');
		header.append(navigation, heading, metadata);
		reply.append(selected, replyTitle, this._composerContainer, replyHint);
		const context = $('.session-review-context');
		context.append(header, toolbar);
		const scrollable = this._register(new DomScrollableElement(context, {
			horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto, useShadows: true,
		}));
		scrollable.getDomNode().classList.add('session-review-context-scroll');
		this._root.append(scrollable.getDomNode(), reply);
		const resizeObserver = this._register(new DisposableResizeObserver('SessionReviewSidebar.context', () => scrollable.scanDomNode(), getWindow(this._root)));
		this._register(resizeObserver.observe(scrollable.getDomNode()));
		const navigationToolbar = this._register(scopedInstantiation.createInstance(MenuWorkbenchToolBar, navigation, Menus.SessionReviewNavigation, {
			menuOptions: { shouldForwardArgs: true },
			ariaLabel: localize('sessionReview.navigation', "Session review navigation"),
			actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? new ReviewActionViewItem(action, options) : undefined,
		}));
		navigationToolbar.context = session;
		const counts = new Map([
			[SessionReviewSection.Artifacts, derived(reader => session.artifacts?.read(reader)?.length)],
			[SessionReviewSection.Changes, derived(reader => (readSessionChangesStats(session, reader) ?? changesCache.get(session.sessionId, reader))?.files)],
			[SessionReviewSection.PullRequest, derived(reader => getSessionReviewPullRequests(session, reader).length)],
		]);
		this._register(autorun(reader => {
			const compact = this._compact.read(reader);
			const hadFocus = isAncestorOfActiveElement(toolbar);
			const focusedElement = getActiveElement();
			const focusedActionId = hadFocus && isHTMLElement(focusedElement) ? this._sectionToolbar.value?.getItemAction(focusedElement)?.id : undefined;
			this._sectionToolbar.clear();
			const sectionsToolbar = scopedInstantiation.createInstance(MenuWorkbenchToolBar, toolbar, Menus.SessionReview, {
				menuOptions: { shouldForwardArgs: true },
				orientation: compact ? ActionsOrientation.HORIZONTAL : ActionsOrientation.VERTICAL,
				toolbarOptions: { primaryGroup: () => true },
				ariaLabel: localize('sessionReview.sections', "Session review sections"),
				actionViewItemProvider: (action, options) => {
					if (!(action instanceof MenuItemAction)) { return undefined; }
					const section = [...counts.keys()].find(section => action.id === `sessions.review.${section}`);
					return new ReviewActionViewItem(action, options, compact || !section ? undefined : counts.get(section),
						compact && section === SessionReviewSection.PullRequest ? localize('sessionReview.shortPullRequest', "PR") : undefined);
				},
			});
			this._sectionToolbar.value = sectionsToolbar;
			sectionsToolbar.context = session;
			if (hadFocus) {
				let focusedIndex = 0;
				for (let index = 0; index < sectionsToolbar.getItemsLength(); index++) {
					if (sectionsToolbar.getItemAction(index)?.id === focusedActionId) {
						focusedIndex = index;
						break;
					}
				}
				sectionsToolbar.focus(focusedIndex);
			}
			scrollable.scanDomNode();
		}));
		const resultToolbar = this._register(scopedInstantiation.createInstance(MenuWorkbenchToolBar, selectedActions, Menus.SessionReviewActions, {
			menuOptions: { shouldForwardArgs: true },
			ariaLabel: localize('sessionReview.resultActions', "Review result actions"),
			actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? new ReviewActionViewItem(action, options) : undefined,
		}));
		resultToolbar.context = session;
		const titleHover = this._register(new MutableDisposable());
		const selectionHover = this._register(new MutableDisposable());
		const summaryHover = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			setActiveSessionContextKeys(session, scopedContext, reader, changesCache);
			hasPullRequest.set(getSessionReviewPullRequests(session, reader).length > 0);
			headingText.textContent = session.title.read(reader);
			titleHover.value = hoverService.setupDelayedHover(headingText, { content: headingText.textContent });
			const sessionStatus = session.status.read(reader);
			statusLabel.textContent = getSessionConversationStatusLabel(sessionStatus);
			state.classList.toggle('needs-input', sessionStatus === SessionStatus.NeedsInput);
			state.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
			state.classList.toggle('failed', sessionStatus === SessionStatus.Error);
			summary.textContent = session.workspace.read(reader)?.label ?? '';
			summary.hidden = !summary.textContent;
			summaryHover.value = hoverService.setupDelayedHover(summary, { content: summary.textContent });
			section.set(reviewService.section.read(reader) ?? sessionsService.sessionReview.read(reader)?.section ?? '');
			const selection = reviewService.selection.read(reader);
			selected.hidden = !selection;
			selectedLabel.textContent = selection?.label ?? '';
			selectionHover.value = hoverService.setupDelayedHover(selectedLabel, { content: selection?.label ?? '' });
			scrollable.scanDomNode();
		}));
		this._register(autorun(reader => {
			const selection = reviewService.selection.read(reader);
			const chat = session.activeChat.read(reader);
			const draft = drafts.getDraft(chat.resource).read(reader);
			replyHint.textContent = chat.interactivity.read(reader) !== ChatInteractivity.Full
				? localize('sessionReview.readOnlyChat', "This conversation is read-only.")
				: draft.attachments.length
					? localize('sessionReview.referencesRetained', "References stay attached when you switch results.")
					: selection ? localize('sessionReview.addReferenceHint', "Add the result to your reply to give the agent context.") : '';
			replyHint.hidden = !replyHint.textContent;
			scrollable.scanDomNode();
		}));
		this._register(autorun(reader => {
			const chat = session.activeChat.read(reader);
			if (isEqual(this._chatResource, chat.resource)) {
				return;
			}
			this._chatResource = chat.resource;
			this._input.clear();
			this._composerContainer.replaceChildren();
			const resource = chat.resource;
			const input = scopedInstantiation.createInstance(NewChatInputWidget, {
				session: constObservable(session),
				layoutMode: 'embedded',
				getContextFolderUri: () => session.workspace.read(undefined)?.folders[0]?.workingDirectory,
				loading: session.loading,
				canSendRequest: derived(reader => isEqual(sessionsService.sessionReview.read(reader)?.sessionResource, session.resource) && !session.isArchived.read(reader) && chat.interactivity.read(reader) === ChatInteractivity.Full),
				historyKey: constObservable(session.sessionId),
				renderRepositoryControls: false,
				sessionTypePickerOptions: { persistSelection: false },
				voiceRoutesWhileSessionActive: true,
				placeholder: localize('sessionReview.inputPlaceholder', "Reply without leaving this result..."),
				maxEditorHeight: this._maximumInputHeight,
				minEditorHeight: 60,
				accessibilityVerbositySetting: AccessibilityVerbositySettingId.SessionReview,
				draft: { state: drafts.getDraft(resource), save: value => drafts.setDraft(resource, value) },
				sendRequest: async request => {
					try {
						return await reviewService.send(session, chat, request.query, request.attachments ?? []);
					} catch (error) {
						notificationService.error(error);
						throw error;
					}
				},
			});
			this._input.value = input;
			input.render(this._composerContainer, this._root);
			input.layout(this._dimension.height, this._dimension.width);
		}));
		this._register(onDidLayout(dimension => {
			this._dimension = dimension;
			const compact = dimension.height < 420;
			this._root.classList.toggle('compact', compact);
			this._compact.set(compact, undefined);
			this._maximumInputHeight.set(Math.min(180, Math.max(60, Math.floor(dimension.height / 4))), undefined);
			this._input.value?.layout(dimension.height, dimension.width);
			scrollable.scanDomNode();
		}));
	}

	focus(): void { this._input.value?.focus(); }
}
