/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalExtension, InstallExtensionResult } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtension } from '../../../../../platform/extensions/common/extensions.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { WorkflowSourceEnablementService } from '../../browser/workflowSourceEnablementService.js';

suite('Workflow source enablement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService() {
		const installedChanged = store.add(new Emitter<readonly InstallExtensionResult[]>());
		const enablementChanged = store.add(new Emitter<readonly IExtension[]>());
		let installed = [upcastPartial<ILocalExtension>({ identifier: { id: 'Example.Workflows' } })];
		const disabled = new Set<IExtension>();
		let reads = 0;
		let read: () => Promise<ILocalExtension[]> = async () => installed;
		const service = store.add(new WorkflowSourceEnablementService(
			upcastPartial<IWorkbenchExtensionManagementService>({
				onDidInstallExtensions: installedChanged.event, onDidUninstallExtension: Event.None,
				onDidChangeProfile: Event.None, onProfileAwareDidUpdateExtensionMetadata: Event.None,
				getInstalled: () => { reads++; return read(); },
			}),
			upcastPartial<IWorkbenchExtensionEnablementService>({
				onEnablementChanged: enablementChanged.event,
				isEnabled: extension => !disabled.has(extension),
			}),
		));
		return {
			service, disabled, installedChanged, enablementChanged, reads: () => reads,
			get installed() { return installed; },
			set installed(value: ILocalExtension[]) { installed = value; },
			set read(value: () => Promise<ILocalExtension[]>) { read = value; },
		};
	}

	test('discovery is lazy and enablement changes reuse installed metadata', async () => {
		const test = createService();
		const initialReads = test.reads();
		const enabled = await test.service.getSourceStates();
		test.disabled.add(test.installed[0]);
		test.enablementChanged.fire(test.installed);
		const disabled = await test.service.getSourceStates();
		test.disabled.clear();
		test.enablementChanged.fire(test.installed);
		const reenabled = await test.service.getSourceStates();
		assert.deepStrictEqual({ initialReads, enabled: [...enabled], disabled: [...disabled], reenabled: [...reenabled], reads: test.reads() }, {
			initialReads: 0, enabled: [['example.workflows', true]], disabled: [['example.workflows', false]],
			reenabled: [['example.workflows', true]], reads: 1,
		});
	});

	test('an observed removal revokes the source and reinstall restores only its enablement', async () => {
		const test = createService();
		const installed = test.installed;
		await test.service.getSourceStates();
		test.installed = [];
		test.installedChanged.fire([]);
		const removed = await test.service.getSourceStates();
		test.installed = installed;
		test.installedChanged.fire([]);
		const restored = await test.service.getSourceStates();
		assert.deepStrictEqual({ removed: [...removed], restored: [...restored] }, { removed: [], restored: [['example.workflows', true]] });
	});

	test('an installation change supersedes an in-flight installed-extension scan', async () => {
		const test = createService();
		const previous = new DeferredPromise<ILocalExtension[]>();
		test.read = () => previous.p;
		const states = test.service.getSourceStates();
		test.read = async () => [upcastPartial<ILocalExtension>({ identifier: { id: 'new.workflow-source' } })];
		test.installedChanged.fire([]);
		await previous.complete(test.installed);
		assert.deepStrictEqual([...await states], [['new.workflow-source', true]]);
	});

	test('duplicate copies retain the source while an enabled copy is still installed', async () => {
		const test = createService();
		const enabledCopy = upcastPartial<ILocalExtension>({ identifier: { id: 'example.workflows' } });
		test.disabled.add(test.installed[0]);
		test.installed = [...test.installed, enabledCopy];
		assert.deepStrictEqual([...await test.service.getSourceStates()], [['example.workflows', true]]);
	});

	test('failed scans reject and may be retried, rather than producing an empty catalog', async () => {
		const test = createService();
		test.read = async () => { throw new Error('Extension metadata unavailable'); };
		await assert.rejects(test.service.getSourceStates(), /Extension metadata unavailable/);
		test.read = async () => test.installed;
		assert.deepStrictEqual([...await test.service.getSourceStates()], [['example.workflows', true]]);
	});

	test('disposing during a scan never returns late source decisions', async () => {
		const test = createService();
		const pending = new DeferredPromise<ILocalExtension[]>();
		test.read = () => pending.p;
		const states = test.service.getSourceStates();
		test.service.dispose();
		await pending.complete(test.installed);
		await assert.rejects(states, /disposed/);
	});
});
