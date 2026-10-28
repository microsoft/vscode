/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILocalExtension } from '../../common/extensionManagement.js';
import { ExtensionManagementStoreCoordinator } from '../../node/extensionManagementStoreCoordinator.js';
import { UninstallExtensionInProfileTask, UninstallExtensionsProfileBatch } from '../../node/uninstallExtensionInProfileTask.js';

suite('Native profile uninstall task batching', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	let coordinator: ExtensionManagementStoreCoordinator;
	const profile = URI.file('/profiles/default/extensions.json');

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'profile-uninstall-batch-'));
		coordinator = new ExtensionManagementStoreCoordinator(join(directory, 'coordination.sqlite'));
	});

	teardown(async () => {
		await coordinator.close();
		await rm(directory, { recursive: true, force: true });
	});

	function task(batch: UninstallExtensionsProfileBatch, id: string, profileLocation = profile): UninstallExtensionInProfileTask {
		return new UninstallExtensionInProfileTask(upcastPartial<ILocalExtension>({ identifier: { id } }), { profileLocation }, batch, coordinator);
	}

	test('three actual tasks share one profile write and none completes before it', async () => {
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const calls: string[][] = [];
		const completed: string[] = [];
		const batch = new UninstallExtensionsProfileBatch({ removeExtensionsFromProfile: async identifiers => {
			calls.push(identifiers.map(identifier => identifier.id)); entered.complete(); await finish.p;
		} });
		await coordinator.withMutation(async () => {
			const tasks = ['one', 'two', 'three'].map(id => task(batch, id));
			const running = Promise.all(tasks.map(value => value.run().then(() => { completed.push(value.extension.identifier.id); })));
			await entered.p;
			try {
				assert.deepStrictEqual({ calls, completed }, { calls: [['one', 'two', 'three']], completed: [] });
			} finally {
				finish.complete();
				await running;
			}
			assert.deepStrictEqual(completed.sort(), ['one', 'three', 'two']);
		});
	});

	test('different profiles retain separate profile API calls', async () => {
		const calls: { profile: string; ids: string[] }[] = [];
		const other = URI.file('/profiles/other/extensions.json');
		const batch = new UninstallExtensionsProfileBatch({ removeExtensionsFromProfile: async (identifiers, profileLocation) => {
			calls.push({ profile: profileLocation.toString(), ids: identifiers.map(identifier => identifier.id) });
		} });
		await coordinator.withMutation(() => Promise.all([task(batch, 'one').run(), task(batch, 'two', other).run(), task(batch, 'three').run()]));
		assert.deepStrictEqual(calls, [{ profile: profile.toString(), ids: ['one', 'three'] }, { profile: other.toString(), ids: ['two'] }]);
	});

	test('separate invocations never combine their removals', async () => {
		const calls: string[][] = [];
		const scanner = { removeExtensionsFromProfile: async (identifiers: { id: string }[]) => { calls.push(identifiers.map(identifier => identifier.id)); } };
		await Promise.all(['first', 'second'].map(invocation => coordinator.withMutation(async () => {
			const batch = new UninstallExtensionsProfileBatch(scanner);
			await Promise.all([task(batch, `${invocation}-one`).run(), task(batch, `${invocation}-two`).run()]);
		})));
		assert.deepStrictEqual(calls, [['first-one', 'first-two'], ['second-one', 'second-two']]);
	});

	test('later waves do not attach to an in-flight or completed write', async () => {
		const entered = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const finish = new DeferredPromise<void>();
		const calls: string[][] = [];
		const batch = new UninstallExtensionsProfileBatch({ removeExtensionsFromProfile: async identifiers => {
			const index = calls.length; calls.push(identifiers.map(identifier => identifier.id)); entered[index]?.complete(); await finish.p;
		} });
		await coordinator.withMutation(async () => {
			const first = task(batch, 'first').run();
			await entered[0].p;
			const second = task(batch, 'second').run();
			await entered[1].p;
			finish.complete();
			await Promise.all([first, second]);
			await task(batch, 'third').run();
		});
		assert.deepStrictEqual(calls, [['first'], ['second'], ['third']]);
	});

	test('one failed write rejects every task in its wave and a later wave can retry', async () => {
		const failure = new Error('profile write failed');
		let writes = 0;
		const batch = new UninstallExtensionsProfileBatch({ removeExtensionsFromProfile: async () => { if (++writes === 1) { throw failure; } } });
		await coordinator.withMutation(async () => {
			const outcomes = await Promise.allSettled(['one', 'two', 'three'].map(id => task(batch, id).run()));
			assert.deepStrictEqual(outcomes, Array.from({ length: 3 }, () => ({ status: 'rejected', reason: failure })));
			await task(batch, 'retry').run();
		});
		assert.strictEqual(writes, 2);
	});

	test('cancellation before task doRun excludes that extension from the batch', async () => {
		const calls: string[][] = [];
		const batch = new UninstallExtensionsProfileBatch({ removeExtensionsFromProfile: async identifiers => { calls.push(identifiers.map(identifier => identifier.id)); } });
		await coordinator.withMutation(async () => {
			const cancelled = task(batch, 'cancelled');
			cancelled.cancel();
			const outcomes = await Promise.allSettled([cancelled.run(), task(batch, 'one').run(), task(batch, 'two').run()]);
			assert.strictEqual(outcomes[0].status, 'rejected');
			if (outcomes[0].status === 'rejected') {
				assert.ok(isCancellationError(outcomes[0].reason));
			}
			assert.deepStrictEqual(outcomes.slice(1), [{ status: 'fulfilled', value: undefined }, { status: 'fulfilled', value: undefined }]);
		});
		assert.deepStrictEqual(calls, [['one', 'two']]);
	});
});
