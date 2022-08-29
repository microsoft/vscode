/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ContentHoverController } from 'vs/editor/contrib/hover/browser/contentHover';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';

suite('Content Hover', () => {
	test('issue #151235: Gitlens hover shows up in the wrong place', () => {
		const actual = ContentHoverController.computeHoverRanges(
			new Range(5, 5, 5, 5),
			[<IHoverPart>{ range: new Range(4, 1, 5, 6) }]
		);
		assert.deepStrictEqual(
			actual,
			{
				showAtPosition: new Position(5, 5),
				showAtRange: new Range(5, 5, 5, 5),
				highlightRange: new Range(4, 1, 5, 6)
			}
		);
	});
});
