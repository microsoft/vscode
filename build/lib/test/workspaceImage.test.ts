/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { NATIVE_BUILD_INPUTS } from '../../../.github/workflows/workspace_image/image.ts';
import { nativeBuildInputFiles } from '../../azure-pipelines/common/cacheKeys.ts';

suite('workspace images', () => {
	// image.ts runs before the checkout, without the files of the repository
	test('compare the native build inputs of the node_modules cache key', () => {
		assert.deepEqual(NATIVE_BUILD_INPUTS, nativeBuildInputFiles);
	});
});
