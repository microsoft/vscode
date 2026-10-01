/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ICodexAccountInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { INotification, NotificationType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, RootState, SessionModelInfo } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryData } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkbenchAssignmentService } from '../../../assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IHostService } from '../../../host/browser/host.js';
import { ICodexAccountService } from '../../browser/codexAccountService.js';
import { CODEX_CONTINUATION_STORAGE_KEY, CodexContinuationService } from '../../browser/codexContinuationService.js';

suite('Codex continuation coordination', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const source: SessionModelInfo = { provider: 'codex', id: '@provider=openai:gpt', name: 'GPT', _meta: { modelSourceId: 'chatgptSubscription' } };
	const target: SessionModelInfo = { provider: 'codex', id: '@provider=vscode-proxy:gpt', name: 'GPT Copilot' };

	function create(storage: InMemoryStorageService, treatment = true) {
		const order: string[] = [];
		const activity = { listSessions: 0 };
		const backend = AgentSession.uri('codex', 'existing');
		const session: { session: URI; startTime: number; modifiedTime: number; model?: { id: string } } = { session: backend, startTime: 1, modifiedTime: 2, model: { id: source.id } };
		const notifications = store.add(new Emitter<INotification>());
		const root = new class extends mock<IAgentSubscription<RootState>>() {
			override onDidChange = Event.None;
			override value = new class extends mock<RootState>() { override agents = [{ provider: 'codex', displayName: 'Codex', description: '', models: [source, target] }]; }();
		}();
		const agent = new class extends NullAgentHostService {
			override get rootState() { return root; }
			override readonly onDidNotification = notifications.event;
			override dispatch(): void { }
			override async listSessions() { activity.listSessions++; return [session]; }
		}();
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override ambientConnection = agent;
			override getSessionResource() { return URI.parse('agent-host-codex:/existing'); }
		}();
		const account = new class extends mock<ICodexAccountService>() {
			override onDidChangeAccount = Event.None;
			override account: ICodexAccountInfo = { status: 'signedIn', planType: 'plus', observedAt: Date.now(), rateLimits: [{ usedPercent: 95, windowDurationMins: 300 }] };
		}();
		const quotaChanged = store.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override onDidChangeEntitlement = Event.None;
			override onDidChangeQuotaRemaining = quotaChanged.event;
			override onDidChangeQuotaExceeded = Event.None;
			override onDidChangeSentiment = Event.None;
			override entitlement = ChatEntitlement.Pro;
			override sentiment = { installed: true };
			override quotas: IChatEntitlementService['quotas'] = { premiumChat: { unlimited: false, percentRemaining: 0 }, additionalUsageEnabled: true };
		}();
		const host = new class extends mock<IHostService>() {
			override hasFocus = true;
			override onDidChangeFocus = Event.None;
			lastFocused = true;
			override async hadLastFocus() { return this.lastFocused; }
		}();
		const telemetry = new class extends NullTelemetryServiceShape {
			override publicLog2(name?: string, data?: ITelemetryData): void { order.push(name === 'experimentTrigger' ? 'trigger' : String(data?.action)); }
		}();
		const assignment = new class extends mock<IWorkbenchAssignmentService>() {
			override onDidRefetchAssignments = Event.None;
			override async getTreatment<T>(): Promise<T | undefined> { order.push('treatment'); return treatment as T; }
		}();
		const config = new TestConfigurationService({ chat: { agentHost: { codexAgent: { enabled: true } } } });
		const environment = new class extends mock<IWorkbenchEnvironmentService>() {
			override isSessionsWindow = true;
		}();

		const service = store.add(new CodexContinuationService(agent, connections, account, entitlement, host, storage, telemetry, assignment, config, environment));
		service.setSelectableModels([{ id: target.id, vendor: 'agent-host-codex' }]);
		return { service, order, host, account, entitlement, session, activity, notifications, quotaChanged };
	}

	for (const treatment of [false, true]) {
		test(`trigger precedes treatment and permanent-state gating in arm ${treatment}`, () => runWithFakedTimers({}, async () => {
			const storage = store.add(new InMemoryStorageService());
			storage.store(CODEX_CONTINUATION_STORAGE_KEY, { permanent: 'completed' }, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			const { service, order, activity } = create(storage, treatment);
			await timeout(101);
			assert.strictEqual(await service.wouldShow('agentsWindow'), false);
			assert.deepStrictEqual({ order, listSessions: activity.listSessions }, { order: ['trigger', 'treatment'], listSessions: 1 });
		}));
	}
	test('low ChatGPT usage and Copilot Free never enumerate session metadata', () => runWithFakedTimers({}, async () => {
		const lowUsage = create(store.add(new InMemoryStorageService()));
		lowUsage.account.account = { ...lowUsage.account.account, rateLimits: [{ usedPercent: 1, windowDurationMins: 300 }] };
		const free = create(store.add(new InMemoryStorageService()));
		free.entitlement.entitlement = ChatEntitlement.Free;

		await timeout(101);

		assert.deepStrictEqual({
			lowUsage: { candidate: lowUsage.service.candidate.get(), listSessions: lowUsage.activity.listSessions },
			free: { candidate: free.service.candidate.get(), listSessions: free.activity.listSessions },
		}, {
			lowUsage: { candidate: undefined, listSessions: 0 },
			free: { candidate: undefined, listSessions: 0 },
		});
	}));
	test('an ordinary live-session notification re-evaluates a newly published model without discovery', () => runWithFakedTimers({}, async () => {
		const { service, session, activity, notifications } = create(store.add(new InMemoryStorageService()));
		delete session.model;
		await timeout(101);
		assert.strictEqual(service.candidate.get(), undefined);

		session.model = { id: source.id };
		notifications.fire({
			type: NotificationType.SessionSummaryChanged,
			channel: ROOT_STATE_URI,
			session: session.session.toString(),
			changes: { _meta: {} },
		});
		await timeout(101);

		assert.deepStrictEqual({
			candidate: service.candidate.get()?.session.session.toString(),
			listSessions: activity.listSessions,
		}, {
			candidate: session.session.toString(),
			listSessions: 2,
		});
	}));
	test('two windows race for one reservation; only visible surface consumes the episode', () => runWithFakedTimers({}, async () => {
		const storage = store.add(new InMemoryStorageService());
		const a = create(storage);
		const b = create(storage);
		await timeout(101);
		assert.deepStrictEqual(await Promise.all([a.service.wouldShow('agentsWindow'), b.service.wouldShow('editorWindow')]), [true, true]);
		const results = await Promise.all([a.service.reservePresentation(), b.service.reservePresentation()]);
		assert.strictEqual(results.filter(Boolean).length, 1);
		const winner = results[0] ? a : b;
		const loser = results[0] ? b : a;
		await winner.service.releasePresentation();
		assert.strictEqual(await loser.service.wouldShow('editorWindow'), true);
		assert.strictEqual(await loser.service.reservePresentation(), true);
		assert.strictEqual(await loser.service.markVisible('editorWindow', loser.service.candidate.get()!), true);
		assert.strictEqual(await winner.service.wouldShow('agentsWindow'), false);
		assert.deepStrictEqual([winner.order.filter(event => event === 'shown').length, loser.order.filter(event => event === 'shown').length], [0, 1]);
	}));
	test('background windows cannot trigger or claim; manual changes never permanently complete', () => runWithFakedTimers({}, async () => {
		const storage = store.add(new InMemoryStorageService());
		const { service, host, session, order } = create(storage);
		await timeout(101);
		host.hasFocus = false;
		assert.deepStrictEqual([await service.wouldShow('editorWindow'), await service.reservePresentation(), order], [false, false, []]);
		host.hasFocus = true;
		await service.wouldShow('editorWindow');
		await service.reservePresentation();
		await service.markVisible('editorWindow', service.candidate.get()!);
		session.model = { id: target.id };
		assert.strictEqual(await service.resolve(), undefined);
		assert.strictEqual((storage.getObject(CODEX_CONTINUATION_STORAGE_KEY, StorageScope.APPLICATION_SHARED, {}) as { permanent?: string }).permanent, undefined);
	}));
	const blockedQuotas: { name: string; entitlement?: ChatEntitlement; quotas: IChatEntitlementService['quotas'] }[] = [
		{ name: 'included premium quota exhausted', quotas: { premiumChat: { unlimited: false, percentRemaining: 0 }, additionalUsageEnabled: false } },
		{ name: 'chat quota exhausted despite additional usage', quotas: { premiumChat: { unlimited: false, percentRemaining: 50 }, chat: { unlimited: false, percentRemaining: 0 }, additionalUsageEnabled: true } },
		{ name: 'Business allowance blocked', entitlement: ChatEntitlement.Business, quotas: { premiumChat: { unlimited: true, percentRemaining: 100, hasQuota: false }, additionalUsageEnabled: true } },
		{ name: 'Enterprise allowance blocked', entitlement: ChatEntitlement.Enterprise, quotas: { premiumChat: { unlimited: false, percentRemaining: 50, hasQuota: false }, additionalUsageEnabled: true } },
		{ name: 'unknown premium allowance', quotas: {} },
	];
	for (const rateLimit of ['sessionRateLimit', 'weeklyRateLimit'] as const) {
		for (const percentRemaining of [0, 10]) {
			blockedQuotas.push({
				name: `${rateLimit} with ${percentRemaining} percent remaining`,
				quotas: { premiumChat: { unlimited: false, percentRemaining: 100 }, [rateLimit]: { unlimited: false, percentRemaining } },
			});
		}
	}
	for (const blocked of blockedQuotas) {
		test(`suppresses both surfaces when Copilot is unavailable: ${blocked.name}`, () => runWithFakedTimers({}, async () => {
			const { service, entitlement, activity, order } = create(store.add(new InMemoryStorageService()));
			entitlement.entitlement = blocked.entitlement ?? ChatEntitlement.Pro;
			entitlement.quotas = blocked.quotas;
			await timeout(101);

			assert.deepStrictEqual({
				candidate: service.candidate.get(),
				agents: await service.wouldShow('agentsWindow'),
				editor: await service.wouldShow('editorWindow'),
				reserved: await service.reservePresentation(),
				listSessions: activity.listSessions,
				telemetry: order,
			}, { candidate: undefined, agents: false, editor: false, reserved: false, listSessions: 0, telemetry: [] });
		}));
	}
	test('withdraws eligibility on a live Copilot quota update and restores it when quota returns', () => runWithFakedTimers({}, async () => {
		const { service, entitlement, quotaChanged } = create(store.add(new InMemoryStorageService()));
		await timeout(101);
		const original = service.candidate.get()!;
		assert.ok(original);

		entitlement.quotas = { ...entitlement.quotas, additionalUsageEnabled: false };
		quotaChanged.fire();
		await timeout(101);
		const blocked = { candidate: service.candidate.get(), resolved: await service.resolve(original), canShow: await service.wouldShow('agentsWindow') };

		entitlement.quotas = { premiumChat: { unlimited: false, percentRemaining: 100 } };
		quotaChanged.fire();
		await timeout(101);
		assert.deepStrictEqual({ blocked, restored: service.candidate.get()?.session.session.toString() }, {
			blocked: { candidate: undefined, resolved: undefined, canShow: false }, restored: original.session.session.toString(),
		});
	}));
	test('focus lost while the authoritative claim is read does not consume an episode', () => runWithFakedTimers({}, async () => {
		let onRead = () => { };
		const storage = store.add(new class extends InMemoryStorageService {
			override async readApplicationSharedValue(key: string): Promise<string | undefined> {
				const value = await super.readApplicationSharedValue(key);
				onRead();
				return value;
			}
		}());
		const { service, host, order } = create(storage);
		await timeout(101);
		await service.wouldShow('editorWindow');
		await service.reservePresentation();
		onRead = () => { host.hasFocus = false; };
		assert.strictEqual(await service.markVisible('editorWindow', service.candidate.get()!), false);
		assert.deepStrictEqual(order, ['trigger', 'treatment']);
		assert.strictEqual((storage.getObject(CODEX_CONTINUATION_STORAGE_KEY, StorageScope.APPLICATION_SHARED, {}) as { episode?: object }).episode, undefined);
	}));
	test('a closed surface cannot claim through a late visibility callback', () => runWithFakedTimers({}, async () => {
		const { service, order } = create(store.add(new InMemoryStorageService()));
		await timeout(101);
		await service.wouldShow('agentsWindow');
		await service.reservePresentation();
		assert.strictEqual(await service.markVisible('agentsWindow', service.candidate.get()!, () => false), false);
		assert.deepStrictEqual(order, ['trigger', 'treatment']);
	}));
	test('native active-window check excludes a background renderer with emulated document focus', () => runWithFakedTimers({}, async () => {
		const { service, host, order } = create(store.add(new InMemoryStorageService()));
		await timeout(101);
		host.lastFocused = false;
		assert.deepStrictEqual([await service.wouldShow('editorWindow'), await service.reservePresentation(), order], [false, false, []]);
	}));
});
