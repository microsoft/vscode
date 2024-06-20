/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ExtHostFileSystemEventService } from 'vs/workbench/api/common/extHostFileSystemEventService';
import { IMainContext } from 'vs/workbench/api/common/extHost.protocol';
import { NullLogService } from 'vs/platform/log/common/log';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('ExtHostFileSystemEventService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('FileSystemWatcher ignore events properties are reversed #26851', function () {

		const protocol: IMainContext = {
			getProxy: () => { return undefined!; },
			set: undefined!,
			dispose: undefined!,
			assertRegistered: undefined!,
			drain: undefined!
		};

		const watcher1 = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!).createFileSystemWatcher(undefined!, undefined!, '**/somethingInteresting', { correlate: false });
		assert.strictEqual(watcher1.ignoreChangeEvents, false);
		assert.strictEqual(watcher1.ignoreCreateEvents, false);
		assert.strictEqual(watcher1.ignoreDeleteEvents, false);
		watcher1.dispose();

		const watcher2 = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined!).createFileSystemWatcher(undefined!, undefined!, '**/somethingBoring', { ignoreCreateEvents: true, ignoreChangeEvents: true, ignoreDeleteEvents: true, correlate: false });
		assert.strictEqual(watcher2.ignoreChangeEvents, true);
		assert.strictEqual(watcher2.ignoreCreateEvents, true);
		assert.strictEqual(watcher2.ignoreDeleteEvents, true);
		watcher2.dispose();
	});

});
