/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatParticipantToolToken, commands, LanguageModelTextPart } from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler, UserInputResponse } from '../../copilotcli/node/userInputHelpers';


export interface IAskQuestionsParams {
	readonly questions: IQuestion[];
}

export interface IAnswerResult {
	readonly answers: Record<string, IQuestionAnswer>;
}

const NotifyQuestionCarouselAnswerCommandId = '_chat.notifyQuestionCarouselAnswer';

function toCarouselAnswerValue(question: IQuestion, response: UserInputResponse): string | { selectedValue?: string; freeformValue?: string } | { selectedValues: string[]; freeformValue?: string } | undefined {
	if (!response.answer) {
		return undefined;
	}

	if (!question.options || question.options.length === 0) {
		return response.answer;
	}

	if (question.multiSelect) {
		const selectedValues = question.options.some(option => option.label === response.answer)
			? [response.answer]
			: response.answer.split(',').map(value => value.trim()).filter(Boolean);
		return response.wasFreeform
			? { selectedValues, freeformValue: response.answer }
			: { selectedValues };
	}

	return response.wasFreeform
		? { freeformValue: response.answer }
		: { selectedValue: response.answer };
}

export class UserQuestionHandler implements IUserQuestionHandler {
	declare _serviceBrand: undefined;
	constructor(
		@ILogService protected readonly _logService: ILogService,
		@IToolsService private readonly _toolsService: IToolsService,
	) {
	}
	async askUserQuestion(question: IQuestion, toolInvocationToken: ChatParticipantToolToken, token: CancellationToken, toolCallId?: string): Promise<IQuestionAnswer | undefined> {
		const input: IAskQuestionsParams = { questions: [question] };
		const result = await this._toolsService.invokeTool(ToolName.CoreAskQuestions, {
			input,
			toolInvocationToken,
			chatStreamToolCallId: toolCallId,
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

	async notifyQuestionCarouselAnswer(toolCallId: string, question: IQuestion, response: UserInputResponse): Promise<void> {
		const answerValue = toCarouselAnswerValue(question, response);
		await commands.executeCommand(NotifyQuestionCarouselAnswerCommandId, toolCallId, answerValue === undefined ? undefined : {
			[`${toolCallId}:0`]: answerValue,
		});
	}
}
