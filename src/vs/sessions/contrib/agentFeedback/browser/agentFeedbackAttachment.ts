/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentFeedbackState, IAgentFeedbackService } from './agentFeedbackService.js';
import { ATTACHMENT_ID_PREFIX, createAgentFeedbackVariableEntry } from './agentFeedbackAttachmentEntry.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';

/**
 * Keeps the "N feedback items" attachment in the chat input in sync with the
 * AgentFeedbackService. One attachment per session resource, updated reactively.
 * Clears feedback after the chat prompt is sent.
 */
export class AgentFeedbackAttachmentContribution extends Disposable {

	static readonly ID = 'workbench.contrib.agentFeedbackAttachment';

	/** Track onDidAcceptInput subscriptions per widget session */
	private readonly _widgetListeners = this._store.add(new DisposableMap<string>());

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._store.add(this._agentFeedbackService.onDidChangeFeedback(e => {
			if (this._isAgentHostSession(e.sessionResource)) {
				return;
			}
			this._updateAttachment(e.sessionResource);
			this._ensureAcceptListener(e.sessionResource);
		}));
	}

	private _isAgentHostSession(sessionResource: URI): boolean {
		const session = this._sessionsManagementService.getSession(sessionResource);
		return session ? isAgentHostProviderId(session.providerId) : false;
	}

	private async _updateAttachment(sessionResource: URI): Promise<void> {
		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			return;
		}

		const feedbackItems = this._agentFeedbackService.getFeedback(sessionResource).filter(item => item.state === AgentFeedbackState.Accepted);
		const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();

		if (feedbackItems.length === 0) {
			widget.attachmentModel.delete(attachmentId);
			return;
		}

		const entry = createAgentFeedbackVariableEntry(sessionResource, feedbackItems);

		// Upsert
		widget.attachmentModel.delete(attachmentId);
		widget.attachmentModel.addContext(entry);
	}

	/**
	 * Ensure we listen for the chat widget's submit event so we can clear feedback after send.
	 */
	private _ensureAcceptListener(sessionResource: URI): void {
		const key = sessionResource.toString();
		if (this._widgetListeners.has(key)) {
			return;
		}

		const widget = this._chatWidgetService.getWidgetBySessionResource(sessionResource);
		if (!widget) {
			return;
		}

		this._widgetListeners.set(key, widget.onDidSubmitAgent(() => {
			this._agentFeedbackService.markFeedbackSubmitted(sessionResource);
			this._widgetListeners.deleteAndDispose(key);
		}));
	}
}
