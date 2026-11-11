/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionDescriptionRegistry } from '../../../services/extensions/common/extensionDescriptionRegistry.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IDebugVisualizationContext } from '../../../contrib/debug/common/debug.js';
import { IDebugSessionDto, MainThreadDebugServiceShape } from '../../common/extHost.protocol.js';
import { IExtHostCommands } from '../../common/extHostCommands.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { ExtHostDebugServiceBase } from '../../common/extHostDebugService.js';
import { IExtHostEditorTabs } from '../../common/extHostEditorTabs.js';
import { IExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { IExtHostTesting } from '../../common/extHostTesting.js';
import { IExtHostVariableResolverProvider } from '../../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host debug visualization session items', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const extension = { ...nullExtensionDescription, identifier: new ExtensionIdentifier('sample.visualizers') };
	const treeId = 'sample.visualizers\0tree';
	const session = (id: string): IDebugSessionDto => ({ id, type: 'test', name: id, parent: undefined, folderUri: undefined, configuration: { type: 'test', request: 'launch', name: id } });
	const context = (sessionId: string): IDebugVisualizationContext => ({ sessionId, threadId: 1, variable: { name: 'value', value: '1', variablesReference: 0 } });
	let service: ExtHostDebugServiceBase;

	setup(async () => {
		const proxy = new class extends mock<MainThreadDebugServiceShape>() {
			override $registerDebugTypes(): void { }
			override $sessionCached(): void { }
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
		await service.$acceptDebugSessionStarted(session('first'));
	});

	function registerTree(overrides: Partial<vscode.DebugVisualizationTree> = {}): void {
		store.add(service.registerDebugVisualizationTree(extension, 'tree', {
			getTreeItem: () => ({ label: 'root' }),
			getChildren: () => [{ label: 'child' }],
			editItem: item => item,
			...overrides
		}));
	}

	test('releases roots and children when their debug session ends', async () => {
		registerTree();
		const root = await service.$getVisualizerTreeItem(treeId, context('first'));
		assert.ok(root);
		const [child] = await service.$getVisualizerTreeItemChildren(treeId, root.id);
		assert.ok(child);
		await service.$acceptDebugSessionTerminated(session('first'));
		assert.strictEqual(await service.$editVisualizerTreeItem(root.id, 'value'), undefined);
		assert.strictEqual(await service.$editVisualizerTreeItem(child.id, 'value'), undefined);
	});

	test('does not cache a root returned after its session ends', async () => {
		const result = new DeferredPromise<vscode.DebugTreeItem>();
		registerTree({ getTreeItem: () => result.p });
		const request = service.$getVisualizerTreeItem(treeId, context('first'));
		await service.$acceptDebugSessionTerminated(session('first'));
		await result.complete({ label: 'late root' });
		assert.strictEqual(await request, undefined);
	});

	test('does not cache children returned after their session ends', async () => {
		const result = new DeferredPromise<vscode.DebugTreeItem[]>();
		registerTree({ getChildren: () => result.p });
		const root = await service.$getVisualizerTreeItem(treeId, context('first'));
		assert.ok(root);
		const request = service.$getVisualizerTreeItemChildren(treeId, root.id);
		await service.$acceptDebugSessionTerminated(session('first'));
		await result.complete([{ label: 'late child' }]);
		assert.deepStrictEqual(await request, []);
	});

	test('does not cache an edit returned after its session ends', async () => {
		const result = new DeferredPromise<vscode.DebugTreeItem>();
		registerTree({ editItem: () => result.p });
		const root = await service.$getVisualizerTreeItem(treeId, context('first'));
		assert.ok(root);
		const request = service.$editVisualizerTreeItem(root.id, 'value');
		await service.$acceptDebugSessionTerminated(session('first'));
		await result.complete({ label: 'late edit' });
		assert.strictEqual(await request, undefined);
	});

	for (const shared of [false, true]) {
		test(`retains ${shared ? 'shared' : 'separate'} items while their sessions are active`, async () => {
			const item = { label: 'root' };
			registerTree({ getTreeItem: () => shared ? item : { ...item } });
			const first = await service.$getVisualizerTreeItem(treeId, context('first'));
			await service.$acceptDebugSessionStarted(session('second'));
			const second = await service.$getVisualizerTreeItem(treeId, context('second'));
			assert.ok(first && second);
			assert.strictEqual(first.id === second.id, shared);
			await service.$acceptDebugSessionTerminated(session('first'));
			assert.ok(await service.$editVisualizerTreeItem(second.id, 'value'));
			await service.$acceptDebugSessionTerminated(session('second'));
			assert.strictEqual(await service.$editVisualizerTreeItem(second.id, 'value'), undefined);
			await service.$acceptDebugSessionStarted(session('third'));
			const third = await service.$getVisualizerTreeItem(treeId, context('third'));
			assert.ok(third && third.id !== second.id);
		});
	}
});
