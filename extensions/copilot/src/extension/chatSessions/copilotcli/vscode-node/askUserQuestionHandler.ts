/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatParticipantToolToken, LanguageModelTextPart } from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from '../../copilotcli/node/userInputHelpers';


export interface IAskQuestionsParams {
	readonly questions: IQuestion[];
}

export interface IAnswerResult {
	readonly answers: Record<string, IQuestionAnswer>;
}


export class UserQuestionHandler implements IUserQuestionHandler {
	declare _serviceBrand: undefined;
	constructor(
		@ILogService protected readonly _logService: ILogService,
		@IToolsService private readonly _toolsService: IToolsService,
	) {
	}
	async askUserQuestion(question: IQuestion, toolInvocationToken: ChatParticipantToolToken, token: CancellationToken): Promise<IQuestionAnswer | undefined> {
		const input: IAskQuestionsParams = { questions: [question] };
		const result = await this._toolsService.invokeTool(ToolName.CoreAskQuestions, {
			input,
			toolInvocationToken,
		}, token);


		// Parse the result
		const firstPart = result?.content.at(0);
		if (!(firstPart instanceof LanguageModelTextPart) || !firstPart.value) {
			return undefined;
		}

		const carouselAnswers = JSON.parse(firstPart.value) as IAnswerResult;

		// Log all available keys in carouselAnswers for debugging
		this._logService.trace(`[AskQuestionsTool] Question & answers ${question.question}, Answers object: ${JSON.stringify(carouselAnswers)}`);

		const answer = carouselAnswers.answers[question.question] ?? carouselAnswers.answers[question.header];
		if (answer === undefined) {
			return undefined;
		} else if (answer.freeText) {
			return answer;
		} else if (answer.selected.length) {
			return answer;
		}
		return undefined;
	}
}
