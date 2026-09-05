/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { captureGlobalTimeApi, type TimeoutId } from '../../../../../../base/test/common/virtualScheduling/timeApi.js';
import { pushGlobalTimeApi } from '../../../../../../base/test/common/virtualScheduling/globalTimeApi.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ILifecycleService, type WillShutdownEvent } from '../../../../../services/lifecycle/common/lifecycle.js';
import { ITerminalEditorService, type ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { TerminalTelemetryContribution } from '../../browser/terminalTelemetry.js';

suite('TerminalTelemetryContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels the shell integration timeout when the terminal or contribution is disposed', async () => {
		const onDidCreateInstance = store.add(new Emitter<ITerminalInstance>());
		const onAnyInstanceShellTypeChanged = store.add(new Emitter<ITerminalInstance>());
		const onDisposed = store.add(new Emitter<ITerminalInstance>());
		const onWillShutdown = store.add(new Emitter<WillShutdownEvent>());
		const timeoutHandle = 1 as unknown as TimeoutId;
		let scheduledTimeout: number | undefined;
		let clearedTimeout: TimeoutId | undefined;
		let telemetryEvents = 0;

		const timeApi = captureGlobalTimeApi();
		store.add(pushGlobalTimeApi({
			...timeApi,
			setTimeout: (_handler, timeout) => {
				scheduledTimeout = timeout;
				return timeoutHandle;
			},
			clearTimeout: handle => clearedTimeout = handle,
		}));

		const terminalService = upcastPartial<ITerminalService>({
			onDidCreateInstance: onDidCreateInstance.event,
			onAnyInstanceShellTypeChanged: onAnyInstanceShellTypeChanged.event,
		});
		const lifecycleService = upcastPartial<ILifecycleService>({ onWillShutdown: onWillShutdown.event });
		const terminalEditorService = upcastPartial<ITerminalEditorService>({
			getInputFromResource: () => { throw new Error('Not an editor terminal'); },
		});
		const telemetryService = upcastPartial<ITelemetryService>({
			publicLog2: () => { telemetryEvents++; },
		});
		const contribution = store.add(new TerminalTelemetryContribution(lifecycleService, terminalService, terminalEditorService, telemetryService));

		const instance = upcastPartial<ITerminalInstance>({
			resource: URI.parse('terminal:test'),
			target: TerminalLocation.Panel,
			processReady: Promise.resolve(),
			onDisposed: onDisposed.event,
			shellLaunchConfig: {},
			capabilities: store.add(new TerminalCapabilityStore()),
			hasRemoteAuthority: false,
			usedShellIntegrationInjection: false,
			shellIntegrationInjectionFailureReason: undefined,
			sessionId: 'test',
		});

		onDidCreateInstance.fire(instance);
		onDisposed.fire(instance);
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({ scheduledTimeout, clearedTimeout, telemetryEvents }, {
			scheduledTimeout: 10_000,
			clearedTimeout: timeoutHandle,
			telemetryEvents: 1,
		});

		scheduledTimeout = undefined;
		clearedTimeout = undefined;
		onDidCreateInstance.fire(instance);
		await Promise.resolve();
		contribution.dispose();
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({ scheduledTimeout, clearedTimeout, telemetryEvents }, {
			scheduledTimeout: 10_000,
			clearedTimeout: timeoutHandle,
			telemetryEvents: 1,
		});
	});
});
