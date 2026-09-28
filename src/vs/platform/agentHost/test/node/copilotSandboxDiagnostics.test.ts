/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { NullLogService } from '../../../log/common/log.js';
import { agentSandboxDiagnosticsMetaKey, readAgentSandboxDiagnostics } from '../../common/meta/agentSandboxDiagnostics.js';
import { SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CopilotSandboxDiagnostics } from '../../node/copilot/copilotSandboxDiagnostics.js';

suite('CopilotSandboxDiagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'ahp-session://remote-host/custom-session';

	function createStateManager(): AgentHostStateManager {
		const manager = store.add(new AgentHostStateManager(new NullLogService()));
		manager.createSession({
			resource: session,
			provider: 'copilotcli',
			title: 'Sandbox',
			status: SessionStatus.Idle,
			createdAt: '2026-09-25T00:00:00.000Z',
			modifiedAt: '2026-09-25T00:00:00.000Z',
			_meta: { unrelated: 'preserved' },
		});
		return manager;
	}

	test('publishes runtime diagnostics and clears them when support becomes available', async () => {
		const manager = createStateManager();
		let supported = false;
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => ({
			supported,
			reason: supported ? undefined : 'Install bubblewrap on this host.',
			capabilities: [],
		}), manager, new NullLogService()));

		await diagnostics.update({ enabled: true });
		const unsupported = manager.getSessionSummary(session)?._meta;
		supported = true;
		await diagnostics.update({ enabled: true });
		assert.deepStrictEqual([unsupported, manager.getSessionSummary(session)?._meta], [
			{ unrelated: 'preserved', [agentSandboxDiagnosticsMetaKey]: ['Install bubblewrap on this host.'] },
			{ unrelated: 'preserved' },
		]);
	});

	test('only reports capabilities used by the configured sandbox', async () => {
		const manager = createStateManager();
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => ({
			supported: true,
			capabilities: [
				{ name: 'network', supported: false, reason: 'Install slirp4netns.' },
				{ name: 'network_filtering', supported: false, reason: 'Proxy unsupported.' },
				{ name: 'denied_paths', supported: false, reason: 'Denied paths unsupported.' },
				{ name: 'future_feature', supported: false, reason: 'Ignore unknown capabilities.' },
			],
		}), manager, new NullLogService()));

		await diagnostics.update({ enabled: true, userPolicy: { network: { allowOutbound: false } } });
		const unused = readAgentSandboxDiagnostics(manager.getSessionSummary(session)!);
		await diagnostics.update({
			enabled: true,
			userPolicy: {
				network: { allowOutbound: true, proxy: { url: 'http://localhost:8080' } },
				filesystem: { deniedPaths: ['/secrets'] },
			},
		});
		assert.deepStrictEqual([unused, readAgentSandboxDiagnostics(manager.getSessionSummary(session)!)], [
			undefined,
			['Install slirp4netns.', 'Proxy unsupported.', 'Denied paths unsupported.'],
		]);
	});

	test('reports unavailable shell support and supplies missing diagnostic text', async () => {
		const manager = createStateManager();
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => ({
			supported: true,
			capabilities: [{ name: 'shell', supported: false }],
		}), manager, new NullLogService()));
		await diagnostics.update({ enabled: true });
		assert.deepStrictEqual(readAgentSandboxDiagnostics(manager.getSessionSummary(session)!), [
			'The sandbox capability \'shell\' is unavailable on this host.',
		]);
	});

	test('disabling sandboxing clears diagnostics without probing and invalidates an in-flight probe', async () => {
		const manager = createStateManager();
		manager.setSessionMeta(session, { [agentSandboxDiagnosticsMetaKey]: ['Previous failure.'] });
		const support = new DeferredPromise<{ supported: boolean; reason: string; capabilities: [] }>();
		let probes = 0;
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, () => {
			probes++;
			return support.p;
		}, manager, new NullLogService()));
		const pending = diagnostics.update({ enabled: true });
		await diagnostics.update({ enabled: false });
		await support.complete({ supported: false, reason: 'Stale failure.', capabilities: [] });
		await pending;
		assert.deepStrictEqual({ probes, reasons: readAgentSandboxDiagnostics(manager.getSessionSummary(session)!) }, { probes: 1, reasons: undefined });
	});

	test('does not publish after disposal', async () => {
		const manager = createStateManager();
		const support = new DeferredPromise<{ supported: boolean; reason: string; capabilities: [] }>();
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, () => support.p, manager, new NullLogService()));
		const pending = diagnostics.update({ enabled: true });
		diagnostics.dispose();
		await support.complete({ supported: false, reason: 'Late result.', capabilities: [] });
		await pending;
		assert.strictEqual(readAgentSandboxDiagnostics(manager.getSessionSummary(session)!), undefined);
	});

	test('logs probe failures without preventing the turn or inventing a diagnostic', async () => {
		const manager = createStateManager();
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		};
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => {
			throw new Error('Connection closed');
		}, manager, log));
		await diagnostics.update({ enabled: true });
		assert.deepStrictEqual({ warnings, reasons: readAgentSandboxDiagnostics(manager.getSessionSummary(session)!) }, {
			warnings: [`[Copilot:${session}] Failed to query sandbox host support`],
			reasons: undefined,
		});
	});

	test('bounds a hung probe and ignores its late response after a successful retry', () => runWithFakedTimers({}, async () => {
		const manager = createStateManager();
		manager.setSessionMeta(session, { [agentSandboxDiagnosticsMetaKey]: ['Previous failure.'] });
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		};
		const pending = new DeferredPromise<{ supported: boolean; reason: string; capabilities: [] }>();
		let queries = 0;
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, () => ++queries === 1
			? pending.p
			: Promise.resolve({ supported: false, reason: 'Current failure.', capabilities: [] }), manager, log));

		const start = Date.now();
		await diagnostics.update({ enabled: true });
		const elapsed = Date.now() - start;
		const afterTimeout = readAgentSandboxDiagnostics(manager.getSessionSummary(session)!);
		await diagnostics.update({ enabled: true });
		await pending.complete({ supported: false, reason: 'Stale failure.', capabilities: [] });

		assert.deepStrictEqual({
			elapsed, queries, warnings, afterTimeout,
			afterLateResponse: readAgentSandboxDiagnostics(manager.getSessionSummary(session)!),
		}, {
			elapsed: 5_000,
			queries: 2,
			warnings: [`[Copilot:${session}] Sandbox host support query timed out after 5000ms`],
			afterTimeout: ['Previous failure.'],
			afterLateResponse: ['Current failure.'],
		});
	}));

	test('handles a late rejection after the probe times out', () => runWithFakedTimers({}, async () => {
		const manager = createStateManager();
		const pending = new DeferredPromise<{ supported: boolean; capabilities: [] }>();
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, () => pending.p, manager, new NullLogService()));
		await diagnostics.update({ enabled: true });
		await pending.error(new Error('Late RPC rejection'));
		assert.strictEqual(readAgentSandboxDiagnostics(manager.getSessionSummary(session)!), undefined);
	}));

	test('ignores absent and malformed optional metadata', () => {
		assert.deepStrictEqual([undefined, null, 'error', [], [1], [''], ['error', null]].map(value =>
			readAgentSandboxDiagnostics({ _meta: { [agentSandboxDiagnosticsMetaKey]: value } })
		), Array(7).fill(undefined));
	});
});
