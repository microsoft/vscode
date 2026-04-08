/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { StaticChatMLFetcher } from '../../../../platform/chat/test/common/staticChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { NullWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/nullWorkspaceFileIndex';
import { IWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { Conversation, ICopilotChatResultIn, Turn, TurnStatus } from '../../../prompt/common/conversation';
import { IToolCall } from '../../../prompt/common/intents';
import { ToolCallRound } from '../../../prompt/common/toolCallRound';
import { ChatTelemetryBuilder } from '../../../prompt/node/chatParticipantTelemetry';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { MockChatResponseStream, TestChatRequest } from '../../../test/node/testHelpers';
import { ToolName } from '../../../tools/common/toolNames';
import { AgentIntent } from '../agentIntent';

describe('AgentIntent /summarize command', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let configService: IConfigurationService;
	let chatResponse: string[] = [];

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceFileIndex, new SyncDescriptor(NullWorkspaceFileIndex));
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[
				[URI.file('/workspace')],
				[]
			]
		));
		chatResponse = [];
		services.define(IChatMLFetcher, new StaticChatMLFetcher(chatResponse));
		accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		configService = accessor.get(IConfigurationService);
	});

	afterAll(() => {
		accessor.dispose();
	});

	beforeEach(() => {
		// Reset config to enabled by default
		configService.setConfig(ConfigKey.SummarizeAgentConversationHistory, true);
		chatResponse.length = 0;
		chatResponse.push('This is a test summary of the conversation.');
	});

	const token = {
		isCancellationRequested: false,
		onCancellationRequested: Event.None,
	};

	async function runSummarize(conversation: Conversation) {
		const intent = instantiationService.createInstance(AgentIntent);
		const request = new TestChatRequest('');
		request.command = 'compact';
		const stream = new MockChatResponseStream();

		const chatTelemetry = instantiationService.createInstance(
			ChatTelemetryBuilder,
			Date.now(),
			'sessionId',
			undefined,
			true,
			request,
			undefined,
		);

		const result = await intent.handleRequest(
			conversation,
			request,
			stream,
			token,
			undefined,
			'agent',
			ChatLocation.Agent,
			chatTelemetry,
			() => false
		);

		return { result, stream };
	}

	function createEditFileToolCall(idx: number): IToolCall {
		return {
			id: `tooluse_${idx}`,
			name: ToolName.EditFile,
			arguments: JSON.stringify({
				filePath: '/workspace/file.ts',
				code: `console.log('edit ${idx}')`
			})
		};
	}

	function createEditFileToolResult(...idxs: number[]): Record<string, LanguageModelToolResult> {
		const result: Record<string, LanguageModelToolResult> = {};
		for (const idx of idxs) {
			result[`tooluse_${idx}`] = new LanguageModelToolResult([new LanguageModelTextPart('success')]);
		}
		return result;
	}

	function createConversationWithHistory(): Conversation {
		// Create a previous turn with tool call rounds
		const previousTurn = new Turn('turn1', { type: 'user', message: 'Create a file for me' });
		const previousTurnResult: ICopilotChatResultIn = {
			metadata: {
				toolCallRounds: [
					new ToolCallRound('Created the file', [createEditFileToolCall(1)], undefined, 'toolCallRoundId1'),
				],
				toolCallResults: createEditFileToolResult(1),
			}
		};
		previousTurn.setResponse(TurnStatus.Success, { type: 'model', message: 'Done!' }, 'responseId1', previousTurnResult);

		// Create the current turn (the /summarize command turn)
		const currentTurn = new Turn('turn2', { type: 'user', message: '/summarize' });

		return new Conversation('sessionId', [previousTurn, currentTurn]);
	}

	function createConversationWithNoHistory(): Conversation {
		// Just the current /summarize turn, no prior history
		const currentTurn = new Turn('turn1', { type: 'user', message: '/summarize' });
		return new Conversation('sessionId', [currentTurn]);
	}

	test('returns summary metadata when enabled and history exists', async () => {
		const conversation = createConversationWithHistory();
		const { result } = await runSummarize(conversation);

		// Should have summary metadata
		expect(result.metadata).toBeDefined();
		expect(result.metadata?.summary).toBeDefined();
		expect(result.metadata?.summary?.toolCallRoundId).toBe('toolCallRoundId1');
		expect(result.metadata?.summary?.text).toBeTruthy();
	});

	test('summarizes even when auto-summarize setting is disabled', async () => {
		// Disable auto-summarization - /compact should still work since it's an explicit user action
		configService.setConfig(ConfigKey.SummarizeAgentConversationHistory, false);
		const conversation = createConversationWithHistory();
		const { result } = await runSummarize(conversation);

		// Should still have summary metadata since /compact is explicit
		expect(result.metadata).toBeDefined();
		expect(result.metadata?.summary).toBeDefined();
		expect(result.metadata?.summary?.toolCallRoundId).toBe('toolCallRoundId1');
		expect(result.metadata?.summary?.text).toBeTruthy();
	});

	test('returns friendly message when no history exists', async () => {
		const conversation = createConversationWithNoHistory();
		const { result, stream } = await runSummarize(conversation);

		// Should not have summary metadata
		expect(result.metadata?.summary).toBeUndefined();

		// Should have output with "Nothing to compact" message
		expect(stream.output.some(msg => msg.toLowerCase().includes('nothing to compact'))).toBe(true);
	});
});
