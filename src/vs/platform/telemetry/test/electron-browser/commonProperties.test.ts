/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { resolveWorkbenchCommonProperties } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { IWorkspaceContextService, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { StorageService, InMemoryLocalStorage } from 'vs/platform/storage/common/storageService';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';

suite('Telemetry - common properties', function () {

	const commit = void 0;
	const version = void 0;
	let storageService;

	setup(() => {
		let instantiationService = new TestInstantiationService();
		let contextService = instantiationService.stub(IWorkspaceContextService, WorkspaceContextService);
		instantiationService.stub(IWorkspaceContextService, 'getWorkspace', TestWorkspace);
		storageService = new StorageService(new InMemoryLocalStorage(), null, contextService);
	});

	test('default', function () {

		return resolveWorkbenchCommonProperties(storageService, commit, version).then(props => {

			assert.ok('commitHash' in props);
			assert.ok('sessionID' in props);
			assert.ok('timestamp' in props);
			assert.ok('common.platform' in props);
			assert.ok('common.timesincesessionstart' in props);
			assert.ok('common.sequence' in props);

			// assert.ok('common.version.shell' in first.data); // only when running on electron
			// assert.ok('common.version.renderer' in first.data);
			assert.ok('common.osVersion' in props, 'osVersion');
			assert.ok('version' in props);

			assert.ok('common.firstSessionDate' in props, 'firstSessionDate');
			assert.ok('common.lastSessionDate' in props, 'lastSessionDate'); // conditional, see below, 'lastSessionDate'ow
			assert.ok('common.isNewSession' in props, 'isNewSession');

			// machine id et al
			assert.ok('common.instanceId' in props, 'instanceId');
			assert.ok('common.machineId' in props, 'machineId');
			if (process.platform === 'win32') { // SQM only on windows
				assert.ok('common.sqm.userid' in props, 'userid');
				assert.ok('common.sqm.machineid' in props, 'machineid');
			}

			assert.equal(Object.keys(props).length, process.platform === 'win32' ? 18 : 16);
		});
	});

	test('lastSessionDate when aviablale', function () {

		storageService.store('telemetry.lastSessionDate', new Date().toUTCString());

		return resolveWorkbenchCommonProperties(storageService, commit, version).then(props => {

			assert.ok('common.lastSessionDate' in props); // conditional, see below
			assert.ok('common.isNewSession' in props);
			assert.equal(props['common.isNewSession'], 0);
		});
	});

	test('values chance on ask', function () {
		return resolveWorkbenchCommonProperties(storageService, commit, version).then(props => {
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
