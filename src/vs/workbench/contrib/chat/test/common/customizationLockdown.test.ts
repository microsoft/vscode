/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isPromptTypeBlocked, isStrictPluginOnlyCustomizationBlocked, isStrictPluginOnlyCustomizationEnabled } from '../../common/customizationLockdown.js';
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

	test('selective values block only named surfaces', () => {
		const values = [undefined, false, [], ['skills'], ['agents'], ['hooks'], ['mcp'], ['skills', 'hooks'], true];
		assert.deepStrictEqual(values.map(value => ({
			skills: isStrictPluginOnlyCustomizationBlocked(value, 'skills'),
			agents: isStrictPluginOnlyCustomizationBlocked(value, 'agents'),
			hooks: isStrictPluginOnlyCustomizationBlocked(value, 'hooks'),
			mcp: isStrictPluginOnlyCustomizationBlocked(value, 'mcp'),
			instructions: isStrictPluginOnlyCustomizationBlocked(value, 'instructions'),
		})), [
			{ skills: false, agents: false, hooks: false, mcp: false, instructions: false },
			{ skills: false, agents: false, hooks: false, mcp: false, instructions: false },
			{ skills: false, agents: false, hooks: false, mcp: false, instructions: false },
			{ skills: true, agents: false, hooks: false, mcp: false, instructions: false },
			{ skills: false, agents: true, hooks: false, mcp: false, instructions: false },
			{ skills: false, agents: false, hooks: true, mcp: false, instructions: false },
			{ skills: false, agents: false, hooks: false, mcp: true, instructions: false },
			{ skills: true, agents: false, hooks: true, mcp: false, instructions: false },
			{ skills: true, agents: true, hooks: true, mcp: true, instructions: true },
		]);
	});

	test('malformed values fail closed without partially applying selectors', () => {
		const malformed = [null, ['skills', 'unknown'], ['skills', 1], 'skills' as never];
		assert.deepStrictEqual(malformed.map(value => ({
			skills: isStrictPluginOnlyCustomizationBlocked(value, 'skills'),
			agents: isStrictPluginOnlyCustomizationBlocked(value, 'agents'),
			hooks: isStrictPluginOnlyCustomizationBlocked(value, 'hooks'),
			mcp: isStrictPluginOnlyCustomizationBlocked(value, 'mcp'),
			instructions: isStrictPluginOnlyCustomizationBlocked(value, 'instructions'),
		})), malformed.map(() => ({ skills: true, agents: true, hooks: true, mcp: true, instructions: true })));
	});
});
