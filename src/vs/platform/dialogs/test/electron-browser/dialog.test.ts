/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { IOSProperties } from '../../../native/common/native.js';
import { createNativeAboutDialogDetails } from '../../electron-browser/dialog.js';

suite('Native About Dialog', () => {
	test('includes the operating system details', () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			commit: 'test-commit',
			date: '2026-08-25T00:00:00Z',
			nameLong: 'Test',
			version: '1.0.0'
		};
		const osProperties: IOSProperties = {
			arch: 'x64',
			cpus: [],
			platform: 'win32',
			release: '10.0.1',
			type: 'Windows_NT'
		};

		const { details } = createNativeAboutDialogDetails(productService, osProperties);

		assert.match(details, /OS: Windows_NT x64 10\.0\.1$/m);
	});
});
