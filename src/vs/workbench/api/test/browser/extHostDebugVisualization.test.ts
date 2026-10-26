/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionDescriptionRegistry } from '../../../services/extensions/common/extensionDescriptionRegistry.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IDebugVisualizationContext } from '../../../contrib/debug/common/debug.js';
import { MainThreadDebugServiceShape } from '../../common/extHost.protocol.js';
import { IExtHostCommands } from '../../common/extHostCommands.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { ExtHostDebugServiceBase } from '../../common/extHostDebugService.js';
import { IExtHostEditorTabs } from '../../common/extHostEditorTabs.js';
import { IExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { IExtHostTesting } from '../../common/extHostTesting.js';
import { IExtHostVariableResolverProvider } from '../../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host debug visualization registrations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const extension = { ...nullExtensionDescription, identifier: new ExtensionIdentifier('sample.visualizers'), contributes: { debugVisualizers: [{ id: 'visualizer', when: 'true' }] } };
	const context: IDebugVisualizationContext = { sessionId: 'session', threadId: 1, variable: { name: 'value', value: '1', variablesReference: 0 } };
	let service: ExtHostDebugServiceBase;

	setup(async () => {
		const proxy = new class extends mock<MainThreadDebugServiceShape>() {
			override $registerDebugTypes(): void { }
			override $sessionCached(): void { }
			override $registerDebugVisualizer(): void { }
			override $unregisterDebugVisualizer(): void { }
			override $registerDebugVisualizerTree(): void { }
			override $unregisterDebugVisualizerTree(): void { }
		};
		service = store.add(new class extends ExtHostDebugServiceBase { }(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IExtHostWorkspace>() { },
			upcastPartial<IExtHostExtensionService>({
				async getExtensionRegistry(): Promise<ExtensionDescriptionRegistry> {
					return new class extends mock<ExtensionDescriptionRegistry>() {
						override readonly onDidChange = Event.None;
						override getAllExtensionDescriptions() { return []; }
					};
				}
			}),
			new class extends mock<IExtHostConfiguration>() { },
			new class extends mock<IExtHostEditorTabs>() { },
			new class extends mock<IExtHostVariableResolverProvider>() { },
			new class extends mock<IExtHostCommands>() { },
			new class extends mock<IExtHostTesting>() { }
		));
		await service.$acceptDebugSessionStarted({ id: 'session', type: 'test', name: 'test', parent: undefined, folderUri: undefined, configuration: { type: 'test', request: 'launch', name: 'test' } });
	});

	test('does not call a disposed visualization provider', async () => {
		let calls = 0;
		const registration = store.add(service.registerDebugVisualizationProvider(extension, 'visualizer', {
			provideDebugVisualization: () => { calls++; return []; }
		}));
		await service.$provideDebugVisualizers('sample.visualizers', 'visualizer', context, CancellationToken.None);
		registration.dispose();
		await service.$provideDebugVisualizers('sample.visualizers', 'visualizer', context, CancellationToken.None);
		assert.strictEqual(calls, 1);
	});

	test('allows a visualization provider to register again after disposal', () => {
		const provider = { provideDebugVisualization: () => [] };
		store.add(service.registerDebugVisualizationProvider(extension, 'visualizer', provider)).dispose();
		store.add(service.registerDebugVisualizationProvider(extension, 'visualizer', provider));
	});

	test('does not call a disposed visualization tree provider', async () => {
		let calls = 0;
		const registration = store.add(service.registerDebugVisualizationTree(extension, 'tree', {
			getTreeItem: () => { calls++; return { label: 'value' }; },
			getChildren: () => []
		}));
		await service.$getVisualizerTreeItem('sample.visualizers\0tree', context);
		registration.dispose();
		await service.$getVisualizerTreeItem('sample.visualizers\0tree', context);
		assert.strictEqual(calls, 1);
	});
});
