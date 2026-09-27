/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationService, IAutomationRunRequestResult } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider, ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { AutomationRunner } from '../../browser/automationRunner.js';

suite('AutomationRunner', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const automation: IAutomationDescriptor = {
		id: 'automation',
		name: 'Review',
		prompt: 'Review changes',
		target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
		schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		enabled: true,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
	};
	const run: IAutomationRun = {
		id: 'run',
		automationId: automation.id,
		status: 'running',
		trigger: 'manual',
		sessionResource: URI.parse('agent-host-copilotcli:/session'),
		startedAt: '2026-01-01T00:00:00Z',
	};

	function provider(catalogueState: AutomationCatalogueState, unavailableReason?: string): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({
			id: 'host',
			label: 'Remote host',
			automations: upcastPartial<ISessionsProviderAutomations>({
				catalogueState: constObservable(catalogueState),
				canCreateAutomation: constObservable(false),
				unavailableReason: constObservable(unavailableReason),
			}),
		});
	}

	function setup(request: () => Promise<IAutomationRunRequestResult>, available = true, exists = true, providers: readonly ISessionsProvider[] = [provider(available ? 'ready' : 'unavailable')]) {
		const errors: string[] = [];
		const calls: string[] = [];
		const service = upcastPartial<IAutomationService>({
			getAutomation: () => exists ? automation : undefined,
			canCreateAutomation: () => false,
			canRunAutomation: () => available,
			runAutomation: id => { calls.push(id); return request(); },
		});
		const providersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
				return providers.find(provider => provider.id === id) as T | undefined;
			}
		}();
		const runner = new AutomationRunner(service, providersService, new NullLogService(), upcastPartial<INotificationService>({ error: message => errors.push(String(message)) }));
		return { runner, errors, calls };
	}

	test('dispatches through the host and observes completion without local lifecycle writes', async () => {
		const completion = new DeferredPromise<void>();
		const { runner, calls, errors } = setup(async () => ({ kind: 'dispatched', run, whenCompleted: completion.p }));
		const operation = runner.runOnce(automation);
		const dispatch = await operation.whenDispatched;
		let completed = false;
		void operation.whenCompleted.then(() => completed = true);
		assert.deepStrictEqual({ dispatch, completed, calls }, { dispatch: { kind: 'started', run, sessionResource: run.sessionResource }, completed: false, calls: ['automation'] });
		await completion.complete();
		await operation.whenCompleted;
		assert.deepStrictEqual(errors, []);
	});

	test('returns the authoritative active run without creating another session', async () => {
		const { runner, calls } = setup(async () => ({ kind: 'alreadyRunning', run }));
		const operation = runner.runOnce(automation);
		assert.deepStrictEqual(await operation.whenDispatched, { kind: 'alreadyRunning', activeRun: run });
		await operation.whenCompleted;
		assert.deepStrictEqual(calls, ['automation']);
	});

	test('unavailable or disconnected hosts cannot dispatch locally', async () => {
		for (const exists of [true, false]) {
			const { runner, calls, errors } = setup(async () => { throw new Error('Must not dispatch'); }, false, exists);
			const operation = runner.runOnce(automation);
			assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'targetUnavailable' });
			await operation.whenCompleted;
			assert.deepStrictEqual({ calls, errorCount: errors.length }, { calls: [], errorCount: 1 });
		}
	});

	test('deleted definitions are reported correctly on a readable host without creation permission', async () => {
		const { runner, calls, errors } = setup(async () => { throw new Error('Must not dispatch'); }, true, false);
		const operation = runner.runOnce(automation);
		assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'deleted' });
		await operation.whenCompleted;
		assert.deepStrictEqual({ calls, errors }, { calls: [], errors: [] });
	});

	test('explains how to recover an automation without a selected host', async () => {
		const { runner, calls, errors } = setup(async () => { throw new Error('Must not dispatch'); });
		const operation = runner.runOnce({
			...automation,
			target: { kind: 'workspace', folderUri: URI.file('/workspace'), isolation: { kind: 'default' } },
		});
		assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'targetUnavailable' });
		await operation.whenCompleted;
		assert.match(errors[0], /Duplicate it and select an Agent Host/);
		assert.deepStrictEqual(calls, []);
	});

	for (const scenario of [
		{ name: 'unregistered', providers: [], guidance: /Connect to this automation's Agent Host and try again/ },
		{
			name: 'unsupported provider',
			providers: [upcastPartial<ISessionsProvider>({ id: 'host', label: 'Copilot Chat' })],
			guidance: /Copilot Chat does not support automations\. Use an Agent Host that supports automations/,
		},
		{ name: 'loading', providers: [provider('loading')], guidance: /still loading\. Wait for loading to finish/ },
		{ name: 'catalogue failure', providers: [provider('error')], guidance: /could not be loaded\. Reconnect to the Agent Host/ },
		{ name: 'disconnected', providers: [provider('unavailable')], guidance: /Remote host is unavailable\. Reconnect to the Agent Host/ },
		{
			name: 'disabled',
			providers: [provider('unavailable', 'Automations are disabled. Enable chat.automations.enabled and try again.')],
			guidance: /Automations are disabled\. Enable chat\.automations\.enabled/,
		},
		{
			name: 'incompatible',
			providers: [provider('unavailable', 'Update this Agent Host to a newer version, then reconnect to use automations.')],
			guidance: /Update this Agent Host/,
		},
	]) {
		test(`reports actionable ${scenario.name} guidance for missing and cached definitions`, async () => {
			for (const exists of [false, true]) {
				const { runner, calls, errors } = setup(async () => { throw new Error('Must not dispatch'); }, true, exists, scenario.providers);
				const operation = runner.runOnce(automation);
				assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'targetUnavailable' });
				await operation.whenCompleted;
				assert.match(errors[0], scenario.guidance);
				assert.deepStrictEqual(calls, []);
			}
		});
	}

	test('pre-cancelled requests do not reach the host', async () => {
		const token = disposables.add(new CancellationTokenSource());
		token.cancel();
		const { runner, calls } = setup(async () => { throw new Error('Must not dispatch'); });
		const operation = runner.runOnce(automation, token.token);
		assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'cancelled' });
		await operation.whenCompleted;
		assert.deepStrictEqual(calls, []);
	});

	test('forwards cancellation to the host exactly once, including cancellation during dispatch', async () => {
		const token = disposables.add(new CancellationTokenSource());
		const requested = new DeferredPromise<IAutomationRunRequestResult>();
		const completed = new DeferredPromise<void>();
		let cancellations = 0;
		const { runner } = setup(() => requested.p);
		const operation = runner.runOnce(automation, token.token);
		token.cancel();
		await requested.complete({ kind: 'dispatched', run, whenCompleted: completed.p, cancel: () => cancellations++ });
		await operation.whenDispatched;
		await completed.complete();
		await operation.whenCompleted;
		assert.strictEqual(cancellations, 1);
	});

	test('reports dispatch failures without synthesizing a browser run', async () => {
		const { runner, errors } = setup(async () => { throw new Error('Host rejected the request'); });
		const operation = runner.runOnce(automation);
		assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'error' });
		await operation.whenCompleted;
		assert.match(errors[0], /Host rejected the request/);
	});

	test('reports authoritative failures that never create a session', async () => {
		const failed = { ...run, status: 'failed', sessionResource: undefined, errorMessage: 'Unavailable model' } as const;
		const { runner, errors } = setup(async () => ({ kind: 'dispatched', run: failed, whenCompleted: Promise.resolve() }));
		const operation = runner.runOnce(automation);
		assert.deepStrictEqual(await operation.whenDispatched, { kind: 'notStarted', reason: 'error', run: failed });
		await operation.whenCompleted;
		assert.match(errors[0], /Unavailable model/);
	});
});
