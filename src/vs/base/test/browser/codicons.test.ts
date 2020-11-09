/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderCodicons } from 'vs/base/browser/codicons';
import * as assert from 'assert';

suite('renderCodicons', () => {

	test('no codicons', () => {
		const result = renderCodicons(' hello World .');

		assert.equal(elementsToString(result), ' hello World .');
	});

	test('codicon only', () => {
		const result = renderCodicons('$(alert)');

		assert.equal(elementsToString(result), '<span class="codicon codicon-alert"></span>');
	});

	test('codicon and non-codicon strings', () => {
		const result = renderCodicons(` $(alert) Unresponsive`);

		assert.equal(elementsToString(result), ' <span class="codicon codicon-alert"></span> Unresponsive');
	});

	test('multiple codicons', () => {
		const result = renderCodicons('$(check)$(error)');

		assert.equal(elementsToString(result), '<span class="codicon codicon-check"></span><span class="codicon codicon-error"></span>');
	});

	test('escaped codicon', () => {
		const result = renderCodicons('\\$(escaped)');

		assert.equal(elementsToString(result), '$(escaped)');
	});

	test('codicon with animation', () => {
		const result = renderCodicons('$(zip~anim)');

		assert.equal(elementsToString(result), '<span class="codicon codicon-zip codicon-animation-anim"></span>');
	});

	const elementsToString = (elements: Array<HTMLElement | string>): string => {
		return elements
			.map(elem => elem instanceof HTMLElement ? elem.outerHTML : elem)
			.reduce((a, b) => a + b, '');
	};
});
