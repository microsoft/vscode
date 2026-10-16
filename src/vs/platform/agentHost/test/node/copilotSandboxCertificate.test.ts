/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotSandboxCertificate } from '../../node/copilot/copilotSandboxCertificate.js';

type CertificateRpc = CopilotClient['rpc']['sandbox']['proxyCa'];
type CertificateStatus = Awaited<ReturnType<CertificateRpc['getStatus']>>;
type CertificateCreateResult = Awaited<ReturnType<CertificateRpc['create']>>;

class TestCertificateRpc extends mock<CertificateRpc>() {
	readonly calls: string[] = [];
	readonly configs: Parameters<CertificateRpc['getStatus']>[0][] = [];
	relevant = true;
	supported = true;
	status: CertificateStatus = { state: 'notInstalled', canInstall: true };
	statusResult: Promise<CertificateStatus> | undefined;
	createResult: Promise<CertificateCreateResult> | undefined;
	trustResult: Promise<CertificateStatus> | undefined;
	rotateResult: Promise<CertificateStatus> | undefined;
	removeResult: Promise<CertificateStatus> | undefined;
	readonly removalArguments: Parameters<CertificateRpc['remove']>[] = [];
	readonly statusStarted = new DeferredPromise<void>();
	readonly createStarted = new DeferredPromise<void>();

	override checkRelevance = async (params: Parameters<CertificateRpc['checkRelevance']>[0]): Promise<boolean> => {
		this.calls.push('relevance');
		this.configs.push(params);
		return this.relevant;
	};

	override checkInstallationSupport = async (): Promise<boolean> => {
		this.calls.push('support');
		return this.supported;
	};

	override getStatus = async (params: Parameters<CertificateRpc['getStatus']>[0]): Promise<CertificateStatus> => {
		this.calls.push('status');
		this.configs.push(params);
		this.statusStarted.complete();
		return this.statusResult ?? this.status;
	};

	override create = async (params: Parameters<CertificateRpc['create']>[0]): Promise<CertificateCreateResult> => {
		this.calls.push('create');
		this.configs.push(params);
		this.createStarted.complete();
		return this.createResult ?? { certificatePath: '/runtime/proxy-ca.pem' };
	};

	override trust = async (params: Parameters<CertificateRpc['trust']>[0]): Promise<CertificateStatus> => {
		this.calls.push('trust');
		this.configs.push(params);
		this.status = await (this.trustResult ?? Promise.resolve({ state: 'installed', canInstall: true }));
		return this.status;
	};

	override rotate = async (params: Parameters<CertificateRpc['rotate']>[0]): Promise<CertificateStatus> => {
		this.calls.push('rotate');
		this.configs.push(params);
		this.status = await (this.rotateResult ?? Promise.resolve({ state: 'notInstalled', canInstall: true }));
		return this.status;
	};

	override remove = async (...args: Parameters<CertificateRpc['remove']>): Promise<CertificateStatus> => {
		this.calls.push('remove');
		this.removalArguments.push(args);
		this.status = await (this.removeResult ?? Promise.resolve({ state: 'notInstalled', canInstall: true }));
		return this.status;
	};
}

suite('CopilotSandboxCertificate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const config = { enabled: true, auth: { git: true, gh: true } };

	suite('explicit mutations', () => {
		test('remove calls the SDK without arguments and refreshes the cached status while retaining the scope', async () => {
			const rpc = new TestCertificateRpc();
			rpc.status = { state: 'installed', canInstall: true };
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			const removed = { state: 'notInstalled', canInstall: true, detail: 'The retained CA needs rotation' } as const;
			rpc.removeResult = Promise.resolve(removed);
			await certificates.remove(rpc, initial.scopeId, () => { });
			const refreshed = await certificates.getStatus(rpc, config);
			assert.deepStrictEqual({
				calls: rpc.calls, args: rpc.removalArguments, state: refreshed?.state, scope: refreshed?.scopeId, requiresRotation: refreshed?.requiresRotation,
			}, {
				calls: ['relevance', 'support', 'status', 'remove', 'relevance', 'support', 'status'],
				args: [[]], state: 'notInstalled', scope: initial.scopeId, requiresRotation: true,
			});
		});

		test('remove rejects a stale runtime scope without mutating the certificate', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			await certificates.getStatus(rpc, config);
			await assert.rejects(certificates.remove(rpc, 'stale-runtime', () => { }), /runtime changed/);
			assert.deepStrictEqual(rpc.calls, ['relevance', 'support', 'status']);
		});

		test('remove waits for installation to finish before removing trust', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			const created = new DeferredPromise<CertificateCreateResult>();
			rpc.createResult = created.p;
			const installing = certificates.install(rpc, () => config, initial.scopeId);
			await rpc.createStarted.p;
			const removing = certificates.remove(rpc, initial.scopeId, () => { });
			await timeout(0);
			const removedBeforeCreation = rpc.calls.includes('remove');
			created.complete({ certificatePath: '/runtime/proxy-ca.pem' });
			await Promise.all([installing, removing]);
			assert.deepStrictEqual({
				removedBeforeCreation, mutations: rpc.calls.filter(call => ['create', 'trust', 'rotate', 'remove'].includes(call)),
			}, { removedBeforeCreation: false, mutations: ['create', 'trust', 'remove'] });
		});

		for (const operation of ['install', 'rotate'] as const) {
			test(`${operation} resolves the current configuration once after dequeueing`, async () => {
				const rpc = new TestCertificateRpc();
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const initial = await certificates.getStatus(rpc, config);
				assert.ok(initial);
				const pending = new DeferredPromise<CertificateCreateResult>();
				rpc.createResult = pending.p;
				const creating = certificates.create(rpc, config);
				await rpc.createStarted.p;
				let currentConfig = config;
				let preflights = 0;
				const queued = certificates[operation](rpc, () => {
					preflights++;
					return currentConfig;
				}, initial.scopeId);
				const preflightsWhileWaiting = preflights;
				currentConfig = { ...config, auth: { git: false, gh: true } };
				const nextConfig = currentConfig;
				const configsBeforeExecution = rpc.configs.length;
				await pending.complete({ certificatePath: '/runtime/proxy-ca.pem' });
				await Promise.all([creating, queued]);
				assert.deepStrictEqual({
					preflightsWhileWaiting, preflights,
					configs: rpc.configs.slice(configsBeforeExecution),
				}, {
					preflightsWhileWaiting: 0, preflights: 1,
					configs: Array(4).fill({ sandboxConfig: nextConfig }),
				});
			});
		}

		test('a removal preflight failure drops only that queued mutation and permits a later request', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			const pending = new DeferredPromise<CertificateCreateResult>();
			rpc.createResult = pending.p;
			const creating = certificates.create(rpc, config);
			await rpc.createStarted.p;
			let preflights = 0;
			const error = new Error('The chat is no longer running');
			const rejected = assert.rejects(certificates.remove(rpc, initial.scopeId, () => {
				preflights++;
				throw error;
			}), actual => actual === error);
			const preflightsWhileWaiting = preflights;
			const removing = certificates.remove(rpc, initial.scopeId, () => { preflights++; });
			await pending.complete({ certificatePath: '/runtime/proxy-ca.pem' });
			await Promise.all([creating, rejected, removing]);
			assert.deepStrictEqual({
				preflightsWhileWaiting, preflights,
				mutations: rpc.calls.filter(call => ['create', 'trust', 'rotate', 'remove'].includes(call)),
			}, { preflightsWhileWaiting: 0, preflights: 2, mutations: ['create', 'remove'] });
		});

		for (const state of ['installed', 'unsupported', 'error'] as const) {
			test(`remove rejects an unconfirmed ${state} result and invalidates the status cache`, async () => {
				const rpc = new TestCertificateRpc();
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const initial = await certificates.getStatus(rpc, config);
				assert.ok(initial);
				rpc.removeResult = Promise.resolve({ state, canInstall: true });
				await assert.rejects(certificates.remove(rpc, initial.scopeId, () => { }), /did not confirm/);
				await certificates.getStatus(rpc, config);
				assert.deepStrictEqual(rpc.calls, ['relevance', 'support', 'status', 'remove', 'relevance', 'support', 'status']);
			});
		}

		test('remove surfaces SDK failures and permits a later retry', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			const removal = new DeferredPromise<CertificateStatus>();
			rpc.removeResult = removal.p;
			const failed = assert.rejects(certificates.remove(rpc, initial.scopeId, () => { }), /Authorization denied/);
			removal.error(new Error('Authorization denied'));
			await failed;
			rpc.removeResult = undefined;
			await certificates.remove(rpc, initial.scopeId, () => { });
			assert.deepStrictEqual(rpc.removalArguments, [[], []]);
		});

		test('install rechecks status and performs create then trust only once for concurrent requests', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			await Promise.all([certificates.install(rpc, () => config, initial.scopeId), certificates.install(rpc, () => config, initial.scopeId)]);
			const status = await certificates.getStatus(rpc, config);
			assert.deepStrictEqual({
				mutations: rpc.calls.filter(call => call === 'create' || call === 'trust'),
				state: status?.state, scope: status?.scopeId,
			}, { mutations: ['create', 'trust'], state: 'installed', scope: initial.scopeId });
		});

		test('install rejects a stale runtime scope before calling the SDK', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			await certificates.getStatus(rpc, config);
			await assert.rejects(certificates.install(rpc, () => config, 'stale-runtime'), /runtime changed/);
			assert.deepStrictEqual(rpc.calls, ['relevance', 'support', 'status']);
		});

		test('rotate forcibly replaces an installed CA and establishes trust when needed', async () => {
			const rpc = new TestCertificateRpc();
			rpc.status = { state: 'installed', canInstall: true };
			rpc.rotateResult = Promise.resolve({ state: 'notInstalled', canInstall: true });
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			await certificates.rotate(rpc, () => config, initial.scopeId);
			const status = await certificates.getStatus(rpc, config);
			assert.deepStrictEqual({
				mutations: rpc.calls.filter(call => ['rotate', 'trust'].includes(call)),
				state: status?.state, scope: status?.scopeId,
			}, { mutations: ['rotate', 'trust'], state: 'installed', scope: initial.scopeId });
		});

		test('rotate rejects a stale runtime scope before calling the SDK', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			await certificates.getStatus(rpc, config);
			await assert.rejects(certificates.rotate(rpc, () => config, 'stale-runtime'), /runtime changed/);
			assert.deepStrictEqual(rpc.calls.filter(call => call === 'rotate'), []);
		});

		test('rotate preserves the supplied configuration and skips duplicate trust when rotation establishes trust', async () => {
			const rpc = new TestCertificateRpc();
			rpc.status = { state: 'installed', canInstall: true };
			rpc.rotateResult = Promise.resolve({ state: 'installed', canInstall: true });
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			await certificates.rotate(rpc, () => config, initial.scopeId);
			assert.deepStrictEqual({
				mutations: rpc.calls.filter(call => ['create', 'rotate', 'trust'].includes(call)),
				params: rpc.configs.at(-1),
			}, { mutations: ['rotate'], params: { sandboxConfig: config } });
		});

		for (const result of [
			{ state: 'error', canInstall: false, detail: 'Authorization denied' },
			{ state: 'unsupported', canInstall: false },
			{ state: 'installed', canInstall: true, detail: 'Still incompatible' },
		] satisfies CertificateStatus[]) {
			test(`explicit rotation rejects ${result.state}${result.detail ? ' with detail' : ''} and invalidates cached status`, async () => {
				const rpc = new TestCertificateRpc();
				rpc.status = { state: 'installed', canInstall: true };
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const initial = await certificates.getStatus(rpc, config);
				assert.ok(initial);
				rpc.rotateResult = Promise.resolve(result);
				await assert.rejects(certificates.rotate(rpc, () => config, initial.scopeId));
				await certificates.getStatus(rpc, config);
				assert.deepStrictEqual({
					mutations: rpc.calls.filter(call => ['create', 'rotate', 'trust'].includes(call)),
					lastReads: rpc.calls.slice(-3),
				}, { mutations: ['rotate'], lastReads: ['relevance', 'support', 'status'] });
			});
		}

		test('explicit rotation fails when subsequent trust is not confirmed', async () => {
			const rpc = new TestCertificateRpc();
			rpc.status = { state: 'installed', canInstall: true };
			rpc.trustResult = Promise.resolve({ state: 'notInstalled', canInstall: true });
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			await assert.rejects(certificates.rotate(rpc, () => config, initial.scopeId), /did not confirm/);
			assert.deepStrictEqual(rpc.calls.slice(-2), ['rotate', 'trust']);
		});

		for (const status of [
			{ state: 'unsupported', canInstall: false },
			{ state: 'error', canInstall: false, detail: 'Status failed' },
		] satisfies CertificateStatus[]) {
			test(`install rechecks and rejects ${status.state}${status.detail ? ' with detail' : ''}`, async () => {
				const rpc = new TestCertificateRpc();
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const initial = await certificates.getStatus(rpc, config);
				assert.ok(initial);
				rpc.status = status;
				await assert.rejects(certificates.install(rpc, () => config, initial.scopeId));
				assert.deepStrictEqual(rpc.calls, ['relevance', 'support', 'status', 'relevance', 'support', 'status']);
			});
		}

		test('install fails rather than reporting success when trust is not confirmed', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			rpc.trustResult = Promise.resolve({ state: 'notInstalled', canInstall: true });
			await assert.rejects(certificates.install(rpc, () => config, initial.scopeId), /did not confirm/);
			assert.deepStrictEqual(rpc.calls.slice(-2), ['create', 'trust']);
		});

		for (const state of ['notInstalled', 'installed'] as const) {
			test(`install replaces an incompatible ${state} CA and trusts only when still needed`, async () => {
				const rpc = new TestCertificateRpc();
				rpc.status = { state, canInstall: true, detail: 'CA is not limited to TLS server authentication' };
				rpc.rotateResult = Promise.resolve({ state, canInstall: true });
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const credentialConfig = { ...config, credentials: { envVars: { TOKEN: { injectHosts: ['example.com'] } } } };
				const initial = await certificates.getStatus(rpc, credentialConfig);
				assert.ok(initial);
				await certificates.install(rpc, () => credentialConfig, initial.scopeId);
				const status = await certificates.getStatus(rpc, credentialConfig);
				assert.deepStrictEqual({
					mutations: rpc.calls.filter(call => ['create', 'rotate', 'trust'].includes(call)),
					configForwarded: rpc.configs.every(params => params.sandboxConfig === credentialConfig),
					state: status?.state, requiresRotation: status?.requiresRotation,
				}, {
					mutations: state === 'installed' ? ['rotate'] : ['rotate', 'trust'],
					configForwarded: true, state: 'installed', requiresRotation: false,
				});
			});
		}

		for (const result of [
			{ state: 'error', canInstall: true, detail: 'Replacement denied' },
			{ state: 'notInstalled', canInstall: true, detail: 'Still incompatible' },
			{ state: 'installed', canInstall: true, detail: 'Still incompatible' },
			{ state: 'unsupported', canInstall: false },
		] satisfies CertificateStatus[]) {
			test(`install stops after unsuccessful replacement: ${result.state}`, async () => {
				const rpc = new TestCertificateRpc();
				rpc.status = { state: 'notInstalled', canInstall: true, detail: 'Replacement required' };
				rpc.rotateResult = Promise.resolve(result);
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const initial = await certificates.getStatus(rpc, config);
				assert.ok(initial);
				await assert.rejects(certificates.install(rpc, () => config, initial.scopeId));
				assert.deepStrictEqual(rpc.calls.filter(call => ['create', 'rotate', 'trust'].includes(call)), ['rotate']);
			});
		}

		test('install never trusts a certificate when creation fails', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const initial = await certificates.getStatus(rpc, config);
			assert.ok(initial);
			const pending = new DeferredPromise<CertificateCreateResult>();
			rpc.createResult = pending.p;
			const installing = certificates.install(rpc, () => config, initial.scopeId);
			const rejected = assert.rejects(installing, /Could not create CA/);
			await rpc.createStarted.p;
			await pending.error(new Error('Could not create CA'));
			await rejected;
			assert.deepStrictEqual(rpc.calls.filter(call => call === 'create' || call === 'trust'), ['create']);
		});

		test('create passes the full configuration and returns the public certificate path without trusting it', async () => {
			const rpc = new TestCertificateRpc();
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const credentialConfig = { ...config, credentials: { envVars: { TOKEN: { injectHosts: ['example.com'] } } } };
			const result = await certificates.create(rpc, credentialConfig);
			assert.deepStrictEqual({ result, calls: rpc.calls, configs: rpc.configs }, {
				result: { certificatePath: '/runtime/proxy-ca.pem' },
				calls: ['create'], configs: [{ sandboxConfig: credentialConfig }],
			});
		});

		for (const status of [
			{ state: 'installed', canInstall: true },
			{ state: 'installed', canInstall: true, detail: 'Additional hosts require rotation.' },
			{ state: 'notInstalled', canInstall: true, detail: 'Stored CA must be rotated.' },
			{ state: 'unsupported', canInstall: false },
			{ state: 'error', canInstall: false, detail: 'OS authorization was denied.' },
		] satisfies CertificateStatus[]) {
			test(`trust preserves ${status.state}${status.detail ? ' with detail' : ''} without creating or rotating`, async () => {
				const rpc = new TestCertificateRpc();
				rpc.trustResult = Promise.resolve(status);
				const warnings: string[] = [];
				const certificates = new CopilotSandboxCertificate(new class extends NullLogService {
					override warn(message: string): void { warnings.push(message); }
				});
				const result = await certificates.trust(rpc, config);
				assert.deepStrictEqual({ result, calls: rpc.calls, configs: rpc.configs, warnings }, {
					result: status, calls: ['trust'], configs: [{ sandboxConfig: config }],
					warnings: status.state === 'error' ? ['[Copilot] Sandbox certificate trust failed'] : [],
				});
			});
		}

		test('serializes create and trust for the same runtime and defers reads until they settle', async () => {
			const rpc = new TestCertificateRpc();
			const pending = new DeferredPromise<CertificateCreateResult>();
			rpc.createResult = pending.p;
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const create = certificates.create(rpc, config);
			const trust = certificates.trust(rpc, config);
			const read = certificates.getStatus(rpc, config);
			await rpc.createStarted.p;
			const whileCreating = [...rpc.calls];
			await pending.complete({ certificatePath: '/runtime/proxy-ca.pem' });
			await Promise.all([create, trust]);
			const status = await read;
			assert.deepStrictEqual({ whileCreating, calls: rpc.calls, state: status?.state }, {
				whileCreating: ['create'], calls: ['create', 'trust', 'relevance', 'support', 'status'], state: 'installed',
			});
		});

		test('does not block operations on another runtime', async () => {
			const first = new TestCertificateRpc();
			const second = new TestCertificateRpc();
			const pending = new DeferredPromise<CertificateCreateResult>();
			first.createResult = pending.p;
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const create = certificates.create(first, config);
			await first.createStarted.p;
			const trusted = await certificates.trust(second, config);
			const firstPending = !pending.isSettled;
			await pending.complete({ certificatePath: '/runtime/proxy-ca.pem' });
			await create;
			assert.deepStrictEqual({ firstPending, trusted: trusted.state, calls: [first.calls, second.calls] }, {
				firstPending: true, trusted: 'installed', calls: [['create'], ['trust']],
			});
		});

		for (const operation of ['create', 'trust'] as const) {
			test(`${operation} rejects disabled sandboxing without making SDK calls`, async () => {
				const rpc = new TestCertificateRpc();
				const warnings: string[] = [];
				const certificates = new CopilotSandboxCertificate(new class extends NullLogService {
					override warn(message: string): void { warnings.push(message); }
				});
				await assert.rejects(certificates[operation](rpc, { enabled: false }), /Sandboxing must be enabled/);
				assert.deepStrictEqual({ calls: rpc.calls, warnings }, {
					calls: [], warnings: [`[Copilot] Failed to ${operation} sandbox certificate`],
				});
			});

			test(`${operation} invalidates every credential configuration but retains the runtime scope`, async () => {
				const rpc = new TestCertificateRpc();
				const other = new TestCertificateRpc();
				const certificates = new CopilotSandboxCertificate(new NullLogService());
				const otherConfig = { ...config, auth: { git: false, gh: true } };
				const before = await certificates.getStatus(rpc, config);
				const beforeOtherConfig = await certificates.getStatus(rpc, otherConfig);
				const beforeOtherRuntime = await certificates.getStatus(other, config);
				await certificates[operation](rpc, config);
				const after = await certificates.getStatus(rpc, config);
				const afterOtherConfig = await certificates.getStatus(rpc, otherConfig);
				const afterOtherRuntime = await certificates.getStatus(other, config);
				assert.deepStrictEqual({
					refreshed: [before !== after, beforeOtherConfig !== afterOtherConfig],
					sameScope: before?.scopeId === after?.scopeId,
					otherRuntimeUnchanged: beforeOtherRuntime === afterOtherRuntime,
					calls: rpc.calls,
				}, {
					refreshed: [true, true], sameScope: true, otherRuntimeUnchanged: true,
					calls: ['relevance', 'support', 'status', 'relevance', 'status', operation, 'relevance', 'support', 'status', 'relevance', 'status'],
				});
			});

			test(`${operation} propagates failures, clears cached errors and permits a later retry`, async () => {
				const rpc = new TestCertificateRpc();
				rpc.status = { state: 'error', canInstall: false, detail: 'Previous read failed' };
				const warnings: string[] = [];
				const certificates = new CopilotSandboxCertificate(new class extends NullLogService {
					override warn(message: string): void { warnings.push(message); }
				});
				await certificates.getStatus(rpc, config);
				const failure = new Error('Connection closed after a partial operation');
				const pending = new DeferredPromise<never>();
				rpc.createResult = pending.p;
				rpc.trustResult = pending.p;
				const rejected = assert.rejects(certificates[operation](rpc, config), error => error === failure);
				await pending.error(failure);
				await rejected;
				rpc.createResult = undefined;
				rpc.trustResult = undefined;
				rpc.status = { state: 'notInstalled', canInstall: true };
				const refreshed = await certificates.getStatus(rpc, config);
				await certificates[operation](rpc, config);
				assert.deepStrictEqual({
					state: refreshed?.state, statusCalls: rpc.calls.filter(call => call === 'status').length, warnings,
				}, {
					state: 'notInstalled', statusCalls: 2,
					warnings: ['[Copilot] Sandbox certificate status unavailable', `[Copilot] Failed to ${operation} sandbox certificate`],
				});
			});
		}

		test('a late pre-mutation check cannot return stale status after trust', async () => {
			const rpc = new TestCertificateRpc();
			const pending = new DeferredPromise<CertificateStatus>();
			rpc.statusResult = pending.p;
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const before = certificates.getStatus(rpc, config);
			await rpc.statusStarted.p;
			rpc.statusResult = undefined;
			await certificates.trust(rpc, config);
			const after = await certificates.getStatus(rpc, config);
			await pending.complete({ state: 'notInstalled', canInstall: true });
			const late = await before;
			assert.deepStrictEqual({ sameResult: late === after, state: late?.state, calls: rpc.calls }, {
				sameResult: true, state: 'installed',
				calls: ['relevance', 'support', 'status', 'trust', 'relevance', 'support', 'status'],
			});
		});

		test('reads waiting on a failed mutation still obtain fresh status', async () => {
			const rpc = new TestCertificateRpc();
			const pending = new DeferredPromise<CertificateCreateResult>();
			rpc.createResult = pending.p;
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const creationFailed = assert.rejects(certificates.create(rpc, config), /Authorization denied/);
			const read = certificates.getStatus(rpc, config);
			await rpc.createStarted.p;
			await pending.error(new Error('Authorization denied'));
			await creationFailed;
			const status = await read;
			assert.deepStrictEqual({ state: status?.state, calls: rpc.calls }, {
				state: 'notInstalled', calls: ['create', 'relevance', 'support', 'status'],
			});
		});

		test('does not apply the five-second read timeout to an OS trust operation', () => runWithFakedTimers({}, async () => {
			const rpc = new TestCertificateRpc();
			const pending = new DeferredPromise<CertificateStatus>();
			rpc.trustResult = pending.p;
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const trust = certificates.trust(rpc, config);
			const create = certificates.create(rpc, config);
			await timeout(6_000);
			const whileAuthorizing = [...rpc.calls];
			await pending.complete({ state: 'installed', canInstall: true });
			const [result] = await Promise.all([trust, create]);
			assert.deepStrictEqual({ whileAuthorizing, calls: rpc.calls, state: result.state }, {
				whileAuthorizing: ['trust'], calls: ['trust', 'create'], state: 'installed',
			});
		}));
	});

	test('does not probe or cache disabled sandboxing', async () => {
		const rpc = new TestCertificateRpc();
		const certificates = new CopilotSandboxCertificate(new NullLogService());
		const disabled = await certificates.getStatus(rpc, { enabled: false });
		const callsWhenDisabled = [...rpc.calls];
		const enabled = await certificates.getStatus(rpc, config);
		assert.deepStrictEqual({ disabled, callsWhenDisabled, enabled: enabled?.state, calls: rpc.calls }, {
			disabled: undefined, callsWhenDisabled: [], enabled: 'notInstalled', calls: ['relevance', 'support', 'status'],
		});
	});

	test('shares in-flight and cached checks across chats with different filesystem roots', async () => {
		const rpc = new TestCertificateRpc();
		const pending = new DeferredPromise<CertificateStatus>();
		rpc.statusResult = pending.p;
		const certificates = new CopilotSandboxCertificate(new NullLogService());
		const firstConfig = { ...config, userPolicy: { filesystem: { readonlyPaths: ['/first/attachments'] } } };
		const first = certificates.getStatus(rpc, firstConfig);
		const second = certificates.getStatus(rpc, { ...config, userPolicy: { filesystem: { readonlyPaths: ['/second/attachments'] } } });
		await pending.complete(rpc.status);
		const results = await Promise.all([first, second, certificates.getStatus(rpc, config)]);
		assert.deepStrictEqual({
			samePromise: first === second,
			sameScope: results.every(result => result?.scopeId === results[0]?.scopeId),
			states: results.map(result => result?.state),
			calls: rpc.calls,
			configs: rpc.configs,
		}, {
			samePromise: true, sameScope: true, states: ['notInstalled', 'notInstalled', 'notInstalled'],
			calls: ['relevance', 'support', 'status'],
			configs: [{ sandboxConfig: firstConfig }, { sandboxConfig: firstConfig }],
		});
	});

	test('does not query OS trust when the runtime says the credential proxy is irrelevant', async () => {
		const rpc = new TestCertificateRpc();
		rpc.relevant = false;
		const certificates = new CopilotSandboxCertificate(new NullLogService());
		const first = await certificates.getStatus(rpc, config);
		const second = await certificates.getStatus(rpc, config);
		rpc.relevant = true;
		const changed = await certificates.getStatus(rpc, { ...config, auth: { git: false, gh: true } });
		assert.deepStrictEqual({ states: [first?.state, second?.state, changed?.state], calls: rpc.calls }, {
			states: ['notRequired', 'notRequired', 'notInstalled'], calls: ['relevance', 'relevance', 'support', 'status'],
		});
	});

	test('checks changed credential destinations but reuses runtime installation support', async () => {
		const rpc = new TestCertificateRpc();
		const certificates = new CopilotSandboxCertificate(new NullLogService());
		for (const host of ['first.example.com', 'second.example.com']) {
			await certificates.getStatus(rpc, { ...config, credentials: { envVars: { TOKEN: { injectHosts: [host] } } } });
		}
		assert.deepStrictEqual(rpc.calls, ['relevance', 'support', 'status', 'relevance', 'status']);
	});

	test('a replacement runtime gets a new check and scope', async () => {
		const firstRpc = new TestCertificateRpc();
		const secondRpc = new TestCertificateRpc();
		const certificates = new CopilotSandboxCertificate(new NullLogService());
		const first = await certificates.getStatus(firstRpc, config);
		const second = await certificates.getStatus(secondRpc, config);
		assert.deepStrictEqual({ newScope: first?.scopeId !== second?.scopeId, calls: [firstRpc.calls, secondRpc.calls] }, {
			newScope: true, calls: [['relevance', 'support', 'status'], ['relevance', 'support', 'status']],
		});
	});

	for (const status of [
		{ state: 'installed', canInstall: true },
		{ state: 'notInstalled', canInstall: true },
		{ state: 'installed', canInstall: true, detail: 'New credential host requires rotation.' },
		{ state: 'notInstalled', canInstall: true, detail: 'Stored certificate requires rotation.' },
		{ state: 'unsupported', canInstall: false },
		{ state: 'error', canInstall: false, detail: 'OS trust store could not be read.' },
	] satisfies CertificateStatus[]) {
		test(`preserves ${status.state} status${status.detail ? ' with detail' : ''}`, async () => {
			const rpc = new TestCertificateRpc();
			rpc.status = status;
			const warnings: string[] = [];
			const certificates = new CopilotSandboxCertificate(new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			});
			const result = await certificates.getStatus(rpc, config);
			assert.deepStrictEqual({ ...result, scopeId: !!result?.scopeId, warnings }, {
				...status, scopeId: true,
				requiresRotation: (status.state === 'installed' || status.state === 'notInstalled') && status.detail !== undefined,
				warnings: status.state === 'error' ? ['[Copilot] Sandbox certificate status unavailable'] : [],
			});
		});
	}

	test('does not offer installation when the runtime cannot elevate', async () => {
		const rpc = new TestCertificateRpc();
		rpc.supported = false;
		const result = await new CopilotSandboxCertificate(new NullLogService()).getStatus(rpc, config);
		assert.deepStrictEqual({ state: result?.state, canInstall: result?.canInstall }, { state: 'notInstalled', canInstall: false });
	});

	for (const failingMethod of ['checkRelevance', 'checkInstallationSupport', 'getStatus'] as const) {
		test(`caches and logs ${failingMethod} failures without rejecting callers`, async () => {
			const rpc = new TestCertificateRpc();
			rpc[failingMethod] = () => { throw new Error('Connection closed'); };
			const warnings: string[] = [];
			const certificates = new CopilotSandboxCertificate(new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			});
			const first = await certificates.getStatus(rpc, config);
			const second = await certificates.getStatus(rpc, config);
			assert.deepStrictEqual({ sameResult: first === second, ...first, scopeId: !!first?.scopeId, warnings }, {
				sameResult: true, scopeId: true, state: 'error', canInstall: false, requiresRotation: false, detail: 'Connection closed',
				warnings: ['[Copilot] Failed to check sandbox certificate status'],
			});
		});
	}

	for (const rejectLate of [false, true]) {
		test(`caches timeouts and ignores late ${rejectLate ? 'rejections' : 'results'}`, () => runWithFakedTimers({}, async () => {
			const rpc = new TestCertificateRpc();
			const pending = new DeferredPromise<CertificateStatus>();
			rpc.statusResult = pending.p;
			const certificates = new CopilotSandboxCertificate(new NullLogService());
			const start = Date.now();
			const first = await certificates.getStatus(rpc, config);
			const elapsed = Date.now() - start;
			if (rejectLate) {
				await pending.error(new Error('Late rejection'));
			} else {
				await pending.complete({ state: 'installed', canInstall: true });
			}
			const second = await certificates.getStatus(rpc, config);
			assert.deepStrictEqual({ elapsed, state: second?.state, sameResult: first === second, calls: rpc.calls }, {
				elapsed: 5_000, state: 'error', sameResult: true, calls: ['relevance', 'support', 'status'],
			});
		}));
	}
});
