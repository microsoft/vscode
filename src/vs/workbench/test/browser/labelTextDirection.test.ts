/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { applyConfiguredTextDirectionToElement } from '../../browser/labelTextDirection.js';

suite('LabelTextDirection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies rtl direction for strong rtl titles in auto mode', () => {
		const element = document.createElement('span');

		applyConfiguredTextDirectionToElement(element, 'سلام world', 'auto');

		assert.strictEqual(element.getAttribute('dir'), 'rtl');
		assert.strictEqual(element.style.unicodeBidi, 'plaintext');
	});

	test('keeps ltr direction for neutral-prefix titles in auto mode', () => {
		const element = document.createElement('span');

		applyConfiguredTextDirectionToElement(element, '# سلام', 'auto');

		assert.strictEqual(element.getAttribute('dir'), 'ltr');
		assert.strictEqual(element.style.unicodeBidi, 'plaintext');
	});

	test('clears direction metadata for empty titles', () => {
		const element = document.createElement('span');
		element.setAttribute('dir', 'rtl');
		element.style.unicodeBidi = 'plaintext';

		applyConfiguredTextDirectionToElement(element, '', 'auto');

		assert.strictEqual(element.hasAttribute('dir'), false);
		assert.strictEqual(element.style.unicodeBidi, '');
	});
});
