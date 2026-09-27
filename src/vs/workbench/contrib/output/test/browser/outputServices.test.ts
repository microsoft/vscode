/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWebWorkerService } from '../../../../../platform/webWorker/browser/webWorkerService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IDefaultLogLevelsService } from '../../../../services/log/common/defaultLogLevels.js';
import { Extensions, IOutputChannel, IOutputChannelRegistry } from '../../../../services/output/common/output.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TestViewsService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { OutputService } from '../../browser/outputServices.js';

suite('OutputService channel disposal', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
	let service: OutputService;
	let nextId = 0;

	setup(() => {
		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IViewsService, new TestViewsService());
		instantiationService.stub(IWorkspaceContextService, new TestContextService(new Workspace('output-test', [])));
		instantiationService.stub(IWebWorkerService, new class extends mock<IWebWorkerService>() { });
		instantiationService.stub(IDefaultLogLevelsService, new class extends mock<IDefaultLogLevelsService>() {
			override readonly onDidChangeDefaultLogLevels = Event.None;
		});
		service = disposables.add(instantiationService.createInstance(OutputService));
	});

	function registerChannel() {
		const id = `output-disposal-test-${nextId++}`;
		registry.registerChannel({ id, label: id, log: false, source: { resource: URI.file(`/logs/${id}.log`) } });
		return service.getChannel(id)!;
	}

	function disposeChannel(): WeakRef<IOutputChannel> {
		const channel = registerChannel();
		const ref = new WeakRef(channel);
		channel.dispose();
		assert.strictEqual(service.getChannel(channel.id), undefined);
		return ref;
	}

	for (const removeFromRegistry of [false, true]) {
		test(`does not retain disposal listeners after ${removeFromRegistry ? 'registry removal' : 'channel disposal'}`, () => {
			registerChannel();
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect service-owned registrations without exposing test-only API.
			const registrations = service['_store']['_toDispose'];
			const initialRegistrations = [...registrations];
			for (let i = 0; i < 3; i++) {
				const channel = registerChannel();
				if (removeFromRegistry) {
					registry.removeChannel(channel.id);
				} else {
					channel.dispose();
				}
			}
			assert.deepStrictEqual([...registrations], initialRegistrations);
		});
	}

	test('disposed channels become collectible while the service remains alive', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		registerChannel(); // Keep another channel open, as in the workbench.
		const ref = disposeChannel();
		// A WeakRef keeps its target alive until the end of the current job.
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(ref.deref() === undefined, true, 'Disposed output channel is still strongly retained');
	});

	test('disposing the active channel preserves another open channel', async () => {
		const remaining = registerChannel();
		const closing = registerChannel();
		await service.showChannel(closing.id);
		closing.dispose();
		assert.deepStrictEqual({
			active: service.getActiveChannel()?.id,
			remaining: service.getChannel(remaining.id)?.id,
			removed: registry.getChannel(closing.id)
		}, { active: remaining.id, remaining: remaining.id, removed: undefined });
	});

	test('registry removal releases its channel while the service remains alive', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip();
		}
		registerChannel();
		const ref = (() => {
			const channel = registerChannel();
			const ref = new WeakRef(channel);
			registry.removeChannel(channel.id);
			assert.strictEqual(service.getChannel(channel.id), undefined);
			return ref;
		})();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(ref.deref() === undefined, true, 'Removed output channel is still strongly retained');
	});

	test('service shutdown still disposes open channels once', () => {
		const channel = registerChannel();
		let disposed = 0;
		disposables.add(channel.model.onDispose(() => disposed++));
		service.dispose();
		service.dispose();
		assert.deepStrictEqual({ disposed, registered: registry.getChannel(channel.id) }, { disposed: 1, registered: undefined });
	});
});
