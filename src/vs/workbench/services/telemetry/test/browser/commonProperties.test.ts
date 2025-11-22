/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { resolveWorkbenchCommonProperties } from '../../browser/workbenchCommonProperties.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { hasKey } from '../../../../../base/common/types.js';

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

		assert.ok(hasKey(props, {
			commitHash: true,
			sessionID: true,
			timestamp: true,
			'common.platform': true,
			'common.timesincesessionstart': true,
			'common.sequence': true,
			version: true,
			'common.firstSessionDate': true,
			'common.lastSessionDate': true,
			'common.isNewSession': true,
			'common.machineId': true
		}));
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
