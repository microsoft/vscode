/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Button, unthemedButtonStyles } from '../../../../browser/ui/button/button.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Button', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disabling a hovered button clears its hover background', () => {
		const container = document.createElement('div');
		const button = store.add(new Button(container, {
			...unthemedButtonStyles,
			buttonBackground: 'red',
			buttonHoverBackground: 'blue',
		}));

		const backgrounds: string[] = [button.element.style.backgroundColor];
		button.element.dispatchEvent(new MouseEvent('mouseover'));
		backgrounds.push(button.element.style.backgroundColor);
		button.enabled = false;
		backgrounds.push(button.element.style.backgroundColor);
		button.element.dispatchEvent(new MouseEvent('mouseout'));
		button.element.dispatchEvent(new MouseEvent('mouseover'));
		backgrounds.push(button.element.style.backgroundColor);

		assert.deepStrictEqual(backgrounds, ['red', 'blue', 'red', 'red']);
	});
});
