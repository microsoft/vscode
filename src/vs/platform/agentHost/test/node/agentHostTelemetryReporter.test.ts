/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession } from '../../common/agentService.js';
import type { ToolDefinition } from '../../common/state/protocol/state.js';
import { IAgentHostRestrictedTelemetry, TelemetryMeasurements, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';

interface IRestrictedCall {
	eventName: string;
	properties: TelemetryProps | undefined;
}

class TestRestrictedTelemetryService implements ITelemetryService, IAgentHostRestrictedTelemetry {
	declare readonly _serviceBrand: undefined;

	telemetryLevel = TelemetryLevel.USAGE;
	sendErrorTelemetry = true;
	sessionId = 'sessionId';
	machineId = 'machineId';
	sqmId = 'sqmId';
	devDeviceId = 'devDeviceId';
	firstSessionDate = 'firstSessionDate';

	readonly enhancedEvents: IRestrictedCall[] = [];
	readonly internalEvents: IRestrictedCall[] = [];

	publicLog(): void { }
	publicLogError(): void { }
	publicLog2(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }

	sendGHTelemetryEvent(): void { }
	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, _measurements?: TelemetryMeasurements): void {
		this.enhancedEvents.push({ eventName, properties });
	}
	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, _measurements?: TelemetryMeasurements): void {
		this.internalEvents.push({ eventName, properties });
	}
	setCopilotTrackingId(): void { }
	setRestrictedTelemetryEndpoint(): void { }
	setRestrictedTelemetryEnabled(): void { }
}

suite('AgentHostTelemetryReporter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'agent-session://copilot/abc';
	const tools: ToolDefinition[] = [{ name: 'grep' }, { name: 'edit' }];

	test('assistantMessageReceived emits request.options.tools keyed on the service request id, and no-ops without one or without tools', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.assistantMessageReceived(session, undefined, tools); // dropped: no service request id
		reporter.assistantMessageReceived(session, 'svc-1', []); // dropped: no tools
		reporter.assistantMessageReceived(session, 'svc-1', tools); // emitted

		assert.deepStrictEqual(service.enhancedEvents, [{
			eventName: 'request.options.tools',
			properties: {
				headerRequestId: 'svc-1',
				conversationId: AgentSession.id(session),
				messagesJson: JSON.stringify(tools),
			},
		}]);
	});

	test('userMessageText emits conversation.messageText (source=user) to enhanced + internal, and no-ops on empty content', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.userMessageText(session, '', 3); // dropped: no content
		reporter.userMessageText(session, 'hello agent', 3); // emitted

		const expected: IRestrictedCall = {
			eventName: 'conversation.messageText',
			properties: {
				source: 'user',
				conversationId: AgentSession.id(session),
				turnIndex: '3',
				messageText: 'hello agent',
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('modelMessageText emits conversation.messageText (source=model) with headerRequestId, and no-ops on empty content', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.modelMessageText(session, '', 3, 'svc-1'); // dropped: no content
		reporter.modelMessageText(session, 'sure, here you go', 3, 'svc-1'); // emitted

		const expected: IRestrictedCall = {
			eventName: 'conversation.messageText',
			properties: {
				source: 'model',
				conversationId: AgentSession.id(session),
				turnIndex: '3',
				headerRequestId: 'svc-1',
				messageText: 'sure, here you go',
			},
		};
		assert.deepStrictEqual(service.enhancedEvents, [expected]);
		assert.deepStrictEqual(service.internalEvents, [expected]);
	});

	test('toolCallDetails emits toolCallDetailsExternal + toolCallDetailsInternal aggregate whenever tools were available, and no-ops when none were', () => {
		const service = new TestRestrictedTelemetryService();
		const reporter = new AgentHostTelemetryReporter(service);

		reporter.toolCallDetails({
			session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', model: 'gpt-x', responseType: 'success',
			toolCounts: {}, availableTools: [],
			numRequests: 1, totalToolCalls: 0, parallelToolCallRounds: 0, parallelToolCallsTotal: 0,
		}); // dropped: no tools were available
		reporter.toolCallDetails({
			session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', model: 'gpt-x', responseType: 'success',
			toolCounts: {}, availableTools: ['grep', 'edit'],
			numRequests: 1, totalToolCalls: 0, parallelToolCallRounds: 0, parallelToolCallsTotal: 0,
		}); // emitted: tools available, even though no tool calls were made
		reporter.toolCallDetails({
			session, turnId: 'a1b2c3d4-0000-4000-8000-000000000000', model: 'gpt-x', responseType: 'success',
			toolCounts: { grep: 2, edit: 1 }, availableTools: ['grep', 'edit'],
			numRequests: 2, totalToolCalls: 3, parallelToolCallRounds: 1, parallelToolCallsTotal: 2,
		}); // emitted

		assert.deepStrictEqual(service.enhancedEvents, [{
			eventName: 'toolCallDetailsExternal',
			properties: {
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				messageId: 'a1b2c3d4-0000-4000-8000-000000000000',
				responseType: 'success',
				model: 'gpt-x',
				toolCounts: JSON.stringify({}),
				availableTools: JSON.stringify(['grep', 'edit']),
			},
		}, {
			eventName: 'toolCallDetailsExternal',
			properties: {
				conversationId: AgentSession.id(session),
				requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
				messageId: 'a1b2c3d4-0000-4000-8000-000000000000',
				responseType: 'success',
				model: 'gpt-x',
				toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
				availableTools: JSON.stringify(['grep', 'edit']),
			},
		}]);
		assert.strictEqual(service.internalEvents.length, 2);
		assert.strictEqual(service.internalEvents[0].eventName, 'toolCallDetailsInternal');
		assert.strictEqual(service.internalEvents[1].eventName, 'toolCallDetailsInternal');
	});
});
