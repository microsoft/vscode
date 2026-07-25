/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { FeedbackInputWidget } from '../../agentFeedback/browser/feedbackInputWidget.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IResolvedResponseSelection, resolveResponseSelection } from './responseSelectionResolver.js';
import { createAndSendSideChat } from './sideChatOrchestration.js';

/**
 * Agents-window-only controller that shows an "Ask Question" input (reusing
 * {@link FeedbackInputWidget}) when the user selects text within a single
 * assistant response's rendered markdown, and creates a side chat anchored to
 * that response when submitted. Owned by `ChatView` so this affordance never
 * appears in the regular workbench chat surface.
 */
export class ResponseSelectionSideChatController extends Disposable {

	private readonly _input: FeedbackInputWidget;
	private _resolved: IResolvedResponseSelection | undefined;
	private _chat: IChat | undefined;
	/** Bumped on a genuine chat navigation/force-dismiss so a stale submission's completion/error handler can no-op. */
	private _generation = 0;

	constructor(
		private readonly _widget: IChatWidget,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		this._input = this._register(new FeedbackInputWidget({
			placeholder: localize('sessions.selectionSideChat.placeholder', "Ask Question"),
			ariaLabel: localize('sessions.selectionSideChat.ariaLabel', "Ask a question about the selected response text"),
			getMaxContentWidth: () => this._widget.domNode.clientWidth,
			primaryAction: {
				label: localize('sessions.selectionSideChat.ask', "Ask Question"),
				icon: Codicon.send,
				keybindingLabel: localize('sessions.selectionSideChat.enter', "Enter"),
			},
		}));
		this._widget.domNode.appendChild(this._input.domNode);

		this._register(this._input.onDidTriggerPrimary(() => this._submit()));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'keydown', e => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss();
				return;
			}
			if (e.keyCode === KeyCode.Enter) {
				if (e.browserEvent.isComposing || e.shiftKey) {
					// Let IME composition finish, or Shift+Enter insert a newline.
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				this._submit();
			}
		}));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'keypress', e => {
			e.stopPropagation();
		}));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'input', () => {
			this._input.autoSize();
			this._input.updateActionEnabled();
		}));

		const window = dom.getWindow(this._widget.domNode);
		this._register(dom.addDisposableListener(window.document, 'selectionchange', () => this._onSelectionChange()));
		// Scrolling the transcript invalidates the widget's pinned position; hide rather than drift.
		this._register(dom.addDisposableListener(this._widget.domNode, 'scroll', () => this._dismiss(), true));
	}

	/**
	 * Tracks which chat the current transcript belongs to, for side-chat
	 * creation. `ChatView` re-invokes this for the same chat on unrelated
	 * observable changes, so only force-dismiss on a genuine resource change.
	 */
	setChat(chat: IChat): void {
		const changedChat = !this._chat || this._chat.resource.toString() !== chat.resource.toString();
		this._chat = chat;
		if (changedChat) {
			this._dismiss(true);
		}
	}

	private _onSelectionChange(): void {
		// The browser collapses the document selection the moment the "Ask
		// Question" textarea receives focus (textareas don't participate in
		// the Selection API). Ignore selectionchange entirely while focus is
		// inside the input so typing doesn't dismiss the widget it just
		// captured; a real outside invalidation is handled once focus
		// actually leaves (the next selectionchange runs with focus outside).
		if (dom.isAncestorOfActiveElement(this._input.domNode)) {
			return;
		}
		// A pending submission owns the overlay until the view changes (see
		// `_dismiss`); don't let an incidental selection change reposition or
		// swap the captured selection out from under it.
		if (this._input.isBusy) {
			return;
		}
		const resolved = resolveResponseSelection(this._widget);
		if (!resolved) {
			this._dismiss();
			return;
		}
		this._resolved = resolved;
		this._showFor(resolved);
	}

	private _showFor(resolved: IResolvedResponseSelection): void {
		const nativeSelection = dom.getWindow(this._widget.domNode).getSelection();
		const range = nativeSelection?.rangeCount ? nativeSelection.getRangeAt(0) : undefined;
		if (!range) {
			return;
		}
		const selectionRect = range.getBoundingClientRect();
		const containerRect = this._widget.domNode.getBoundingClientRect();

		this._input.show();
		this._input.autoSize();
		this._input.updateActionEnabled();

		const gap = 4;
		const inputWidth = this._input.domNode.offsetWidth;
		const inputHeight = this._input.domNode.offsetHeight;
		const viewport = dom.getWindow(this._widget.domNode);

		const maxLeft = Math.max(0, containerRect.width - inputWidth);
		const left = Math.max(0, Math.min(selectionRect.left - containerRect.left, maxLeft));

		// Clamp to whichever is smaller: the widget's own box, or the visible
		// viewport below the widget's top edge, so the popup never renders
		// past either bound.
		const maxTop = Math.max(0, Math.min(containerRect.height, viewport.innerHeight - containerRect.top) - inputHeight);
		let top = selectionRect.bottom - containerRect.top + gap;
		if (top > maxTop) {
			// Not enough room below the selection: prefer placing it above instead.
			const aboveTop = selectionRect.top - containerRect.top - inputHeight - gap;
			top = aboveTop >= 0 ? aboveTop : maxTop;
		}
		top = Math.max(0, Math.min(top, maxTop));

		this._input.domNode.style.top = `${top}px`;
		this._input.domNode.style.left = `${left}px`;
	}

	/**
	 * Dismisses the input. While a submission is pending (`_input.isBusy`),
	 * only a genuine view change (`force`, from {@link setChat}) may dismiss
	 * it — outside interactions like Escape, scrolling, or selection
	 * invalidation must not race the in-flight create/open/send.
	 */
	private _dismiss(force = false): void {
		if (!force && this._input.isBusy) {
			return;
		}
		if (force) {
			// A genuine navigation: bump the generation so a stale submission's completion/error handler no-ops.
			this._generation++;
		}
		const hadFocus = dom.isAncestorOfActiveElement(this._input.domNode);
		this._resolved = undefined;
		this._input.setBusy(false);
		this._input.hide();
		this._input.clearInput();
		if (hadFocus) {
			// Hiding the focused input would otherwise leave focus stranded on
			// the body; return it to the transcript it was invoked from.
			this._widget.focusResponseItem(true);
		}
	}

	private _submit(): void {
		const resolved = this._resolved;
		const chat = this._chat;
		const query = this._input.inputElement.value.trim();
		if (!resolved || !chat || !query || this._input.isBusy) {
			return;
		}

		const found = this._sessionsManagementService.getSessionForChatResource(chat.resource);
		if (!found) {
			this._notificationService.warn(localize('sessions.selectionSideChat.sessionUnavailable', "A side chat cannot be created from this conversation."));
			return;
		}
		const { session } = found;
		if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
			this._notificationService.warn(localize('sessions.selectionSideChat.unsupported', "This conversation does not support side chats."));
			return;
		}

		// Keep the overlay visible with a busy state instead of eagerly
		// dismissing: opening the created side chat naturally dismisses it via
		// `setChat`; on failure the question and normal controls are restored
		// below so the user can retry.
		this._input.setBusy(true, localize('sessions.selectionSideChat.busy', "Asking question…"));
		const generation = this._generation;
		createAndSendSideChat(this._sessionsManagementService, this._sessionsService, session, chat.resource, resolved.response.requestId, query, { text: resolved.text })
			.then(() => {
				// A stale completion after a genuine navigation force-dismissed this overlay must no-op.
				if (this._generation !== generation) {
					return;
				}
				// `setChat` (fired by the view change from opening the side
				// chat) normally dismisses this overlay already; clear busy
				// defensively in case that doesn't happen.
				this._input.setBusy(false);
			})
			.catch(err => {
				this._logService.error('[selectionSideChat] Failed to create side chat', err);
				if (this._generation !== generation) {
					return;
				}
				this._notificationService.error(localize('sessions.selectionSideChat.createFailed', "The side chat could not be created."));
				this._input.setBusy(false);
				this._input.inputElement.value = query;
				this._input.autoSize();
				this._input.updateActionEnabled();
				this._input.inputElement.focus();
			});
	}
}
