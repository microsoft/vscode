/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { join } from 'vs/base/common/path';
import { mkdirp, RimRafMode, rimraf } from 'vs/base/node/pfs';
import { resolveMarketplaceHeaders } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { isUUID } from 'vs/base/common/uuid';

suite('Extension Gallery Service', () => {
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'extensiongalleryservice');
	const marketplaceHome = join(parentDir, 'Marketplace');

	setup(done => {

		// Delete any existing backups completely and then re-create it.
		rimraf(marketplaceHome, RimRafMode.MOVE).then(() => {
			mkdirp(marketplaceHome).then(() => {
				done();
			}, error => done(error));
		}, error => done(error));
	});

	teardown(done => {
		rimraf(marketplaceHome, RimRafMode.MOVE).then(done, done);
	});

	test('marketplace machine id', () => {
		const args = ['--user-data-dir', marketplaceHome];
		const environmentService = new EnvironmentService(parseArgs(args), process.execPath);

		return resolveMarketplaceHeaders(environmentService).then(headers => {
			assert.ok(isUUID(headers['X-Market-User-Id']));

			return resolveMarketplaceHeaders(environmentService).then(headers2 => {
				assert.equal(headers['X-Market-User-Id'], headers2['X-Market-User-Id']);
			});
		});
	});
});