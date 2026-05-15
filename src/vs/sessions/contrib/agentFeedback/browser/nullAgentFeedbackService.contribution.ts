/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackNavigationBearing, IAgentFeedbackService, INavigableSessionComment } from './agentFeedbackService.js';
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

	addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, _suggestion?: ICodeReviewSuggestion, _context?: IAgentFeedbackContext, _sourcePRReviewCommentId?: string): IAgentFeedback {
		return {
			id: '',
			text,
			resourceUri,
			range,
			sessionResource,
		};
	}

	removeFeedback(_sessionResource: URI, _feedbackId: string): void { }
	updateFeedback(_sessionResource: URI, _feedbackId: string, _text: string): void { }
	getFeedback(_sessionResource: URI): readonly IAgentFeedback[] { return []; }
	getMostRecentSessionForResource(_resourceUri: URI): URI | undefined { return undefined; }
	async revealFeedback(_sessionResource: URI, _feedbackId: string): Promise<void> { }
	async revealSessionComment(): Promise<void> { }
	getNextFeedback(): IAgentFeedback | undefined { return undefined; }
	getNextNavigableItem<T extends INavigableSessionComment>(): T | undefined { return undefined; }
	setNavigationAnchor(): void { }
	getNavigationBearing(_sessionResource: URI): IAgentFeedbackNavigationBearing { return { activeIdx: -1, totalCount: 0 }; }
	clearFeedback(): void { }
	async addFeedbackAndSubmit(): Promise<void> { }
}

registerSingleton(IAgentFeedbackService, NullAgentFeedbackService, InstantiationType.Delayed);
