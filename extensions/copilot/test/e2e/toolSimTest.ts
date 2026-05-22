/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IToolCall } from '../../src/extension/prompt/common/intents';
import { ToolName } from '../../src/extension/tools/common/toolNames';
import { IToolsService } from '../../src/extension/tools/common/toolsService';
import { NoopTestToolsService } from '../../src/extension/tools/node/test/testToolsService';
import { IConfigurationService } from '../../src/platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../src/platform/configuration/test/common/inMemoryConfigurationService';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { SimulationTestFunction } from '../base/stest';
import { KeywordPredicate, validate } from '../base/validate';
import { fetchConversationScenarios, IConversationTestCase, Scenario } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

export type ToolScenarioEvaluator = (
	accessor: ITestingServicesAccessor,
	question: string,
	toolCalls: any[]
) => Promise<void>;

export interface IParsedToolCall {
	name: string;
	input: unknown;
	id: string;
}

export interface IToolCallExpectation {
	allowParallelToolCalls?: boolean;

	/**
	 * Validate tool results with a callback.
	 */
	toolCallValidators?: Partial<Record<ToolName, (toolCall: IParsedToolCall[]) => void | Promise<void>>>;
}

export function generateToolTestRunner(toolScenario: IConversationToolTestCase | ToolScenario, expectedToolCalls?: IToolCallExpectation): SimulationTestFunction {
	if (!Array.isArray(toolScenario)) {
		toolScenario = [toolScenario];
	}

	return async (testingServiceCollection) => {
		testingServiceCollection.define(IToolsService, new SyncDescriptor(NoopTestToolsService));

		if (toolScenario.length !== 1) {
			throw new Error('Tool test cases must only have one scenario');
		}
		const testCase = toolScenario[0];
		testCase.question = ensureSlashEditAgent(testCase.question);
		testCase.setupCase = accessor => {
			(accessor.get(IConfigurationService) as InMemoryConfigurationService).setNonExtensionConfig('chat.agent.maxRequests', 0);
		};

		// Apply default name
		const scenario: Scenario = toolScenario.map(testCase => ({
			...testCase,
			name: testCase.name ?? testCase.question,
		}));

		return generateScenarioTestRunner(scenario, async (accessor, question, userVisibleAnswer, rawResponse, turn, scenarioIndex, commands) => {
			const toolCalls = turn?.resultMetadata?.toolCallRounds;
			if (!toolCalls || toolCalls.length === 0) {
				return { success: false, errorMessage: 'No tool calls were made.' };
			}

			if (toolCalls.length !== 1) {
				return { success: false, errorMessage: `Multiple tool call rounds, this shouldn't've happened.` };
			}

			await validateToolCallExpectation(accessor, testCase, expectedToolCalls, toolCalls[0].toolCalls);
			return { success: true };
		})(testingServiceCollection);
	};
}

async function validateToolCallExpectation(accessor: ITestingServicesAccessor, testCase: IConversationToolTestCase, expectation: IToolCallExpectation | undefined, toolCalls: IToolCall[]): Promise<void> {
	const toolsService = accessor.get(IToolsService);

	const expectedAnyOfToolNames = testCase.expectedToolCalls && new Set(
		typeof testCase.expectedToolCalls === 'string' ?
			[testCase.expectedToolCalls] :
			testCase.expectedToolCalls.anyOf);

	const toolCallsByName = new Map<ToolName, IParsedToolCall[]>();
	for (const toolCall of toolCalls) {
		if (expectedAnyOfToolNames) {
			if (!expectedAnyOfToolNames.has(toolCall.name as ToolName)) {
				throw new Error(`Tool call name "${toolCall.name}" does not match expected tool call names (${Array.from(expectedAnyOfToolNames).join(', ')}).`);
			}

			if (!expectation?.allowParallelToolCalls) {
				// Add a flag if we need to support multiple calls to the same tool
				expectedAnyOfToolNames.delete(toolCall.name as ToolName);
			}
		}

		const validationResult = toolsService.validateToolInput(toolCall.name, toolCall.arguments);
		if ('error' in validationResult) {
			throw new Error(`Tool call input "${JSON.stringify(toolCall.arguments)}" is invalid: ${validationResult.error}`);
		}

		const toolName = toolCall.name as ToolName;
		const parsedToolCall: IParsedToolCall = {
			...toolCall,
			input: validationResult.inputObj as object
		};
		toolCallsByName.set(toolName, toolCallsByName.get(toolName) ?? []);
		toolCallsByName.get(toolName)?.push(parsedToolCall);

		if (testCase.toolInputValues) {
			Object.keys(testCase.toolInputValues).forEach(key => {
				const argValue = (parsedToolCall.input as any)[key];
				const keyword = testCase.toolInputValues![key]!;
				if (typeof keyword === 'boolean') {
					assert.strictEqual(argValue, keyword, key);
					return;
				}

				if (typeof argValue !== 'string') {
					throw new Error(`Tool call input arg "${key}" must be a string to use toolInputValues. Got: ${JSON.stringify(argValue)}`);
				}

				const err = validate(argValue, keyword);
				if (err) {
					throw new Error(err);
				}
			});
		}
	}

	for (const [toolName, toolCalls] of toolCallsByName) {
		const validator = expectation?.toolCallValidators?.[toolName];
		if (validator) {
			await validator(toolCalls);
		}
	}
}

/**
 * JSON extensions for tool test cases.
 */
export interface IConversationToolTestCase extends Omit<IConversationTestCase, 'name'> {
	name?: string;
	expectedToolCalls?: ToolName | { anyOf: ToolName[] };
	toolInputValues?: Record<string, object | boolean | KeywordPredicate[]>;
}

export type ToolScenario = IConversationToolTestCase[];

export function fetchToolScenarios(scenarioFolderPath: string): ToolScenario[] {
	const scenarios = fetchConversationScenarios(scenarioFolderPath);
	return scenarios.map(scenario => {
		return scenario.map<IConversationToolTestCase>(testCase => {
			if (!testCase.json.expectedToolCalls) {
				throw new Error(`Tool test case "${testCase.name}" must define expectedToolCalls.`);
			}

			return {
				...testCase,
				expectedToolCalls: testCase.json.expectedToolCalls,
			};
		});
	});
}

function ensureSlashEditAgent(question: string): string {
	if (question.startsWith('/editAgent')) {
		return question;
	}
	return '/editAgent ' + question;
}