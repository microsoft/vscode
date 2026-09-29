/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { IOTelConfigResolver, IResolvedOTelConfig, OTelConfigDrift, resolveOTelConfigFromSettings } from '../../../../platform/otel/common/otelConfigResolution';
import { TestOTelSettings } from '../../../../platform/otel/common/test/otelTestSettings';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { IOTelPolicyRestartRecord, IOTelStaleConfigHost, OTelStaleConfigMonitor } from '../otelStaleConfigMonitor';

class TestResolver implements IOTelConfigResolver {
	declare readonly _serviceBrand: undefined;
	readonly activeResolution: IResolvedOTelConfig;
	constructor(private readonly _settings: TestOTelSettings, private readonly _env: Record<string, string | undefined> = {}, private readonly _sessionId = 'session') {
		this.activeResolution = this.resolve();
	}
	resolve(): IResolvedOTelConfig {
		return resolveOTelConfigFromSettings(this._settings, this._env, '1.0.0', this._sessionId);
	}
}

/** The record outlives the extension host, as workspaceState does. */
class TestHost implements IOTelStaleConfigHost {
	policySettled: Promise<void> = Promise.resolve();
	record: IOTelPolicyRestartRecord | undefined;
	recordAtRestart: IOTelPolicyRestartRecord | undefined;
	restarts = 0;
	warnings = 0;
	prompts = 0;
	notifications = 0;
	restartError: Error | undefined;
	storageError: Error | undefined;
	restartCompleted: (() => void) | undefined;
	restartStarted: (() => void) | undefined;
	beforeReload: (() => Promise<void>) | undefined;

	whenPolicySettled() { return this.policySettled; }
	getRestartRecord() { return this.record; }
	async setRestartRecord(record: IOTelPolicyRestartRecord | undefined) {
		if (this.storageError) {
			throw this.storageError;
		}
		this.record = record;
	}
	async restartExtensionHost(): Promise<void> {
		this.restarts++;
		this.recordAtRestart = this.record;
		this.restartStarted?.();
		if (this.restartError) {
			throw this.restartError;
		}
		// Simulates the host remaining alive after the command and grace period.
		await new Promise<void>(resolve => { this.restartCompleted = resolve; });
	}
	warnPolicyNotApplied(beforeReload?: () => Promise<void>) { this.warnings++; this.beforeReload = beforeReload; }
	promptReload(_current: IResolvedOTelConfig, beforeReload?: () => Promise<void>) { this.prompts++; this.beforeReload = beforeReload; }
	notifyPolicyRestarted() { this.notifications++; }
}

class RecordingLogService extends TestLogService {
	readonly warnings: string[] = [];
	override warn(message: string): void { this.warnings.push(message); }
}

const managedPolicy = { enabled: true, otlpEndpoint: 'https://collector.example.com', headers: { authorization: 'secret' } };

describe('OTelStaleConfigMonitor', () => {
	let settings: TestOTelSettings;
	let host: TestHost;
	let log: RecordingLogService;
	const newHost = () => new OTelStaleConfigMonitor(new TestResolver(settings), host, log);

	/** Drain the promise queue as far as the simulated, non-returning restart. */
	async function startRestart(monitor: OTelStaleConfigMonitor) {
		const started = new Promise<void>(resolve => { host.restartStarted = resolve; });
		const pending = monitor.check();
		await started;
		expect(host.recordAtRestart).toBeDefined();
		return { pending };
	}

	beforeEach(() => {
		settings = new TestOTelSettings();
		host = new TestHost();
		log = new RecordingLogService();
	});

	it('prompts on identity revocation without restarting or mutating the running config', async () => {
		settings.policy = { ...managedPolicy, captureIdentity: true };
		const resolver = new TestResolver(settings);
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		settings.policy.captureIdentity = false;
		expect(await monitor.check()).toBe(OTelConfigDrift.Policy);
		expect({ prompts: host.prompts, restarts: host.restarts, active: resolver.activeResolution.config.captureIdentity }).toEqual({
			prompts: 1, restarts: 0, active: true,
		});
		expect(resolver.resolve().config.captureIdentity).toBe(false);
	});

	it('restarts for policy that lands before the contribution can register its watcher', async () => {
		const resolver = new TestResolver(settings);
		expect(resolver.activeResolution.config.enabled).toBe(false);
		settings.policy = managedPolicy;
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		await startRestart(monitor);
		expect(host.restarts).toBe(1);
		expect(host.warnings + host.prompts + host.notifications).toBe(0);
		expect(log.warnings.join('\n')).toContain('headers');
		expect(log.warnings.join('\n')).not.toContain('secret');
		expect(log.warnings.join('\n')).not.toContain('collector.example');
	});

	it('restarts when unrelated policy exposes the unconfigured shared endpoint policy slot', async () => {
		settings.policySlotDefaults.otlpEndpoint = '';
		const resolver = new TestResolver(settings);
		expect(resolver.activeResolution).toMatchObject({
			hasEnterpriseSettings: false,
			config: { enabled: false, otlpEndpoint: '' },
		});
		settings.policy = managedPolicy;
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		await startRestart(monitor);
		expect({ restarts: host.restarts, prompts: host.prompts }).toEqual({ restarts: 1, prompts: 0 });
	});

	it('restarts after transient fail-closed policy defaults settle without changing the exporter', async () => {
		settings.policySlotDefaults = { exporterType: '', otlpEndpoint: '', captureIdentity: false };
		const resolver = new TestResolver(settings);
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		expect(resolver.activeResolution).toMatchObject({
			hasEnterpriseSettings: true,
			config: { enabled: false, exporterType: 'otlp-http', captureIdentity: false },
		});

		settings.policySlotDefaults = {};
		expect(await monitor.check()).toBe(OTelConfigDrift.None);
		settings.policy = managedPolicy;
		await startRestart(monitor);
		expect({ restarts: host.restarts, prompts: host.prompts }).toEqual({ restarts: 1, prompts: 0 });
	});

	it('does not prompt while a forced refresh publishes restrictive placeholders', async () => {
		const resolver = new TestResolver(settings);
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		const settled = new DeferredPromise<void>();
		host.policySettled = settled.p;
		settings.policySlotDefaults = { exporterType: '', otlpEndpoint: '', captureIdentity: false };
		const check = monitor.check();
		await Promise.resolve();
		expect({ restarts: host.restarts, prompts: host.prompts }).toEqual({ restarts: 0, prompts: 0 });

		settings.policySlotDefaults = {};
		settings.policy = managedPolicy;
		const started = new Promise<void>(resolve => { host.restartStarted = resolve; });
		await settled.complete();
		await started;
		expect({ restarts: host.restarts, prompts: host.prompts }).toEqual({ restarts: 1, prompts: 0 });
		host.restartCompleted!();
		await check;
	});

	it('handles a settled blocked refresh without another configuration change', async () => {
		settings.policy = managedPolicy;
		const monitor = newHost();
		const settled = new DeferredPromise<void>();
		host.policySettled = settled.p;
		settings.policy = {};
		settings.policySlotDefaults = { enabled: false, exporterType: '', otlpEndpoint: '', captureIdentity: false };
		const check = monitor.check();
		await Promise.resolve();
		expect({ restarts: host.restarts, prompts: host.prompts }).toEqual({ restarts: 0, prompts: 0 });

		await settled.complete();
		expect({ drift: await check, restarts: host.restarts, prompts: host.prompts }).toEqual({
			drift: OTelConfigDrift.Policy, restarts: 0, prompts: 1,
		});
	});

	it('does not ignore restrictive values when policy is already settled', async () => {
		settings.policy = managedPolicy;
		const monitor = newHost();
		settings.policy = {};
		settings.policySlotDefaults = { enabled: false, exporterType: '', otlpEndpoint: '', captureIdentity: false };
		expect({ drift: await monitor.check(), restarts: host.restarts, prompts: host.prompts }).toEqual({
			drift: OTelConfigDrift.Policy, restarts: 0, prompts: 1,
		});
	});

	it('recovers settled policy when service construction observed a forced-refresh placeholder', async () => {
		settings.policySlotDefaults = { exporterType: '', otlpEndpoint: '', captureIdentity: false };
		const monitor = newHost();
		settings.policySlotDefaults = {};
		settings.policy = managedPolicy;
		await startRestart(monitor);
		expect({ restarts: host.restarts, prompts: host.prompts }).toEqual({ restarts: 1, prompts: 0 });
	});

	it('acknowledges a successful restart exactly once and retains the session budget', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		const second = newHost();
		expect(await second.check()).toBe(OTelConfigDrift.None);
		await second.check();
		await newHost().check();
		expect(host.record).toMatchObject({ sessionId: 'session', acknowledged: true });
		expect(host.notifications).toBe(1);
		expect(host.restarts).toBe(1);
		expect(host.warnings + host.prompts).toBe(0);
	});

	it('does not repeat the acknowledgement for concurrent checks', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		const second = newHost();
		await Promise.all([second.check(), second.check(), second.check()]);
		expect(host.notifications).toBe(1);
	});

	it('does not acknowledge a different target or forget its pending guard', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		settings.policy = { ...managedPolicy, serviceName: 'different' };
		await newHost().check();
		expect(host.notifications).toBe(0);
		expect(host.record).toBeDefined();
	});

	it('does not loop when the restarted host loses the race again', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		settings.policy = {};
		const second = newHost();
		await second.check();
		expect(host.record).toBeDefined();
		expect(host.notifications).toBe(0);
		settings.policy = managedPolicy;
		expect(await second.check()).toBe(OTelConfigDrift.Policy);
		expect(host.restarts).toBe(1);
		expect(host.warnings).toBe(1);
		// A different policy still cannot spend a second automatic attempt in this session.
		settings.policy = { ...managedPolicy, otlpEndpoint: 'https://different.example' };
		await second.check();
		expect(host.restarts).toBe(1);
		expect(host.warnings).toBe(1);

		settings.policy = {};
		const third = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'new-editor-session'), host, log);
		settings.policy = managedPolicy;
		await startRestart(third);
		expect(host.restarts).toBe(2);
		expect(host.warnings).toBe(1);
	});

	it('does not repeat a managed reload prompt after the window reloads', async () => {
		settings.policy = managedPolicy;
		const first = newHost();
		settings.policy = { ...managedPolicy, otlpEndpoint: 'https://changed.example' };
		expect(await first.check()).toBe(OTelConfigDrift.Policy);
		expect(host.prompts).toBe(1);
		expect(host.record).toBeUndefined();
		await host.beforeReload!();

		settings.policy = managedPolicy;
		const resolver = new TestResolver(settings, {}, 'reloaded-editor-session');
		const second = new OTelStaleConfigMonitor(resolver, host, log);
		await second.check();
		settings.policy = { ...managedPolicy, otlpEndpoint: 'https://changed.example' };
		expect(await second.check()).toBe(OTelConfigDrift.Policy);
		await second.check();
		await new OTelStaleConfigMonitor(resolver, host, log).check();
		expect({ prompts: host.prompts, warnings: host.warnings, canReload: !!host.beforeReload }).toEqual({
			prompts: 1, warnings: 2, canReload: false,
		});
	});

	it('does not treat a dismissed reload prompt as a recovery attempt', async () => {
		settings.policy = managedPolicy;
		const first = newHost();
		settings.policy = { ...managedPolicy, serviceName: 'changed' };
		await first.check();

		settings.policy = managedPolicy;
		const second = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'later-session'), host, log);
		settings.policy = { ...managedPolicy, serviceName: 'changed' };
		await second.check();
		expect({ prompts: host.prompts, record: host.record }).toEqual({ prompts: 2, record: undefined });
	});

	it('recovers late policy in a fresh editor session after successful automatic recovery', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		await newHost().check();

		settings.policy = {};
		const later = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'later-session'), host, log);
		await later.check();
		settings.policy = managedPolicy;
		await startRestart(later);
		expect({ restarts: host.restarts, sessionId: host.record?.sessionId, notifications: host.notifications }).toEqual({
			restarts: 2, sessionId: 'later-session', notifications: 1,
		});
	});

	it('acknowledges an applied window reload without blocking recovery on a future launch', async () => {
		settings.policy = managedPolicy;
		const first = newHost();
		settings.policy = { ...managedPolicy, serviceName: 'changed' };
		await first.check();
		await host.beforeReload!();
		await new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'reloaded-session'), host, log).check();
		expect(host.record).toMatchObject({ acknowledged: true, reloadRequested: false });

		settings.policy = {};
		const later = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'later-session'), host, log);
		settings.policy = { ...managedPolicy, serviceName: 'changed' };
		await startRestart(later);
		expect(host.restarts).toBe(1);
	});

	it('bounds a failed automatic recovery and window reload to their immediate successor', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		host.restartError = new Error('restart failed');
		await first.check();
		await host.beforeReload!();

		settings.policy = {};
		const second = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'reloaded-session'), host, log);
		await second.check();
		settings.policy = managedPolicy;
		await second.check();
		expect({ restarts: host.restarts, warnings: host.warnings, canReload: !!host.beforeReload }).toEqual({
			restarts: 1, warnings: 2, canReload: false,
		});

		settings.policy = {};
		const later = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'later-session'), host, log);
		settings.policy = managedPolicy;
		await later.check();
		expect(host.restarts).toBe(2);
	});

	it('does not suppress personal setting drift that matches a managed reload guard', async () => {
		settings.policy = managedPolicy;
		const first = newHost();
		settings.policy = { ...managedPolicy, otlpEndpoint: 'https://changed.example' };
		expect(await first.check()).toBe(OTelConfigDrift.Policy);
		await host.beforeReload!();

		settings.user = { captureIdentity: true };
		const second = new OTelStaleConfigMonitor(new TestResolver(settings, {}, 'later-session'), host, log);
		settings.user.captureIdentity = false;
		expect(await second.check()).toBe(OTelConfigDrift.User);
		expect(host.prompts).toBe(2);
	});

	it('canonicalizes object key order when checking the restart guard', async () => {
		const first = newHost();
		settings.policy = { ...managedPolicy, headers: { a: '1', b: '2' } };
		await startRestart(first);
		settings.policy = {};
		const second = newHost();
		settings.policy = { ...managedPolicy, headers: { b: '2', a: '1' } };
		await second.check();
		expect(host.restarts).toBe(1);
		expect(host.record?.fingerprint).toMatch(/^[a-f0-9]{40}$/);
	});

	it('waits for the restart grace, then warns without clearing the guard', async () => {
		const monitor = newHost();
		settings.policy = managedPolicy;
		const { pending } = await startRestart(monitor);
		expect(host.warnings).toBe(0);
		host.restartCompleted!();
		expect(await pending).toBe(OTelConfigDrift.Policy);
		await monitor.check();
		expect(host.warnings).toBe(1);
		expect(host.restarts).toBe(1);
		expect(host.record).toBeDefined();
	});

	it('retains the session budget and warns when the restart command throws', async () => {
		const monitor = newHost();
		settings.policy = managedPolicy;
		host.restartError = new Error('command unavailable');
		await monitor.check();
		expect(host.record?.sessionId).toBe('session');
		expect(host.warnings).toBe(1);
		settings.policy = { ...managedPolicy, headers: { authorization: 'changed' } };
		await monitor.check();
		expect(host.restarts).toBe(1);
		expect(host.warnings).toBe(1);
	});

	it('retries storage on the next event and never restarts without a stored guard', async () => {
		const monitor = newHost();
		settings.policy = managedPolicy;
		host.storageError = new Error('storage unavailable');
		await monitor.check();
		expect(host.restarts).toBe(0);
		expect(host.warnings).toBe(1);
		host.storageError = undefined;
		await startRestart(monitor);
		expect(host.restarts).toBe(1);
	});

	it('retries consuming the success record if storage fails, without duplicate information', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		const second = newHost();
		host.storageError = new Error('storage unavailable');
		await second.check();
		expect(host.notifications).toBe(0);
		expect(host.record).toBeDefined();
		host.storageError = undefined;
		await second.check();
		await second.check();
		expect(host.notifications).toBe(1);
		expect(host.record?.acknowledged).toBe(true);
	});

	it('prompts only once for later policy updates after successful recovery', async () => {
		const first = newHost();
		settings.policy = managedPolicy;
		await startRestart(first);
		const second = newHost();
		await second.check();
		settings.policy = { ...managedPolicy, headers: { authorization: 'rotation-1' } };
		await second.check();
		settings.policy = { ...managedPolicy, headers: { authorization: 'rotation-2' } };
		await second.check();
		expect(host.restarts).toBe(1);
		expect(host.prompts).toBe(1);
	});

	it('does not auto-restart for mid-session policy changes when policy was present at startup', async () => {
		settings.policy = managedPolicy;
		const monitor = newHost();
		settings.policy = { ...managedPolicy, otlpEndpoint: 'https://new.example' };
		await monitor.check();
		expect(host.restarts).toBe(0);
		expect(host.prompts).toBe(1);
	});

	it.each([
		{ otlpEndpoint: 'https://managed.example' },
		{ serviceName: 'managed-service' },
		{ headers: { managed: '1' } },
	])('only prompts when a disabled managed block present at startup is later enabled: %j', async policy => {
		settings.policy = { ...policy, enabled: false };
		const resolver = new TestResolver(settings);
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		host.restartError = new Error('Unexpected automatic restart');
		expect(resolver.activeResolution.config.enabled).toBe(false);
		settings.policy = { ...policy, enabled: true };
		expect(await monitor.check()).toBe(OTelConfigDrift.Policy);
		await monitor.check();
		settings.policy = { ...settings.policy, captureContent: true };
		await monitor.check();
		expect({
			restarts: host.restarts,
			prompts: host.prompts,
			warnings: host.warnings,
			restartRecord: host.record && { sessionId: host.record.sessionId, acknowledged: host.record.acknowledged },
		}).toEqual({ restarts: 0, prompts: 1, warnings: 0, restartRecord: undefined });
	});

	it('only prompts when policy is withdrawn', async () => {
		settings.policy = managedPolicy;
		const monitor = newHost();
		settings.policy = {};
		expect(await monitor.check()).toBe(OTelConfigDrift.Withdrawal);
		expect(host.restarts).toBe(0);
		expect(host.prompts).toBe(1);
	});

	it('only prompts for user changes, once per target', async () => {
		const monitor = newHost();
		settings.user = { enabled: true };
		expect(await monitor.check()).toBe(OTelConfigDrift.User);
		await monitor.check();
		expect(host.restarts).toBe(0);
		expect(host.prompts).toBe(1);
	});

	it('does not mistake a personal collector setting for policy', async () => {
		const monitor = newHost();
		settings.user = { enabled: true, otlpEndpoint: 'https://personal.example' };
		expect(await monitor.check()).toBe(OTelConfigDrift.User);
		expect(host.restarts).toBe(0);
		expect(host.prompts).toBe(1);
	});

	it('does not restart pointlessly when env precedence leaves the resolved config unchanged', async () => {
		const resolver = new TestResolver(settings, { COPILOT_OTEL_ENABLED: 'false' });
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		settings.policy = managedPolicy;
		expect(await monitor.check()).toBe(OTelConfigDrift.None);
		expect(host.restarts + host.notifications).toBe(0);
	});

	it.each([
		{
			name: 'a DB-only pipeline and a managed service name',
			user: { 'dbSpanExporter.enabled': true },
			policy: { serviceName: 'managed' },
			env: {},
		},
		{
			name: 'user-enabled export with only managed headers',
			user: { enabled: true },
			policy: { headers: { managed: '1' } },
			env: {},
		},
		{
			name: 'a personal endpoint that overrides the managed collector',
			user: {},
			policy: managedPolicy,
			env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://personal.example' },
		},
		{
			name: 'a personal file exporter that overrides OTLP',
			user: {},
			policy: managedPolicy,
			env: { COPILOT_OTEL_FILE_EXPORTER_PATH: '/tmp/personal-otel.jsonl' },
		},
		{
			name: 'a non-HTTP collector URL',
			user: {},
			policy: { ...managedPolicy, otlpEndpoint: 'file:///tmp/not-a-collector' },
			env: {},
		},
	])('does not automatically restart for $name', async ({ user, policy, env }) => {
		settings.user = user;
		const resolver = new TestResolver(settings, env);
		const monitor = new OTelStaleConfigMonitor(resolver, host, log);
		settings.policy = policy;
		await monitor.check();
		expect(host.restarts).toBe(0);
		expect(host.notifications).toBe(0);
	});

	it('recovers explicit policy enablement even when the collector equals the schema default', async () => {
		const monitor = newHost();
		settings.policy = { enabled: true, otlpEndpoint: 'http://localhost:4318' };
		await startRestart(monitor);
		expect(host.restarts).toBe(1);
	});

	it('does nothing on a normal, unchanged startup', async () => {
		expect(await newHost().check()).toBe(OTelConfigDrift.None);
		expect(host.restarts + host.prompts + host.warnings + host.notifications).toBe(0);
	});
});
