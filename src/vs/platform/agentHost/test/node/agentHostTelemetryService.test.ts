/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentHostTelemetryLevelConfigKey, telemetryLevelToAgentHostConfigValue } from '../../common/agentHostSchema.js';
import { IAgentHostRestrictedTelemetry, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';
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

class TestRestrictedSink implements IAgentHostRestrictedTelemetry {
	readonly enhanced: string[] = [];
	readonly standard: string[] = [];
	readonly trackingIds: (string | undefined)[] = [];
	readonly endpoints: (string | undefined)[] = [];
	readonly enabledFlags: boolean[] = [];

	sendGHTelemetryEvent(eventName: string, _properties?: TelemetryProps): void {
		this.standard.push(eventName);
	}
	sendEnhancedGHTelemetryEvent(eventName: string, _properties?: TelemetryProps): void {
		this.enhanced.push(eventName);
	}
	sendInternalMSFTTelemetryEvent(): void { }
	setCopilotTrackingId(trackingId: string | undefined): void {
		this.trackingIds.push(trackingId);
	}
	setRestrictedTelemetryEndpoint(endpointUrl: string | undefined): void {
		this.endpoints.push(endpointUrl);
	}
	setRestrictedTelemetryEnabled(enabled: boolean): void {
		this.enabledFlags.push(enabled);
	}
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

	test('enhanced GH telemetry is gated on the restricted (rt) opt-in; standard GH telemetry is not', () => {
		const restricted = new TestRestrictedSink();
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService(), restricted));

		service.sendEnhancedGHTelemetryEvent('request.options.tools'); // dropped: rt disabled by default
		service.sendGHTelemetryEvent('completion'); // sent: standard GH telemetry is not rt-gated
		service.setRestrictedTelemetryEnabled(true);
		service.sendEnhancedGHTelemetryEvent('request.options.tools'); // sent: rt now enabled
		service.setCopilotTrackingId('tid-1');
		service.setRestrictedTelemetryEndpoint('https://ghe.example/telemetry');

		assert.deepStrictEqual({
			enhanced: restricted.enhanced,
			standard: restricted.standard,
			trackingIds: restricted.trackingIds,
			endpoints: restricted.endpoints,
		}, {
			enhanced: ['request.options.tools'],
			standard: ['completion'],
			trackingIds: ['tid-1'],
			endpoints: ['https://ghe.example/telemetry'],
		});
		// The rt opt-in is mirrored onto the sender (defense in depth), matching the extension's
		// opted-in-only restricted reporter.
		assert.deepStrictEqual(restricted.enabledFlags, [true]);
	});

	test('enhanced GH telemetry stays suppressed when telemetry is disabled, even for an rt=1 user', () => {
		const delegate = new TestTelemetryService();
		delegate.telemetryLevel = TelemetryLevel.ERROR; // user opted below USAGE
		const restricted = new TestRestrictedSink();
		const service = disposables.add(new AgentHostTelemetryService(delegate, restricted));

		service.setRestrictedTelemetryEnabled(true); // rt=1
		service.sendEnhancedGHTelemetryEvent('request.options.tools');
		service.sendGHTelemetryEvent('completion');

		// Neither standard nor enhanced GH telemetry is delegated below USAGE, regardless of rt.
		assert.deepStrictEqual({ enhanced: restricted.enhanced, standard: restricted.standard }, { enhanced: [], standard: [] });
	});
});
