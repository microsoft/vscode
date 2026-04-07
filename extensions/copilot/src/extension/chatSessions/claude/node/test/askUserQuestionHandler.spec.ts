/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AskUserQuestionInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { Emitter } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { constObservable, IObservable } from '../../../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IAnswerResult } from '../../../../tools/common/askQuestionsTypes';
import { ToolName } from '../../../../tools/common/toolNames';
import { ICopilotTool } from '../../../../tools/common/toolsRegistry';
import { IOnWillInvokeToolEvent, IToolsService, IToolValidationResult } from '../../../../tools/common/toolsService';
import { ClaudeToolPermissionContext } from '../../common/claudeToolPermission';
import { ClaudeToolNames } from '../../common/claudeTools';
import { AskUserQuestionHandler } from '../../common/toolPermissionHandlers/askUserQuestionHandler';

class MockToolsService implements IToolsService {
	readonly _serviceBrand: undefined;

	private readonly _onWillInvokeTool = new Emitter<IOnWillInvokeToolEvent>();
	readonly onWillInvokeTool = this._onWillInvokeTool.event;
	readonly tools: ReadonlyArray<vscode.LanguageModelToolInformation> = [];
	readonly copilotTools = new Map<ToolName, ICopilotTool<unknown>>();
	modelSpecificTools: IObservable<{ definition: vscode.LanguageModelToolDefinition; tool: ICopilotTool<unknown> }[]> = constObservable([]);

	private _result: vscode.LanguageModelToolResult2 = { content: [] };
	private _shouldThrow = false;
	private _invokeToolCalls: Array<{ name: string; input: unknown }> = [];

	setResult(answerResult: IAnswerResult): void {
		this._result = {
			content: [new LanguageModelTextPart(JSON.stringify(answerResult))]
		};
	}

	setEmptyResult(): void {
		this._result = { content: [] };
	}

	setShouldThrow(): void {
		this._shouldThrow = true;
	}

	get invokeToolCalls(): ReadonlyArray<{ name: string; input: unknown }> {
		return this._invokeToolCalls;
	}

	async invokeTool(name: string, options: vscode.LanguageModelToolInvocationOptions<unknown>): Promise<vscode.LanguageModelToolResult2> {
		this._invokeToolCalls.push({ name, input: options.input });
		if (this._shouldThrow) {
			throw new Error('Tool invocation failed');
		}
		return this._result;
	}

	invokeToolWithEndpoint(name: string, options: vscode.LanguageModelToolInvocationOptions<unknown>, _endpoint: IChatEndpoint | undefined): Thenable<vscode.LanguageModelToolResult2> {
		return this.invokeTool(name, options);
	}

	getCopilotTool(): ICopilotTool<unknown> | undefined { return undefined; }
	getTool(): vscode.LanguageModelToolInformation | undefined { return undefined; }
	getToolByToolReferenceName(): vscode.LanguageModelToolInformation | undefined { return undefined; }
	validateToolInput(): IToolValidationResult { return { inputObj: {} }; }
	validateToolName(): string | undefined { return undefined; }
	getEnabledTools(): vscode.LanguageModelToolInformation[] { return []; }
}

function createMockContext(): ClaudeToolPermissionContext {
	return {
		toolInvocationToken: {} as vscode.ChatParticipantToolToken
	};
}

function createInput(questions: AskUserQuestionInput['questions']): AskUserQuestionInput {
	return { questions } as AskUserQuestionInput;
}

describe('AskUserQuestionHandler', () => {
	let store: DisposableStore;
	let mockToolsService: MockToolsService;
	let handler: AskUserQuestionHandler;

	beforeEach(() => {
		store = new DisposableStore();
		const serviceCollection = store.add(createExtensionUnitTestingServices());

		mockToolsService = new MockToolsService();
		serviceCollection.set(IToolsService, mockToolsService);

		const accessor = serviceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		handler = instantiationService.createInstance(AskUserQuestionHandler);
	});

	it('invokes CoreAskQuestions tool with input', async () => {
		const input = createInput([{
			question: 'Which framework?',
			header: 'Framework',
			options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
			multiSelect: false,
		}]);

		mockToolsService.setResult({
			answers: {
				Framework: { selected: ['React'], freeText: null, skipped: false }
			}
		});

		await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(mockToolsService.invokeToolCalls.length).toBe(1);
		expect(mockToolsService.invokeToolCalls[0].name).toBe(ToolName.CoreAskQuestions);
		expect(mockToolsService.invokeToolCalls[0].input).toBe(input);
	});

	it('transforms answers from header-keyed to question-text-keyed', async () => {
		const input = createInput([{
			question: 'Which framework do you prefer?',
			header: 'Framework',
			options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
			multiSelect: false,
		}]);

		mockToolsService.setResult({
			answers: {
				Framework: { selected: ['React'], freeText: null, skipped: false }
			}
		});

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('allow');
		if (result.behavior === 'allow') {
			const answers = result.updatedInput.answers as Record<string, string>;
			expect(answers['Which framework do you prefer?']).toBe('React');
			expect(answers['Framework']).toBeUndefined();
		}
	});

	it('combines selected options and free text', async () => {
		const input = createInput([{
			question: 'What features do you want?',
			header: 'Features',
			options: [{ label: 'Auth', description: '' }, { label: 'DB', description: '' }],
			multiSelect: true,
		}]);

		mockToolsService.setResult({
			answers: {
				Features: { selected: ['Auth', 'DB'], freeText: 'also caching', skipped: false }
			}
		});

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('allow');
		if (result.behavior === 'allow') {
			const answers = result.updatedInput.answers as Record<string, string>;
			expect(answers['What features do you want?']).toBe('Auth, DB, also caching');
		}
	});

	it('excludes skipped questions from answers', async () => {
		const input = createInput([
			{
				question: 'Which framework?',
				header: 'Framework',
				options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
				multiSelect: false,
			},
			{
				question: 'Which database?',
				header: 'Database',
				options: [{ label: 'Postgres', description: '' }, { label: 'MySQL', description: '' }],
				multiSelect: false,
			},
		]);

		mockToolsService.setResult({
			answers: {
				Framework: { selected: ['React'], freeText: null, skipped: false },
				Database: { selected: [], freeText: null, skipped: true }
			}
		});

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('allow');
		if (result.behavior === 'allow') {
			const answers = result.updatedInput.answers as Record<string, string>;
			expect(answers['Which framework?']).toBe('React');
			expect(answers['Which database?']).toBeUndefined();
		}
	});

	it('denies when all questions are skipped', async () => {
		const input = createInput([{
			question: 'Which framework?',
			header: 'Framework',
			options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
			multiSelect: false,
		}]);

		mockToolsService.setResult({
			answers: {
				Framework: { selected: [], freeText: null, skipped: true }
			}
		});

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('deny');
		if (result.behavior === 'deny') {
			expect(result.message).toBe('The user cancelled the question');
		}
	});

	it('denies when tool returns empty content', async () => {
		const input = createInput([{
			question: 'Which framework?',
			header: 'Framework',
			options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
			multiSelect: false,
		}]);

		mockToolsService.setEmptyResult();

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('deny');
		if (result.behavior === 'deny') {
			expect(result.message).toBe('The user cancelled the question');
		}
	});

	it('denies when tool throws', async () => {
		const input = createInput([{
			question: 'Which framework?',
			header: 'Framework',
			options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
			multiSelect: false,
		}]);

		mockToolsService.setShouldThrow();

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('deny');
		if (result.behavior === 'deny') {
			expect(result.message).toBe('The user cancelled the question');
		}
	});

	it('preserves original input in updatedInput alongside answers', async () => {
		const input = createInput([{
			question: 'Which framework?',
			header: 'Framework',
			options: [{ label: 'React', description: '' }, { label: 'Vue', description: '' }],
			multiSelect: false,
		}]);

		mockToolsService.setResult({
			answers: {
				Framework: { selected: ['React'], freeText: null, skipped: false }
			}
		});

		const result = await handler.handle(ClaudeToolNames.AskUserQuestion, input, createMockContext());

		expect(result.behavior).toBe('allow');
		if (result.behavior === 'allow') {
			expect(result.updatedInput.questions).toBe(input.questions);
		}
	});
});
