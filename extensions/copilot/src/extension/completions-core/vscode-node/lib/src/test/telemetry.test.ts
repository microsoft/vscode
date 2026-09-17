/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import Sinon from 'sinon';
import { ICompletionsTelemetryService } from '../../../bridge/src/completionsTelemetryServiceBridge';
import { ICompletionsTelemetryReporters, telemetryCatch, TelemetryData, TelemetryStore } from '../telemetry';
import { ICompletionsTelemetryUserConfigService } from '../telemetry/userConfig';
import { ICompletionsPromiseQueueService } from '../util/promiseQueue';
import { createLibTestingContext } from './context';
import { NoopCopilotTelemetryReporter } from './noopTelemetry';
import { withInMemoryTelemetry } from './telemetry';

suite('Telemetry unit tests', function () {
	const accessor = createLibTestingContext().createTestingAccessor();
	let clock: Sinon.SinonFakeTimers;

	setup(function () {
		clock = Sinon.useFakeTimers();
	});

	teardown(function () {
		clock.restore();
	});

	test('Adds additional fields', async function () {
		const telemetry = TelemetryData.createAndMarkAsIssued();

		await telemetry.makeReadyForSending(accessor, TelemetryStore.Standard, 'SkipExp', 2000);

		assert.ok(telemetry.properties.copilot_build);
		assert.ok(telemetry.properties.copilot_buildType);
		// assert.ok(telemetry.properties.copilot_trackingId);
		assert.ok(telemetry.properties.editor_version);
		assert.ok(telemetry.properties.editor_plugin_version);
		assert.ok(telemetry.properties.client_machineid);
		assert.ok(telemetry.properties.client_sessionid);
		assert.ok(telemetry.properties.copilot_version);
		assert.ok(telemetry.properties.runtime_version);
		assert.ok(telemetry.properties.common_extname);
		assert.ok(telemetry.properties.common_extversion);
		assert.ok(telemetry.properties.common_vscodeversion);
		// assert.ok(telemetry.properties.proxy_enabled);
		// assert.ok(telemetry.properties.proxy_auth);
		// assert.ok(telemetry.properties.proxy_kerberos_spn);
		// assert.ok(telemetry.properties.reject_unauthorized);
		assert.ok(telemetry.properties.unique_id);
	});

	test('Telemetry user config has undefined tracking id', function () {
		const accessor = createLibTestingContext().createTestingAccessor();
		const config = accessor.get(ICompletionsTelemetryUserConfigService);

		assert.strictEqual(config.trackingId, undefined);
	});

	test('Test for multiplexProperties with only short values', function () {
		const properties = {
			key1: 'short value',
			key2: 'another short value',
		};

		const result = TelemetryData.multiplexProperties(properties);

		assert.deepEqual(result, properties);
	});

	test('Test for multiplexProperties with a long value', function () {
		const longValue = 'a'.repeat(19000) + 'b';
		const properties = {
			key1: longValue,
		};

		const result = TelemetryData.multiplexProperties(properties);

		assert.strictEqual(Object.keys(result).length, 3);
		assert.strictEqual(result.key1.length, 8192);
		assert.strictEqual(result.key1_02.length, 8192);
		assert.strictEqual(result.key1_03.length, 19001 - 16384);
		// The last character should be 'b' if we sliced correctly
		assert.strictEqual(result.key1_03.slice(-1), 'b');
	});

	test('telemetryCatch', async function () {
		const { enhancedReporter } = await withInMemoryTelemetry(accessor, accessor => {
			telemetryCatch(
				accessor.get(ICompletionsTelemetryService),
				accessor.get(ICompletionsPromiseQueueService),
				() => {
					throw new Error('boom!');
				},
				'exceptionTest'
			)();
		});

		// Chat has no Telemetry Store.

		// const standardEvent = reporter.events[0];
		// assert.ok(standardEvent);
		const enhancedEvent = enhancedReporter.events[0];
		assert.ok(enhancedEvent);

		// assert.deepStrictEqual(standardEvent.properties.message, 'boom!');

		assert.deepStrictEqual(enhancedEvent.properties.message, 'boom!');

		// assert.ok(standardEvent.properties.restricted_unique_id);
		// assert.deepStrictEqual(enhancedEvent.properties.unique_id, standardEvent.properties.restricted_unique_id);
	});
});

suite('TelemetryReporters unit tests', function () {
	test('deactivate is safe to call synchronously', async function () {
		const accessor = createLibTestingContext().createTestingAccessor();
		const oldRepoter = new NoopCopilotTelemetryReporter();
		const oldRestrictedReporter = new NoopCopilotTelemetryReporter();
		const reporters = accessor.get(ICompletionsTelemetryReporters);
		reporters.setReporter(oldRepoter);
		reporters.setEnhancedReporter(oldRestrictedReporter);

		const asyncWork = reporters.deactivate();
		const updatedReporter = reporters.getReporter(accessor); // snapshot these before awaiting the result
		const updatedEnhancedReporter = reporters.getEnhancedReporter(accessor);
		await asyncWork;

		assert.strictEqual(updatedReporter, undefined);
		assert.strictEqual(updatedEnhancedReporter, undefined);
	});
});
