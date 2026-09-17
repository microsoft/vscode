/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReview.css';
import { $, DisposableResizeObserver, getWindow, isAncestorOfActiveElement, trackFocus } from '../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { Menus } from '../../../browser/menus.js';
import { getSessionConversationStatusLabel } from '../../../browser/sessionConversationGroups.js';
import { SessionReviewSidebarFocusContext } from '../../../common/contextkeys.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionInputDraftService } from '../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { NewChatInputWidget } from '../../chat/browser/newChatInput.js';
import { IDashboardWorkService } from '../../intent/common/dashboardWork.js';
import { ReviewActionViewItem } from './sessionReviewSidebar.js';
import { canStopSessionResponse, SessionResponseStopAction } from './sessionResponseStopAction.js';

/** A chat-scoped reply hosted for the native modal content footer's lifetime. */
export class SessionReviewComposer extends Disposable {
	private readonly _input = this._register(new MutableDisposable<NewChatInputWidget>());
	private readonly _maximumInputHeight = observableValue(this, 100);
	private _chatResource: URI | undefined;
	private _dimension = { width: 400, height: 220 };

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
		@IDashboardWorkService dashboardWork: IDashboardWorkService,
		@ISessionsManagementService management: ISessionsManagementService,
	) {
		super();
		const root = $('.session-review-reply', {
			role: 'region',
			'aria-label': localize('sessionReview.replyRegion', "Session review reply"),
		});
		container.appendChild(root);
		const scopedContext = this._register(contextKeyService.createScoped(root));
		const focused = SessionReviewSidebarFocusContext.bindTo(scopedContext);
		const focusTracker = this._register(trackFocus(root));
		this._register(focusTracker.onDidFocus(() => focused.set(true)));
		this._register(focusTracker.onDidBlur(() => focused.set(false)));
		const scopedInstantiation = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContext],
			[ISessionContext, new SessionContext(constObservable(session))],
		)));

		const content = $('.session-review-reply-content');
		const header = $('.session-review-reply-header');
		const target = $('.session-review-reply-title');
		const selectedActions = $('.session-review-selected-actions');
		const responseActions = $('.session-review-response-actions');
		header.append(target, selectedActions, responseActions);
		const selectedLabel = $('.session-review-selected-label');
		const composerContainer = $('.session-review-composer');
		const replyHint = $('.session-review-reply-hint');
		const relatedWork = $('.session-review-related-work');
		content.append(header, selectedLabel, composerContainer, replyHint, relatedWork);
		const scrollable = this._register(new DomScrollableElement(content, {
			horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto, useShadows: true,
		}));
		root.appendChild(scrollable.getDomNode());
		const resizeObserver = this._register(new DisposableResizeObserver('SessionReviewComposer.content', () => scrollable.scanDomNode(), getWindow(root)));
		this._register(resizeObserver.observe(content));
		this._register(resizeObserver.observe(root));

		const resultToolbar = this._register(scopedInstantiation.createInstance(MenuWorkbenchToolBar, selectedActions, Menus.SessionReviewActions, {
			menuOptions: { shouldForwardArgs: true },
			ariaLabel: localize('sessionReview.resultActions', "Review result actions"),
			actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? new ReviewActionViewItem(action, options) : undefined,
		}));
		resultToolbar.context = session;
		const stop = this._register(scopedInstantiation.createInstance(SessionResponseStopAction, () => ({ session, chat: session.activeChat.get() })));
		const responseToolbar = this._register(scopedInstantiation.createInstance(WorkbenchToolBar, responseActions, {
			ariaLabel: localize('sessionReview.responseActions', "Response Actions"),
		}));
		responseToolbar.setActions([stop]);
		const catalogChanges = observableSignalFromEvent(this, management.onDidChangeSessions);
		const targetHover = this._register(new MutableDisposable());
		const selectionHover = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			setActiveSessionContextKeys(session, scopedContext, reader, changesCache);
			const chat = session.activeChat.read(reader);
			const canStop = canStopSessionResponse(session, chat, reader);
			const restoreReplyFocus = !canStop && isAncestorOfActiveElement(responseActions);
			responseActions.hidden = !canStop;
			const title = chat.title.read(reader) || localize('sessionReview.untitledChat', "Untitled Chat");
			target.textContent = localize('sessionReview.replyTarget', "Reply to {0}", title);
			targetHover.value = hoverService.setupDelayedHover(target, { content: target.textContent });
			const selection = reviewService.selection.read(reader);
			selectedActions.hidden = !selection;
			selectedLabel.hidden = !selection;
			selectedLabel.textContent = selection ? localize('sessionReview.currentResult', "Current result: {0}", selection.label) : '';
			selectionHover.value = hoverService.setupDelayedHover(selectedLabel, { content: selectedLabel.textContent });
			const draft = drafts.getDraft(chat.resource).read(reader);
			replyHint.textContent = chat.interactivity.read(reader) !== ChatInteractivity.Full
				? localize('sessionReview.readOnlyChat', "This conversation is read-only.")
				: draft.attachments.length
					? localize('sessionReview.referencesRetained', "References stay attached when you switch results.")
					: selection ? localize('sessionReview.addReferenceHint', "Add the result to your reply to give the agent context.") : '';
			replyHint.hidden = !replyHint.textContent;
			catalogChanges.read(reader);
			const executions = dashboardWork.executions.read(reader).filter(execution => isEqual(execution.source, session.resource));
			relatedWork.hidden = executions.length === 0;
			relatedWork.textContent = executions.map(execution => {
				const child = execution.sessionResource ? management.getSession(execution.sessionResource) : undefined;
				const phase = child ? getSessionConversationStatusLabel(child.status.read(reader))
					: execution.phase === 'starting' ? localize('sessionReview.preparing', "Preparing")
						: execution.phase === 'failed' ? localize('sessionReview.failed', "Failed")
							: execution.phase === 'unknown' ? localize('sessionReview.inspect', "Needs inspection") : localize('sessionReview.started', "Started");
				return localize('sessionReview.execution', "{0}: {1} ({2})", execution.title, execution.target, phase);
			}).join('\n');
			scrollable.scanDomNode();
			if (restoreReplyFocus) { this.focus(); }
		}));
		this._register(autorun(reader => {
			const chat = session.activeChat.read(reader);
			if (isEqual(this._chatResource, chat.resource)) {
				return;
			}
			const hadFocus = isAncestorOfActiveElement(composerContainer);
			this._chatResource = chat.resource;
			this._input.clear();
			composerContainer.replaceChildren();
			const resource = chat.resource;
			const input = scopedInstantiation.createInstance(NewChatInputWidget, {
				session: constObservable(session),
				layoutMode: 'embedded',
				getContextFolderUri: () => session.workspace.read(undefined)?.folders[0]?.workingDirectory,
				loading: session.loading,
				canSendRequest: derived(reader => isEqual(sessionsService.sessionReview.read(reader)?.sessionResource, session.resource) && !session.isArchived.read(reader) && chat.interactivity.read(reader) === ChatInteractivity.Full && chat.status.read(reader) !== SessionStatus.NeedsInput),
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
			input.render(composerContainer, root);
			input.layout(this._dimension.height, this._dimension.width);
			if (hadFocus) { input.focus(); }
			scrollable.scanDomNode();
		}));
		this._register(onDidLayout(dimension => {
			this._dimension = dimension;
			root.classList.toggle('compact', dimension.height < 180);
			this._maximumInputHeight.set(Math.min(180, Math.max(60, dimension.height - 120)), undefined);
			this._input.value?.layout(dimension.height, dimension.width);
			scrollable.scanDomNode();
		}));
	}

	focus(): void { this._input.value?.focus(); }
}
