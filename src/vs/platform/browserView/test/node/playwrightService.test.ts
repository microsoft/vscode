/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IBrowserViewService } from '../../common/browserView.js';
import { IBrowserViewGroupRemoteService } from '../../node/browserViewGroupRemoteService.js';
import { PlaywrightService } from '../../node/playwrightService.js';

suite('PlaywrightService network filtering', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps filtering enabled for the tracked-page lifetime', async () => {
		const filteringCalls: [viewId: string, sourceId: string, enabled: boolean][] = [];
		const browserViewService: Pick<IBrowserViewService, 'setAgentNetworkFiltering' | 'setAgentNetworkAction' | 'getNetworkPolicyError'> = {
			async setAgentNetworkFiltering(viewId, sourceId, enabled) {
				filteringCalls.push([viewId, sourceId, enabled]);
			},
			async setAgentNetworkAction() { },
			async getNetworkPolicyError() { return undefined; },
		};
		const browserViewGroupRemoteService: IBrowserViewGroupRemoteService = {
			async createGroup() {
				throw new Error('Unexpected group creation');
			},
		};
		const networkFilterService: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: () => true,
			formatError: () => '',
		};
		const service = store.add(new PlaywrightService(
			1,
			browserViewGroupRemoteService,
			browserViewService,
			new NullLogService(),
			networkFilterService,
			NullTelemetryService,
		));

		await service.startTrackingPage('view');
		await service.disposeSession('agent-session');
		const callsWhileTracked = [...filteringCalls];
		await service.stopTrackingPage('view');
		const sourceId = filteringCalls[0][1];

		assert.deepStrictEqual({
			callsWhileTracked,
			filteringCalls,
		}, {
			callsWhileTracked: [['view', sourceId, true]],
			filteringCalls: [
				['view', sourceId, true],
				['view', sourceId, false],
			],
		});
	});

	test('releases tracked-page filtering when the service is disposed', async () => {
		const filteringCalls: [viewId: string, sourceId: string, enabled: boolean][] = [];
		const browserViewService: Pick<IBrowserViewService, 'setAgentNetworkFiltering' | 'setAgentNetworkAction' | 'getNetworkPolicyError'> = {
			async setAgentNetworkFiltering(viewId, sourceId, enabled) {
				filteringCalls.push([viewId, sourceId, enabled]);
			},
			async setAgentNetworkAction() { },
			async getNetworkPolicyError() { return undefined; },
		};
		const service = new PlaywrightService(
			1,
			{ async createGroup() { throw new Error('Unexpected group creation'); } },
			browserViewService,
			new NullLogService(),
			{ _serviceBrand: undefined, onDidChange: Event.None, isUriAllowed: () => true, formatError: () => '' },
			NullTelemetryService,
		);

		await service.startTrackingPage('view');
		service.dispose();
		const sourceId = filteringCalls[0][1];

		assert.deepStrictEqual(filteringCalls, [
			['view', sourceId, true],
			['view', sourceId, false],
		]);
	});

	test('rolls back filtering when disposal races with tracking', async () => {
		const filteringCalls: [viewId: string, sourceId: string, enabled: boolean][] = [];
		let releaseEnable: (() => void) | undefined;
		const enableBarrier = new Promise<void>(resolve => releaseEnable = resolve);
		const service = new PlaywrightService(
			1,
			{ async createGroup() { throw new Error('Unexpected group creation'); } },
			{
				async setAgentNetworkFiltering(viewId, sourceId, enabled) {
					filteringCalls.push([viewId, sourceId, enabled]);
					if (enabled) {
						await enableBarrier;
					}
				},
				async setAgentNetworkAction() { },
				async getNetworkPolicyError() { return undefined; },
			},
			new NullLogService(),
			{ _serviceBrand: undefined, onDidChange: Event.None, isUriAllowed: () => true, formatError: () => '' },
			NullTelemetryService,
		);

		const tracking = service.startTrackingPage('view');
		service.dispose();
		releaseEnable?.();
		await assert.rejects(tracking, /disposed while tracking/);
		const sourceId = filteringCalls[0][1];

		assert.deepStrictEqual(filteringCalls, [
			['view', sourceId, true],
			['view', sourceId, false],
		]);
	});

	test('serializes stop followed by start for the same page', async () => {
		const filteringCalls: [viewId: string, sourceId: string, enabled: boolean][] = [];
		let releaseDisable: (() => void) | undefined;
		let disableStarted: (() => void) | undefined;
		const disableBarrier = new Promise<void>(resolve => releaseDisable = resolve);
		const disableStartedBarrier = new Promise<void>(resolve => disableStarted = resolve);
		const service = new PlaywrightService(
			1,
			{ async createGroup() { throw new Error('Unexpected group creation'); } },
			{
				async setAgentNetworkFiltering(viewId, sourceId, enabled) {
					filteringCalls.push([viewId, sourceId, enabled]);
					if (!enabled) {
						disableStarted?.();
						await disableBarrier;
					}
				},
				async setAgentNetworkAction() { },
				async getNetworkPolicyError() { return undefined; },
			},
			new NullLogService(),
			{ _serviceBrand: undefined, onDidChange: Event.None, isUriAllowed: () => true, formatError: () => '' },
			NullTelemetryService,
		);

		const stopping = service.stopTrackingPage('view');
		await disableStartedBarrier;
		const starting = service.startTrackingPage('view');
		releaseDisable?.();
		await Promise.all([stopping, starting]);
		const tracked = await service.isPageTracked('view');
		const callsBeforeDisposal = [...filteringCalls];
		service.dispose();

		assert.deepStrictEqual({
			tracked,
			enabledStates: callsBeforeDisposal.map(([, , enabled]) => enabled),
		}, {
			tracked: true,
			enabledStates: [false, true],
		});
	});

	test('serializes start followed by stop for the same page', async () => {
		const filteringCalls: [viewId: string, sourceId: string, enabled: boolean][] = [];
		let releaseEnable: (() => void) | undefined;
		let enableStarted: (() => void) | undefined;
		const enableBarrier = new Promise<void>(resolve => releaseEnable = resolve);
		const enableStartedBarrier = new Promise<void>(resolve => enableStarted = resolve);
		const service = new PlaywrightService(
			1,
			{ async createGroup() { throw new Error('Unexpected group creation'); } },
			{
				async setAgentNetworkFiltering(viewId, sourceId, enabled) {
					filteringCalls.push([viewId, sourceId, enabled]);
					if (enabled) {
						enableStarted?.();
						await enableBarrier;
					}
				},
				async setAgentNetworkAction() { },
				async getNetworkPolicyError() { return undefined; },
			},
			new NullLogService(),
			{ _serviceBrand: undefined, onDidChange: Event.None, isUriAllowed: () => true, formatError: () => '' },
			NullTelemetryService,
		);

		const starting = service.startTrackingPage('view');
		await enableStartedBarrier;
		const stopping = service.stopTrackingPage('view');
		releaseEnable?.();
		await Promise.all([starting, stopping]);
		const tracked = await service.isPageTracked('view');
		service.dispose();

		assert.deepStrictEqual({
			tracked,
			enabledStates: filteringCalls.map(([, , enabled]) => enabled),
		}, {
			tracked: false,
			enabledStates: [true, false],
		});
	});

	test('does not replay a page into a session created while untracking', async () => {
		let releaseDisable: (() => void) | undefined;
		let disableStarted: (() => void) | undefined;
		const disableBarrier = new Promise<void>(resolve => releaseDisable = resolve);
		const disableStartedBarrier = new Promise<void>(resolve => disableStarted = resolve);
		const service = new PlaywrightService(
			1,
			{ async createGroup() { throw new Error('Unexpected group creation'); } },
			{
				async setAgentNetworkFiltering(_viewId, _sourceId, enabled) {
					if (!enabled) {
						disableStarted?.();
						await disableBarrier;
					}
				},
				async setAgentNetworkAction() { },
				async getNetworkPolicyError() { return undefined; },
			},
			new NullLogService(),
			{ _serviceBrand: undefined, onDidChange: Event.None, isUriAllowed: () => true, formatError: () => '' },
			NullTelemetryService,
		);
		await service.startTrackingPage('view');

		const stopping = service.stopTrackingPage('view');
		await disableStartedBarrier;
		let addViewCallCount = 0;
		const session = {
			sessionId: 'new-session',
			group: {
				async addView() { addViewCallCount++; },
				async removeView() { },
			},
			dispose() { },
		};
		const sessions = Reflect.get(service, '_sessions') as { set(key: string, value: typeof session): void };
		sessions.set(session.sessionId, session);
		const replayTrackedPage = Reflect.get(service, 'replayTrackedPage') as (targetSession: typeof session, viewId: string) => Promise<void>;
		const replay = Reflect.apply(replayTrackedPage, service, [session, 'view']) as Promise<void>;

		releaseDisable?.();
		await Promise.all([stopping, replay]);
		const tracked = await service.isPageTracked('view');
		service.dispose();

		assert.deepStrictEqual({ tracked, addViewCallCount }, { tracked: false, addViewCallCount: 0 });
	});

});
