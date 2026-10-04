/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../workbench/common/views.js';
import { IExplorerService } from '../../../../../workbench/contrib/files/browser/files.js';
import { ExplorerView } from '../../../../../workbench/contrib/files/browser/views/explorerView.js';
import { SESSIONS_FILES_VIEW_ID } from '../../../../../workbench/contrib/files/common/files.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionsExplorerView } from '../../browser/filesView.js';

suite('SessionsExplorerView folder reveal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/workspace/folder');
	teardown(() => sinon.restore());

	function createView(openFiles: () => Promise<void>, calls: object[], visible = true) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.AuxiliaryBar,
		});
		instantiation.stub(IExplorerService, { registerView: () => { } });
		instantiation.stub(ICommandService, {
			executeCommand: async id => {
				calls.push({ command: id });
				await openFiles();
			},
		});
		sinon.stub(ExplorerView.prototype, 'selectResource').callsFake(async (uri, reveal, retry) => {
			calls.push({ select: uri, reveal, retry });
		});
		const view = store.add(instantiation.createInstance(SessionsExplorerView, {
			id: SESSIONS_FILES_VIEW_ID,
			title: 'Files',
			delegate: { willOpenElement: () => { }, didOpenElement: () => { } },
		}));
		sinon.stub(view, 'isExpanded').returns(true);
		view.setVisible(visible);
		return view;
	}

	test('waits for Files tab activation before selecting a folder in a reopened panel', async () => {
		const activation = new DeferredPromise<void>();
		const calls: object[] = [];
		const view = createView(() => activation.p, calls);
		const selection = view.selectResource(resource, 'force');
		const whileActivating = [...calls];
		await activation.complete();
		await selection;
		assert.deepStrictEqual({ whileActivating, calls }, {
			whileActivating: [{ command: NEW_FILE_TAB_COMMAND_ID }],
			calls: [
				{ command: NEW_FILE_TAB_COMMAND_ID },
				{ select: resource, reveal: 'force', retry: 0 },
			],
		});
	});

	test('waits for the sidebar to become visible after Files tab activation completes', async () => {
		const activated = new DeferredPromise<void>();
		const calls: object[] = [];
		const view = createView(async () => { await activated.complete(); }, calls, false);
		const selection = view.selectResource(resource, 'force');
		await activated.p;
		await timeout(0);
		const beforeVisibility = [...calls];
		view.setVisible(true);
		await selection;
		assert.deepStrictEqual({ beforeVisibility, calls }, {
			beforeVisibility: [{ command: NEW_FILE_TAB_COMMAND_ID }],
			calls: [
				{ command: NEW_FILE_TAB_COMMAND_ID },
				{ select: resource, reveal: 'force', retry: 0 },
			],
		});
	});

	for (const { uri, reveal, retry } of [
		{ uri: resource, reveal: true, retry: 0 },
		{ uri: resource, reveal: 'force', retry: 1 },
		{ uri: undefined, reveal: 'force', retry: 0 },
	] as const) {
		test(`does not change tabs for automatic selection or retries (${reveal}, ${retry}, ${uri})`, async () => {
			const calls: object[] = [];
			const view = createView(async () => { }, calls);
			await view.selectResource(uri, reveal, retry);
			assert.deepStrictEqual(calls, [{ select: uri, reveal, retry }]);
		});
	}

	test('propagates Files tab activation failures without selecting a hidden tree', async () => {
		const error = new Error('Files activation failed');
		const calls: object[] = [];
		const view = createView(async () => { throw error; }, calls);
		await assert.rejects(view.selectResource(resource, 'force'), error);
		assert.deepStrictEqual(calls, [{ command: NEW_FILE_TAB_COMMAND_ID }]);
	});
});
