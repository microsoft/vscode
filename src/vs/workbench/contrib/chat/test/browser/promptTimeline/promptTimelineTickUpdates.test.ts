/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';
import { PromptTimelineRulerRail } from '../../../browser/promptTimeline/promptTimelineRulerRail.js';

suite('PromptTimeline independent tick updates', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const stat = { added: 3, removed: 1, fileCount: 1 };
	const ticks: readonly PromptTick[] = ['one', 'two'].map((requestId, index) => ({
		requestId,
		allRequestIds: [requestId],
		text: `Prompt ${index}`,
		ariaLabel: `Prompt ${index} label`,
		timestamp: index,
		count: 1,
		stat,
	}));
	const changes = {
		nothing: { allRequestIds: ['two'], stat: { ...stat } },
		text: { text: 'Renamed' },
		ariaLabel: { ariaLabel: 'Changed accessible label' },
		timestamp: { timestamp: 42 },
		count: { count: 2 },
		membership: { allRequestIds: ['two', 'three'] },
		added: { stat: { ...stat, added: 7 } },
		removed: { stat: { ...stat, removed: 4 } },
		fileCount: { stat: { ...stat, fileCount: 2 } },
	} satisfies Record<string, Partial<PromptTick>>;

	function attach(domNode: HTMLElement): void {
		document.body.appendChild(domNode);
		store.add(toDisposable(() => domNode.remove()));
	}

	for (const [field, change] of Object.entries(changes)) {
		const expectedRerender = [false, field !== 'nothing'];
		const rerenders = field === 'nothing' ? 'no prompt for an equal copy' : `only the prompt whose ${field} changed`;

		test(`ruler re-renders ${rerenders}`, () => {
			const rail = store.add(new PromptTimelineRulerRail());
			attach(rail.domNode);
			const hovered: PromptTick[] = [];
			rail.setFilesProvider(tick => {
				hovered.push(tick);
				return [];
			});
			rail.setTicks(ticks);
			const marks = [...rail.domNode.querySelectorAll<HTMLButtonElement>('.prompt-timeline-ruler-mark')];
			const barNodes = marks.map(mark => mark.querySelector('.seg-add'));
			const updated: PromptTick = { ...ticks[1], ...change };
			rail.setTicks([ticks[0], updated]);
			marks[1].dispatchEvent(new MouseEvent('mouseenter'));

			assert.deepStrictEqual({
				rerendered: marks.map((mark, index) => mark.querySelector('.seg-add') !== barNodes[index]),
				ariaLabel: marks[1].getAttribute('aria-label'),
				bar: [...marks[1].querySelectorAll<HTMLElement>('.prompt-timeline-ruler-bar > span')].map(segment => segment.style.flexGrow),
				hovered,
			}, {
				rerendered: expectedRerender,
				ariaLabel: updated.ariaLabel,
				bar: [String(updated.stat!.added), String(updated.stat!.removed)],
				hovered: [updated],
			});
		});
	}
});