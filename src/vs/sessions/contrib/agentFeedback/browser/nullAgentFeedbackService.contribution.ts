/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackAddedEvent, IAgentFeedbackChangeEvent, IAgentFeedbackConvertedEvent, IAgentFeedbackNavigationBearing, IAgentFeedbackReplyAddedEvent, IAgentFeedbackService, IAgentFeedbackSubmittedEvent, INavigableSessionComment } from './agentFeedbackService.js';
import { IAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { ICodeReviewSuggestion } from '../../codeReview/browser/codeReviewService.js';

/**
 * No-op implementation of {@link IAgentFeedbackService} used on web,
 * where the full agent feedback UI (editor overlay, hover, attachments)
 * is not wired up. The changes view model still depends on the service
 * being registered, so we expose a service that reports no feedback.
 */
class NullAgentFeedbackService extends Disposable implements IAgentFeedbackService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeFeedback = this._register(new Emitter<IAgentFeedbackChangeEvent>()).event;
	readonly onDidChangeNavigation = this._register(new Emitter<URI>()).event;
	readonly onDidAddFeedback = this._register(new Emitter<IAgentFeedbackAddedEvent>()).event;
	readonly onDidConvertFeedback = this._register(new Emitter<IAgentFeedbackConvertedEvent>()).event;
	readonly onDidAddReply = this._register(new Emitter<IAgentFeedbackReplyAddedEvent>()).event;
	readonly onDidSubmitFeedback = this._register(new Emitter<IAgentFeedbackSubmittedEvent>()).event;

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, _suggestion?: ICodeReviewSuggestion, _context?: IAgentFeedbackContext, _sourcePRReviewCommentId?: string, _kind?: AgentFeedbackKind, state: AgentFeedbackState = AgentFeedbackState.Accepted): IAgentFeedback {
		return {
			id: '',
			text,
			resourceUri,
			range,
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state,
		};
	}

	acceptFeedback(_sessionResource: URI, _feedbackId: string): void { }

	removeFeedback(_sessionResource: URI, _feedbackId: string): void { }
	updateFeedback(_sessionResource: URI, _feedbackId: string, _text: string): void { }
	setFeedbackResolved(_sessionResource: URI, _feedbackId: string, _resolved: boolean): void { }
	addReply(_sessionResource: URI, _feedbackId: string, _replyText: string): void { }
	getFeedback(_sessionResource: URI): readonly IAgentFeedback[] { return []; }
	getSessionForFile(_resourceUri: URI): undefined { return undefined; }
	getMostRecentSessionForResource(_resourceUri: URI): URI | undefined { return undefined; }
	async revealFeedback(_sessionResource: URI, _feedbackId: string): Promise<void> { }
	async revealSessionComment(): Promise<void> { }
	getNextFeedback(): IAgentFeedback | undefined { return undefined; }
	getNextNavigableItem<T extends INavigableSessionComment>(): T | undefined { return undefined; }
	setNavigationAnchor(): void { }
	getNavigationBearing(_sessionResource: URI): IAgentFeedbackNavigationBearing { return { activeIdx: -1, totalCount: 0 }; }
	clearFeedback(): void { }
	markFeedbackSubmitted(): void { }
	async submitFeedback(): Promise<void> { }
	async addFeedbackAndSubmit(): Promise<void> { }
}

registerSingleton(IAgentFeedbackService, NullAgentFeedbackService, InstantiationType.Delayed);
