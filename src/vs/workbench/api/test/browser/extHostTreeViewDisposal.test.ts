/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { TreeDataProvider, TreeItem } from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadCommandsShape, MainThreadTreeViewsShape } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ExtHostTreeViews } from '../../common/extHostTreeViews.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostTreeViews registration lifetime', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let service: ExtHostTreeViews;
	let removed: string[];
	let registration: Promise<void>;

	class Provider implements TreeDataProvider<string> {
		getChildren(): string[] { return ['item']; }
		getTreeItem(label: string): TreeItem { return { label }; }
	}

	setup(() => {
		removed = [];
		registration = Promise.resolve();
		const commands = new ExtHostCommands(SingleProxyRPCProtocol(new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
			override $unregisterCommand(): void { }
		}), new NullLogService(), new class extends mock<IExtHostTelemetry>() { });
		service = disposables.add(new ExtHostTreeViews(new class extends mock<MainThreadTreeViewsShape>() {
			override $registerTreeViewDataProvider(): Promise<void> { return registration; }
			override async $disposeTree(id: string): Promise<void> { removed.push(id); }
		}, commands, new NullLogService()));
	});

	async function disposeView(): Promise<WeakRef<Provider>> {
		const provider = new Provider();
		const view = service.createTreeView('disposed', { treeDataProvider: provider }, nullExtensionDescription);
		await view.dispose();
		return new WeakRef(provider);
	}

	test('disposed view providers become collectible while the service remains alive', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		const ref = await disposeView();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(ref.deref() === undefined, true, 'Disposed tree view provider is still strongly retained');
	});

	test('disposing one view preserves other live providers', async () => {
		service.createTreeView('remaining', { treeDataProvider: new Provider() }, nullExtensionDescription);
		await disposeView();
		const children = await service.$getChildren('remaining');
		const item = children?.[0][1];
		assert.deepStrictEqual({
			removed,
			label: typeof item === 'object' ? item.label?.label : undefined
		}, { removed: ['disposed'], label: 'item' });
	});

	test('registered data providers can still be disposed repeatedly', async () => {
		const registration = service.registerTreeDataProvider('provider', new Provider(), nullExtensionDescription);
		await registration.dispose();
		await registration.dispose();
		assert.deepStrictEqual(removed, ['provider']);
		await assert.rejects(service.$getChildren('provider'));
	});

	test('shutdown still disposes all live registrations', async () => {
		service.createTreeView('first', { treeDataProvider: new Provider() }, nullExtensionDescription);
		service.createTreeView('second', { treeDataProvider: new Provider() }, nullExtensionDescription);
		service.dispose();
		await timeout(0);
		assert.deepStrictEqual(removed, ['first', 'second']);
	});

	test('pending old-view disposal does not remove a replacement', async () => {
		const pending = new DeferredPromise<void>();
		registration = pending.p;
		const oldView = service.createTreeView('replaced', { treeDataProvider: new Provider() }, nullExtensionDescription);
		const oldDisposal = oldView.dispose();
		service.createTreeView('replaced', { treeDataProvider: new Provider() }, nullExtensionDescription);
		await pending.complete();
		await oldDisposal;
		const children = await service.$getChildren('replaced');
		const item = children?.[0][1];
		assert.deepStrictEqual({
			removed,
			label: typeof item === 'object' ? item.label?.label : undefined
		}, { removed: [], label: 'item' });
	});
});
