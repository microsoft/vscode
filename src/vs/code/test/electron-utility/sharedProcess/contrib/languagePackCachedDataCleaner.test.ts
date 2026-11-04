/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { errorHandler } from '../../../../../base/common/errors.js';
import { join } from '../../../../../base/common/path.js';
import { Promises } from '../../../../../base/node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { LanguagePackCachedDataCleaner } from '../../../../electron-utility/sharedProcess/contrib/languagePackCachedDataCleaner.js';

suite('LanguagePackCachedDataCleaner', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'languagePackCachedDataCleaner');
		await fs.promises.mkdir(join(testDir, 'clp'), { recursive: true });
	});

	teardown(async () => {
		await Promises.rm(testDir);
	});

	test('ignores an installed language pack without cached data', async () => {
		await fs.promises.writeFile(join(testDir, 'languagepacks.json'), JSON.stringify({
			de: {
				hash: 'language-pack-hash',
				extensions: []
			}
		}));

		const environmentService = {
			isBuilt: false,
			userDataPath: testDir
		} as INativeEnvironmentService;
		const productService = {
			quality: 'insider'
		} as IProductService;
		const unexpectedErrors: Error[] = [];
		const unexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => unexpectedErrors.push(error));

		try {
			const cleaner = disposables.add(new LanguagePackCachedDataCleaner(environmentService, new NullLogService(), productService));
			await cleaner.cleanUpLanguagePackCache();

			assert.deepStrictEqual(unexpectedErrors, []);
		} finally {
			errorHandler.setUnexpectedErrorHandler(unexpectedErrorHandler);
		}
	});
});
