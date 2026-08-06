/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from 'vitest';
import { calculateImageTokenCost } from '../tokenizer';

test('calculates original image detail from 32-pixel patches', () => {
	const pngHeader = new Uint8Array(24);
	pngHeader.set([0x89, 0x50, 0x4e, 0x47]);
	const dataView = new DataView(pngHeader.buffer);
	dataView.setUint32(16, 4096, false);
	dataView.setUint32(20, 4096, false);
	const imageUrl = `data:image/png;base64,${Buffer.from(pngHeader).toString('base64')}`;

	expect(calculateImageTokenCost(imageUrl, 'original')).toBe(16384);
});
