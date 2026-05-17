/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentHostTelemetryLevelConfigKey, telemetryLevelToAgentHostConfigValue } from '../../common/agentHostSchema.js';
import { AgentHostTelemetryService, updateAgentHostTelemetryLevelFromConfig } from '../../node/agentHostTelemetryService.js';

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	telemetryLevel = TelemetryLevel.USAGE;
	sendErrorTelemetry = true;
	sessionId = 'sessionId';
	machineId = 'machineId';
	sqmId = 'sqmId';
	devDeviceId = 'devDeviceId';
	firstSessionDate = 'firstSessionDate';
	readonly events: { eventName: string; data: ITelemetryData | undefined }[] = [];
	readonly errorEvents: { eventName: string; data: ITelemetryData | undefined }[] = [];

	publicLog(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}

	publicLogError(eventName: string, data?: ITelemetryData): void {
		this.errorEvents.push({ eventName, data });
	}

	publicLog2(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}

	publicLogError2(eventName: string, data?: ITelemetryData): void {
		this.errorEvents.push({ eventName, data });
	}

	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('AgentHostTelemetryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('permanently disables usage and error telemetry after TelemetryLevel.NONE', async () => {
		const delegate = new TestTelemetryService();
		const service = disposables.add(new AgentHostTelemetryService(delegate));

		service.publicLog('beforeDisable', { count: 1 });
		service.updateTelemetryLevel(TelemetryLevel.NONE);
		service.updateTelemetryLevel(TelemetryLevel.USAGE);
		service.publicLog2('afterDisable');
		service.publicLogError2('afterDisableError');
		service.publicLog('afterDisableAsync', { count: 4 });
		service.publicLogError('afterDisableErrorAsync', { count: 5 });

		assert.deepStrictEqual({
			telemetryLevel: service.telemetryLevel,
			sendErrorTelemetry: service.sendErrorTelemetry,
			events: delegate.events,
			errorEvents: delegate.errorEvents,
		}, {
			telemetryLevel: TelemetryLevel.NONE,
			sendErrorTelemetry: false,
			events: [{ eventName: 'beforeDisable', data: { count: 1 } }],
			errorEvents: [],
		});
	});

	test('uses most restrictive client telemetry level', () => {
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService()));

		service.updateTelemetryLevel(TelemetryLevel.ERROR);
		service.updateTelemetryLevel(TelemetryLevel.USAGE);

		assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);
	});

	test('updates telemetry level from root config string enum', () => {
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService()));

		updateAgentHostTelemetryLevelFromConfig(service, {
			[AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.ERROR),
		});

		assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);
	});
});
