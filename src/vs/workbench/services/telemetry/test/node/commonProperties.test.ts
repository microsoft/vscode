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
		assert.ok(props.commitHash);
		assert.ok(props.sessionID);
		assert.ok(props.timestamp);
		assert.ok(props['common.platform']);
		assert.ok(props['common.nodePlatform']);
		assert.ok(props['common.nodeArch']);
		assert.ok(props['common.timesincesessionstart']);
		assert.ok(props['common.sequence']);
		// assert.ok('common.version.shell' in first.data); // only when running on electron
		// assert.ok('common.version.renderer' in first.data);
		assert.ok(props['common.platformVersion'], 'platformVersion');
		assert.ok(props.version);
		assert.ok(props['common.releaseDate']);
		assert.ok(props['common.firstSessionDate'], 'firstSessionDate');
		assert.ok(props['common.lastSessionDate'], 'lastSessionDate'); // conditional, see below, 'lastSessionDate'ow
		assert.ok(props['common.isNewSession'], 'isNewSession');
		// machine id et al
		assert.ok(props['common.machineId'], 'machineId');
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
