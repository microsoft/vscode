/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAdapterManager, IDebugAdapterDescriptorFactory, IDebugModel, IDebugService, IViewModel } from '../../../contrib/debug/common/debug.js';
import { IDebugVisualizerService } from '../../../contrib/debug/common/debugVisualizers.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadDebugService } from '../../browser/mainThreadDebugService.js';

suite('MainThreadDebugService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes debug adapter descriptor factory registrations when they are unregistered', async () => {
		let registrationDisposed = false;
		const adapterManager = new class extends mock<IAdapterManager>() {
			override registerDebugAdapterDescriptorFactory(_factory: IDebugAdapterDescriptorFactory) {
				return toDisposable(() => registrationDisposed = true);
			}
			override unregisterDebugAdapterDescriptorFactory(_factory: IDebugAdapterDescriptorFactory): void { }
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
			override getAdapterManager() { return adapterManager; }
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

		await service.$registerDebugAdapterDescriptorFactory('test', 1);
		service.$unregisterDebugAdapterDescriptorFactory(1);

		assert.strictEqual(registrationDisposed, true);
	});
});
