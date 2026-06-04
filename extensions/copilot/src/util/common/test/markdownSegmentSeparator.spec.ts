/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { MarkdownSegmentSeparator } from '../markdownSegmentSeparator';

describe('MarkdownSegmentSeparator', () => {

	it('does not emit a separator on the very first segment', () => {
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment('a');

		expect(emit).not.toHaveBeenCalled();
	});

	it('does not emit a separator when the same segment key repeats', () => {
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment('a');
		sep.onSegment('a');
		sep.onSegment('a');

		expect(emit).not.toHaveBeenCalled();
	});

	it('emits a separator once when the segment key changes', () => {
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment('a');
		sep.onSegment('b');

		expect(emit).toHaveBeenCalledTimes(1);
	});

	it('emits a separator on every distinct transition', () => {
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment('a');
		sep.onSegment('b');
		sep.onSegment('b');
		sep.onSegment('c');
		sep.onSegment('a');

		// a→b, b→c, c→a → 3 separators
		expect(emit).toHaveBeenCalledTimes(3);
	});

	it('works with numeric segment keys', () => {
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment(0);
		sep.onSegment(0);
		sep.onSegment(1);

		expect(emit).toHaveBeenCalledTimes(1);
	});

	it('treats `undefined` as a no-op: does not emit and preserves the last known key', () => {
		// Legacy fallback: SDKs that don't carry an id for some events
		// shouldn't produce a separator just because we couldn't compute a
		// key, nor should they reset our state.
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment('a');
		sep.onSegment(undefined);
		expect(emit).not.toHaveBeenCalled();

		// `'a'` is still remembered, so a subsequent same-key call must
		// still be silent...
		sep.onSegment('a');
		expect(emit).not.toHaveBeenCalled();

		// ...and a different key must still trigger.
		sep.onSegment('b');
		expect(emit).toHaveBeenCalledTimes(1);
	});

	it('reset() forgets the last segment so the next emission is treated as the first', () => {
		const emit = vi.fn();
		const sep = new MarkdownSegmentSeparator(emit);

		sep.onSegment('a');
		sep.onSegment('b');
		expect(emit).toHaveBeenCalledTimes(1);

		sep.reset();

		sep.onSegment('c');
		expect(emit).toHaveBeenCalledTimes(1); // unchanged: first emission after reset

		sep.onSegment('d');
		expect(emit).toHaveBeenCalledTimes(2);
	});
});
