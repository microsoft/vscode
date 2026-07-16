/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { CopilotGitHubTelemetryForwarder } from '../../node/copilot/copilotGitHubTelemetryForwarder.js';

interface CapturedEvent {
	eventName: string;
	data: ITelemetryData | undefined;
}

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sendErrorTelemetry = true;
	readonly sessionId = 'sessionId';
	readonly machineId = 'machineId';
	readonly sqmId = 'sqmId';
	readonly devDeviceId = 'devDeviceId';
	readonly firstSessionDate = 'firstSessionDate';
	readonly events: CapturedEvent[] = [];

	publicLog(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLog2(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('CopilotGitHubTelemetryForwarder', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards a standard event to VS Code telemetry', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);

		forwarder.forward({
			sessionId: 'notification-session',
			restricted: false,
			event: {
				kind: 'tool_call_executed',
				created_at: '2026-07-10T12:00:00Z',
				model_call_id: 'model-call',
				properties: { tool_name: 'grep' },
				metrics: { duration_ms: 42 },
				exp_assignment_context: 'experiment',
				features: { featureA: 'enabled' },
				copilot_tracking_id: 'tracking-id',
				client: {
					cli_version: '1.0.69',
					os_platform: 'win32',
					os_version: '11',
					os_arch: 'x64',
					node_version: '24.0.0',
					is_staff: true,
				},
			},
		});

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'copilotCli/tool_call_executed',
			data: {
				cli_version: '1.0.69',
				os_platform: 'win32',
				os_version: '11',
				os_arch: 'x64',
				node_version: '24.0.0',
				is_staff: true,
				tool_name: 'grep',
				duration_ms: 42,
				created_at: '2026-07-10T12:00:00Z',
				model_call_id: 'model-call',
				exp_assignment_context: 'experiment',
				session_id: 'notification-session',
				sdk_session_id: 'notification-session',
				copilot_tracking_id: 'tracking-id',
				kind: 'tool_call_executed',
				restricted: false,
				'feature.featureA': 'enabled',
			},
		}]);
	});

	test('gates restricted events on the restricted telemetry option', () => {
		const telemetryService = new TestTelemetryService();
		let restrictedTelemetryEnabled = false;
		const forwarder = new CopilotGitHubTelemetryForwarder(() => restrictedTelemetryEnabled, telemetryService);
		const notification: GitHubTelemetryNotification = {
			sessionId: 'session',
			restricted: true,
			event: {
				kind: 'restricted_event',
				properties: {},
				metrics: {},
			},
		};

		forwarder.forward(notification);
		restrictedTelemetryEnabled = true;
		forwarder.forward(notification);

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'copilotCli/restricted_event',
			data: {
				created_at: undefined,
				model_call_id: undefined,
				exp_assignment_context: undefined,
				session_id: 'session',
				sdk_session_id: 'session',
				copilot_tracking_id: undefined,
				kind: 'restricted_event',
				restricted: true,
			},
		}]);
	});
});
