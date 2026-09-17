/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReview.css';
import { $, DisposableResizeObserver, getWindow, trackFocus } from '../../../../base/browser/dom.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Menus } from '../../../browser/menus.js';
import { SessionReviewHasPullRequestContext, SessionReviewSectionContext, SessionReviewSidebarFocusContext } from '../../../common/contextkeys.js';
import { getSessionConversationStatusLabel } from '../../../browser/sessionConversationGroups.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionReviewService } from '../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesStatsCache, readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { SessionReviewSection } from '../../../services/sessions/common/sessionReview.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { getSessionReviewPullRequests } from '../common/sessionReviewResources.js';

export class ReviewActionViewItem extends ActionViewItem {
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

	constructor(
		container: HTMLElement,
		onDidLayout: Event<{ readonly height: number; readonly width: number }>,
		session: IActiveSession,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsService sessionsService: ISessionsService,
		@ISessionReviewService reviewService: ISessionReviewService,
		@IHoverService hoverService: IHoverService,
		@ISessionChangesStatsCache changesCache: ISessionChangesStatsCache,
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
		header.append(navigation, heading, metadata);
		const context = $('.session-review-context');
		context.append(header, toolbar);
		const scrollable = this._register(new DomScrollableElement(context, {
			horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto, useShadows: true,
		}));
		scrollable.getDomNode().classList.add('session-review-context-scroll');
		this._root.appendChild(scrollable.getDomNode());
		const resizeObserver = this._register(new DisposableResizeObserver('SessionReviewSidebar.context', () => scrollable.scanDomNode(), getWindow(this._root)));
		this._register(resizeObserver.observe(scrollable.getDomNode()));
		const navigationToolbar = this._register(scopedInstantiation.createInstance(MenuWorkbenchToolBar, navigation, Menus.SessionReviewNavigation, {
			menuOptions: { shouldForwardArgs: true },
			ariaLabel: localize('sessionReview.navigation', "Session review navigation"),
		}));
		navigationToolbar.context = session;
		const counts = new Map([
			[SessionReviewSection.Artifacts, derived(reader => session.artifacts?.read(reader)?.length)],
			[SessionReviewSection.Changes, derived(reader => (readSessionChangesStats(session, reader) ?? changesCache.get(session.sessionId, reader))?.files)],
			[SessionReviewSection.PullRequest, derived(reader => getSessionReviewPullRequests(session, reader).length)],
		]);
		const sectionsToolbar = this._register(scopedInstantiation.createInstance(MenuWorkbenchToolBar, toolbar, Menus.SessionReview, {
			menuOptions: { shouldForwardArgs: true },
			orientation: ActionsOrientation.VERTICAL,
			toolbarOptions: { primaryGroup: () => true },
			ariaLabel: localize('sessionReview.sections', "Session review sections"),
			actionViewItemProvider: (action, options) => {
				if (!(action instanceof MenuItemAction)) { return undefined; }
				const section = [...counts.keys()].find(section => action.id === `sessions.review.${section}`);
				return new ReviewActionViewItem(action, options, section ? counts.get(section) : undefined);
			},
		}));
		sectionsToolbar.context = session;
		const titleHover = this._register(new MutableDisposable());
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
			state.classList.toggle('completed', sessionStatus === SessionStatus.Completed);
			summary.textContent = session.workspace.read(reader)?.label ?? '';
			summary.hidden = !summary.textContent;
			summaryHover.value = hoverService.setupDelayedHover(summary, { content: summary.textContent });
			section.set(reviewService.section.read(reader) ?? sessionsService.sessionReview.read(reader)?.section ?? '');
			scrollable.scanDomNode();
		}));
		this._register(onDidLayout(dimension => {
			this._root.classList.toggle('compact', dimension.height < 300);
			scrollable.scanDomNode();
		}));
	}
}
