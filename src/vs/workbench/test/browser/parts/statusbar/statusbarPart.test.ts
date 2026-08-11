/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MainStatusbarPart } from '../../../../browser/parts/statusbar/statusbarPart.js';

suite('StatusbarPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const updateStylesIfCreated = Reflect.get(MainStatusbarPart.prototype, 'updateStylesIfCreated') as (this: { element: HTMLElement | undefined; updateStyles(): void }) => void;

	test('updates styles only after the part is created', () => {
		let updateCount = 0;
		const part = {
			element: undefined as HTMLElement | undefined,
			updateStyles: () => updateCount++,
		};

		updateStylesIfCreated.call(part);
		part.element = document.createElement('div');
		updateStylesIfCreated.call(part);

		assert.strictEqual(updateCount, 1);
	});
});
