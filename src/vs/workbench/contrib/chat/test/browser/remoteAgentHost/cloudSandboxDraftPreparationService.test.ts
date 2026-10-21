/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, disposableTimeout, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxEarlyPreparationSettingId, CloudSandboxEnabledSettingId, CloudSandboxRequestError, ICloudSandboxApiService, ICloudSandboxReservedSession, ICloudSandboxReserveSessionRequest } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
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
	function reservedSession(environmentId: string, reservationExpiresAt = Date.UTC(2100, 0, 1)): ICloudSandboxReservedSession {
		return { taskId: `task-${environmentId}`, sessionId: `session-${environmentId}`, environmentId, reservationExpiresAt };
	}
	const prepared = { ...reservedSession('env-1'), expectedAccountKey: 'account-a' };

	function createFixture(options: {
		readonly getAccountKey?: () => Promise<string | undefined>;
		readonly provision?: (token: CancellationToken) => Promise<string>;
		readonly reservationExpiresAt?: number;
		readonly deleteTask?: (taskId: string) => Promise<void>;
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
		const enteredVerification = new DeferredPromise<void>();
		const deleted = new DeferredPromise<void>();
		const calls: string[] = [];
		const reservationRequests: ICloudSandboxReserveSessionRequest[] = [];
		const deletionAttempts: { taskId: string; expectedAccountKey: string | undefined }[] = [];
		const warnings: string[] = [];
		const infos: string[] = [];
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
				if (accountLookups > 1 && !enteredVerification.isSettled) {
					void enteredVerification.complete();
				}
				return options.getAccountKey ? options.getAccountKey() : account;
			}

			override async reserveSession(request: ICloudSandboxReserveSessionRequest, token: CancellationToken): Promise<ICloudSandboxReservedSession> {
				if (!account || request.expectedAccountKey !== account) {
					throw new CancellationError();
				}
				calls.push('reserve');
				reservationRequests.push(request);
				if (!enteredAllocation.isSettled) {
					void enteredAllocation.complete();
				}
				const environmentId = options.provision ? await options.provision(token) : `env-${++allocations}`;
				return reservedSession(environmentId, options.reservationExpiresAt);
			}

			override async deleteTask(taskId: string, _token: CancellationToken, expectedAccountKey?: string): Promise<void> {
				deletionAttempts.push({ taskId, expectedAccountKey });
				if (!account || expectedAccountKey !== account) {
					throw new CancellationError();
				}
				calls.push(`delete:${taskId}`);
				await options.deleteTask?.(taskId);
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
			override info(message: string): void {
				infos.push(message);
			}
			override warn(message: string): void {
				warnings.push(message);
			}
		}());
		const service = store.add(instantiation.createInstance(CloudSandboxDraftPreparationService));
		return {
			service, calls, warnings, infos, reservationRequests, deletionAttempts, configuration, triggers: telemetry.triggers,
			accountLookups: () => accountLookups,
			enteredAllocation: enteredAllocation.p,
			enteredVerification: enteredVerification.p,
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

	for (const claimed of [true, false]) {
		test(`retains a confirmed ${claimed ? 'claim' : 'fallback'} only for its draft lifetime without restoring deletion ownership`, async () => {
			const fixture = createFixture();
			fixture.service.prepare(editorDraft, 'owner/repo');
			const reservation = await fixture.service.take(editorDraft, CancellationToken.None);
			assert.ok(reservation);
			const beforeConfirmation = fixture.service.getSubmittedDraft(editorDraft);
			const created = { ...reservedSession(claimed ? 'env-1' : 'fallback'), claimed };
			fixture.service.markSubmitted(reservation, created, 'owner/repo');
			await fixture.service.clear();
			await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false);
			fixture.service.updateRepository(editorDraft, 'another/repo');
			await assert.rejects(fixture.service.release(reservation), /submitted cloud task cannot be released/);
			const retained = fixture.service.getSubmittedDraft(editorDraft);
			await fixture.service.forget(editorDraft);

			assert.deepStrictEqual({
				beforeConfirmation, retained, forgotten: fixture.service.getSubmittedDraft(editorDraft), calls: fixture.calls,
			}, {
				beforeConfirmation: undefined,
				retained: { reservation, created, repoNwo: 'owner/repo' },
				forgotten: undefined, calls: ['reserve'],
			});
		});
	}

	test('a late confirmed response does not recreate a forgotten draft record', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		const reservation = await fixture.service.take(editorDraft, CancellationToken.None);
		assert.ok(reservation);
		await fixture.service.forget(editorDraft);
		fixture.service.markSubmitted(reservation, { ...reservedSession('env-1'), claimed: true }, undefined);
		assert.deepStrictEqual({ submitted: fixture.service.getSubmittedDraft(editorDraft), calls: fixture.calls }, {
			submitted: undefined, calls: ['reserve'],
		});
	});

	test('cannot confirm a receipt that was not handed off', () => {
		const fixture = createFixture();
		assert.throws(() => fixture.service.markSubmitted(prepared, { ...reservedSession('env-1'), claimed: true }, undefined), /not handed off/);
	});

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
				callsWhileDrafting: enabled === true ? ['reserve'] : [],
				accountLookups: enabled === true ? 1 : 0,
				triggers: [`config.${CloudSandboxEarlyPreparationSettingId}`],
			});
		});
	}

	for (const pendingAtSend of [false, true]) {
		test(`logs the reservation handoff with ${pendingAtSend ? 'pending' : 'received'} preparation without draft contents`, () => runWithFakedTimers({}, async () => {
			const draft = URI.parse('cloud-sandbox:/private-draft');
			const fixture = createFixture({ provision: async () => { await timeout(100); return 'env-1'; } });
			fixture.service.prepare(draft, 'private-owner/private-repo');
			await fixture.enteredAllocation;
			for (let i = 0; i < 20; i++) {
				fixture.service.prepare(draft, 'private-owner/private-repo');
			}
			await timeout(pendingAtSend ? 20 : 200);
			await fixture.service.take(draft, CancellationToken.None);

			const started = '[CloudSandboxPreparation] preparationId=1 event=started state=draft elapsedMs=0 hasRepository=true';
			const receipt = `[CloudSandboxPreparation] preparationId=1 event=receipt state=${pendingAtSend ? 'taking' : 'draft'} elapsedMs=100 taskId="task-env-1" environmentId="env-1"`;
			const waiting = `[CloudSandboxPreparation] preparationId=1 event=sendWait state=taking elapsedMs=${pendingAtSend ? 20 : 200} receipt=${pendingAtSend ? 'pending' : 'received'}`;
			const handedOff = `[CloudSandboxPreparation] preparationId=1 event=handoff state=transferred elapsedMs=${pendingAtSend ? 100 : 200} taskId="task-env-1" waitMs=${pendingAtSend ? 80 : 0}`;
			assert.deepStrictEqual({
				infos: fixture.infos,
				privateContent: fixture.infos.some(message => message.includes('private-') || message.includes('account-a')),
			}, {
				infos: pendingAtSend ? [started, waiting, receipt, handedOff] : [started, receipt, waiting, handedOff],
				privateContent: false,
			});
		}));
	}

	test('logs a disabled preparation reason once rather than on every keystroke', async () => {
		const fixture = createFixture({ configuration: { [CloudSandboxEarlyPreparationSettingId]: false } });
		for (let i = 0; i < 20; i++) {
			fixture.service.prepare(URI.parse(editorDraft.toString()), 'private-owner/private-repo');
		}

		assert.deepStrictEqual({ infos: fixture.infos, calls: fixture.calls }, {
			infos: ['[CloudSandboxPreparation] event=skipped reason=settingDisabled'], calls: [],
		});
	});

	test('skip diagnostics reset with the logical draft rather than accumulating after disposal', async () => {
		const fixture = createFixture({ configuration: { [CloudSandboxEarlyPreparationSettingId]: false } });
		fixture.service.prepare(editorDraft);
		await fixture.service.forget(editorDraft);
		fixture.service.prepare(URI.parse(editorDraft.toString()));

		assert.deepStrictEqual(fixture.infos, [
			'[CloudSandboxPreparation] event=skipped reason=settingDisabled',
			'[CloudSandboxPreparation] event=skipped reason=settingDisabled',
		]);
	});

	test('a changed skip reason is logged once without starting preparation', async () => {
		const fixture = createFixture({ trusted: false, configuration: { [CloudSandboxEarlyPreparationSettingId]: false } });
		fixture.service.prepare(editorDraft);
		fixture.setTrusted(true);
		fixture.service.prepare(editorDraft);
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual({ infos: fixture.infos, calls: fixture.calls }, {
			infos: [
				'[CloudSandboxPreparation] event=skipped reason=workspaceUntrusted',
				'[CloudSandboxPreparation] event=skipped reason=settingDisabled',
			],
			calls: [],
		});
	});

	test('receipt identities are escaped so they cannot inject additional log lines', async () => {
		const fixture = createFixture({ provision: async () => 'env-\n"quoted"' });
		fixture.service.prepare(editorDraft);
		await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({
			multiline: fixture.infos.some(message => message.includes('\n')),
			receipt: fixture.infos.filter(message => message.includes('event=receipt ')).map(message => message.split(' taskId=')[1]),
		}, {
			multiline: false,
			receipt: ['"task-env-\\n\\"quoted\\"" environmentId="env-\\n\\"quoted\\""'],
		});
	});

	test('discarded preparation does not log every subsequent keystroke or duplicate cleanup', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await fixture.service.discard(editorDraft);
		for (let i = 0; i < 20; i++) {
			fixture.service.prepare(editorDraft);
			await fixture.service.discard(editorDraft);
		}

		assert.deepStrictEqual(fixture.infos.map(message => message.match(/\bevent=(?<event>\w+)/)?.groups?.event), [
			'started', 'releaseRequested', 'receipt', 'released', 'skipped',
		]);
	});

	for (const reason of ['discarded', 'repositoryChanged', 'expired', 'disabled', 'accountChanged'] as const) {
		test(`cleanup diagnostics identify ${reason} and its actual result`, () => runWithFakedTimers({}, async () => {
			const fixture = createFixture({ deleteTask: async () => { await timeout(25); } });
			fixture.service.prepare(editorDraft, 'private-owner/private-repo');
			await timeout(10);
			switch (reason) {
				case 'repositoryChanged': fixture.service.updateRepository(editorDraft, 'private-owner/other'); break;
				case 'expired': await timeout(300_000); break;
				case 'disabled': await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false); break;
				case 'accountChanged': fixture.setAccount('other-account'); break;
			}
			await fixture.service.discard(editorDraft);

			assert.deepStrictEqual({
				releases: fixture.infos.filter(message => message.includes('event=releaseRequested ')).map(message => message.split(' reason=')[1]),
				completions: fixture.infos.filter(message => /\bevent=released |event=releaseFailed /.test(message)).map(message => ({
					outcome: message.match(/\bevent=(?<event>\w+)/)?.groups?.event,
					duration: message.match(/\bdurationMs=(?<duration>\d+)/)?.groups?.duration,
				})),
				privateContent: fixture.infos.some(message => message.includes('private-') || message.includes('other-account')),
			}, {
				releases: [reason],
				completions: [{ outcome: reason === 'accountChanged' ? 'releaseFailed' : 'released', duration: reason === 'accountChanged' ? '0' : '25' }],
				privateContent: false,
			});
		}));
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
			result: prepared, calls: ['reserve'],
			triggers: [`config.${CloudSandboxEarlyPreparationSettingId}`],
		});
	});

	for (const unavailable of [
		{ name: 'Cloud disabled', configuration: { [CloudSandboxEnabledSettingId]: false }, reason: 'featureDisabled' },
		{ name: 'remote hosts disabled', configuration: { [RemoteAgentHostsEnabledSettingId]: false }, reason: 'featureDisabled' },
		{ name: 'AI disabled', configuration: { [ChatAIDisabledSettingId]: true }, reason: 'aiDisabled' },
		{ name: 'AI hidden', hidden: true, reason: 'aiHidden' },
		{ name: 'untrusted workspace', trusted: false, reason: 'workspaceUntrusted' },
	]) {
		test(`does not prepare or log exposure when ${unavailable.name}`, async () => {
			const fixture = createFixture(unavailable);
			fixture.service.prepare(editorDraft);
			await timeout(0);

			assert.deepStrictEqual({ calls: fixture.calls, accountLookups: fixture.accountLookups(), triggers: fixture.triggers, infos: fixture.infos }, {
				calls: [], accountLookups: 0, triggers: [],
				infos: [`[CloudSandboxPreparation] event=skipped reason=${unavailable.reason}`],
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

			assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
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

		assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
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
			result: prepared, calls: ['reserve'],
		});
	});

	test('cleanup still reports a failure after the setting is disabled', async () => {
		const fixture = createFixture({ deleteTask: async () => { throw new Error('unavailable'); } });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await fixture.setConfiguration(CloudSandboxEarlyPreparationSettingId, false);
		await fixture.service.clear();

		assert.deepStrictEqual({ calls: fixture.calls, warnings: fixture.warnings }, {
			calls: ['reserve', 'delete:task-env-1'],
			warnings: ['[CloudSandboxPreparation] Could not delete unused reservation task-env-1; cleanup is incomplete.'],
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
			before: ['reserve'],
			result: prepared,
			calls: ['reserve'],
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
			allocations: fixture.calls.filter(call => call === 'reserve').length,
		}, { editor: prepared, agents: { ...reservedSession('env-2'), expectedAccountKey: 'account-a' }, allocations: 2 });
	});

	test('preparing alone reserves without polling, connecting, or submitting a task', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await timeout(60_000);
		const callsWhileDrafting = [...fixture.calls];
		await fixture.service.discard(editorDraft);

		assert.deepStrictEqual(callsWhileDrafting, ['reserve']);
	}));

	test('reserves the supplied repository and hands off the receipt without requiring an online environment', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft, 'owner/repo');
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls, requests: fixture.reservationRequests }, {
			result: prepared, calls: ['reserve'],
			requests: [{ repoNwo: 'owner/repo', expectedAccountKey: 'account-a' }],
		});
	});

	test('repository selection alone does not reserve or log experiment exposure', async () => {
		const fixture = createFixture();
		fixture.service.updateRepository(editorDraft, 'owner/repo');
		fixture.service.updateRepository(editorDraft, 'owner/other');
		await timeout(0);
		const beforeTyping = { calls: [...fixture.calls], lookups: fixture.accountLookups(), triggers: [...fixture.triggers] };
		fixture.service.prepare(editorDraft, 'owner/other');
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ beforeTyping, result, requests: fixture.reservationRequests }, {
			beforeTyping: { calls: [], lookups: 0, triggers: [] }, result: prepared,
			requests: [{ repoNwo: 'owner/other', expectedAccountKey: 'account-a' }],
		});
	});

	for (const change of [
		{ before: undefined, after: 'owner/repo' },
		{ before: 'owner/repo', after: 'owner/other' },
		{ before: 'owner/repo', after: undefined },
	]) {
		for (const ready of [false, true]) {
			test(`repository change ${change.before} to ${change.after} releases ${ready ? 'received' : 'pending'} preparation without replacement`, async () => {
				const allocation = new DeferredPromise<string>();
				const fixture = createFixture({ provision: () => allocation.p });
				fixture.service.prepare(editorDraft, change.before);
				await fixture.enteredAllocation;
				if (ready) {
					await allocation.complete('env-1');
					await timeout(0);
				}

				fixture.service.updateRepository(editorDraft, change.after);
				if (!ready) {
					await allocation.complete('env-1');
				}
				await fixture.deleted;
				fixture.service.prepare(editorDraft, change.after);
				const result = await fixture.service.take(editorDraft, CancellationToken.None);

				assert.deepStrictEqual({ result, calls: fixture.calls, requests: fixture.reservationRequests }, {
					result: undefined, calls: ['reserve', 'delete:task-env-1'],
					requests: [{ repoNwo: change.before, expectedAccountKey: 'account-a' }],
				});
			});
		}
	}

	test('repeated preparation with another repository releases the old context without replacing it', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft, 'owner/repo');
		await fixture.enteredAllocation;
		fixture.service.prepare(editorDraft, 'owner/other');
		await fixture.deleted;
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls }, { result: undefined, calls: ['reserve', 'delete:task-env-1'] });
	});

	test('reselecting the same repository keeps its reservation despite casing changes', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft, 'Owner/Repo');
		await fixture.enteredAllocation;
		fixture.service.updateRepository(editorDraft, 'owner/repo');
		fixture.service.prepare(editorDraft, 'owner/repo');
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls, requests: fixture.reservationRequests }, {
			result: prepared, calls: ['reserve'],
			requests: [{ repoNwo: 'Owner/Repo', expectedAccountKey: 'account-a' }],
		});
	});

	for (const transferred of [false, true]) {
		test(`repository updates leave ${transferred ? 'transferred' : 'pending'} Send ownership alone`, async () => {
			const allocation = new DeferredPromise<string>();
			const fixture = createFixture({ provision: () => allocation.p });
			fixture.service.prepare(editorDraft, 'owner/repo');
			await fixture.enteredAllocation;
			const taking = fixture.service.take(editorDraft, CancellationToken.None);
			if (transferred) {
				await allocation.complete('env-1');
				await taking;
			}
			fixture.service.updateRepository(editorDraft, 'owner/other');
			if (!transferred) {
				await allocation.complete('env-1');
			}
			const result = await taking;

			assert.deepStrictEqual({ result, calls: fixture.calls }, { result: prepared, calls: ['reserve'] });
		});
	}

	test('Send before preparation prevents late typing from allocating', async () => {
		const fixture = createFixture();
		const missing = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ missing, retry, calls: fixture.calls }, { missing: undefined, retry: undefined, calls: [] });
	});

	test('allows only one handoff and leaves a transferred reservation alone', async () => {
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
			result: prepared, calls: ['reserve'], deletions: [],
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
			retry: undefined, calls: ['reserve', 'delete:task-env-1'],
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

			assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
		});
	}

	test('returning an old receipt does not reset or delete a newer claim for the same draft', async () => {
		const verification = new DeferredPromise<string | undefined>();
		let lookups = 0;
		const fixture = createFixture({
			getAccountKey: async () => ++lookups === 2 ? verification.p : 'account-a',
		});
		fixture.service.prepare(editorDraft);
		const claiming = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.enteredVerification;
		await fixture.service.forget(editorDraft);
		await verification.complete('account-a');
		const old = await claiming;
		assert.ok(old);
		fixture.service.prepare(editorDraft);
		const current = await fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.service.release(old);
		await fixture.service.release(old);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), /already been claimed/);

		assert.deepStrictEqual({ current, attempts: fixture.deletionAttempts }, {
			current: { ...reservedSession('env-2'), expectedAccountKey: 'account-a' },
			attempts: [{ taskId: 'task-env-1', expectedAccountKey: 'account-a' }],
		});
	});

	test('returning a taken receipt reports cleanup failure without retrying or preparing again', async () => {
		const fixture = createFixture({ deleteTask: async () => { throw new Error('unavailable'); } });
		fixture.service.prepare(editorDraft);
		const taken = await fixture.service.take(editorDraft, CancellationToken.None);
		assert.ok(taken);
		await fixture.service.release(taken);
		await fixture.service.forget(editorDraft);
		await fixture.service.release(taken);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual({ retry, calls: fixture.calls, warnings: fixture.warnings }, {
			retry: undefined, calls: ['reserve', 'delete:task-env-1'],
			warnings: ['[CloudSandboxPreparation] Could not delete unused reservation task-env-1; cleanup is incomplete.'],
		});
	});

	test('returning an unrecognized receipt never deletes a task', async () => {
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
		}, { result: undefined, requestCancelled: false, calls: ['reserve', 'delete:task-env-1'] });
	});

	test('closing a draft while Send waits does not delete its reservation', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		const claimed = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.service.forget(editorDraft);
		await allocation.complete('env-1');

		assert.deepStrictEqual({ result: await claimed, calls: fixture.calls }, {
			result: prepared, calls: ['reserve'],
		});
	});

	test('clearing releases unused preparations but not a claim in progress', async () => {
		const allocation = new DeferredPromise<string>();
		let allocations = 0;
		const fixture = createFixture({ provision: async () => ++allocations === 1 ? allocation.p : 'env-2' });
		fixture.service.prepare(editorDraft);
		const claimed = fixture.service.take(editorDraft, CancellationToken.None);
		await fixture.enteredAllocation;
		fixture.service.prepare(agentsDraft);
		await timeout(0);
		await fixture.service.clear();
		await allocation.complete('env-1');

		assert.deepStrictEqual({ result: await claimed, deleted: fixture.deletionAttempts }, {
			result: prepared, deleted: [{ taskId: 'task-env-2', expectedAccountKey: 'account-a' }],
		});
	});

	test('expires five minutes after the allocation receipt, without automatically replacing it', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture({ provision: async () => { await timeout(10_000); return 'env-1'; } });
		fixture.service.prepare(editorDraft);
		await timeout(309_999);
		const beforeExpiry = [...fixture.calls];
		await timeout(1);
		await fixture.deleted;
		fixture.service.prepare(editorDraft);
		await timeout(1_000);

		assert.deepStrictEqual({ beforeExpiry, calls: fixture.calls }, {
			beforeExpiry: ['reserve'], calls: ['reserve', 'delete:task-env-1'],
		});
	}));

	test('a handoff just before expiry survives the unused deadline', () => runWithFakedTimers({}, async () => {
		let lookups = 0;
		const fixture = createFixture({
			getAccountKey: async () => {
				if (++lookups > 1) {
					await timeout(2_000);
				}
				return 'account-a';
			},
		});
		fixture.service.prepare(editorDraft);
		await timeout(299_999);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls }, {
			result: prepared, calls: ['reserve'],
		});
	}));

	test('Send after expiry misses preparation and does not allocate a replacement', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await timeout(300_001);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual({ result, calls: fixture.calls }, {
			result: undefined, calls: ['reserve', 'delete:task-env-1'],
		});
	}));

	test('expires at the server lease when it is earlier than the client limit', () => runWithFakedTimers({}, async () => {
		const fixture = createFixture({ reservationExpiresAt: 20_000 });
		fixture.service.prepare(editorDraft);
		await timeout(19_999);
		const beforeExpiry = [...fixture.calls];
		await timeout(1);
		await fixture.deleted;
		const elapsed = Date.now();
		const result = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);

		assert.deepStrictEqual({ elapsed, beforeExpiry, result, calls: fixture.calls }, {
			elapsed: 20_000, beforeExpiry: ['reserve'], result: undefined, calls: ['reserve', 'delete:task-env-1'],
		});
	}));

	for (const error of [
		new CloudSandboxRequestError(422, 'reservation unsupported'),
		new CloudSandboxRequestError(429, 'rate limited', 2),
		new CloudSandboxRequestError(503, 'unavailable'),
		new Error('network unavailable'),
	]) {
		test(`a pending reservation failure permits cold Send without retry: ${error.message}`, async () => {
			const fixture = createFixture({ provision: async () => { throw error; } });
			fixture.service.prepare(editorDraft);
			const result = await fixture.service.take(editorDraft, CancellationToken.None);
			fixture.service.prepare(editorDraft);

			assert.deepStrictEqual({
				result, calls: fixture.calls, deletions: fixture.deletionAttempts,
				fallbackReported: fixture.warnings.some(message => message.includes('continuing with normal task creation')),
			}, { result: undefined, calls: ['reserve'], deletions: [], fallbackReported: true });
		});
	}

	for (const error of [new CloudSandboxAuthenticationRequiredError(), new CancellationError()]) {
		test(`a pending reservation ${error.name} still stops Send`, async () => {
			const fixture = createFixture({ provision: async () => { throw error; } });
			fixture.service.prepare(editorDraft);
			await assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), caught => caught === error);

			assert.deepStrictEqual(fixture.calls, ['reserve']);
		});
	}

	test('a reservation wait timeout permits cold Send and deletes a late receipt without replaying it', () => runWithFakedTimers({}, async () => {
		const allocation = new DeferredPromise<string>();
		const caller = store.add(new CancellationTokenSource());
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, caller.token);
		const elapsed = Date.now();
		await allocation.complete('env-1');
		await fixture.deleted;
		await timeout(60_000);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({
			elapsed, result, retry, calls: fixture.calls, callerCancelled: caller.token.isCancellationRequested,
			reported: fixture.warnings.some(message => message.includes('wait timed out')),
		}, {
			elapsed: 300_000, result: undefined, retry: undefined, calls: ['reserve', 'delete:task-env-1'], callerCancelled: false, reported: true,
		});
	}));

	test('the reservation deadline includes a stalled initial account lookup', () => runWithFakedTimers({}, async () => {
		const account = new DeferredPromise<string | undefined>();
		const fixture = createFixture({ getAccountKey: () => account.p });
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);
		await account.complete('account-a');

		assert.deepStrictEqual({ elapsed: Date.now(), result, calls: fixture.calls }, { elapsed: 300_000, result: undefined, calls: [] });
	}));

	for (const reason of ['cancel', 'shutdown', 'account change'] as const) {
		test(`${reason} at the reservation deadline still aborts instead of falling back`, () => runWithFakedTimers({}, async () => {
			const allocation = new DeferredPromise<string>();
			const cancellation = store.add(new CancellationTokenSource());
			const fixture = createFixture({ provision: () => allocation.p });
			fixture.service.prepare(editorDraft);
			store.add(disposableTimeout(() => {
				if (reason === 'cancel') {
					cancellation.cancel();
				} else if (reason === 'shutdown') {
					fixture.service.dispose();
				} else {
					fixture.setAccount('account-b');
				}
			}, 300_000));

			await assert.rejects(fixture.service.take(editorDraft, cancellation.token), isCancellationError);
			await allocation.complete('env-1');
			await timeout(0);

			assert.deepStrictEqual({
				calls: fixture.calls, attempts: fixture.deletionAttempts,
				fellBack: fixture.warnings.some(message => message.includes('continuing with normal task creation')),
			}, {
				calls: reason === 'account change' ? ['reserve'] : ['reserve', 'delete:task-env-1'],
				attempts: [{ taskId: 'task-env-1', expectedAccountKey: 'account-a' }], fellBack: false,
			});
		}));
	}

	test('an already cancelled Send leaves preparation available for a later Send', async () => {
		const fixture = createFixture();
		fixture.service.prepare(editorDraft);
		await assert.rejects(fixture.service.take(editorDraft, CancellationToken.Cancelled), isCancellationError);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({ result, calls: fixture.calls }, {
			result: prepared, calls: ['reserve'],
		});
	});

	test('cancelling Send before the receipt returns cleans up its late reservation', async () => {
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

		assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
	});

	test('cancelling account verification releases the unused reservation', async () => {
		const verification = new DeferredPromise<string | undefined>();
		let lookups = 0;
		const cancellation = store.add(new CancellationTokenSource());
		const fixture = createFixture({ getAccountKey: async () => ++lookups === 1 ? 'account-a' : verification.p });
		fixture.service.prepare(editorDraft);
		const claimed = assert.rejects(fixture.service.take(editorDraft, cancellation.token), isCancellationError);
		await fixture.enteredVerification;
		cancellation.cancel();
		await claimed;
		await fixture.deleted;
		await verification.complete('account-a');

		assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
	});

	test('a failed background reservation is logged and unavailable to Send without being replayed', async () => {
		const error = new Error('allocation outcome unknown');
		const fixture = createFixture({ provision: async () => { throw error; } });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await timeout(0);
		fixture.service.prepare(editorDraft);
		const result = await fixture.service.take(editorDraft, CancellationToken.None);
		fixture.service.prepare(editorDraft);
		const retry = await fixture.service.take(editorDraft, CancellationToken.None);

		assert.deepStrictEqual({
			calls: fixture.calls, deletions: fixture.deletionAttempts, logged: fixture.warnings.length, result, retry,
		}, { calls: ['reserve'], deletions: [], logged: 1, result: undefined, retry: undefined });
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
			result: undefined, calls: ['reserve'],
			attempts: [{ taskId: 'task-env-1', expectedAccountKey: 'account-a' }],
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
				result: { result: prepared }, calls: ['reserve'], deletions: [],
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
		test(`never hands over a reservation after an account change during verification (notified=${notify})`, async () => {
			const verification = new DeferredPromise<string | undefined>();
			let lookups = 0;
			const fixture = createFixture({ getAccountKey: async () => ++lookups === 1 ? 'account-a' : verification.p });
			fixture.service.prepare(editorDraft);
			const claimed = assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), isCancellationError);
			await fixture.enteredVerification;
			fixture.setAccount('account-b', notify);
			await verification.complete('account-b');
			await claimed;
			await timeout(0);

			assert.deepStrictEqual({
				calls: fixture.calls, attempts: fixture.deletionAttempts,
			}, {
				calls: ['reserve'],
				attempts: [{ taskId: 'task-env-1', expectedAccountKey: 'account-a' }],
			});
		});
	}

	test('logs cleanup failure without starting another allocation or hiding the deletion attempt', async () => {
		const fixture = createFixture({ deleteTask: async () => { throw new Error('network unavailable'); } });
		fixture.service.prepare(editorDraft);
		await fixture.enteredAllocation;
		await fixture.service.discard(editorDraft);
		fixture.service.prepare(editorDraft);
		await fixture.service.discard(editorDraft);

		assert.deepStrictEqual({
			calls: fixture.calls, attempts: fixture.deletionAttempts.length,
			warnings: fixture.warnings,
		}, {
			calls: ['reserve', 'delete:task-env-1'], attempts: 1,
			warnings: ['[CloudSandboxPreparation] Could not delete unused reservation task-env-1; cleanup is incomplete.'],
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
			result: { ...reservedSession('env-2'), expectedAccountKey: 'account-a' },
			attempts: [{ taskId: 'task-env-1', expectedAccountKey: 'account-a' }],
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

		assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
	});

	test('service disposal cancels a handoff still waiting for its reservation', async () => {
		const allocation = new DeferredPromise<string>();
		const fixture = createFixture({ provision: () => allocation.p });
		fixture.service.prepare(editorDraft);
		const claimed = assert.rejects(fixture.service.take(editorDraft, CancellationToken.None), isCancellationError);
		await fixture.enteredAllocation;
		fixture.service.dispose();
		await claimed;
		await allocation.complete('env-1');
		await fixture.deleted;

		assert.deepStrictEqual(fixture.calls, ['reserve', 'delete:task-env-1']);
	});
});
