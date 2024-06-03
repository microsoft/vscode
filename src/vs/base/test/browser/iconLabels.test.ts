/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isHTMLElement } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('renderLabelWithIcons', () => {

	test('no icons', () => {
		const result = renderLabelWithIcons(' hello World .');

		assert.strictEqual(elementsToString(result), ' hello World .');
	});

	test('icons only', () => {
		const result = renderLabelWithIcons('$(alert)');

		assert.strictEqual(elementsToString(result), '<span class="codicon codicon-alert"></span>');
	});

	test('icon and non-icon strings', () => {
		const result = renderLabelWithIcons(` $(alert) Unresponsive`);

		assert.strictEqual(elementsToString(result), ' <span class="codicon codicon-alert"></span> Unresponsive');
	});

	test('multiple icons', () => {
		const result = renderLabelWithIcons('$(check)$(error)');

		assert.strictEqual(elementsToString(result), '<span class="codicon codicon-check"></span><span class="codicon codicon-error"></span>');
	});

	test('escaped icons', () => {
		const result = renderLabelWithIcons('\\$(escaped)');

		assert.strictEqual(elementsToString(result), '$(escaped)');
	});

	test('icon with animation', () => {
		const result = renderLabelWithIcons('$(zip~anim)');

		assert.strictEqual(elementsToString(result), '<span class="codicon codicon-zip codicon-modifier-anim"></span>');
	});

	const elementsToString = (elements: Array<HTMLElement | string>): string => {
		return elements
			.map(elem => isHTMLElement(elem) ? elem.outerHTML : elem)
			.reduce((a, b) => a + b, '');
	};

	ensureNoDisposablesAreLeakedInTestSuite();
});
