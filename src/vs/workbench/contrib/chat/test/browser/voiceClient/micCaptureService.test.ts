/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MIC_CAPTURE_CHUNK_SIZE } from '../../../browser/voiceClient/micCaptureService.js';

suite('MicCaptureService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buffers 32 ms voice chunks at 16 kHz', () => {
		assert.deepStrictEqual({
			samples: MIC_CAPTURE_CHUNK_SIZE,
			durationMs: MIC_CAPTURE_CHUNK_SIZE / 16,
		}, {
			samples: 512,
			durationMs: 32,
		});
	});
});
