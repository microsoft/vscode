/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { resolveWorkbenchCommonProperties } from '../../browser/workbenchCommonProperties.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Browser Telemetry - common properties', function () {

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

	test('mixes in additional properties', async function () {
		const resolveCommonTelemetryProperties = () => {
			return {
				'userId': '1'
			};
		};

		const props = resolveWorkbenchCommonProperties(testStorageService, commit, version, false, undefined, undefined, false, resolveCommonTelemetryProperties);

		assert.ok(props.commitHash);
		assert.ok(props.sessionID);
		assert.ok(props.timestamp);
		assert.ok(props['common.platform']);
		assert.ok(props['common.timesincesessionstart']);
		assert.ok(props['common.sequence']);
		assert.ok(props.version);
		assert.ok(props['common.firstSessionDate'], 'firstSessionDate');
		assert.ok(props['common.lastSessionDate'], 'lastSessionDate');
		assert.ok(props['common.isNewSession'], 'isNewSession');
		assert.ok(props['common.machineId'], 'machineId');

		assert.strictEqual(props['userId'], '1');
	});

	test('mixes in additional dyanmic properties', async function () {
		let i = 1;
		const resolveCommonTelemetryProperties = () => {
			return Object.defineProperties({}, {
				'userId': {
					get: () => {
						return i++;
					},
					enumerable: true
				}
			});
		};

		const props = resolveWorkbenchCommonProperties(testStorageService, commit, version, false, undefined, undefined, false, resolveCommonTelemetryProperties);
		assert.strictEqual(props['userId'], 1);

		const props2 = resolveWorkbenchCommonProperties(testStorageService, commit, version, false, undefined, undefined, false, resolveCommonTelemetryProperties);
		assert.strictEqual(props2['userId'], 2);
	});
});
