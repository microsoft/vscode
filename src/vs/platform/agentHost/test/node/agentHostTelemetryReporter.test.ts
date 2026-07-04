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
	sendInternalMSFTTelemetryEvent(): void { }
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
});
