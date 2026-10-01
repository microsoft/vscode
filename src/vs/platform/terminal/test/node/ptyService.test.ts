/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, rejects, ok } from 'assert';
import { tmpdir } from 'os';
import { SerializeAddon } from '@xterm/addon-serialize';
import pkg from '@xterm/headless';
import { createSandbox } from 'sinon';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { PtyService, XtermSerializer } from '../../node/ptyService.js';
import { IProductService } from '../../../product/common/productService.js';
import { mock } from '../../../../base/test/common/mock.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ISerializedTerminalState, ITerminalChatOwner, ITerminalProcessOptions, ProcessPropertyType } from '../../common/terminal.js';

suite('PtyService chat ownership', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: ITerminalProcessOptions = {
		shellIntegration: { enabled: false, suggestEnabled: false, nonce: 'owner-test' },
		windowsUseConptyDll: false,
		environmentVariableCollections: undefined,
		workspaceFolder: undefined,
		isScreenReaderOptimized: false,
	};

	function createService(): PtyService {
		return store.add(new PtyService(new NullLogService(), new class extends mock<IProductService>() {
			override readonly applicationName = 'code-oss';
			override readonly nameLong = 'Code - OSS';
			override readonly version = '1.0.0';
		}, { graceTime: 60000, shortGraceTime: 6000, scrollback: 100 }, 0));
	}

	async function createProcess(service: PtyService, chatOwner: ITerminalChatOwner, shouldPersist = true): Promise<number> {
		const ready = new DeferredPromise<void>();
		const id = await service.createProcess({
			executable: process.execPath,
			args: ['-e', 'process.stdout.write("owner-ready\\n"); setInterval(() => {}, 1000);'],
			chatOwner,
		}, tmpdir(), 80, 24, '6', { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, process.env, options, shouldPersist, 'owner-test-workspace', 'owner-test');
		const listener = service.onProcessData(event => {
			if (event.id === id && (typeof event.event === 'string' ? event.event : event.event.data).includes('owner-ready')) {
				ready.complete();
			}
		});
		try {
			const result = await service.start(id);
			ok(!result || !hasKey(result, { message: true }), JSON.stringify(result));
			await ready.p;
			await service.input(id, '\r');
			return id;
		} finally {
			listener.dispose();
		}
	}

	test('same-cwd owners have distinct live process ids and backend metadata survives promotion and revival', async () => {
		const service = createService();
		const firstOwner = { backend: 'pty', sessionResource: 'opaque:/session', chatResource: 'opaque:/A' };
		const secondOwner = { ...firstOwner, chatResource: 'opaque:/B' };
		const firstId = await createProcess(service, firstOwner);
		const secondId = await createProcess(service, secondOwner);
		const live = await service.listProcesses();
		ok(live[0].pid > 0 && live[1].pid > 0 && live[0].pid !== live[1].pid);
		const promotedOwner = { ...firstOwner, sessionResource: 'opaque:/committed', chatResource: 'opaque:/main' };
		await service.updateProperty(firstId, ProcessPropertyType.ChatOwner, promotedOwner);
		const saved = JSON.parse(await service.serializeTerminalState([firstId, secondId])) as { state: ISerializedTerminalState[] };
		const revived = createService();
		await createProcess(revived, { ...firstOwner, backend: 'unrelated-backend' }, false);
		await revived.reviveTerminalProcesses('owner-test-workspace', saved.state, 'en');
		const restored = await revived.listProcesses();
		deepStrictEqual({
			liveOwners: live.map(entry => entry.chatOwner),
			savedOwners: saved.state.map(entry => [entry.shellLaunchConfig.chatOwner, entry.processDetails.chatOwner]),
			restoredIds: restored.map(entry => entry.id),
			restoredOwners: restored.map(entry => entry.chatOwner),
		}, {
			liveOwners: [firstOwner, secondOwner],
			savedOwners: [[promotedOwner, promotedOwner], [secondOwner, secondOwner]],
			restoredIds: [2, 3],
			restoredOwners: [promotedOwner, secondOwner],
		});
		for (const [backend, ids] of [[service, [firstId, secondId]], [revived, [1, 2, 3]]] as const) {
			for (const id of ids) {
				await backend.start(id);
				const exited = new DeferredPromise<void>();
				const listener = backend.onProcessExit(event => {
					if (event.id === id) {
						exited.complete();
					}
				});
				try {
					await backend.shutdown(id, true);
					await exited.p;
				} finally {
					listener.dispose();
				}
			}
		}
	});
});

suite('XtermSerializer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sandbox = createSandbox();

	teardown(() => sandbox.restore());

	function createSerializer(rawReviveBuffer?: string) {
		const loadAddon = sandbox.spy(pkg.Terminal.prototype, 'loadAddon');
		const serializer = store.add(new XtermSerializer(80, 30, 100, '6', undefined, 'test-nonce', rawReviveBuffer, new NullLogService()));
		const terminal: pkg.Terminal = loadAddon.firstCall.thisValue;
		return { serializer, terminal };
	}

	test('releases each replay addon without changing the serialized screen', async () => {
		const { serializer, terminal } = createSerializer();
		const dispose = sandbox.spy(SerializeAddon.prototype, 'dispose');
		await new Promise<void>(resolve => terminal.write('replay-ready', resolve));
		const results = [];
		for (let index = 0; index < 3; index++) {
			const replay = await serializer.generateReplayEvent();
			results.push({ disposed: dispose.callCount, screen: replay.events[0].data });
		}
		deepStrictEqual(results, [
			{ disposed: 1, screen: 'replay-ready' },
			{ disposed: 2, screen: 'replay-ready' },
			{ disposed: 3, screen: 'replay-ready' }
		]);
	});

	test('releases each addon when serialization throws on repeated attempts', async () => {
		const { serializer } = createSerializer();
		const dispose = sandbox.spy(SerializeAddon.prototype, 'dispose');
		const failure = new Error('Serialization failed');
		sandbox.stub(SerializeAddon.prototype, 'serialize').throws(failure);
		const disposalCounts = [];
		for (let index = 0; index < 3; index++) {
			await rejects(serializer.generateReplayEvent(), error => error === failure);
			disposalCounts.push(dispose.callCount);
		}
		deepStrictEqual(disposalCounts, [1, 2, 3]);
	});

	test('releases the addon when reusing a saved screen', async () => {
		const { serializer } = createSerializer('saved screen');
		const dispose = sandbox.spy(SerializeAddon.prototype, 'dispose');
		const serialize = sandbox.spy(SerializeAddon.prototype, 'serialize');
		const replay = await serializer.generateReplayEvent(true, true);
		deepStrictEqual({ disposed: dispose.callCount, serialized: serialize.callCount, screen: replay.events[0].data }, { disposed: 1, serialized: 0, screen: 'saved screen' });
	});
});
