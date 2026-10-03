/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { throws } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ViewGpuContext } from '../../../browser/gpu/viewGpuContext.js';

suite('ViewGpuContext', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('atlas', () => {
		// The static `atlas` getter intentionally *throws* (rather than returning
		// `undefined`) when the GPU device hasn't resolved yet. Callers that want to
		// no-op in that window must guard against the backing field directly (e.g.
		// `ViewGpuContext._atlas?.clear()`) - optional chaining on the getter does
		// not help because the exception is thrown from inside the getter. This test
		// pins that throwing contract so the footgun stays documented.
		test('static getter throws before the device is resolved', () => {
			throws(() => ViewGpuContext.atlas);
		});
	});
});
