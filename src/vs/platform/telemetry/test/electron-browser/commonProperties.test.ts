/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { TPromise } from 'vs/base/common/winjs.base';
import { resolveWorkbenchCommonProperties } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { getRandomTestPath } from 'vs/workbench/test/workbenchTestServices';
import { del } from 'vs/base/node/extfs';
import { mkdirp } from 'vs/base/node/pfs';

suite('Telemetry - common properties', function () {
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'telemetryservice');
	const installSource = path.join(parentDir, 'installSource');

	const commit: string = void 0;
	const version: string = void 0;
	let storageService: StorageService;

	setup(() => {
		storageService = new StorageService(new InMemoryLocalStorage(), null, TestWorkspace.id);
	});

	teardown(done => {
		del(parentDir, os.tmpdir(), done);
	});

	test('default', function () {
		return mkdirp(parentDir).then(() => {
			fs.writeFileSync(installSource, 'my.install.source');

			return resolveWorkbenchCommonProperties(storageService, commit, version, 'someMachineId', installSource).then(props => {
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
				assert.ok('common.osVersion' in props, 'osVersion');
				assert.ok('version' in props);
				assert.equal(props['common.source'], 'my.install.source');

				assert.ok('common.firstSessionDate' in props, 'firstSessionDate');
				assert.ok('common.lastSessionDate' in props, 'lastSessionDate'); // conditional, see below, 'lastSessionDate'ow
				assert.ok('common.isNewSession' in props, 'isNewSession');

				// machine id et al
				assert.ok('common.instanceId' in props, 'instanceId');
				assert.ok('common.machineId' in props, 'machineId');

				fs.unlinkSync(installSource);

				return resolveWorkbenchCommonProperties(storageService, commit, version, 'someMachineId', installSource).then(props => {
					assert.ok(!('common.source' in props));
				});
			});
		});
	});

	test('lastSessionDate when aviablale', function () {

		storageService.store('telemetry.lastSessionDate', new Date().toUTCString());

		return resolveWorkbenchCommonProperties(storageService, commit, version, 'someMachineId', installSource).then(props => {

			assert.ok('common.lastSessionDate' in props); // conditional, see below
			assert.ok('common.isNewSession' in props);
			assert.equal(props['common.isNewSession'], 0);
		});
	});

	test('values chance on ask', function () {
		return resolveWorkbenchCommonProperties(storageService, commit, version, 'someMachineId', installSource).then(props => {
			let value1 = props['common.sequence'];
			let value2 = props['common.sequence'];
			assert.ok(value1 !== value2, 'seq');

			value1 = props['timestamp'];
			value2 = props['timestamp'];
			assert.ok(value1 !== value2, 'timestamp');

			value1 = props['common.timesincesessionstart'];
			return TPromise.timeout(10).then(_ => {
				value2 = props['common.timesincesessionstart'];
				assert.ok(value1 !== value2, 'timesincesessionstart');
			});
		});
	});
});
