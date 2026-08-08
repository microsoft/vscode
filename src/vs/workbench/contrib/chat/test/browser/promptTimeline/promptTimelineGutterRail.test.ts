/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTimelineGutterRail } from '../../../browser/promptTimeline/promptTimelineGutterRail.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';

suite('PromptTimelineGutterRail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function tick(index: number): PromptTick {
		const requestId = String(index);
		return { requestId, allRequestIds: [requestId], text: requestId, timestamp: index, count: 1, ariaLabel: requestId };
	}

	test('pairs row and dot hover feedback', () => {
		const rail = store.add(new PromptTimelineGutterRail());
		rail.setTicks(Array.from({ length: 3 }, (_, index) => tick(index)));

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-dot'));

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

	test('maps row hover to the nearest sampled dot when capped', () => {
		const rail = store.add(new PromptTimelineGutterRail());
		rail.setTicks(Array.from({ length: 51 }, (_, index) => tick(index)));

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-dot'));
		rows[25].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

		assert.deepStrictEqual({
			dotCount: dots.length,
			previewRow: rows.findIndex(row => row.classList.contains('preview')),
			previewDot: dots.findIndex(dot => dot.classList.contains('preview')),
		}, {
			dotCount: 50,
			previewRow: 25,
			previewDot: 24,
		});
	});
});
