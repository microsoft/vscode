/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createChatFindHighlightRegistry, IChatFindHighlightWindow, supportsCssHighlightApi } from '../../../browser/widget/chatFind/chatFindHighlights.js';

/** A minimal fake `Highlight` + `CSS.highlights` pair, so composition can be tested without a real browser API. */
function fakeHighlightWindow(): IChatFindHighlightWindow & { highlights: Map<string, Set<Range>>; priorities: Map<string, number | undefined> } {
	const highlights = new Map<string, Set<Range>>();
	const priorities = new Map<string, number | undefined>();
	class FakeHighlight {
		readonly ranges = new Set<Range>();
		priority: number | undefined;
		add(range: Range): void { this.ranges.add(range); }
		clear(): void { this.ranges.clear(); }
	}
	return {
		highlights,
		priorities,
		Highlight: FakeHighlight as unknown as IChatFindHighlightWindow['Highlight'],
		CSS: {
			highlights: {
				set: (name: string, h: unknown) => {
					highlights.set(name, (h as FakeHighlight).ranges);
					priorities.set(name, (h as FakeHighlight).priority);
				},
				delete: (name: string) => { priorities.delete(name); return highlights.delete(name); },
			},
		},
	};
}

function fakeRange(): Range {
	return {} as Range;
}

const widgetA = {};
const widgetB = {};

suite('ChatFindHighlights registry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('supportsCssHighlightApi reflects the target window, not globals', () => {
		assert.strictEqual(supportsCssHighlightApi({}), false);
		assert.strictEqual(supportsCssHighlightApi(fakeHighlightWindow()), true);
	});

	test('applies the requested highlight priority so the current match wins overlaps', () => {
		const win = fakeHighlightWindow();
		const registry = createChatFindHighlightRegistry(win);

		registry.setRanges(widgetA, 'current', [fakeRange()], 1);
		registry.setRanges(widgetA, 'other', [fakeRange()], 0);

		assert.deepStrictEqual([win.priorities.get('current'), win.priorities.get('other')], [1, 0]);
	});

	test('composes ranges from two owners under the same highlight name', () => {
		const win = fakeHighlightWindow();
		const registry = createChatFindHighlightRegistry(win);
		const [a, b] = [fakeRange(), fakeRange()];

		registry.setRanges(widgetA, 'name', [a]);
		registry.setRanges(widgetB, 'name', [b]);

		assert.deepStrictEqual([...win.highlights.get('name')!], [a, b]);
	});

	test('clearing one owner keeps the other owner\'s ranges', () => {
		const win = fakeHighlightWindow();
		const registry = createChatFindHighlightRegistry(win);
		const [a, b] = [fakeRange(), fakeRange()];

		registry.setRanges(widgetA, 'name', [a]);
		registry.setRanges(widgetB, 'name', [b]);
		registry.clear(widgetA);

		assert.deepStrictEqual([...win.highlights.get('name')!], [b]);
	});

	test('removes the highlight entirely once no owner has ranges left', () => {
		const win = fakeHighlightWindow();
		const registry = createChatFindHighlightRegistry(win);
		registry.setRanges(widgetA, 'name', [fakeRange()]);

		registry.clear(widgetA);

		assert.strictEqual(win.highlights.has('name'), false);
	});

	test('replacing an owner\'s ranges does not require re-clearing first', () => {
		const win = fakeHighlightWindow();
		const registry = createChatFindHighlightRegistry(win);
		const [a, b] = [fakeRange(), fakeRange()];

		registry.setRanges(widgetA, 'name', [a]);
		registry.setRanges(widgetA, 'name', [b]);

		assert.deepStrictEqual([...win.highlights.get('name')!], [b]);
	});

	test('is a no-op when the target window lacks the Highlight API', () => {
		const registry = createChatFindHighlightRegistry({});
		assert.doesNotThrow(() => {
			registry.setRanges(widgetA, 'name', [fakeRange()]);
			registry.clear(widgetA);
		});
	});
});
