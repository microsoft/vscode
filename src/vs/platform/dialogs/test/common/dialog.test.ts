/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepEqual } from 'assert';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IMassagedMessageBoxOptions, massageMessageBoxOptions } from 'vs/platform/dialogs/common/dialogs';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';

suite('Dialog', () => {

	function assertOptions({ options, buttonIndeces }: IMassagedMessageBoxOptions, buttons: string[], defaultId: number, cancelId: number, indeces: number[]): void {
		deepEqual(options.buttons, buttons);
		deepEqual(options.defaultId, defaultId);
		deepEqual(options.cancelId, cancelId);
		deepEqual(buttonIndeces, indeces);
	}

	test('massageMessageBoxOptions', () => {
		const testProductService: IProductService = {
			_serviceBrand: undefined,
			...product,
			nameLong: 'Test'
		};

		// All platforms
		const allPlatformsMassagedOptions = massageMessageBoxOptions({ buttons: ['1'], message: 'message' }, testProductService);
		deepEqual(allPlatformsMassagedOptions.options.title, 'Test');
		deepEqual(allPlatformsMassagedOptions.options.message, 'message');
		deepEqual(allPlatformsMassagedOptions.options.noLink, true);

		// Specific cases

		const oneButtonNoCancel = massageMessageBoxOptions({ buttons: ['1'], cancelId: undefined, message: 'message' }, testProductService);
		const oneButtonCancel_0 = massageMessageBoxOptions({ buttons: ['1'], cancelId: 0, message: 'message' }, testProductService);
		const oneButtonCancel_1 = massageMessageBoxOptions({ buttons: ['1'], cancelId: 1, message: 'message' }, testProductService);
		const oneButtonNegativeCancel = massageMessageBoxOptions({ buttons: ['1'], cancelId: -1, message: 'message' }, testProductService);

		const twoButtonNoCancel = massageMessageBoxOptions({ buttons: ['1', '2'], cancelId: undefined, message: 'message' }, testProductService);
		const twoButtonCancel_0 = massageMessageBoxOptions({ buttons: ['1', '2'], cancelId: 0, message: 'message' }, testProductService);
		const twoButtonCancel_1 = massageMessageBoxOptions({ buttons: ['1', '2'], cancelId: 1, message: 'message' }, testProductService);
		const twoButtonCancel_2 = massageMessageBoxOptions({ buttons: ['1', '2'], cancelId: 2, message: 'message' }, testProductService);
		const twoButtonNegativeCancel = massageMessageBoxOptions({ buttons: ['1', '2'], cancelId: -1, message: 'message' }, testProductService);

		const threeButtonNoCancel = massageMessageBoxOptions({ buttons: ['1', '2', '3'], cancelId: undefined, message: 'message' }, testProductService);
		const threeButtonCancel_0 = massageMessageBoxOptions({ buttons: ['1', '2', '3'], cancelId: 0, message: 'message' }, testProductService);
		const threeButtonCancel_1 = massageMessageBoxOptions({ buttons: ['1', '2', '3'], cancelId: 1, message: 'message' }, testProductService);
		const threeButtonCancel_2 = massageMessageBoxOptions({ buttons: ['1', '2', '3'], cancelId: 2, message: 'message' }, testProductService);
		const threeButtonCancel_3 = massageMessageBoxOptions({ buttons: ['1', '2', '3'], cancelId: 3, message: 'message' }, testProductService);
		const threeButtonNegativeCancel = massageMessageBoxOptions({ buttons: ['1', '2', '3'], cancelId: -1, message: 'message' }, testProductService);

		const fourButtonNoCancel = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: undefined, message: 'message' }, testProductService);
		const fourButtonCancel_0 = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: 0, message: 'message' }, testProductService);
		const fourButtonCancel_1 = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: 1, message: 'message' }, testProductService);
		const fourButtonCancel_2 = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: 2, message: 'message' }, testProductService);
		const fourButtonCancel_3 = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: 3, message: 'message' }, testProductService);
		const fourButtonCancel_4 = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: 4, message: 'message' }, testProductService);
		const fourButtonNegativeCancel = massageMessageBoxOptions({ buttons: ['1', '2', '3', '4'], cancelId: -1, message: 'message' }, testProductService);

		if (isWindows) {
			assertOptions(oneButtonNoCancel, ['1'], 0, 0, [0]);
			assertOptions(oneButtonCancel_0, ['1'], 0, 0, [0]);
			assertOptions(oneButtonCancel_1, ['1'], 0, 1, [0]);
			assertOptions(oneButtonNegativeCancel, ['1'], 0, -1, [0]);

			assertOptions(twoButtonNoCancel, ['1', '2'], 0, 1, [0, 1]);
			assertOptions(twoButtonCancel_0, ['2', '1'], 0, 1, [1, 0]);
			assertOptions(twoButtonCancel_1, ['1', '2'], 0, 1, [0, 1]);
			assertOptions(twoButtonCancel_2, ['1', '2'], 0, 2, [0, 1]);
			assertOptions(twoButtonNegativeCancel, ['1', '2'], 0, -1, [0, 1]);

			assertOptions(threeButtonNoCancel, ['1', '2', '3'], 0, 2, [0, 1, 2]);
			assertOptions(threeButtonCancel_0, ['2', '3', '1'], 0, 2, [1, 2, 0]);
			assertOptions(threeButtonCancel_1, ['1', '3', '2'], 0, 2, [0, 2, 1]);
			assertOptions(threeButtonCancel_2, ['1', '2', '3'], 0, 2, [0, 1, 2]);
			assertOptions(threeButtonCancel_3, ['1', '2', '3'], 0, 3, [0, 1, 2]);
			assertOptions(threeButtonNegativeCancel, ['1', '2', '3'], 0, -1, [0, 1, 2]);

			assertOptions(fourButtonNoCancel, ['1', '2', '3', '4'], 0, 3, [0, 1, 2, 3]);
			assertOptions(fourButtonCancel_0, ['2', '3', '4', '1'], 0, 3, [1, 2, 3, 0]);
			assertOptions(fourButtonCancel_1, ['1', '3', '4', '2'], 0, 3, [0, 2, 3, 1]);
			assertOptions(fourButtonCancel_2, ['1', '2', '4', '3'], 0, 3, [0, 1, 3, 2]);
			assertOptions(fourButtonCancel_3, ['1', '2', '3', '4'], 0, 3, [0, 1, 2, 3]);
			assertOptions(fourButtonCancel_4, ['1', '2', '3', '4'], 0, 4, [0, 1, 2, 3]);
			assertOptions(fourButtonNegativeCancel, ['1', '2', '3', '4'], 0, -1, [0, 1, 2, 3]);
		} else if (isMacintosh) {
			assertOptions(oneButtonNoCancel, ['1'], 0, 0, [0]);
			assertOptions(oneButtonCancel_0, ['1'], 0, 0, [0]);
			assertOptions(oneButtonCancel_1, ['1'], 0, 1, [0]);
			assertOptions(oneButtonNegativeCancel, ['1'], 0, -1, [0]);

			assertOptions(twoButtonNoCancel, ['1', '2'], 0, 1, [0, 1]);
			assertOptions(twoButtonCancel_0, ['2', '1'], 0, 1, [1, 0]);
			assertOptions(twoButtonCancel_1, ['1', '2'], 0, 1, [0, 1]);
			assertOptions(twoButtonCancel_2, ['1', '2'], 0, 2, [0, 1]);
			assertOptions(twoButtonNegativeCancel, ['1', '2'], 0, -1, [0, 1]);

			assertOptions(threeButtonNoCancel, ['1', '3', '2'], 0, 1, [0, 2, 1]);
			assertOptions(threeButtonCancel_0, ['2', '1', '3'], 0, 1, [1, 0, 2]);
			assertOptions(threeButtonCancel_1, ['1', '2', '3'], 0, 1, [0, 1, 2]);
			assertOptions(threeButtonCancel_2, ['1', '3', '2'], 0, 1, [0, 2, 1]);
			assertOptions(threeButtonCancel_3, ['1', '2', '3'], 0, 3, [0, 1, 2]);
			assertOptions(threeButtonNegativeCancel, ['1', '2', '3'], 0, -1, [0, 1, 2]);

			assertOptions(fourButtonNoCancel, ['1', '4', '2', '3'], 0, 1, [0, 3, 1, 2]);
			assertOptions(fourButtonCancel_0, ['2', '1', '3', '4'], 0, 1, [1, 0, 2, 3]);
			assertOptions(fourButtonCancel_1, ['1', '2', '3', '4'], 0, 1, [0, 1, 2, 3]);
			assertOptions(fourButtonCancel_2, ['1', '3', '2', '4'], 0, 1, [0, 2, 1, 3]);
			assertOptions(fourButtonCancel_3, ['1', '4', '2', '3'], 0, 1, [0, 3, 1, 2]);
			assertOptions(fourButtonCancel_4, ['1', '2', '3', '4'], 0, 4, [0, 1, 2, 3]);
			assertOptions(fourButtonNegativeCancel, ['1', '2', '3', '4'], 0, -1, [0, 1, 2, 3]);
		} else if (isLinux) {
			assertOptions(oneButtonNoCancel, ['1'], 0, 0, [0]);
			assertOptions(oneButtonCancel_0, ['1'], 0, 0, [0]);
			assertOptions(oneButtonCancel_1, ['1'], 0, 1, [0]);
			assertOptions(oneButtonNegativeCancel, ['1'], 0, -1, [0]);

			assertOptions(twoButtonNoCancel, ['2', '1'], 1, 0, [1, 0]);
			assertOptions(twoButtonCancel_0, ['1', '2'], 1, 0, [0, 1]);
			assertOptions(twoButtonCancel_1, ['2', '1'], 1, 0, [1, 0]);
			assertOptions(twoButtonCancel_2, ['2', '1'], 1, 2, [1, 0]);
			assertOptions(twoButtonNegativeCancel, ['2', '1'], 1, -1, [1, 0]);

			assertOptions(threeButtonNoCancel, ['2', '3', '1'], 2, 1, [1, 2, 0]);
			assertOptions(threeButtonCancel_0, ['3', '1', '2'], 2, 1, [2, 0, 1]);
			assertOptions(threeButtonCancel_1, ['3', '2', '1'], 2, 1, [2, 1, 0]);
			assertOptions(threeButtonCancel_2, ['2', '3', '1'], 2, 1, [1, 2, 0]);
			assertOptions(threeButtonCancel_3, ['3', '2', '1'], 2, 3, [2, 1, 0]);
			assertOptions(threeButtonNegativeCancel, ['3', '2', '1'], 2, -1, [2, 1, 0]);

			assertOptions(fourButtonNoCancel, ['3', '2', '4', '1'], 3, 2, [2, 1, 3, 0]);
			assertOptions(fourButtonCancel_0, ['4', '3', '1', '2'], 3, 2, [3, 2, 0, 1]);
			assertOptions(fourButtonCancel_1, ['4', '3', '2', '1'], 3, 2, [3, 2, 1, 0]);
			assertOptions(fourButtonCancel_2, ['4', '2', '3', '1'], 3, 2, [3, 1, 2, 0]);
			assertOptions(fourButtonCancel_3, ['3', '2', '4', '1'], 3, 2, [2, 1, 3, 0]);
			assertOptions(fourButtonCancel_4, ['4', '3', '2', '1'], 3, 4, [3, 2, 1, 0]);
			assertOptions(fourButtonNegativeCancel, ['4', '3', '2', '1'], 3, -1, [3, 2, 1, 0]);
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
