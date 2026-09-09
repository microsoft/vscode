/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { validateSpacingTokens } from '../stylelint/validateDesignTokens.ts';

suite('design tokens', () => {

	test('validates the complete spacing scale', () => {
		const css = [
			'.fine { padding: 1px 3px; }',
			'.off-ramp { margin: 5px 7px; }',
		].join('\n');

		assert.deepStrictEqual(validateSpacingTokens(css), [{
			line: 2,
			message: '5px 7px is off the spacing scale -> nearest: 6px 8px (var(--vscode-spacing-size60) var(--vscode-spacing-size80))'
		}]);
	});
});
