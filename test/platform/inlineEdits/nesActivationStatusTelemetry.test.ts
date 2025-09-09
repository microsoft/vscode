/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NesActivationStatusTelemetryContribution } from '../../../src/vs/platform/inlineEdits/common/nesActivationStatusTelemetry.contribution.js';
import { ITelemetryService } from '../../../src/vs/platform/telemetry/common/telemetry.js';

class MockTelemetryService implements ITelemetryService {
	_serviceBrand: undefined = undefined;
	telemetryLevel: any = undefined;
	sessionId: string = 'test-session';
	machineId: string = 'test-machine';
	sqmId: string = 'test-sqm';
	devDeviceId: string = 'test-device';
	firstSessionDate: string = '2024-01-01';
	sendErrorTelemetry: boolean = true;

	public publicLogCalls: Array<{ eventName: string; data: any }> = [];
	public publicLogErrorCalls: Array<{ eventName: string; data: any }> = [];

	publicLog(eventName: string, data?: any): void {
		this.publicLogCalls.push({ eventName, data });
	}

	publicLog2<E, T>(eventName: string, data?: any): void {
		this.publicLogCalls.push({ eventName, data });
	}

	publicLogError(errorEventName: string, data?: any): void {
		this.publicLogErrorCalls.push({ eventName: errorEventName, data });
	}

	publicLogError2<E, T>(eventName: string, data?: any): void {
		this.publicLogErrorCalls.push({ eventName, data });
	}

	setExperimentProperty(): void { }
	setEnabled(): void { }
	getTelemetryInfo(): Promise<any> { return Promise.resolve({}); }
}

suite('NesActivationStatusTelemetryContribution', () => {
	let mockTelemetryService: MockTelemetryService;

	setup(() => {
		mockTelemetryService = new MockTelemetryService();
	});

	test('should use publicLog2 instead of publicLogError2 for activation status', () => {
		// Act: Create the contribution which triggers telemetry
		const contribution = new NesActivationStatusTelemetryContribution(mockTelemetryService);

		// Assert: Check that regular telemetry was used, not error telemetry
		assert.strictEqual(mockTelemetryService.publicLogCalls.length, 1, 'Should have one regular telemetry call');
		assert.strictEqual(mockTelemetryService.publicLogErrorCalls.length, 0, 'Should have no error telemetry calls');

		const telemetryCall = mockTelemetryService.publicLogCalls[0];
		assert.strictEqual(telemetryCall.eventName, 'nesActivationStatus', 'Should have correct event name');
		assert.strictEqual(telemetryCall.data.activated, true, 'Should include activation status');
		assert.strictEqual(telemetryCall.data.context, 'initialization', 'Should include context');
		assert.ok(typeof telemetryCall.data.timestamp === 'number', 'Should include numeric timestamp');

		// Cleanup
		contribution.dispose();
	});
});