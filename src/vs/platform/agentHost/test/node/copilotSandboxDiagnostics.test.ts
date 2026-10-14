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
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
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
			defaultChat: buildDefaultChatUri(session),
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
			{ unrelated: 'preserved', [agentSandboxDiagnosticsMetaKey]: ['Missing sandbox dependencies may prevent terminal commands from running.'] },
			{ unrelated: 'preserved' },
		]);
	});

	test('reports network filtering without a proxy and gates network and denied paths on configuration', async () => {
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
			['Missing sandbox dependencies may prevent network access restrictions from working.'],
			['Missing sandbox dependencies may prevent terminal commands from connecting to the network.'],
		]);
	});

	test('reports unavailable network filtering and filesystem enumeration from host capabilities without user policy', async () => {
		const manager = createStateManager();
		const networkFilteringReason = 'This Windows host cannot run a sandbox proxy. See https://aka.ms/ghcp-sandbox-os-support';
		const filesystemEnumerationReason = 'This Windows host cannot grant enumerate-only filesystem access. See https://aka.ms/ghcp-sandbox-os-support';
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => ({
			supported: true,
			capabilities: [
				{ name: 'network', supported: true },
				{ name: 'network_filtering', supported: false, reason: networkFilteringReason },
				{ name: 'denied_paths', supported: true },
				{ name: 'shell', supported: true },
				{ name: 'filesystem_enumeration', supported: false, reason: filesystemEnumerationReason },
			],
		}), manager, new NullLogService()));

		await diagnostics.update({ enabled: true });

		assert.deepStrictEqual(readAgentSandboxDiagnostics(manager.getSessionSummary(session)!), [
			'Missing sandbox dependencies may prevent network access restrictions from working.',
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
			'Missing sandbox dependencies may prevent terminal commands from running.',
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

	for (const [capability, message] of [
		['shell', 'Missing sandbox dependencies may prevent terminal commands from running.'],
		['filesystem_enumeration', 'Missing sandbox dependencies may prevent terminal commands from accessing folders.'],
		['network', 'Missing sandbox dependencies may prevent terminal commands from connecting to the network.'],
		['network_filtering', 'Missing sandbox dependencies may prevent network access restrictions from working.'],
		['denied_paths', 'Missing sandbox dependencies may prevent blocked files and folders from being protected.'],
	]) {
		test(`publishes a brief ${capability} impact and logs all technical reasons`, async () => {
			const manager = createStateManager();
			const warnings: { message: string; details: unknown[] }[] = [];
			const log = new class extends NullLogService {
				override warn(message: string, ...details: unknown[]): void { warnings.push({ message, details }); }
			};
			const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => ({
				supported: true,
				capabilities: [
					{ name: 'future_feature', supported: false, reason: 'Unknown capability.' },
					{ name: capability, supported: false, reason: 'Detailed SDK reason.' },
					{ name: 'shell', supported: false, reason: 'Another SDK reason.' },
				],
			}), manager, log));
			await diagnostics.update({
				enabled: true,
				userPolicy: { network: { allowOutbound: true }, filesystem: { deniedPaths: ['/secrets'] } },
			});
			assert.deepStrictEqual({
				reasons: readAgentSandboxDiagnostics(manager.getSessionSummary(session)!),
				warnings,
			}, {
				reasons: [message],
				warnings: [
					{ message: `[Copilot:${session}] Sandbox capability '${capability}' unavailable`, details: ['Detailed SDK reason.'] },
					{ message: `[Copilot:${session}] Sandbox capability 'shell' unavailable`, details: ['Another SDK reason.'] },
				],
			});
		});
	}

	test('logs an unsupported backend reason instead of publishing its details', async () => {
		const manager = createStateManager();
		const warnings: { message: string; details: unknown[] }[] = [];
		const log = new class extends NullLogService {
			override warn(message: string, ...details: unknown[]): void { warnings.push({ message, details }); }
		};
		const diagnostics = store.add(new CopilotSandboxDiagnostics(session, async () => ({
			supported: false,
			reason: 'Technical backend failure.',
			capabilities: [],
		}), manager, log));
		await diagnostics.update({ enabled: true });
		assert.deepStrictEqual({
			reasons: readAgentSandboxDiagnostics(manager.getSessionSummary(session)!),
			warnings,
		}, {
			reasons: ['Missing sandbox dependencies may prevent terminal commands from running.'],
			warnings: [{ message: `[Copilot:${session}] Sandbox backend unavailable`, details: ['Technical backend failure.'] }],
		});
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
			warnings: [
				`[Copilot:${session}] Sandbox host support query timed out after 5000ms`,
				`[Copilot:${session}] Sandbox backend unavailable`,
			],
			afterTimeout: ['Previous failure.'],
			afterLateResponse: ['Missing sandbox dependencies may prevent terminal commands from running.'],
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
