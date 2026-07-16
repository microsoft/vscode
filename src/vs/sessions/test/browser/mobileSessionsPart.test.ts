/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MobileSessionsPart } from '../../browser/parts/mobile/mobileSessionsPart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('Sessions - Mobile Sessions Part', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('layouts the internal session grid at full phone dimensions', () => {
		let layoutContentsArgs: readonly [number, number] | undefined;
		let gridLayoutArgs: readonly [number, number, number, number] | undefined;

		const part = {
			layoutService: {
				mainContainer: {
					classList: {
						contains: (className: string) => className === 'phone-layout',
					},
				},
				isVisible: (partId: string) => partId === Parts.SESSIONS_PART,
			},
			layoutContents: (width: number, height: number) => {
				layoutContentsArgs = [width, height];
				return {
					contentSize: { width: width - 2, height: height - 4 },
				};
			},
			_gridWidget: {
				layout: (width: number, height: number, top: number, left: number) => {
					gridLayoutArgs = [width, height, top, left];
				},
			},
		};

		MobileSessionsPart.prototype.layout.call(part as unknown as MobileSessionsPart, 390, 796, 48, 0);

		assert.deepStrictEqual(layoutContentsArgs, [390, 796]);
		assert.deepStrictEqual(gridLayoutArgs, [388, 792, 48, 0]);
	});
});
