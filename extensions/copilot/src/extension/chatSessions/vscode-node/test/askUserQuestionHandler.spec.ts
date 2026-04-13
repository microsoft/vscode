/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { LanguageModelToolInvocationOptions } from 'vscode';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult, LanguageModelToolResult2 } from '../../../../vscodeTypes';
import { ICopilotTool } from '../../../tools/common/toolsRegistry';
import { IToolsService } from '../../../tools/common/toolsService';
import { IQuestion } from '../../copilotcli/node/userInputHelpers';
import { IAnswerResult, UserQuestionHandler } from '../askUserQuestionHandler';

function makeAskQuestionsTool(invokeResult: LanguageModelToolResult | undefined, resolveInput?: unknown): ICopilotTool<unknown> {
	return {
		invoke: vi.fn(async () => invokeResult),
		resolveInput,
	} as unknown as ICopilotTool<unknown>;
}

function makeToolsService(tool: ICopilotTool<unknown> | undefined): IToolsService {
	return new class extends mock<IToolsService>() {
		override invokeTool(name: string, options: LanguageModelToolInvocationOptions<unknown>, token: CancellationToken): Thenable<LanguageModelToolResult2> {
			return (tool as any).invoke(options, token) as Thenable<LanguageModelToolResult2>;
		}
	}();
}

const logService = new class extends mock<import('../../../../platform/log/common/logService').ILogService>() {
	override trace = vi.fn();
	override warn = vi.fn();
}();

function makeHandler(tool: ICopilotTool<unknown> | undefined) {
	return new UserQuestionHandler(logService, makeToolsService(tool));
}

const toolInvocationToken = {} as import('vscode').ChatParticipantToolToken;

const question: IQuestion = {
	header: 'What color?',
	question: 'What color?',
	options: [{ label: 'Red' }, { label: 'Blue' }],
	allowFreeformInput: true,
};

describe('UserQuestionHandler', () => {
	describe('askUserQuestion', () => {
		it('returns undefined when tool returns no content', async () => {
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([]));
			const handler = makeHandler(tool);
			const result = await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			expect(result).toBeUndefined();
		});

		it('returns undefined when result part is not a LanguageModelTextPart', async () => {
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([{ value: 'not-a-text-part' } as unknown as LanguageModelTextPart]));
			const handler = makeHandler(tool);
			const result = await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			expect(result).toBeUndefined();
		});

		it('returns undefined when the answer key is missing', async () => {
			const answers: IAnswerResult = { answers: {} };
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([new LanguageModelTextPart(JSON.stringify(answers))]));
			const handler = makeHandler(tool);
			const result = await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			expect(result).toBeUndefined();
		});

		it('returns freeText answer when freeText is present', async () => {
			const answers: IAnswerResult = {
				answers: {
					'What color?': { selected: [], freeText: 'Purple', skipped: false }
				}
			};
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([new LanguageModelTextPart(JSON.stringify(answers))]));
			const handler = makeHandler(tool);
			const result = await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			expect(result).toEqual({ selected: [], freeText: 'Purple', skipped: false });
		});

		it('returns selections when choices are selected', async () => {
			const answers: IAnswerResult = {
				answers: {
					'What color?': { selected: ['Red', 'Blue'], freeText: null, skipped: false }
				}
			};
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([new LanguageModelTextPart(JSON.stringify(answers))]));
			const handler = makeHandler(tool);
			const result = await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			expect(result).toEqual({ selected: ['Red', 'Blue'], freeText: null, skipped: false });
		});

		it('returns undefined when answer has no freeText and no selections', async () => {
			const answers: IAnswerResult = {
				answers: {
					'What color?': { selected: [], freeText: null, skipped: true }
				}
			};
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([new LanguageModelTextPart(JSON.stringify(answers))]));
			const handler = makeHandler(tool);
			const result = await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			expect(result).toBeUndefined();
		});

		it('passes question text, choices, and freeform flag to the tool', async () => {
			const answers: IAnswerResult = {
				answers: { 'What color?': { selected: ['Red'], freeText: null, skipped: false } }
			};
			const tool = makeAskQuestionsTool(new LanguageModelToolResult([new LanguageModelTextPart(JSON.stringify(answers))]));
			const handler = makeHandler(tool);
			await handler.askUserQuestion(question, toolInvocationToken, CancellationToken.None);
			const invokeArg = (tool.invoke as ReturnType<typeof vi.fn>).mock.calls[0][0];
			expect(invokeArg.input.questions[0]).toMatchObject({
				header: 'What color?',
				question: 'What color?',
				allowFreeformInput: true,
				options: [{ label: 'Red' }, { label: 'Blue' }],
			});
		});
	});
});
