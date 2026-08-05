/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTimelineDockRail } from '../../../browser/promptTimeline/promptTimelineDockRail.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';

suite('PromptTimelineDockRail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ticks: readonly PromptTick[] = [
		{ requestId: 'one', allRequestIds: ['one'], text: 'One', timestamp: 1, count: 1, ariaLabel: 'One' },
		{ requestId: 'two', allRequestIds: ['two'], text: 'Two', timestamp: 2, count: 1, ariaLabel: 'Two' },
		{ requestId: 'three', allRequestIds: ['three'], text: 'Three', timestamp: 3, count: 1, ariaLabel: 'Three' },
	];

	test('pairs row and dot hover feedback', () => {
		const rail = store.add(new PromptTimelineDockRail());
		rail.setTicks(ticks);

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-dock-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-dock-dot'));

		rows[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const rowHover = {
			rows: rows.map(row => row.classList.contains('preview')),
			dots: dots.map(dot => dot.classList.contains('preview')),
		};

		dots[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const dotHover = {
			rows: rows.map(row => row.classList.contains('preview')),
			dots: dots.map(dot => dot.classList.contains('preview')),
		};

		assert.deepStrictEqual({ rowHover, dotHover }, {
			rowHover: {
				rows: [false, true, false],
				dots: [false, true, false],
			},
			dotHover: {
				rows: [false, false, true],
				dots: [false, false, true],
			},
		});
	});
});
