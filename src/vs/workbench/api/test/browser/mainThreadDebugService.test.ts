/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DebugConfigurationProviderTriggerKind, IConfigurationManager, IDebugConfigurationProvider, IDebugModel, IDebugService, IViewModel } from '../../../contrib/debug/common/debug.js';
import { IDebugVisualizerService } from '../../../contrib/debug/common/debugVisualizers.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadDebugService } from '../../browser/mainThreadDebugService.js';

suite('MainThreadDebugService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes debug configuration provider registrations when they are unregistered', async () => {
		let registrationDisposed = false;
		const configurationManager = new class extends mock<IConfigurationManager>() {
			override registerDebugConfigurationProvider(_provider: IDebugConfigurationProvider) {
				return toDisposable(() => registrationDisposed = true);
			}
			override unregisterDebugConfigurationProvider(_provider: IDebugConfigurationProvider): void { }
		};
		const model = new class extends mock<IDebugModel>() {
			override readonly onDidChangeBreakpoints = Event.None;
			override getBreakpoints() { return []; }
			override getFunctionBreakpoints() { return []; }
			override getDataBreakpoints() { return []; }
		};
		const viewModel = new class extends mock<IViewModel>() {
			override readonly onDidFocusSession = Event.None;
			override readonly onDidFocusThread = Event.None;
			override readonly onDidFocusStackFrame = Event.None;
		};
		const debugService = new class extends mock<IDebugService>() {
			override readonly onDidNewSession = Event.None;
			override readonly onWillNewSession = Event.None;
			override readonly onDidEndSession = Event.None;
			override getConfigurationManager() { return configurationManager; }
			override getModel() { return model; }
			override getViewModel() { return viewModel; }
		};
		const extHostContext = new class extends mock<IExtHostContext>() {
			override readonly remoteAuthority = '';
			override readonly extensionHostKind = ExtensionHostKind.LocalProcess;
			override getProxy(): any { return {}; }
		};
		const service = store.add(new MainThreadDebugService(
			extHostContext,
			debugService,
			new class extends mock<IDebugVisualizerService>() { }
		));

		await service.$registerDebugConfigurationProvider('test', DebugConfigurationProviderTriggerKind.Initial, true, false, false, 1);
		service.$unregisterDebugConfigurationProvider(1);

		assert.strictEqual(registrationDisposed, true);
	});
});
