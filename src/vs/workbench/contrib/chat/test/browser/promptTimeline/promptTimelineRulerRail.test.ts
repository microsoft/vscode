/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';
import { PromptTimelineRulerRail } from '../../../browser/promptTimeline/promptTimelineRulerRail.js';

suite('PromptTimelineRulerRail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves unchanged mark content and keyboard focus while updating diff stats', () => {
		const rail = store.add(new PromptTimelineRulerRail());
		document.body.appendChild(rail.domNode);
		store.add(toDisposable(() => rail.domNode.remove()));
		const ticks: PromptTick[] = [0, 1].map(index => ({
			requestId: String(index),
			allRequestIds: [String(index)],
			text: `Prompt ${index}`,
			ariaLabel: `Prompt ${index}`,
			timestamp: index,
			count: 1,
			stat: { added: 3, removed: 1, fileCount: 1 },
		}));
		rail.setTicks(ticks);
		const marks = [...rail.domNode.querySelectorAll<HTMLButtonElement>('.prompt-timeline-ruler-mark')];
		const bar = marks[0].querySelector('.seg-add');
		marks[0].focus();
		rail.setTicks(ticks.map(tick => ({ ...tick, allRequestIds: [...tick.allRequestIds], stat: { ...tick.stat! } })));
		const unchangedMarkPreserved = marks[0].querySelector('.seg-add') === bar;
		rail.setTicks([ticks[0], { ...ticks[1], ariaLabel: 'Updated', stat: { added: 7, removed: 0, fileCount: 1 } }]);
		rail.setActive('1');

		assert.deepStrictEqual({
			unchangedMarkPreserved,
			firstMarkPreserved: marks[0].querySelector('.seg-add') === bar,
			focused: document.activeElement === marks[0],
			tabbable: marks.filter(mark => mark.tabIndex === 0).length,
			ariaLabel: marks[1].getAttribute('aria-label'),
			added: marks[1].querySelector<HTMLElement>('.seg-add')?.style.flexGrow,
			removed: !!marks[1].querySelector('.seg-del'),
			active: marks[1].getAttribute('aria-current'),
		}, {
			unchangedMarkPreserved: true,
			firstMarkPreserved: true,
			focused: true,
			tabbable: 1,
			ariaLabel: 'Updated',
			added: '7',
			removed: false,
			active: 'location',
		});

		const selected: string[] = [];
		store.add(rail.onDidSelect(id => selected.push(id)));
		marks[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true }));
		marks[1].click();
		rail.setTicks([ticks[0], { ...ticks[1], stat: undefined }]);

		assert.deepStrictEqual({
			selected,
			focused: document.activeElement === marks[1],
			edited: marks[1].querySelector('.prompt-timeline-ruler-bar')?.classList.contains('edited'),
		}, { selected: ['1'], focused: true, edited: false });
	});
});
