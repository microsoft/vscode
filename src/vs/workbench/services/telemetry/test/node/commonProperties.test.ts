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

suite('Telemetry - common properties', function () {
	const commit: string = (undefined)!;
	const version: string = (undefined)!;
	let testStorageService: InMemoryStorageService;

	teardown(() => {
		testStorageService.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		testStorageService = new InMemoryStorageService();
	});

	test('default', function () {
		const props = resolveWorkbenchCommonProperties(testStorageService, release(), hostname(), commit, version, 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process);
		assert.ok('commitHash' in props);
		assert.ok('sessionID' in props);
		assert.ok('timestamp' in props);
		assert.ok('common.platform' in props);
		assert.ok('common.nodePlatform' in props);
		assert.ok('common.nodeArch' in props);
		assert.ok('common.timesincesessionstart' in props);
		assert.ok('common.sequence' in props);
		// assert.ok('common.version.shell' in first.data); // only when running on electron
		// assert.ok('common.version.renderer' in first.data);
		assert.ok('common.platformVersion' in props, 'platformVersion');
		assert.ok('version' in props);
		assert.ok('common.firstSessionDate' in props, 'firstSessionDate');
		assert.ok('common.lastSessionDate' in props, 'lastSessionDate'); // conditional, see below, 'lastSessionDate'ow
		assert.ok('common.isNewSession' in props, 'isNewSession');
		// machine id et al
		assert.ok('common.machineId' in props, 'machineId');
	});

	test('lastSessionDate when available', function () {

		testStorageService.store('telemetry.lastSessionDate', new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const props = resolveWorkbenchCommonProperties(testStorageService, release(), hostname(), commit, version, 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process);
		assert.ok('common.lastSessionDate' in props); // conditional, see below
		assert.ok('common.isNewSession' in props);
		assert.strictEqual(props['common.isNewSession'], '0');
	});

	test('values chance on ask', async function () {
		const props = resolveWorkbenchCommonProperties(testStorageService, release(), hostname(), commit, version, 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process);
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
