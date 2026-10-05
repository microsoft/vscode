/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ICodexAccountInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { INotification, NotificationType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, RootState, SessionModelInfo } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryData } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IHostService } from '../../../host/browser/host.js';
import { ICodexAccountService } from '../../browser/codexAccountService.js';
import { CODEX_CONTINUATION_SETTING, CODEX_CONTINUATION_STORAGE_KEY, CODEX_CONTINUATION_THRESHOLD_SETTING, CodexContinuationService } from '../../browser/codexContinuationService.js';

suite('Codex continuation coordination', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const source: SessionModelInfo = { provider: 'codex', id: '@provider=openai:gpt', name: 'GPT', _meta: { modelSourceId: 'chatgptSubscription' } };
	const target: SessionModelInfo = { provider: 'codex', id: '@provider=vscode-proxy:gpt', name: 'GPT Copilot' };

	function create(storage: InMemoryStorageService, treatment = true, canMapSession = true) {
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
			override getSessionResource(): URI | undefined { return canMapSession ? URI.parse('agent-host-codex:/existing') : undefined; }
		}();
		const accountChanged = store.add(new Emitter<ICodexAccountInfo>());
		const account = new class extends mock<ICodexAccountService>() {
			override onDidChangeAccount = accountChanged.event;
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
		const telemetry = new class extends TestExperimentTriggerTelemetryService {
			override publicLog2(name?: string, data?: ITelemetryData): void {
				super.publicLog2(name, data);
				order.push(name === 'experimentTrigger' ? 'trigger' : String(data?.action));
			}
		}();
		const config = new TestConfigurationService({ chat: { agentHost: { codexAgent: { enabled: true } }, experimental: { codexContinuation: { enabled: treatment } } } });
		const environment = new class extends mock<IWorkbenchEnvironmentService>() {
			override isSessionsWindow = true;
		}();

		const service = store.add(new CodexContinuationService(agent, connections, account, entitlement, host, storage, telemetry, config, environment));
		service.setSelectableModels([{ id: target.id, vendor: 'agent-host-codex' }]);
		return { service, order, telemetry, config, host, account, accountChanged, entitlement, session, activity, notifications, quotaChanged };
	}

	test('changing the threshold setting re-evaluates an existing quota observation', () => runWithFakedTimers({}, async () => {
		const { service, config, account, activity } = create(store.add(new InMemoryStorageService()));
		account.account = { ...account.account, rateLimits: [{ usedPercent: 85, windowDurationMins: 300 }] };
		await timeout(101);
		assert.deepStrictEqual({ candidate: service.candidate.get(), listSessions: activity.listSessions }, { candidate: undefined, listSessions: 0 });
		const eligible: boolean[] = [];
		for (const threshold of [80, 90, 85]) {
			await config.setUserConfiguration(CODEX_CONTINUATION_THRESHOLD_SETTING, threshold);
			config.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: () => true }));
			await timeout(101);
			eligible.push(!!service.candidate.get() && await service.wouldShow('agentsWindow'));
		}
		assert.deepStrictEqual(eligible, [true, false, true]);
	}));

	for (const threshold of [undefined, null, -1, 101, NaN, Infinity, '80']) {
		test(`invalid or missing threshold falls back to 90 percent: ${String(threshold)}`, () => runWithFakedTimers({}, async () => {
			const { service, config, account } = create(store.add(new InMemoryStorageService()));
			await config.setUserConfiguration(CODEX_CONTINUATION_THRESHOLD_SETTING, threshold);
			account.account = { ...account.account, rateLimits: [{ usedPercent: 89.99, windowDurationMins: 300 }] };
			const below = await service.resolve();
			account.account = { ...account.account, rateLimits: [{ usedPercent: 90, windowDurationMins: 300 }] };
			assert.deepStrictEqual({ below: !!below, atDefault: !!await service.resolve() }, { below: false, atDefault: true });
		}));
	}

	test('fresh usage above a lowered threshold keeps an already-shown episode suppressed', () => runWithFakedTimers({}, async () => {
		const { service, config, account, accountChanged } = create(store.add(new InMemoryStorageService()));
		await config.setUserConfiguration(CODEX_CONTINUATION_THRESHOLD_SETTING, 80);
		account.account = { ...account.account, rateLimits: [{ usedPercent: 85, windowDurationMins: 300 }] };
		await timeout(101);
		await service.wouldShow('agentsWindow');
		await service.reservePresentation();
		assert.strictEqual(await service.markVisible('agentsWindow', service.candidate.get()!), true);
		service.dismiss('agentsWindow');
		await service.releasePresentation();
		const outcomes: boolean[] = [];
		for (const usedPercent of [85, 79, 85]) {
			await timeout(1000);
			account.account = { ...account.account, observedAt: Date.now(), rateLimits: [{ usedPercent, windowDurationMins: 300 }] };
			accountChanged.fire(account.account);
			await timeout(101);
			outcomes.push(await service.wouldShow('agentsWindow'));
		}
		assert.deepStrictEqual(outcomes, [false, false, true]);
	}));

	test('a window with a higher threshold cannot clear another window\'s suppression', () => runWithFakedTimers({}, async () => {
		const storage = store.add(new InMemoryStorageService());
		const lower = create(storage);
		const higher = create(storage);
		await lower.config.setUserConfiguration(CODEX_CONTINUATION_THRESHOLD_SETTING, 80);
		lower.account.account = { ...lower.account.account, rateLimits: [{ usedPercent: 85, windowDurationMins: 300 }] };
		await timeout(101);
		await higher.service.wouldShow('editorWindow');
		await lower.service.wouldShow('agentsWindow');
		await lower.service.reservePresentation();
		assert.strictEqual(await lower.service.markVisible('agentsWindow', lower.service.candidate.get()!), true);
		lower.service.dismiss('agentsWindow');
		await lower.service.releasePresentation();
		await timeout(1000);
		higher.account.account = { ...higher.account.account, observedAt: Date.now(), rateLimits: [{ usedPercent: 85, windowDurationMins: 300 }] };
		higher.accountChanged.fire(higher.account.account);
		await timeout(101);
		assert.deepStrictEqual({
			higher: await higher.service.wouldShow('editorWindow'), lower: await lower.service.wouldShow('agentsWindow'),
		}, { higher: false, lower: false });
	}));

	for (const treatment of [false, true]) {
		test(`does not suggest a session whose exact identity cannot be mapped in arm ${treatment}`, () => runWithFakedTimers({}, async () => {
			const { service, order } = create(store.add(new InMemoryStorageService()), treatment, false);
			await timeout(101);
			assert.deepStrictEqual({
				candidate: service.candidate.get(),
				wouldShow: await service.wouldShow('agentsWindow'),
				telemetry: order,
			}, { candidate: undefined, wouldShow: false, telemetry: [] });
		}));

		test(`trigger precedes setting and permanent-state gating in arm ${treatment}`, () => runWithFakedTimers({}, async () => {
			const storage = store.add(new InMemoryStorageService());
			storage.store(CODEX_CONTINUATION_STORAGE_KEY, { permanent: 'completed' }, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			const { service, order, activity, telemetry } = create(storage, treatment);
			await timeout(101);
			assert.strictEqual(await service.wouldShow('agentsWindow'), false);
			assert.deepStrictEqual({ order, listSessions: activity.listSessions, triggers: telemetry.triggers }, {
				order: ['trigger'], listSessions: 1, triggers: [`config.${CODEX_CONTINUATION_SETTING}`],
			});
		}));

		test(`the effective setting controls presentation in arm ${treatment}`, () => runWithFakedTimers({}, async () => {
			const { service, telemetry } = create(store.add(new InMemoryStorageService()), treatment);
			await timeout(101);
			assert.deepStrictEqual({
				first: await service.wouldShow('agentsWindow'), second: await service.wouldShow('agentsWindow'),
				reserved: await service.reservePresentation(), triggers: telemetry.triggers,
			}, {
				first: treatment, second: treatment, reserved: treatment,
				triggers: [`config.${CODEX_CONTINUATION_SETTING}`],
			});
		}));
	}

	for (const action of ['dismiss', 'disable', 'complete'] as const) {
		test(`developer preview bypasses quota and setting without changing suppression or telemetry: ${action}`, () => runWithFakedTimers({}, async () => {
			let sharedReads = 0;
			let sharedWrites = 0;
			const storage = store.add(new class extends InMemoryStorageService {
				override async readApplicationSharedValue(key: string): Promise<string | undefined> {
					sharedReads++;
					return super.readApplicationSharedValue(key);
				}
				override async compareAndSwapApplicationSharedValue(key: string, expected: string | undefined, value: string) {
					sharedWrites++;
					return super.compareAndSwapApplicationSharedValue(key, expected, value);
				}
			}());
			storage.store(CODEX_CONTINUATION_STORAGE_KEY, { permanent: 'disabled' }, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
			const persisted = storage.get(CODEX_CONTINUATION_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
			const { service, account, order } = create(storage, false);
			account.account = { ...account.account, rateLimits: [{ usedPercent: 1, windowDurationMins: 300 }] };
			await timeout(101);
			assert.strictEqual(await service.showPreview(), true);
			assert.strictEqual(await service.wouldShow('agentsWindow'), true);
			assert.strictEqual(await service.reservePresentation(), true);
			assert.strictEqual(await service.markVisible('agentsWindow', service.candidate.get()!), true);
			assert.strictEqual(service.ownsEpisode(), true);
			await service[action]('agentsWindow');
			const release = service.releasePresentation();
			service.endPreview();
			await release;
			await timeout(101);
			assert.deepStrictEqual({
				persisted: storage.get(CODEX_CONTINUATION_STORAGE_KEY, StorageScope.APPLICATION_SHARED),
				sharedReads, sharedWrites, telemetry: order, ownsEpisode: service.ownsEpisode(), candidate: service.candidate.get(),
			}, { persisted, sharedReads: 0, sharedWrites: 0, telemetry: [], ownsEpisode: false, candidate: undefined });
			assert.strictEqual(await service.showPreview(), true);
			service.endPreview();
		}));
	}

	test('developer preview retains model, identity, and Copilot quota checks', () => runWithFakedTimers({}, async () => {
		const unmappable = create(store.add(new InMemoryStorageService()), false, false);
		const missingModel = create(store.add(new InMemoryStorageService()), false);
		delete missingModel.session.model;
		const exhausted = create(store.add(new InMemoryStorageService()), false);
		exhausted.entitlement.quotas = { premiumChat: { unlimited: false, percentRemaining: 0 } };
		assert.deepStrictEqual(await Promise.all([unmappable, missingModel, exhausted].map(async h => ({
			preview: await h.service.showPreview(), candidate: h.service.candidate.get(), telemetry: h.order,
		}))), Array.from({ length: 3 }, () => ({ preview: false, candidate: undefined, telemetry: [] })));
	}));

	test('turning off the setting invalidates a claimed notice and prevents further claims', () => runWithFakedTimers({}, async () => {
		const { service, config, telemetry } = create(store.add(new InMemoryStorageService()));
		await timeout(101);
		await service.wouldShow('agentsWindow');
		await service.reservePresentation();
		const candidate = service.candidate.get()!;
		assert.strictEqual(await service.markVisible('agentsWindow', candidate), true);
		await config.setUserConfiguration(CODEX_CONTINUATION_SETTING, false);
		assert.deepStrictEqual({
			ownsEpisode: service.ownsEpisode(), wouldShow: await service.wouldShow('agentsWindow'),
			reserved: await service.reservePresentation(), visible: await service.markVisible('agentsWindow', candidate),
			triggers: telemetry.triggers,
		}, { ownsEpisode: false, wouldShow: false, reserved: false, visible: false, triggers: [`config.${CODEX_CONTINUATION_SETTING}`] });
	}));

	test('accessibility visibility is scoped to live notice and guide lifetimes', () => {
		const { service } = create(store.add(new InMemoryStorageService()));
		const visibility = [service.isVisible.get()];
		const notice = store.add(service.trackVisibility());
		visibility.push(service.isVisible.get());
		const guide = store.add(service.trackVisibility());
		notice.dispose();
		visibility.push(service.isVisible.get());
		guide.dispose();
		visibility.push(service.isVisible.get());
		assert.deepStrictEqual(visibility, [false, true, true, false]);
	});
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
		assert.deepStrictEqual(order, ['trigger']);
		assert.strictEqual((storage.getObject(CODEX_CONTINUATION_STORAGE_KEY, StorageScope.APPLICATION_SHARED, {}) as { episode?: object }).episode, undefined);
	}));
	test('a closed surface cannot claim through a late visibility callback', () => runWithFakedTimers({}, async () => {
		const { service, order } = create(store.add(new InMemoryStorageService()));
		await timeout(101);
		await service.wouldShow('agentsWindow');
		await service.reservePresentation();
		assert.strictEqual(await service.markVisible('agentsWindow', service.candidate.get()!, () => false), false);
		assert.deepStrictEqual(order, ['trigger']);
	}));
	test('native active-window check excludes a background renderer with emulated document focus', () => runWithFakedTimers({}, async () => {
		const { service, host, order } = create(store.add(new InMemoryStorageService()));
		await timeout(101);
		host.lastFocused = false;
		assert.deepStrictEqual([await service.wouldShow('editorWindow'), await service.reservePresentation(), order], [false, false, []]);
	}));
});
