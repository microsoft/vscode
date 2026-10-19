/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { readAgentSandboxCertificate, type IAgentSandboxCertificateStatus } from '../../common/meta/agentSandboxCertificate.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CopilotSandboxCertificateDiagnostics } from '../../node/copilot/copilotSandboxCertificateDiagnostics.js';
import { CopilotSandboxCertificate } from '../../node/copilot/copilotSandboxCertificate.js';

suite('CopilotSandboxCertificateDiagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'ahp-session://remote-host/opaque-session';
	const chat = 'custom-chat://remote-host/opaque-chat';
	const status: IAgentSandboxCertificateStatus = { scopeId: 'shared-runtime', state: 'notInstalled', canInstall: true, requiresRotation: false };

	function createManager(...sessions: string[]): AgentHostStateManager {
		const manager = store.add(new AgentHostStateManager(new NullLogService()));
		for (const resource of sessions) {
			manager.createSession({
				resource, defaultChat: buildDefaultChatUri(resource), provider: 'copilot', title: 'Certificate test', status: SessionStatus.Idle,
				createdAt: '2026-10-15T00:00:00.000Z', modifiedAt: '2026-10-15T00:00:00.000Z',
				_meta: { unrelated: 'preserved', 'vscode.sandboxDiagnostics': ['Missing dependency'] },
			});
		}
		return manager;
	}

	test('returns immediately and publishes completion through the existing action stream', async () => {
		const manager = createManager(session);
		const pending = new DeferredPromise<IAgentSandboxCertificateStatus>();
		const published = new DeferredPromise<void>();
		const actions: string[] = [];
		store.add(manager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				actions.push(envelope.channel);
				void published.complete();
			}
		}));
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), () => pending.p, manager, new NullLogService()));
		const returned = diagnostics.update({ enabled: true });
		const before = readAgentSandboxCertificate(manager.getSessionSummary(session), chat);
		await pending.complete(status);
		await returned;
		await published.p;
		diagnostics.update({ enabled: true });
		await timeout(0);
		assert.deepStrictEqual({ before, actions, meta: manager.getSessionSummary(session)?._meta }, {
			before: undefined, actions: [session],
			meta: {
				unrelated: 'preserved', 'vscode.sandboxDiagnostics': ['Missing dependency'],
				'vscode.sandboxCertificate': { version: 1, chats: { [chat]: status } },
			},
		});
	});

	test('one host check asynchronously updates every waiting session with the same scope', async () => {
		const secondSession = 'ahp-session://remote-host/second-session';
		const manager = createManager(session, secondSession);
		const certificates = new CopilotSandboxCertificate(new NullLogService());
		const pending = new DeferredPromise<Awaited<ReturnType<CopilotClient['rpc']['sandbox']['proxyCa']['getStatus']>>>();
		let queries = 0;
		const rpc = new class extends mock<CopilotClient['rpc']['sandbox']['proxyCa']>() {
			override checkRelevance = async () => true;
			override checkInstallationSupport = async () => true;
			override getStatus = () => { queries++; return pending.p; };
		};
		const actions: string[] = [];
		store.add(manager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				actions.push(envelope.channel);
			}
		}));
		for (const resource of [session, secondSession]) {
			const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(
				() => ({ session: resource, chat: buildDefaultChatUri(resource) }),
				config => certificates.getStatus(rpc, config), manager, new NullLogService(),
			));
			diagnostics.update({ enabled: true, auth: { git: true } });
		}
		await pending.complete({ state: 'notInstalled', canInstall: true });
		await timeout(0);
		const results = [session, secondSession].map(resource => readAgentSandboxCertificate(manager.getSessionSummary(resource), buildDefaultChatUri(resource)));
		assert.deepStrictEqual({ queries, actions, states: results.map(result => result?.state), sameScope: results[0]?.scopeId === results[1]?.scopeId }, {
			queries: 1, actions: [session, secondSession], states: ['notInstalled', 'notInstalled'], sameScope: true,
		});
	});

	test('clears only this chat when disabled and ignores an older pending result', async () => {
		const manager = createManager(session);
		const pending = new DeferredPromise<IAgentSandboxCertificateStatus>();
		let calls = 0;
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), () => {
			calls++;
			return pending.p;
		}, manager, new NullLogService()));
		const peer = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat: 'peer' }), async () => status, manager, new NullLogService()));
		peer.update({ enabled: true });
		diagnostics.update({ enabled: true });
		diagnostics.update({ enabled: false });
		await pending.complete(status);
		await timeout(0);
		assert.deepStrictEqual({
			calls, current: readAgentSandboxCertificate(manager.getSessionSummary(session), chat),
			peer: readAgentSandboxCertificate(manager.getSessionSummary(session), 'peer'),
		}, { calls: 1, current: undefined, peer: status });
	});

	test('publishes an error result without modifying dependency diagnostics', async () => {
		const manager = createManager(session);
		const error: IAgentSandboxCertificateStatus = { ...status, state: 'error', canInstall: false, detail: 'Connection closed' };
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), async () => error, manager, new NullLogService()));
		diagnostics.update({ enabled: true });
		await timeout(0);
		assert.deepStrictEqual({
			certificate: readAgentSandboxCertificate(manager.getSessionSummary(session), chat),
			dependencies: manager.getSessionSummary(session)?._meta?.['vscode.sandboxDiagnostics'],
		}, { certificate: error, dependencies: ['Missing dependency'] });
	});

	test('a newer configuration wins over a late result', async () => {
		const manager = createManager(session);
		const pending = new DeferredPromise<IAgentSandboxCertificateStatus>();
		const installed: IAgentSandboxCertificateStatus = { ...status, state: 'installed' };
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), config =>
			config.auth?.git ? pending.p : Promise.resolve(installed), manager, new NullLogService()));
		diagnostics.update({ enabled: true, auth: { git: true } });
		diagnostics.update({ enabled: true, auth: { git: false } });
		await pending.complete(status);
		await timeout(0);
		assert.deepStrictEqual(readAgentSandboxCertificate(manager.getSessionSummary(session), chat), installed);
	});

	test('irrelevant configurations clear previously published certificate status', async () => {
		const manager = createManager(session);
		let result = status;
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), async () => result, manager, new NullLogService()));
		diagnostics.update({ enabled: true });
		await timeout(0);
		result = { ...status, state: 'notRequired' };
		diagnostics.update({ enabled: true });
		await timeout(0);
		assert.deepStrictEqual(manager.getSessionSummary(session)?._meta, {
			unrelated: 'preserved', 'vscode.sandboxDiagnostics': ['Missing dependency'],
		});
	});

	test('uses the current owner if the chat moves during a check', async () => {
		const destination = 'ahp-session://remote-host/destination';
		const manager = createManager(session, destination);
		let owner = session;
		const pending = new DeferredPromise<IAgentSandboxCertificateStatus>();
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session: owner, chat }), () => pending.p, manager, new NullLogService()));
		diagnostics.update({ enabled: true });
		owner = destination;
		await pending.complete(status);
		await timeout(0);
		assert.deepStrictEqual([
			readAgentSandboxCertificate(manager.getSessionSummary(session), chat),
			readAgentSandboxCertificate(manager.getSessionSummary(destination), chat),
		], [undefined, status]);
	});

	test('does not publish after disposal or session removal', async () => {
		const manager = createManager(session);
		const pending = new DeferredPromise<IAgentSandboxCertificateStatus>();
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), () => pending.p, manager, new NullLogService()));
		diagnostics.update({ enabled: true });
		diagnostics.dispose();
		await pending.complete(status);
		await timeout(0);
		const afterDisposal = readAgentSandboxCertificate(manager.getSessionSummary(session), chat);
		manager.deleteSession(session);
		const removed = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), async () => status, manager, new NullLogService()));
		removed.update({ enabled: true });
		await timeout(0);
		assert.deepStrictEqual({ afterDisposal, afterRemoval: manager.getSessionSummary(session) }, { afterDisposal: undefined, afterRemoval: undefined });
	});

	test('contains unexpected publication failures', async () => {
		const manager = createManager(session);
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		};
		const diagnostics = store.add(new CopilotSandboxCertificateDiagnostics(() => ({ session, chat }), async () => {
			throw new Error('Unexpected failure');
		}, manager, log));
		diagnostics.update({ enabled: true });
		await timeout(0);
		assert.deepStrictEqual(warnings, ['[Copilot] Failed to publish sandbox certificate diagnostics']);
	});
});
