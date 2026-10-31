/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isPromptTypeBlocked, isStrictPluginOnlyCustomizationEnabled } from '../../common/customizationLockdown.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

suite('Customization lockdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('undefined and false preserve existing behavior', () => {
		assert.strictEqual(isStrictPluginOnlyCustomizationEnabled(undefined), false);
		assert.strictEqual(isStrictPluginOnlyCustomizationEnabled(false), false);
	});

	test('true blocks every covered prompt surface', () => {
		assert.strictEqual(isStrictPluginOnlyCustomizationEnabled(true), true);
		assert.strictEqual(isPromptTypeBlocked(true, PromptsType.skill), true);
		assert.strictEqual(isPromptTypeBlocked(true, PromptsType.agent), true);
		assert.strictEqual(isPromptTypeBlocked(true, PromptsType.hook), true);
		assert.strictEqual(isPromptTypeBlocked(true, PromptsType.instructions), true);
		assert.strictEqual(isPromptTypeBlocked(true, PromptsType.prompt), false);
	});
});
