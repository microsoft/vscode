/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isUUID } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LogLevel, NullLogService } from '../../../log/common/log.js';
import { TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { AgentHostStartupMarks, AgentHostStartupPerformance } from '../../node/agentHostStartupPerformance.js';
import { TestAgentHostStartupTelemetryService } from './testAgentHostStartupTelemetryService.js';

suite('AgentHostStartupPerformance', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('buffers named bootstrap marks and derives explicit predecessor durations under one host-lifetime UUID', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let now = 10;
		const marks = new AgentHostStartupMarks(() => now);
		marks.mark('bootstrapStart');
		now = 20;
		marks.mark('configuration', { since: 'bootstrapStart' });
		now = 30;
		marks.mark('telemetry', { since: 'configuration' });
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.VSCodeCLI, marks, telemetry, new NullLogService(), () => now));
		const beforeReporting = telemetry.events.length;
		now = 35;
		performance.mark('services', { since: 'telemetry' });
		performance.mark('bootstrap', { since: 'processStart' });
		const next = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.VSCodeCLI, undefined, new TestAgentHostStartupTelemetryService(), new NullLogService()));

		assert.deepStrictEqual({
			beforeReporting,
			validId: isUUID(performance.agentHostSessionId),
			freshId: next.agentHostSessionId !== performance.agentHostSessionId,
			commonId: telemetry.commonProperties.get('common.agentHostSessionId'),
			correlated: telemetry.events.every(event => event.eventName === 'agentHost.startupMark'
				&& event.data?.agentHostSessionId === marks.agentHostSessionId
				&& event.data?.hostLaunchKind === AgentHostLaunchKind.VSCodeCLI
				&& event.data?.provider === 'host'
				&& event.data?.attempt === 1
				&& event.data?.schemaVersion === 1),
			marks: telemetry.events.map(({ data }) => [data?.name, data?.timestampMs, data?.since, data?.durationMs]),
		}, {
			beforeReporting: 0,
			validId: true,
			freshId: true,
			commonId: marks.agentHostSessionId,
			correlated: true,
			marks: [
				['processStart', 0, undefined, undefined],
				['bootstrapStart', 10, undefined, undefined],
				['configuration', 20, 'bootstrapStart', 10],
				['telemetry', 30, 'configuration', 10],
				['services', 35, 'telemetry', 5],
				['bootstrap', 35, 'processStart', 35],
			],
		});
	});

	test('buffered bootstrap markers respect configured consent and are not replayed after opt-in', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let now = 10;
		const marks = new AgentHostStartupMarks(() => now);
		marks.mark('bootstrapStart');
		marks.mark('configuration', { since: 'bootstrapStart' });
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, marks, telemetry, new NullLogService(), () => now));
		const beforeConfiguration = telemetry.events.length;

		now = 20;
		telemetry.telemetryLevel = TelemetryLevel.NONE;
		performance.mark('bootstrap', { since: 'processStart' });
		const afterConfiguration = telemetry.events.length;
		now = 30;
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		performance.mark('bootstrap', { since: 'processStart' });
		performance.mark('hostReady', { since: 'processStart', outcome: 'success' });

		assert.deepStrictEqual({
			beforeConfiguration,
			afterConfiguration,
			markers: telemetry.events.map(({ data }) => [data?.name, data?.timestampMs, data?.since, data?.durationMs, data?.outcome]),
		}, {
			beforeConfiguration: 0,
			afterConfiguration: 0,
			markers: [['hostReady', 30, 'processStart', 30, 'success']],
		});
	});

	test('pairs operation markers within each provider and attempt rather than the last global marker', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let now = 10;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => now));
		const copilot = performance.start('sessionMigrationScan', 'copilotcli');
		now = 20;
		const codex = performance.start('sessionDiscoveryScan', 'codex');
		now = 35;
		codex?.complete('success', { scannedSessionCount: 101 });
		now = 50;
		copilot?.complete('success', { scannedSessionCount: 99 });
		assert.deepStrictEqual(telemetry.events.map(({ data }) => [
			data?.name, data?.provider, data?.attempt, data?.timestampMs, data?.since, data?.durationMs, data?.outcome, data?.scannedSessionCount,
		]), [
			['processStart', 'host', 1, 0, undefined, undefined, undefined, undefined],
			['sessionMigrationScanStart', 'copilotcli', 1, 10, undefined, undefined, undefined, undefined],
			['sessionDiscoveryScanStart', 'codex', 1, 20, undefined, undefined, undefined, undefined],
			['sessionDiscoveryScan', 'codex', 1, 35, 'sessionDiscoveryScanStart', 15, 'success', 101],
			['sessionMigrationScan', 'copilotcli', 1, 50, 'sessionMigrationScanStart', 40, 'success', 99],
		]);
	});

	test('a missing predecessor is diagnosed without inventing a duration', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		};
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, log, () => 10));
		performance.mark('services', { since: 'telemetry', catalogEnabled: true });
		assert.deepStrictEqual({
			warnings,
			mark: telemetry.events[1]?.data,
		}, {
			warnings: ['[AgentHostStartupPerformance] Missing predecessor \'telemetry\' for \'services\''],
			mark: { agentHostSessionId: performance.agentHostSessionId, hostLaunchKind: AgentHostLaunchKind.Unknown, schemaVersion: 1, provider: 'host', attempt: 1, name: 'services', timestampMs: 10, since: 'telemetry', catalogEnabled: true },
		});
	});

	test('repeated milestones neither read the clock nor overwrite the first timestamp or data', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let clockReads = 0;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => ++clockReads));
		for (let i = 0; i < 10000; i++) {
			performance.mark('bootstrap', { since: 'processStart', registeredSessionCount: i });
		}
		assert.deepStrictEqual({
			clockReads,
			marks: telemetry.events.map(({ data }) => [data?.name, data?.timestampMs, data?.registeredSessionCount]),
		}, {
			clockReads: 1,
			marks: [['processStart', 0, undefined], ['bootstrap', 1, 0]],
		});
	});

	test('retains measured zeroes and omits unavailable counts', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => 0));
		performance.start('sessionMigrationScan', 'copilotcli')?.complete('unavailable');
		performance.start('sessionMigrationScan', 'copilotcli')?.complete('success', { scannedSessionCount: 0 });

		assert.deepStrictEqual(telemetry.events.filter(event => event.data?.outcome).map(({ data }) => ({
			duration: data?.durationMs,
			outcome: data?.outcome,
			hasCount: Object.hasOwn(data!, 'scannedSessionCount'),
			count: data?.scannedSessionCount,
		})), [
			{ duration: 0, outcome: 'unavailable', hasCount: false, count: undefined },
			{ duration: 0, outcome: 'success', hasCount: true, count: 0 },
		]);
	});

	test('discovery milestones remain independent of scan attempts and the registration retry cap', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let now = 10;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => now));
		for (const outcome of ['partial', 'error', 'cancelled'] as const) {
			performance.start('sessionDiscoveryRegistration', 'codex')?.complete(outcome, { candidateSessionCount: 2 });
		}
		const pendingAfterCap = performance.isPending('firstSessionDiscoveryRegistration', 'codex');
		now = 20;
		performance.start('sessionDiscoveryScan', 'codex')?.complete('success', { scannedSessionCount: 99 });
		now = 30;
		performance.mark('firstSessionDiscoveryResult', { provider: 'codex', since: 'processStart', candidateSessionCount: 0 });
		now = 40;
		performance.mark('firstSessionDiscoveryRegistration', { provider: 'codex', since: 'processStart', candidateSessionCount: 0, registeredSessionCount: 0 });
		performance.mark('firstSessionDiscoveryRegistration', { provider: 'codex', since: 'processStart', candidateSessionCount: 99 });

		assert.deepStrictEqual({
			pendingAfterCap,
			pendingAfterCompletion: performance.isPending('firstSessionDiscoveryRegistration', 'codex'),
			retry: performance.start('sessionDiscoveryRegistration', 'codex'),
			milestones: telemetry.events.filter(event => String(event.data?.name).startsWith('firstSessionDiscovery')).map(({ data }) => [
				data?.name, data?.since, data?.durationMs, data?.candidateSessionCount, data?.registeredSessionCount, data?.outcome,
			]),
		}, {
			pendingAfterCap: true,
			pendingAfterCompletion: false,
			retry: undefined,
			milestones: [
				['firstSessionDiscoveryResult', 'processStart', 30, 0, undefined, undefined],
				['firstSessionDiscoveryRegistration', 'processStart', 40, 0, 0, undefined],
			],
		});
	});

	test('pending discovery milestones normalize providers and consume disabled observations without replay', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		telemetry.telemetryLevel = TelemetryLevel.NONE;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => 10));
		const pendingBefore = performance.isPending('firstSessionDiscoveryResult', 'private-provider');
		performance.mark('firstSessionDiscoveryResult', { provider: 'private-provider', since: 'processStart' });
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		const pendingAfter = performance.isPending('firstSessionDiscoveryResult', 'another-private-provider');
		performance.mark('firstSessionDiscoveryResult', { provider: 'another-private-provider', since: 'processStart', candidateSessionCount: 100 });
		performance.dispose();

		assert.deepStrictEqual({
			pendingBefore,
			pendingAfter,
			pendingAfterDisposal: performance.isPending('firstSessionDiscoveryRegistration', 'codex'),
			events: telemetry.events,
		}, { pendingBefore: true, pendingAfter: false, pendingAfterDisposal: false, events: [] });
	});

	test('provider context snapshots are bounded, normalized, and never overwritten by later activation', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let clockReads = 0;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => ++clockReads));
		performance.mark('providerContext', { provider: 'codex', activationState: 'inactive', sdkAvailability: 'unknown' });
		performance.mark('providerContext', { provider: 'claude', activationState: 'notRequired', sdkAvailability: 'unavailable' });
		performance.mark('providerContext', { provider: 'copilotcli', activationState: 'notRequired', sdkAvailability: 'available' });
		for (let i = 0; i < 10000; i++) {
			performance.mark('providerContext', { provider: 'codex', activationState: 'active', sdkAvailability: 'available' });
			performance.mark('providerContext', { provider: `custom-${i}`, activationState: 'unknown', sdkAvailability: 'unknown' });
		}

		assert.deepStrictEqual({
			clockReads,
			contexts: telemetry.events.filter(event => event.data?.name === 'providerContext').map(({ data }) => [
				data?.provider, data?.activationState, data?.sdkAvailability, data?.timestampMs,
			]),
		}, {
			clockReads: 4,
			contexts: [
				['codex', 'inactive', 'unknown', 1],
				['claude', 'notRequired', 'unavailable', 2],
				['copilotcli', 'notRequired', 'available', 3],
				['other', 'unknown', 'unknown', 4],
			],
		});
	});

	test('provider contexts observed without consent are not replayed after opt-in', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		telemetry.telemetryLevel = TelemetryLevel.NONE;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => 10));
		const enabledBefore = performance.isEnabled;
		performance.mark('providerContext', { provider: 'codex', activationState: 'inactive', sdkAvailability: 'unknown' });
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		performance.mark('providerContext', { provider: 'codex', activationState: 'active', sdkAvailability: 'available' });
		assert.deepStrictEqual({ enabledBefore, enabledAfter: performance.isEnabled, events: telemetry.events }, {
			enabledBefore: false, enabledAfter: true, events: [],
		});
	});

	test('bounds failed attempts and stops observing after success without reading the clock again', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let clockReads = 0;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => ++clockReads));
		for (let i = 0; i < 10000; i++) {
			performance.start('sessionMigrationScan', 'copilotcli')?.complete('error');
			performance.start('sessionDiscoveryScan', 'codex')?.complete('success');
		}
		assert.deepStrictEqual({
			clockReads,
			markerCount: telemetry.events.length,
			attempts: telemetry.events.filter(event => event.data?.outcome).map(({ data }) => [data?.provider, data?.attempt, data?.outcome]),
		}, {
			clockReads: 8,
			markerCount: 9,
			attempts: [['copilotcli', 1, 'error'], ['codex', 1, 'success'], ['copilotcli', 2, 'error'], ['copilotcli', 3, 'error']],
		});
	});

	test('does not conflate concurrent operations or allow late completions to overwrite a retry', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => 0));
		const first = performance.start('sessionList');
		const overlapping = performance.start('sessionList');
		first?.complete('error');
		const retry = performance.start('sessionList');
		first?.setMetrics({ visibleSessionCount: 999 });
		first?.complete('success');
		retry?.setMetrics({ registeredSessionCount: 101 });
		retry?.complete('success', { visibleSessionCount: 99 });
		retry?.complete('error');

		assert.deepStrictEqual({
			overlapping,
			events: telemetry.events.filter(event => event.data?.name !== 'processStart').map(({ data }) => [
				data?.name, data?.attempt, data?.since, data?.outcome, data?.registeredSessionCount, data?.visibleSessionCount,
			]),
		}, {
			overlapping: undefined,
			events: [
				['sessionListStart', 1, undefined, undefined, undefined, undefined],
				['sessionList', 1, 'sessionListStart', 'error', undefined, undefined],
				['sessionListStart', 2, undefined, undefined, undefined, undefined],
				['sessionList', 2, 'sessionListStart', 'success', 101, 99],
			],
		});
	});

	test('does not emit disabled usage telemetry or time disabled operations', () => {
		for (const level of [TelemetryLevel.NONE, TelemetryLevel.CRASH, TelemetryLevel.ERROR]) {
			const telemetry = new TestAgentHostStartupTelemetryService();
			telemetry.telemetryLevel = level;
			let clockReads = 0;
			const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => ++clockReads));
			const timing = performance.start('sessionList');
			performance.mark('bootstrap', { since: 'processStart' });
			telemetry.telemetryLevel = TelemetryLevel.USAGE;
			const late = performance.start('sessionList');
			performance.mark('bootstrap', { since: 'processStart' });

			assert.deepStrictEqual({ timing, late, clockReads, events: telemetry.events, validId: isUUID(performance.agentHostSessionId) }, {
				timing: undefined, late: undefined, clockReads: 1, events: [], validId: true,
			});
		}
	});

	test('honors consent changes while an operation is in flight', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => 0));
		const timing = performance.start('sessionList');
		telemetry.telemetryLevel = TelemetryLevel.NONE;
		timing?.complete('success');
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		assert.deepStrictEqual({ markers: telemetry.events.map(event => event.data?.name), retry: performance.start('sessionList') }, { markers: ['processStart', 'sessionListStart'], retry: undefined });
	});

	test('trace logging does not bypass telemetry consent, including later opt-in', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		telemetry.telemetryLevel = TelemetryLevel.NONE;
		let traces = 0;
		const log = new class extends NullLogService {
			override getLevel(): LogLevel { return LogLevel.Trace; }
			override trace(): void { traces++; }
		};
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, log, () => 0));
		const timing = performance.start('sessionList');
		telemetry.telemetryLevel = TelemetryLevel.USAGE;
		timing?.complete('success');
		assert.deepStrictEqual({ traces, events: telemetry.events }, { traces: 3, events: [] });
	});

	test('disposal cancels open phases once and ignores subsequent callbacks', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		let now = 5;
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => now));
		const timing = performance.start('sessionDiscoveryScan', 'claude');
		timing?.setMetrics({ pageCount: 1 });
		now = 12;
		performance.dispose();
		timing?.complete('success', { scannedSessionCount: 1000 });
		performance.mark('bootstrap', { since: 'processStart' });

		assert.deepStrictEqual({
			restart: performance.start('sessionList'),
			events: telemetry.events.filter(event => event.data?.outcome).map(({ data }) => [data?.outcome, data?.durationMs, data?.pageCount, data?.scannedSessionCount]),
		}, {
			restart: undefined,
			events: [['cancelled', 7, 1, undefined]],
		});
	});

	test('normalizes unknown providers before retaining keys or sending data', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, new NullLogService(), () => 0));
		for (let i = 0; i < 1000; i++) {
			performance.start('sessionMigration', `private-provider-${i}`)?.complete('success');
		}
		assert.deepStrictEqual(telemetry.events.filter(event => event.data?.outcome).map(({ data }) => data?.provider), ['other']);
	});

	test('telemetry sink failure is logged and cannot fail or repeat the measured operation', () => {
		const telemetry = new TestAgentHostStartupTelemetryService();
		telemetry.publicLog2 = () => { throw new Error('test sink failure'); };
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		};
		const performance = disposables.add(new AgentHostStartupPerformance(AgentHostLaunchKind.Unknown, undefined, telemetry, log, () => 0));
		performance.start('sessionList')?.complete('success');
		assert.deepStrictEqual({ warnings, retry: performance.start('sessionList') }, {
			warnings: Array(3).fill('[AgentHostStartupPerformance] Failed to report startup marker'),
			retry: undefined,
		});
	});
});
