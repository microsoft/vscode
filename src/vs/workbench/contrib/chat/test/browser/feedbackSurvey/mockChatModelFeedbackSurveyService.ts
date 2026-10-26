/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IChatModelFeedbackSurveyService, IChatModelFeedbackSurveyState } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

/** Never offers a survey, matching any build without the experiment configured. */
export class MockChatModelFeedbackSurveyService implements IChatModelFeedbackSurveyService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeSurveyState = Event.None;
	readonly onDidChangeConfiguration = Event.None;

	getSurvey(_response: IChatResponseViewModel): IChatModelFeedbackSurveyState | undefined {
		return undefined;
	}

	toggle(_response: IChatResponseViewModel): void { }
	notifyModelSwitchedAway(_sessionResource: URI, _fromModelId: string, _toModelId: string): void { }
	answerChoice(_response: IChatResponseViewModel, _stepId: string, _optionId: string): void { }
	submit(_response: IChatResponseViewModel, _comment?: string): void { }
	dismiss(_response: IChatResponseViewModel, _comment?: string): void { }
	setCommentDraft(_response: IChatResponseViewModel, _comment: string): void { }
}
