/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {getDefaultProperties} from 'vs/platform/telemetry/electron-browser/electronTelemetryService';
import {TestStorageService} from 'vs/workbench/test/browser/servicesTestUtils';

suite('Telemetry - common properties', function () {

	test('getDefaultProperties', function () {

		return getDefaultProperties(new TestStorageService()).then(props => {

			// assert.ok('common.version.shell' in first.data); // only when running on electron
			// assert.ok('common.version.renderer' in first.data);
			assert.ok('common.osVersion' in props, 'osVersion');

			assert.ok('common.firstSessionDate' in props, 'firstSessionDate');
			assert.ok(!('common.lastSessionDate' in props), 'lastSessionDate'); // conditional, see bel, 'lastSessionDate'ow
			assert.ok('common.isNewSession' in props, 'isNewSession');

			// machine id et al
			assert.ok('common.instanceId' in props, 'instanceId');
			assert.ok('common.machineId' in props, 'machineId');
			if (process.platform === 'win32') { // SQM only on windows
				assert.ok('common.sqm.userid' in props, 'userid');
				assert.ok('common.sqm.machineid' in props, 'machineid');
			}
		});
	});

	test('getDefaultProperties, lastSessionDate when aviablale', function () {

		let service = new TestStorageService();
		service.store('telemetry.lastSessionDate', new Date().toUTCString());

		return getDefaultProperties(service).then(props => {

			assert.ok('common.lastSessionDate' in props); // conditional, see below
			assert.ok('common.isNewSession' in props);
			assert.equal(props['common.isNewSession'], 0);
		});
	});
});
