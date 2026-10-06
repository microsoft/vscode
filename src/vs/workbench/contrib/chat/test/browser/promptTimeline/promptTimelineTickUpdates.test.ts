/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTimelineGutterRail } from '../../../browser/promptTimeline/promptTimelineGutterRail.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';
import { PromptTimelineRulerRail } from '../../../browser/promptTimeline/promptTimelineRulerRail.js';

suite('PromptTimeline independent tick updates', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const stat = { added: 3, removed: 1, fileCount: 1 };
	const original: PromptTick = { requestId: 'one', allRequestIds: ['one'], text: 'Original', ariaLabel: 'Original prompt', timestamp: 1, count: 1, stat };
	const changes = {
		text: { text: 'Renamed' },
		ariaLabel: { ariaLabel: 'Changed accessible label' },
		timestamp: { timestamp: 42 },
		count: { count: 2 },
		membership: { allRequestIds: ['one', 'two'] },
		added: { stat: { ...stat, added: 7 } },
		removed: { stat: { ...stat, removed: 4 } },
		fileCount: { stat: { ...stat, fileCount: 2 } }
	} satisfies Record<string, Partial<PromptTick>>;

	for (const kind of ['gutter', 'ruler']) {
		for (const [field, change] of Object.entries(changes)) {
			test(`${kind} updates ${field} independently of every other compared field`, () => {
				const rail = store.add(kind === 'gutter' ? new PromptTimelineGutterRail() : new PromptTimelineRulerRail());
				document.body.appendChild(rail.domNode);
				store.add(toDisposable(() => rail.domNode.remove()));
				let observed: PromptTick | undefined;
				if (rail instanceof PromptTimelineGutterRail) {
					store.add(rail.onDidReview(tick => observed = tick));
				} else {
					rail.setFilesProvider(tick => {
						observed = tick;
						return [];
					});
				}
				rail.setTicks([original]);
				const updated: PromptTick = { ...original, ...change };
				rail.setTicks([updated]);
				if (rail instanceof PromptTimelineGutterRail) {
					rail.domNode.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-row-diff')!.click();
				} else {
					rail.domNode.querySelector<HTMLButtonElement>('.prompt-timeline-ruler-mark')!.dispatchEvent(new MouseEvent('mouseenter'));
				}
				assert.deepStrictEqual(observed, updated);
			});
		}
	}
});
