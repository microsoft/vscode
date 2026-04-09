/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, test } from 'vitest';
import { _dispose } from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { fromFixture, snapshotPathInFixture, srcWithAnnotatedStructure } from './getStructure.util';

describe('getStructure - rust', () => {
	afterAll(() => _dispose());

	function rustStruct(source: string) {
		return srcWithAnnotatedStructure(WASMLanguage.Rust, source);
	}

	test('source with different syntax constructs', async () => {

		const file = 'test.rs';

		const source = await fromFixture(file);

		await expect(await rustStruct(source)).toMatchFileSnapshot(snapshotPathInFixture(file));
	});

});
