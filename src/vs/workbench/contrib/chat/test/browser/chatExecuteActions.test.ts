/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatRequestModel } from '../../common/chatModel.js';
import { ChatConfiguration } from '../../common/constants.js';
import { CreateRemoteAgentJobAction } from '../../browser/actions/chatExecuteActions.js';

interface MockChatRequestModel extends Partial<IChatRequestModel> {
	id: string;
	message: { text: string };
	response?: {
		agent?: { id: string };
		slashCommand?: { name: string };
		response: { value: any };
		result?: any;
	};
	variableData: any;
	editedFileEvents?: any;
}

suite('CreateRemoteAgentJobAction History Cutoff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let configurationService: IConfigurationService;
	let action: CreateRemoteAgentJobAction;

	setup(() => {
		configurationService = new TestConfigurationService();
		action = new CreateRemoteAgentJobAction();
	});

	function createMockRequest(id: string, text: string, agentId?: string): MockChatRequestModel {
		return {
			id,
			message: { text },
			response: agentId ? {
				agent: { id: agentId },
				response: { value: 'response' },
				result: {}
			} : undefined,
			variableData: {},
			editedFileEvents: []
		};
	}

	test('should apply max limit cutoff when no coding agent found', () => {
		const requests: MockChatRequestModel[] = [];
		for (let i = 0; i < 25; i++) {
			requests.push(createMockRequest(`req${i}`, `Message ${i}`, 'regular-agent'));
		}

		configurationService.setUserConfiguration(ChatConfiguration.MaxHistoryEntriesForRemoteAgent, 10);

		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'max-limit');
		assert.strictEqual(result.originalCount, 25);
		assert.strictEqual(result.filteredCount, 10);
		assert.strictEqual(result.filteredRequests.length, 10);
		// Should get the last 10 requests
		assert.strictEqual(result.filteredRequests[0].id, 'req15');
		assert.strictEqual(result.filteredRequests[9].id, 'req24');
	});

	test('should apply coding agent cutoff when coding agent found', () => {
		const requests: MockChatRequestModel[] = [
			createMockRequest('req0', 'First message', 'regular-agent'),
			createMockRequest('req1', 'Second message', 'regular-agent'),
			createMockRequest('req2', 'Third message', 'coding-agent'),
			createMockRequest('req3', 'Fourth message', 'regular-agent'),
			createMockRequest('req4', 'Fifth message', 'regular-agent')
		];

		configurationService.setUserConfiguration(ChatConfiguration.MaxHistoryEntriesForRemoteAgent, 10);

		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'coding-agent');
		assert.strictEqual(result.originalCount, 5);
		assert.strictEqual(result.filteredCount, 3);
		assert.strictEqual(result.filteredRequests.length, 3);
		// Should start from the coding agent message
		assert.strictEqual(result.filteredRequests[0].id, 'req2');
		assert.strictEqual(result.filteredRequests[2].id, 'req4');
	});

	test('should detect remote agent as coding agent', () => {
		const requests: MockChatRequestModel[] = [
			createMockRequest('req0', 'First message', 'regular-agent'),
			createMockRequest('req1', 'Second message', 'remote-coding-agent'),
			createMockRequest('req2', 'Third message', 'regular-agent')
		];

		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'coding-agent');
		assert.strictEqual(result.filteredCount, 2);
		assert.strictEqual(result.filteredRequests[0].id, 'req1');
	});

	test('should detect delegate message as coding agent trigger', () => {
		const requests: MockChatRequestModel[] = [
			createMockRequest('req0', 'First message', 'regular-agent'),
			createMockRequest('req1', 'Please delegate this task', 'regular-agent'),
			createMockRequest('req2', 'Third message', 'regular-agent')
		];

		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'coding-agent');
		assert.strictEqual(result.filteredCount, 2);
		assert.strictEqual(result.filteredRequests[0].id, 'req1');
	});

	test('should use most recent coding agent when multiple found', () => {
		const requests: MockChatRequestModel[] = [
			createMockRequest('req0', 'First message', 'coding-agent-1'),
			createMockRequest('req1', 'Second message', 'regular-agent'),
			createMockRequest('req2', 'Third message', 'coding-agent-2'),
			createMockRequest('req3', 'Fourth message', 'regular-agent')
		];

		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'coding-agent');
		assert.strictEqual(result.filteredCount, 2);
		// Should start from the most recent coding agent (req2)
		assert.strictEqual(result.filteredRequests[0].id, 'req2');
	});

	test('should apply no cutoff when history is within limit and no coding agent', () => {
		const requests: MockChatRequestModel[] = [
			createMockRequest('req0', 'First message', 'regular-agent'),
			createMockRequest('req1', 'Second message', 'regular-agent')
		];

		configurationService.setUserConfiguration(ChatConfiguration.MaxHistoryEntriesForRemoteAgent, 10);

		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'none');
		assert.strictEqual(result.originalCount, 2);
		assert.strictEqual(result.filteredCount, 2);
		assert.strictEqual(result.filteredRequests.length, 2);
	});

	test('should use default limit when configuration not set', () => {
		const requests: MockChatRequestModel[] = [];
		for (let i = 0; i < 25; i++) {
			requests.push(createMockRequest(`req${i}`, `Message ${i}`, 'regular-agent'));
		}

		// Don't set the configuration, should use default of 20
		const result = (action as any).applyCutoffToHistory(requests, configurationService);

		assert.strictEqual(result.cutoffApplied, 'max-limit');
		assert.strictEqual(result.filteredCount, 20);
		// Should get the last 20 requests
		assert.strictEqual(result.filteredRequests[0].id, 'req5');
		assert.strictEqual(result.filteredRequests[19].id, 'req24');
	});
});