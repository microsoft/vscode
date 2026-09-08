/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getColorRegistry } from '../../../../../platform/theme/common/colorUtils.js';
import { chatInputWorkingBorderColor1, chatInputWorkingBorderColor2, chatInputWorkingBorderColor3, chatThinkingShimmer } from '../../common/widget/chatColors.js';

suite('Chat colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows opaque animation colors and deprecates unused accents', () => {
		const ids = [chatThinkingShimmer, chatInputWorkingBorderColor1, chatInputWorkingBorderColor2, chatInputWorkingBorderColor3];
		const colors = getColorRegistry().getColors();

		assert.deepStrictEqual(ids.map(id => {
			const color = colors.find(color => color.id === id);
			return { id, needsTransparency: color?.needsTransparency, deprecated: !!color?.deprecationMessage };
		}), [
			{ id: chatThinkingShimmer, needsTransparency: false, deprecated: false },
			{ id: chatInputWorkingBorderColor1, needsTransparency: false, deprecated: false },
			{ id: chatInputWorkingBorderColor2, needsTransparency: false, deprecated: true },
			{ id: chatInputWorkingBorderColor3, needsTransparency: false, deprecated: true },
		]);
	});
});
