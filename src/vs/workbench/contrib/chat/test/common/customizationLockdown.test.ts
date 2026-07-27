/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isCustomizationSurfaceBlocked, isPromptTypeBlocked } from '../../common/customizationLockdown.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

suite('Customization lockdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('undefined and false preserve existing behavior', () => {
		assert.strictEqual(isCustomizationSurfaceBlocked(undefined, 'skills'), false);
		assert.strictEqual(isCustomizationSurfaceBlocked(false, 'hooks'), false);
	});

	test('true blocks every covered surface', () => {
		assert.strictEqual(isCustomizationSurfaceBlocked(true, 'skills'), true);
		assert.strictEqual(isCustomizationSurfaceBlocked(true, 'agents'), true);
		assert.strictEqual(isCustomizationSurfaceBlocked(true, 'hooks'), true);
		assert.strictEqual(isCustomizationSurfaceBlocked(true, 'mcpServers'), true);
	});

	test('array form blocks only selected surfaces', () => {
		const value = ['skills', 'hooks'] as const;
		assert.strictEqual(isPromptTypeBlocked(value, PromptsType.skill), true);
		assert.strictEqual(isPromptTypeBlocked(value, PromptsType.hook), true);
		assert.strictEqual(isPromptTypeBlocked(value, PromptsType.agent), false);
		assert.strictEqual(isPromptTypeBlocked(value, PromptsType.prompt), false);
		assert.strictEqual(isPromptTypeBlocked(value, PromptsType.instructions), false);
	});
});
