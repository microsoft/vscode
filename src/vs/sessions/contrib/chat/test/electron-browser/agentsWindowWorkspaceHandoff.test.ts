/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISessionsWindowOpenContext, SessionsWindowOpenTelemetry } from '../../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { SelectAgentsFolderContribution } from '../../electron-browser/chat.contribution.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ISession } from '../../../../services/sessions/common/session.js';

const startWindowOpenTelemetry = Reflect.get(SelectAgentsFolderContribution.prototype, '_startWindowOpenTelemetry') as (
	source: AgentsWindowOpenSource,
	context: ISessionsWindowOpenContext,
) => SessionsWindowOpenTelemetry | undefined;

suite('Agents Window workspace handoff telemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('later opening requests cannot change the initial opening context or handoff tracker', () => {
		const lifecycleService = disposables.add(new TestLifecycleService());
		const events: { name: string; data?: ITelemetryData }[] = [];
		const harness = {
			startWindowOpenTelemetry,
			_didHandleInitialWindowOpen: false,
			_windowOpenTelemetry: disposables.add(new MutableDisposable<SessionsWindowOpenTelemetry>()),
			_workspaceSelectionTelemetry: disposables.add(new MutableDisposable()),
			instantiationService: { createInstance: () => Disposable.None },
			storageService: { getNumber: () => 0 },
			telemetryService: upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }),
			sessionsSetUpService: { initialSignInDialogShown: false },
			_getWindowOpenViewState: () => ({ workspacePreselected: false, workspacePreselectionSource: 'none', viewKind: 'noComposer' }),
			lifecycleService,
		};
		const initialTracker = harness.startWindowOpenTelemetry(AgentsWindowOpenSource.TitleBar, { workspaceArgumentKind: 'local', hasSessionArgument: false, workspaceArgumentIsDefault: true });
		initialTracker?.recordWorkspaceHandoffState('waitingForProvider');
		const subsequentTracker = harness.startWindowOpenTelemetry(AgentsWindowOpenSource.CommandPalette, { workspaceArgumentKind: 'none', hasSessionArgument: true });
		subsequentTracker?.recordWorkspaceHandoffState('applied');
		lifecycleService.fireShutdown(ShutdownReason.CLOSE);

		const data = events.find(event => event.name === 'agents/firstTimeWindowOpen')?.data;
		assert.deepStrictEqual({
			eventNames: events.map(event => event.name),
			hasInitialTracker: initialTracker !== undefined,
			hasSubsequentTracker: subsequentTracker !== undefined,
			source: data?.source,
			argument: data?.workspaceArgumentKind,
			isDefault: data?.workspaceArgumentIsDefault,
			hasSessionArgument: data?.hasSessionArgument,
			handoff: data?.workspaceHandoffStateAtEmission,
		}, {
			eventNames: ['agents/windowSessionStart', 'agents/firstTimeWindowOpen'],
			hasInitialTracker: true,
			hasSubsequentTracker: false,
			source: 'titleBar',
			argument: 'local',
			isDefault: true,
			hasSessionArgument: false,
			handoff: 'waitingForProvider',
		});
	});

	test('a superseded existing-session lookup cannot navigate after a newer opening', async () => {
		const found = new DeferredPromise<boolean>();
		const cancellation = disposables.add(new CancellationTokenSource());
		let opened = false;
		const harness = {
			resolveAndOpenSession: Reflect.get(SelectAgentsFolderContribution.prototype, 'resolveAndOpenSession') as (resource: URI, token: CancellationTokenSource['token']) => Promise<void>,
			waitForSessionAvailable: () => found.p,
			sessionsService: { openSession: async () => { opened = true; } },
			logService: { info: () => { }, warn: () => { } },
		};
		const opening = harness.resolveAndOpenSession(URI.file('/private/session'), cancellation.token);
		cancellation.cancel();
		await found.complete(true);
		await opening;
		assert.strictEqual(opened, false);
	});

	for (const kind of ['session', 'link'] as const) {
		for (const alreadyCancelled of [false, true]) {
			test(`disposes ${kind} lookup listeners on ${alreadyCancelled ? 'immediate' : 'pending'} cancellation`, async () => {
				const changed = disposables.add(new Emitter<void>());
				const resolved = disposables.add(new Emitter<void>());
				const cancellation = disposables.add(new CancellationTokenSource());
				const harness = {
					waitForSessionAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionAvailable') as (resource: URI, token: CancellationToken) => Promise<boolean>,
					waitForSessionLinkAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionLinkAvailable') as (resource: URI, token: CancellationToken) => Promise<ISession | undefined>,
					sessionsManagementService: { getSession: () => undefined, getSessions: () => [], onDidChangeSessions: changed.event },
					agentHostConnectionsService: { onDidChangeSessionResolution: resolved.event },
				};
				if (alreadyCancelled) {
					cancellation.cancel();
				}
				const resource = URI.parse('agent-host-copilot:/session');
				const opening = kind === 'link'
					? harness.waitForSessionLinkAvailable(resource, cancellation.token)
					: harness.waitForSessionAvailable(resource, cancellation.token);
				const listening = changed.hasListeners();
				cancellation.cancel();
				const result = await opening;
				assert.deepStrictEqual({ listening, result, listenersRemain: changed.hasListeners() || resolved.hasListeners() }, {
					listening: !alreadyCancelled, result: kind === 'link' ? undefined : false, listenersRemain: false,
				});
			});
		}
	}
});
