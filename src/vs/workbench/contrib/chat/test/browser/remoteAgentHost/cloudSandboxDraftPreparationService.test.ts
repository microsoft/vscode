/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxEarlyPreparationSettingId, CloudSandboxEnabledSettingId, CloudSandboxRequestError, ICloudSandboxApiService, ICloudSandboxEnvironment } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { CloudSandboxDraftPreparationService } from '../../../browser/remoteAgentHost/cloudSandboxDraftPreparationService.js';

suite('CloudSandboxDraftPreparationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorDraft = URI.parse('cloud-sandbox:/untitled-editor');
	const agentsDraft = URI.parse('copilot-cloud-sandbox:/untitled-agents');
	const prepared = { environmentId: 'env-1', expectedAccountKey: 'account-a' };

	function createFixture(options: {
		readonly getAccountKey?: () => Promise<string | undefined>;
		readonly provision?: (token: CancellationToken) => Promise<string>;
		readonly getEnvironment?: (environmentId: string, token: CancellationToken) => Promise<ICloudSandboxEnvironment>;
		readonly deleteEnvironment?: (environmentId: string) => Promise<void>;
		readonly configuration?: Record<string, boolean | undefined>;
		readonly hidden?: boolean;
		readonly trusted?: boolean;
	} = {}) {
		let account: string | undefined = 'account-a';
		let allocations = 0;
		let accountLookups = 0;
		let trusted = options.trusted ?? true;
		const sentiment = { hidden: options.hidden ?? false };
		const changedAccount = store.add(new Emitter<string | undefined>());
		const changedSentiment = store.add(new Emitter<void>());
		const changedTrust = store.add(new Emitter<boolean>());
		const enteredAllocation = new DeferredPromise<void>();
		const enteredReadiness = new DeferredPromise<void>();
		const deleted = new DeferredPromise<void>();
		const calls: string[] = [];
		const readTimes: number[] = [];
		const deletionAttempts: { environmentId: string; expectedAccountKey: string }[] = [];
		const warnings: string[] = [];
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({
			[CloudSandboxEarlyPreparationSettingId]: true,
			[CloudSandboxEnabledSettingId]: true,
			[RemoteAgentHostsEnabledSettingId]: true,
			[ChatAIDisabledSettingId]: false,
			...options.configuration,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const telemetry = new TestExperimentTriggerTelemetryService();
		const api = new class extends mock<ICloudSandboxApiService>() {
			override readonly onDidChangeAccount = changedAccount.event;

			override async getAccountKey(): Promise<string | undefined> {
				accountLookups++;
				return options.getAccountKey ? options.getAccountKey() : account;
			}

			override async provisionEnvironment(token: CancellationToken, expectedAccountKey?: string): Promise<string> {
				if (!account || expectedAccountKey !== account) {
					throw new CancellationError();
				}
				calls.push('provision');
				if (!enteredAllocation.isSettled) {
					void enteredAllocation.complete();
				}
				return options.provision ? options.provision(token) : `env-${++allocations}`;
			}

			override async getEnvironment(environmentId: string, token: CancellationToken): Promise<ICloudSandboxEnvironment> {
				calls.push(`read:${environmentId}`);
				readTimes.push(Date.now());
				if (!enteredReadiness.isSettled) {
					void enteredReadiness.complete();
				}
				return options.getEnvironment ? options.getEnvironment(environmentId, token) : { id: environmentId, status: 'online' };
			}

			override async deleteEnvironment(environmentId: string, expectedAccountKey: string): Promise<void> {
				deletionAttempts.push({ environmentId, expectedAccountKey });
				if (!account || expectedAccountKey !== account) {
					throw new CancellationError();
				}
				calls.push(`delete:${environmentId}`);
				await options.deleteEnvironment?.(environmentId);
				if (!deleted.isSettled) {
					void deleted.complete();
				}
			}
		}();
		instantiation.stub(ICloudSandboxApiService, api);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ITelemetryService, telemetry);
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = changedSentiment.event;
			override readonly sentiment = sentiment;
		}());
		instantiation.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
			override readonly onDidChangeTrust = changedTrust.event;
			override isWorkspaceTrusted(): boolean { return trusted; }
		}());
		instantiation.stub(ILogService, new class extends NullLogService {
			override warn(message: string): void {
				warnings.push(message);
			}
		}());
		const service = store.add(instantiation.createInstance(CloudSandboxDraftPreparationService));
		return {
			service, calls, warnings, readTimes, deletionAttempts, configuration, triggers: telemetry.triggers,
			accountLookups: () => accountLookups,
			enteredAllocation: enteredAllocation.p,
			enteredReadiness: enteredReadiness.p,
			deleted: deleted.p,
			setAccount(value: string | undefined, notify = true) {
				account = value;
				if (notify) {
					changedAccount.fire(value);
				}
			},
			async setConfiguration(key: string, value: boolean, source = ConfigurationTarget.USER) {
				await configuration.setUserConfiguration(key, value);
				configuration.onDidChangeConfigurationEmitter.fire({
					affectsConfiguration: section => section === key,
					affectedKeys: new Set([key]),
					source,
					change: { keys: [key], overrides: [] },
				});
			},
			setHidden(value: boolean) {
				sentiment.hidden = value;
				changedSentiment.fire();
			},
			setTrusted(value: boolean) {
				trusted = value;
				changedTrust.fire(value);
			},
		};
	}

	for (const enabled of [false, true, undefined]) {
		test(`logs experiment exposure in the eligible input path with setting ${enabled}`, async () => {
			const fixture = createFixture({ configuration: { [CloudSandboxEarlyPreparationSettingId]: enabled } });
			fixture.service.prepare(editorDraft);
			fixture.service.prepare(editorDraft);
			await timeout(0);
			const callsWhileDrafting = [...fixture.calls];
			const accountLookups = fixture.accountLookups();
			await fixture.service.clear();

			assert.deepStrictEqual({ callsWhileDrafting, accountLookups, triggers: fixture.triggers }, {
				callsWhileDrafting: enabled === true ? ['provision'] : [],
				accountLookups: enabled === true ? 1 : 0,
				triggers: [`config.${CloudSandboxEarlyPreparationSettingId}`],
			});
		});
	}

	test('constructing the service or enabling the setting alone does not prepare or log exposure', async () => {
		const fixture = createFixture({ configuration: { [CloudSandboxEarlyPreparationSettingId]: false } });
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, true, ConfigurationTarget.DEFAULT);
		await timeout(0);

		assert.deepStrictEqual({ calls: fixture.calls, accountLookups: fixture.accountLookups(), triggers: fixture.triggers }, {
			calls: [], accountLookups: 0, triggers: [],
		});
	});

	test('picks up a changed experiment default on the next eligible input without replacing the service', async () => {
		const fixture = createFixture({ configuration: { [CloudSandboxEarlyPreparationSettingId]: false } });
		fixture.service.prepare(editorDraft);
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, true, ConfigurationTarget.DEFAULT);
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls, triggers: fixture.triggers }, {
			result: prepared, calls: ['provision', 'read:env-1'],
			triggers: [`config.${CloudSandboxEarlyPreparationSettingId}`],
		});
	});

	for (const unavailable of [
		{ name: 'Cloud disabled', configuration: { [CloudSandboxEnabledSettingId]: false } },
		{ name: 'remote hosts disabled', configuration: { [RemoteAgentHostsEnabledSettingId]: false } },
		{ name: 'AI disabled', configuration: { [ChatAIDisabledSettingId]: true } },
		{ name: 'AI hidden', hidden: true },
		{ name: 'untrusted workspace', trusted: false },
	]) {
		test(`does not prepare or log exposure when ${unavailable.name}`, async () => {
			const fixture = createFixture(unavailable);
			fixture.service.prepare(editorDraft);
			await timeout(0);

			assert.deepStrictEqual({ calls: fixture.calls, accountLookups: fixture.accountLookups(), triggers: fixture.triggers }, {
				calls: [], accountLookups: 0, triggers: [],
			});
		});
	}

	test('disabling preparation before identity resolves prevents allocation', async () => {
		const account = new DeferredPromise<string | undefined>();
		const entered = new DeferredPromise<void>();
		const fixture = createFixture({
			getAccountKey: () => { void entered.complete(); return account.p; },
		});
		fixture.service.prepare(editorDraft);
		await entered.p;
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false);
		await account.complete('account-a');
		await fixture.service.clear();

		assert.deepStrictEqual(fixture.calls, []);
	});

	for (const change of [
		{ name: 'preparation setting', apply: (fixture: ReturnType<typeof createFixture>) => fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false) },
		{ name: 'Cloud setting', apply: (fixture: ReturnType<typeof createFixture>) => fixture.setConfiguration(CloudSandboxEnabledSettingId, false) },
		{ name: 'remote hosts setting', apply: (fixture: ReturnType<typeof createFixture>) => fixture.setConfiguration(RemoteAgentHostsEnabledSettingId, false) },
		{ name: 'AI setting', apply: (fixture: ReturnType<typeof createFixture>) => fixture.setConfiguration(ChatAIDisabledSettingId, true) },
		{ name: 'AI sentiment', apply: async (fixture: ReturnType<typeof createFixture>) => fixture.setHidden(true) },
		{ name: 'workspace trust', apply: async (fixture: ReturnType<typeof createFixture>) => fixture.setTrusted(false) },
	]) {
		test(`releases a late unused allocation when disabled through ${change.name}`, async () => {
			const allocation = new DeferredPromise<string>();
			const fixture = createFixture({ provision: () => allocation.p });
			fixture.service.prepare(editorDraft);
			await fixture.enteredAllocation;
			await change.apply(fixture);
			await allocation.complete('env-1');
			await fixture.service.clear();

			assert.deepStrictEqual(fixture.calls, ['provision', 'delete:env-1']);
		});
	}

	test('re-enabling does not automatically replace a discarded preparation', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false);
		await fixture.service.clear();
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, true);
		fixture.service.prepare(editorDraft);
		await timeout(0);

		assert.deepStrictEqual(fixture.calls, ['provision', 'delete:env-1']);
	});

	test('disabling early preparation does not cancel an allocation already claimed by Send', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		const claimed = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false);
		await fixture.service.clear();
		await allocation.complete('env-1');

		assert.deepStrictEqual({ result: await claimed, calls: fixture.calls }, {
			result: prepared, calls: ['provision', 'read:env-1'],
		});
	});

	test('cleanup still reports a failure after the setting is disabled', async () => {
		const fixture = createFixture({ deleteEnvironment: async () => { throw new Error('unavailable'); } });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false);
		await fixture.service.clear();

		assert.deepStrictEqual({ calls: fixture.calls, warnings: fixture.warnings }, {
			calls: ['provision', 'delete:env-1'],
			warnings: ['[CloudSandboxPreparation] Could not delete unused environment env-1; cleanup is incomplete.'],
		});
	});

	test('deduplicates a draft and lets Send await its unfinished allocation', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		fixture.service.prepare(URI.parse(editorDraft.toString()));
		await fixture.enteredAllocation;
		const claimed = fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);
		const before = [...fixture.calls];
		await allocation.complete('env-1');

		assert.deepStrictEqual({ before, result: await claimed, calls: fixture.calls }, {
			before: ['provision'],
			result: prepared,
			calls: ['provision', 'read:env-1'],
		});
	});

	test('keeps preparations for editor and Agents drafts independent', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		fixture.service.prepare(agentsDraft);
		const [editor, agents] = await Promise.all([
			fixture.service.take(editorDraft, CancellationToken.None),
			fixture.service.take(agentsDraft, CancellationToken.None),
		]);

		assert.deepStrictEqual({
			editor, agents,
			allocations: fixture.calls.filter(call => call === 'provision').length,
		}, { editor: prepared, agents: { ...prepared, environmentId: 'env-2' }, allocations: 2 });
	});

	test('preparing alone does not poll, connect, or create a task or session', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await timeout(60_000);
		const callsWhileDrafting = [...fixture.calls];
		await fixture.service.discard(editorDraft);

		assert.deepStrictEqual(callsWhileDrafting, ['provision']);
	}));

	test('Send before preparation prevents late typing from allocating', async () => {
		const fixture = createFixture();
		const missing = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ missing, retry, calls: fixture.calls }, { missing: undefined, retry: undefined, calls: [] });
	});

	test('allows only one claim and leaves a transferred environment alone', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		const first = fixture.service.take(editorDraft, CancellationToken.None);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /already been claimed/);
		await allocation.complete('env-1');
		const result = await first;
		await fixture.service.discard(editorDraft);
		await fixture.service.clear();
		await fixture.service.forget(editorDraft);
		fixture.service.dispose();

		assert.deepStrictEqual({ result, calls: fixture.calls, deletions: fixture.deletionAttempts }, {
			result: prepared, calls: ['provision', 'read:env-1'], deletions: [],
		});
	});

	test('returning a taken receipt releases once and allows a later Send without preparing again', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		const taken = await fixture.service.take(editorDraft, CancellationToken.None);
		assert.ok(taken);
		await Promise.all([fixture.service.release(taken), fixture.service.release(taken)]);
		fixture.service.prepare(editorDraft);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.service.release(taken);

		assert.deepStrictEqual({ retry, calls: fixture.calls }, {
			retry: undefined, calls: ['provision', 'read:env-1', 'delete:env-1'],
		});
	});

	for (const dispose of [false, true]) {
		test(`returning a taken receipt after ${dispose ? 'service disposal' : 'forgetting the draft'} releases once`, async () => {
			const fixture = createFixture();
			fixture.service.prepare(editorDraft);
			const taken = await fixture.service.take(editorDraft, CancellationToken.None);
			assert.ok(taken);
			if (dispose) {
				fixture.service.dispose();
			} else {
				await fixture.service.forget(editorDraft);
			}
			await Promise.all([fixture.service.release(taken), fixture.service.release(taken)]);

			assert.deepStrictEqual(fixture.calls, ['provision', 'read:env-1', 'delete:env-1']);
		});
	}

	test('returning an old receipt does not reset or delete a newer claim for the same draft', async () => {
		const readiness = new DeferredPromise<ICloudSandboxEnvironment>();
		const fixture = createFixture({
			getEnvironment: async id => id === 'env-1' ? readiness.p : { id, status: 'online' },
		});
		fixture.service.prepare(editorDraft);
		const claiming = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.enteredReadiness;
		await fixture.service.forget(editorDraft);
		await readiness.complete({ id: 'env-1', status: 'online' });
		const old = await claiming;
		assert.ok(old);
		fixture.service.prepare(editorDraft);
		const current = await fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.service.release(old);
		await fixture.service.release(old);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /already been claimed/);

		assert.deepStrictEqual({ current, attempts: fixture.deletionAttempts }, {
			current: { ...prepared, environmentId: 'env-2' },
			attempts: [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }],
		});
	});

	test('returning a taken receipt reports cleanup failure without retrying or preparing again', async () => {
		const fixture = createFixture({ deleteEnvironment: async () => { throw new Error('unavailable'); } });
		fixture.service.prepare(editorDraft);
		const taken = await fixture.service.take(editorDraft, CancellationToken.None);
		assert.ok(taken);
		await fixture.service.release(taken);
		await fixture.service.forget(editorDraft);
		await fixture.service.release(taken);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual({ retry, calls: fixture.calls, warnings: fixture.warnings }, {
			retry: undefined, calls: ['provision', 'read:env-1', 'delete:env-1'],
			warnings: ['[CloudSandboxPreparation] Could not delete unused environment env-1; cleanup is incomplete.'],
		});
	});

	test('returning an unrecognized receipt never deletes an environment', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		const taken = await fixture.service.take(editorDraft, CancellationToken.None);
		assert.ok(taken);
		await assert.rejects(fixture.service.release({ ...taken }), /not handed off/);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /already been claimed/);

		assert.deepStrictEqual(fixture.deletionAttempts, []);
	});

	test('discarding before account resolution never allocates', async () => {
		const account = new DeferredPromise<string | undefined>();
		const entered = new DeferredPromise<void>();
		const fixture = createFixture({
			getAccountKey: () => { void entered.complete(); return account.p; },
		});
		fixture.service.prepare(editorDraft);
		await entered.p;
		await fixture.service.discard(editorDraft);
		await account.complete('account-a');
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual(fixture.calls, []);
	});

	test('keeps listening to an abandoned allocation and deletes its late receipt once', async () => {
		const allocation = new DeferredPromise<string>();
		let allocationToken: CancellationToken | undefined;
		const fixture = createFixture({
			provision: token => { allocationToken = token; return allocation.p; },
		});
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		const discarded = fixture.service.discard(editorDraft);
		const discardedAgain = fixture.service.discard(editorDraft);
		await allocation.complete('env-1');
		await Promise.all([discarded, discardedAgain]);
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			requestCancelled: allocationToken?.isCancellationRequested,
			calls: fixture.calls,
		}, { result: undefined, requestCancelled: false, calls: ['provision', 'delete:env-1'] });
	});

	test('closing a draft while Send waits does not delete the claimed environment', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		const claimed = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.service.forget(editorDraft);
		await allocation.complete('env-1');

		assert.deepStrictEqual({ result: await claimed, calls: fixture.calls }, {
			result: prepared, calls: ['provision', 'read:env-1'],
		});
	});

	test('clearing releases unused preparations but not a claim in progress', async () => {
		const readiness = new DeferredPromise<ICloudSandboxEnvironment>();
		const fixture = createFixture({ getEnvironment: () => readiness.p });
		fixture.service.prepare(editorDraft);
		const claimed = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.enteredReadiness;
		fixture.service.prepare(agentsDraft);
		await timeout(0);
		await fixture.service.clear();
		await readiness.complete({ id: 'env-1', status: 'online' });

		assert.deepStrictEqual({ result: await claimed, deleted: fixture.deletionAttempts }, {
			result: prepared, deleted: [{ environmentId: 'env-2', expectedAccountKey: 'account-a' }],
		});
	});

	test('expires five minutes after the allocation receipt, without automatically replacing it', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture({ provision: async () => { await timeout(10_000); return 'env-1'; } });
		fixture.service.prepare(editorDraft);
		await timeout(309_999);
		const beforeExpiry = [...fixture.calls];
		await timeout(1);
		await fixture.service.discard(editorDraft);
		fixture.service.prepare(editorDraft);
		await timeout(1_000);

		assert.deepStrictEqual({ beforeExpiry, calls: fixture.calls }, {
			beforeExpiry: ['provision'], calls: ['provision', 'delete:env-1'],
		});
	}));

	test('a claim just before expiry survives the unused deadline', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture({
			getEnvironment: async id => {
				await timeout(2_000);
				return { id, status: 'online' };
			},
		});
		fixture.service.prepare(editorDraft);
		await timeout(299_999);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls }, {
			result: prepared, calls: ['provision', 'read:env-1'],
		});
	}));

	test('Send after expiry misses preparation and does not allocate a replacement', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await timeout(300_001);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual({ result, calls: fixture.calls }, {
			result: undefined, calls: ['provision', 'delete:env-1'],
		});
	}));

	test('polls only while Send waits for an online environment', () => runWithFakedTimers({}, async () => {
		const statuses: ICloudSandboxEnvironment['status'][] = ['offline', 'waking', 'degraded', 'online'];
		const fixture = createFixture({
			getEnvironment: async id => ({ id, status: statuses.shift() ?? 'online' }),
		});
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, readTimes: fixture.readTimes }, {
			result: prepared, readTimes: [0, 1_000, 2_000, 3_000],
		});
	}));

	test('honors server pacing for transient readiness failures without discarding the environment', () => runWithFakedTimers({}, async () => {
		let reads = 0;
		const fixture = createFixture({
			getEnvironment: async id => {
				switch (++reads) {
					case 1: throw new CloudSandboxRequestError(429, 'rate limited', 2, { code: 'rate_limit_exceeded' });
					case 2: return { id, status: 'waking' };
					default: return { id, status: 'online' };
				}
			},
		});
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, readTimes: fixture.readTimes, deletions: fixture.deletionAttempts }, {
			result: prepared, readTimes: [0, 2_000, 3_000], deletions: [],
		});
	}));

	test('bounds consecutive unanswered readiness requests using the existing backoff', () => runWithFakedTimers({}, async () => {
		const error = new Error('network unavailable');
		const fixture = createFixture({ getEnvironment: async () => { throw error; } });
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), caught => caught === error);
		await fixture.deleted;

		assert.deepStrictEqual({
			reads: fixture.readTimes.length,
			boundedBackoff: Date.now() >= 7_000 && Date.now() < 7_750,
			deletions: fixture.deletionAttempts,
		}, {
			reads: 4, boundedBackoff: true,
			deletions: [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }],
		});
	}));

	test('does not retry permanent readiness refusals even with a server-error status', async () => {
		const error = new CloudSandboxRequestError(503, 'forbidden', undefined, { code: 'forbidden' });
		const fixture = createFixture({ getEnvironment: async () => { throw error; } });
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), caught => caught === error);
		await fixture.deleted;

		assert.deepStrictEqual(fixture.calls, ['provision', 'read:env-1', 'delete:env-1']);
	});

	test('an oversized server retry delay reaches the claim deadline without an early retry', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture({
			getEnvironment: async () => { throw new CloudSandboxRequestError(429, 'rate limited', 600, { code: 'rate_limit_exceeded' }); },
		});
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /not ready after 300 seconds/);
		await fixture.deleted;
		const elapsed = Date.now();
		await timeout(600_000);

		assert.deepStrictEqual({ elapsed, calls: fixture.calls }, {
			elapsed: 300_000, calls: ['provision', 'read:env-1', 'delete:env-1'],
		});
	}));

	test('cancels a readiness retry delay without issuing another read', () => runWithFakedTimers({}, async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const fixture = createFixture({
			getEnvironment: async () => { throw new CloudSandboxRequestError(429, 'rate limited', 10); },
		});
		fixture.service.prepare(editorDraft);
		const claimed = assert.rejects(fixture.service.take(editorDraft, cancellation.token), isCancellationError);
		await timeout(500);
		cancellation.cancel();
		await claimed;
		await fixture.deleted;
		await timeout(10_000);

		assert.deepStrictEqual(fixture.calls, ['provision', 'read:env-1', 'delete:env-1']);
	}));

	test('bounds readiness waiting to five minutes, releases the environment, and stops polling', () => runWithFakedTimers({ maxTaskCount: 400 }, async () => {
		const fixture = createFixture({ getEnvironment: async id => ({ id, status: 'waking' }) });
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /not ready after 300 seconds/);
		await fixture.deleted;
		const elapsed = Date.now();
		const reads = fixture.readTimes.length;
		await timeout(60_000);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ elapsed, reads, finalReads: fixture.readTimes.length, retry, deletions: fixture.deletionAttempts }, {
			elapsed: 300_000, reads: 300, finalReads: 300,
			retry: undefined,
			deletions: [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }],
		});
	}));

	test('the readiness deadline also cancels a stalled read', () => runWithFakedTimers({}, async () => {
		const readiness = new DeferredPromise<ICloudSandboxEnvironment>();
		const fixture = createFixture({ getEnvironment: () => readiness.p });
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /not ready after 300 seconds/);
		await fixture.deleted;
		await readiness.complete({ id: 'env-1', status: 'online' });

		assert.deepStrictEqual(fixture.calls, ['provision', 'read:env-1', 'delete:env-1']);
	}));

	for (const response of [{ id: 'env-other', status: 'online' }, { id: 'env-1', status: 'draining' }] as const) {
		test(`rejects a readiness response for ${response.id} in state ${response.status}`, async () => {
			const fixture = createFixture({ getEnvironment: async () => response });
			fixture.service.prepare(editorDraft);
			await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), response.id === 'env-other' ? /different cloud environment/ : /not available/);
			await fixture.deleted;

			assert.deepStrictEqual(fixture.deletionAttempts, [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }]);
		});
	}

	test('an already cancelled Send leaves preparation available for a later Send', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.Cancelled), isCancellationError);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls }, {
			result: prepared, calls: ['provision', 'read:env-1'],
		});
	});

	test('cancelling Send before the allocation returns cleans up its late environment', async () => {
		const allocation = new DeferredPromise<string>();
		const cancellation = store.add(new CancellationTokenSource());
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		const claimed = assert.rejects(fixture.service.take(editorDraft, cancellation.token), isCancellationError);
		cancellation.cancel();
		await claimed;
		await allocation.complete('env-1');
		await fixture.deleted;

		assert.deepStrictEqual(fixture.calls, ['provision', 'delete:env-1']);
	});

	test('cancelling a readiness wait prevents further reads and deletes unused compute', () => runWithFakedTimers({}, async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const fixture = createFixture({ getEnvironment: async id => ({ id, status: 'waking' }) });
		fixture.service.prepare(editorDraft);
		const claimed = assert.rejects(fixture.service.take(editorDraft, cancellation.token), isCancellationError);
		await timeout(500);
		cancellation.cancel();
		await claimed;
		await fixture.deleted;
		await timeout(60_000);

		assert.deepStrictEqual(fixture.calls, ['provision', 'read:env-1', 'delete:env-1']);
	}));

	test('allocation failures remain visible to Send and are never automatically replayed', async () => {
		const error = new Error('allocation outcome unknown');
		const fixture = createFixture({ provision: async () => { throw error; } });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await timeout(0);
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), caught => caught === error);
		fixture.service.prepare(editorDraft);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({
			calls: fixture.calls, deletions: fixture.deletionAttempts, logged: fixture.warnings.length, retry,
		}, { calls: ['provision'], deletions: [], logged: 1, retry: undefined });
	});

	test('requires a signed-in account without allocating or implicitly signing in', async () => {
		const fixture = createFixture();
		fixture.setAccount(undefined);
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), CloudSandboxAuthenticationRequiredError);

		assert.deepStrictEqual(fixture.calls, []);
	});

	test('account changes invalidate drafting preparation without deleting under the new account', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		fixture.setAccount('account-b');
		await allocation.complete('env-1');
		await fixture.service.discard(editorDraft);
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({
			result, calls: fixture.calls, attempts: fixture.deletionAttempts,
			incompleteCleanup: fixture.warnings.some(message => message.includes('cleanup is incomplete')),
		}, {
			result: undefined, calls: ['provision'],
			attempts: [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }],
			incompleteCleanup: true,
		});
	});

	test('token refresh for the same account keeps preparation usable', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		fixture.setAccount('account-a');
		await allocation.complete('env-1');

		assert.deepStrictEqual(await fixture.service.take(editorDraft, CancellationToken.None), prepared);
	});

	for (const claiming of [false, true]) {
		test(`same-account refresh preserves an unresolved initial identity (claiming=${claiming})`, async () => {
			const account = new DeferredPromise<string | undefined>();
			const entered = new DeferredPromise<void>();
			const fixture = createFixture({
				getAccountKey: () => {
					if (!entered.isSettled) {
						void entered.complete();
					}
					return account.p;
				},
			});
			fixture.service.prepare(editorDraft);
			const claimed = claiming
				? fixture.service.take(editorDraft, CancellationToken.None).then(result => ({ result }), (error: Error) => ({ error: error.name }))
				: undefined;
			await entered.p;
			fixture.setAccount('account-a');
			await account.complete('account-a');
			const result = claimed ? await claimed : { result: await fixture.service.take(editorDraft, CancellationToken.None) };

			assert.deepStrictEqual({ result, calls: fixture.calls, deletions: fixture.deletionAttempts }, {
				result: { result: prepared }, calls: ['provision', 'read:env-1'], deletions: [],
			});
		});
	}

	for (const selectedAccount of ['account-b', undefined]) {
		test(`an initial lookup cannot allocate after the account changes to ${selectedAccount}`, async () => {
			const account = new DeferredPromise<string | undefined>();
			const entered = new DeferredPromise<void>();
			const fixture = createFixture({
				getAccountKey: () => { void entered.complete(); return account.p; },
			});
			fixture.service.prepare(editorDraft);
			const claimed = assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), isCancellationError);
			await entered.p;
			fixture.setAccount(selectedAccount);
			await account.complete('account-a');
			await claimed;

			assert.deepStrictEqual(fixture.calls, []);
		});
	}

	for (const notify of [false, true]) {
		test(`never hands over an environment after an account change during readiness (notified=${notify})`, async () => {
			const readiness = new DeferredPromise<ICloudSandboxEnvironment>();
			const fixture = createFixture({ getEnvironment: () => readiness.p });
			fixture.service.prepare(editorDraft);
			const claimed = assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), isCancellationError);
			await fixture.enteredReadiness;
			fixture.setAccount('account-b', notify);
			await readiness.complete({ id: 'env-1', status: 'online' });
			await claimed;
			await timeout(0);

			assert.deepStrictEqual({
				calls: fixture.calls, attempts: fixture.deletionAttempts,
			}, {
				calls: ['provision', 'read:env-1'],
				attempts: [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }],
			});
		});
	}

	test('logs cleanup failure without starting another allocation or hiding the deletion attempt', async () => {
		const fixture = createFixture({ deleteEnvironment: async () => { throw new Error('network unavailable'); } });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await fixture.service.discard(editorDraft);
		fixture.service.prepare(editorDraft);
		await fixture.service.discard(editorDraft);

		assert.deepStrictEqual({
			calls: fixture.calls, attempts: fixture.deletionAttempts.length,
			warnings: fixture.warnings,
		}, {
			calls: ['provision', 'delete:env-1'], attempts: 1,
			warnings: ['[CloudSandboxPreparation] Could not delete unused environment env-1; cleanup is incomplete.'],
		});
	});

	test('forgetting a draft does not let a late cleanup delete another draft preparation', async () => {
		const first = new DeferredPromise<string>();
		let allocations = 0;
		const fixture = createFixture({ provision: async () => ++allocations === 1 ? first.p : 'env-2' });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		const forgotten = fixture.service.forget(editorDraft);
		fixture.service.prepare(agentsDraft);
		const result = await fixture.service.take(agentsDraft, CancellationToken.None);
		await first.complete('env-1');
		await forgotten;

		assert.deepStrictEqual({ result, attempts: fixture.deletionAttempts }, {
			result: { ...prepared, environmentId: 'env-2' },
			attempts: [{ environmentId: 'env-1', expectedAccountKey: 'account-a' }],
		});
	});

	test('service disposal releases late allocations and rejects further preparation', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		fixture.service.dispose();
		await allocation.complete('env-1');
		await fixture.deleted;
		assert.throws(() => fixture.service.prepare(agentsDraft), isCancellationError);

		assert.deepStrictEqual(fixture.calls, ['provision', 'delete:env-1']);
	});

	test('service disposal cancels a claim still waiting for readiness', async () => {
		const readiness = new DeferredPromise<ICloudSandboxEnvironment>();
		const fixture = createFixture({ getEnvironment: () => readiness.p });
		fixture.service.prepare(editorDraft);
		const claimed = assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), isCancellationError);
		await fixture.enteredReadiness;
		fixture.service.dispose();
		await claimed;
		await fixture.deleted;
		await readiness.complete({ id: 'env-1', status: 'online' });

		assert.deepStrictEqual(fixture.calls, ['provision', 'read:env-1', 'delete:env-1']);
	});
});
