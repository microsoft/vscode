/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { release, hostname } from 'os';
import { resolveWorkbenchCommonProperties } from '../../common/workbenchCommonProperties.js';
import { StorageScope, InMemoryStorageService, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { hasKey } from '../../../../../base/common/types.js';

suite('Telemetry - common properties', function () {
	const commit: string = (undefined)!;
	const version: string = (undefined)!;
	const date = undefined;
	let testStorageService: InMemoryStorageService;

	teardown(() => {
		testStorageService.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testStorageService = new InMemoryStorageService();
	});

	test('default', function () {
		const props = resolveWorkbenchCommonProperties(testStorageService, release(), hostname(), commit, version, 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process, date);
		assert.ok(hasKey(props, {
			commitHash: true,
			sessionID: true,
			timestamp: true,
			'common.platform': true,
			'common.nodePlatform': true,
			'common.nodeArch': true,
			'common.timesincesessionstart': true,
			'common.sequence': true,
			// 'common.version.shell': true, // only when running on electron
			// 'common.version.renderer': true,
			'common.platformVersion': true,
			version: true,
			'common.releaseDate': true,
			'common.firstSessionDate': true,
			'common.lastSessionDate': true,
			'common.isNewSession': true,
			'common.machineId': true
		}));
	});

	test('lastSessionDate when available', function () {

		testStorageService.store('telemetry.lastSessionDate', new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const props = resolveWorkbenchCommonProperties(testStorageService, release(), hostname(), commit, version, 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process, date);
		assert.ok(props['common.lastSessionDate']); // conditional, see below
		assert.ok(props['common.isNewSession']);
		assert.strictEqual(props['common.isNewSession'], '0');
	});

	test('values chance on ask', async function () {
		const props = resolveWorkbenchCommonProperties(testStorageService, release(), hostname(), commit, version, 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process, date);
		let value1 = props['common.sequence'];
		let value2 = props['common.sequence'];
		assert.ok(value1 !== value2, 'seq');

		value1 = props['timestamp'];
		value2 = props['timestamp'];
		assert.ok(value1 !== value2, 'timestamp');

		value1 = props['common.timesincesessionstart'];
		await timeout(10);
		value2 = props['common.timesincesessionstart'];
		assert.ok(value1 !== value2, 'timesincesessionstart');
	});
});
