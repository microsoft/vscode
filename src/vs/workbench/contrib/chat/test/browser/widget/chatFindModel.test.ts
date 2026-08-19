/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatFindModel } from '../../../browser/widget/chatFind/chatFindModel.js';
import { ChatTreeItem } from '../../../browser/chat.js';

/** Builds a minimal fake request item satisfying `isRequestVM` (`'message' in item`). */
function fakeRequest(id: string, messageText: string): ChatTreeItem {
	return { id, message: {}, messageText } as unknown as ChatTreeItem;
}

/** Builds a minimal fake response item satisfying `isResponseVM` (`typeof item.setVote !== 'undefined'`). */
function fakeResponse(id: string, value: unknown[], errorDetails?: { message: string }, codeCitations?: unknown[]): ChatTreeItem {
	const response = { value };
	return {
		id,
		setVote: () => { },
		response,
		errorDetails,
		codeCitations,
		isCanceled: false,
		// Error details only render for a final, uncanceled response; see `isErrorDetailsRendered`.
		model: { response, entireResponse: response },
	} as unknown as ChatTreeItem;
}

function markdown(text: string) {
	return { kind: 'markdownContent', content: new MarkdownString(text) };
}

function thinking(text: string) {
	return { kind: 'thinking', value: text };
}

function toolInvocation(invocationMessage: string, pastTenseMessage?: string, isComplete = true) {
	return { kind: 'toolInvocationSerialized', invocationMessage, pastTenseMessage, toolSpecificData: undefined, resultDetails: undefined, isComplete };
}

suite('ChatFindModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds matches across a user request and response markdown', () => {
		const items = [
			fakeRequest('req1', 'How do I sort an array in Python?'),
			fakeResponse('resp1', [markdown('You can use `sorted(array)` to sort an **array** in Python.')]),
		];
		const model = new ChatFindModel(() => items);
		model.setQuery('array', { isRegex: false, matchCase: false, wholeWord: false });

		// One "array" in the request, two in the response markdown text.
		assert.strictEqual(model.matches.length, 3);
		assert.strictEqual(model.matches[0].itemId, 'req1');
		assert.strictEqual(model.matches[1].itemId, 'resp1');
		assert.strictEqual(model.matches[2].itemId, 'resp1');
		model.dispose();
	});

	test('does not index reasoning or tool invocations', () => {
		// Where a tool renders is decided during rendering, and reasoning bodies are built on
		// expansion, so indexing either makes the count depend on how far the transcript has drawn.
		const items = [
			fakeResponse('resp1', [
				thinking('I should check the needle in this haystack first.'),
				toolInvocation('Searching for needle in files', 'Searched for needle in files'),
				markdown('A needle in the response body.'),
			]),
		];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });

		assert.strictEqual(model.matches.length, 1, 'only the rendered markdown is indexed');
		assert.strictEqual(model.matches[0].itemId, 'resp1');
		model.dispose();
	});

	test('match count does not change when the renderer marks a tool as grouped', () => {
		// `isAttachedToThinking` is assigned while rendering; the index must not read it, or the
		// count would drop as rows draw and navigation would target vanishing matches.
		const tool = toolInvocation('Searching needle', 'Searched needle') as Record<string, unknown>;
		const items = [fakeResponse('resp1', [tool, markdown('needle in prose')])];
		const model = new ChatFindModel(() => items);

		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });
		const before = model.matches.length;

		tool.isAttachedToThinking = true;
		model.recompute();

		assert.strictEqual(model.matches.length, before, 'count is stable across render-time flags');
		model.dispose();
	});

	test('does not index error details the renderer replaces or omits', () => {
		// Canceled responses drop the error part, and the quota/rate-limit variants render fixed
		// copy instead of the message, so indexing it would count unreachable matches.
		const canceled = fakeResponse('resp1', [], { message: 'needle failure' }) as unknown as Record<string, unknown>;
		canceled.isCanceled = true;
		const quota = fakeResponse('resp2', [], { message: 'needle failure' }) as unknown as Record<string, unknown>;
		(quota.errorDetails as Record<string, unknown>).isQuotaExceeded = true;

		for (const item of [canceled, quota]) {
			const model = new ChatFindModel(() => [item as unknown as ChatTreeItem]);
			model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });
			assert.strictEqual(model.matches.length, 0);
			model.dispose();
		}
	});

	test('caps the total match count across segments', () => {
		// Two segments that each exceed the cap on their own: the total must still be bounded.
		const many = new Array(9000).fill('needle').join(' ');
		const items = [
			fakeResponse('resp1', [markdown(many)]),
			fakeResponse('resp2', [markdown(many)]),
		];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });

		assert.strictEqual(model.matches.length, 9999);
		model.dispose();
	});

	test('tracks occurrences across response parts merged by the renderer', () => {
		const items = [fakeResponse('resp1', [markdown('first needle '), markdown('second needle')])];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });

		assert.deepStrictEqual(model.matches.map(match => ({
			partIndex: match.partIndex,
			occurrenceIndex: match.occurrenceIndex,
		})), [
			{ partIndex: 1, occurrenceIndex: 0 },
			{ partIndex: 1, occurrenceIndex: 1 },
		]);
		model.dispose();
	});

	test('respects case sensitivity', () => {
		const items = [fakeResponse('resp1', [markdown('Needle and needle and NEEDLE')])];
		const model = new ChatFindModel(() => items);

		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 3);

		model.setQuery('needle', { isRegex: false, matchCase: true, wholeWord: false });
		assert.strictEqual(model.matches.length, 1);
		model.dispose();
	});

	test('respects whole word', () => {
		const items = [fakeResponse('resp1', [markdown('cat concatenate cat')])];
		const model = new ChatFindModel(() => items);

		model.setQuery('cat', { isRegex: false, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 3);

		model.setQuery('cat', { isRegex: false, matchCase: false, wholeWord: true });
		assert.strictEqual(model.matches.length, 2);
		model.dispose();
	});

	test('supports regular expressions', () => {
		const items = [fakeResponse('resp1', [markdown('foo1 foo2 bar3')])];
		const model = new ChatFindModel(() => items);

		model.setQuery('foo\\d', { isRegex: true, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 2);
		model.dispose();
	});

	test('reports invalid regex without throwing', () => {
		const items = [fakeResponse('resp1', [markdown('some text')])];
		const model = new ChatFindModel(() => items);

		model.setQuery('([', { isRegex: true, matchCase: false, wholeWord: false });
		assert.strictEqual(model.isInvalidRegex, true);
		assert.strictEqual(model.matches.length, 0);
		model.dispose();
	});

	test('next/previous wrap around', () => {
		const items = [fakeResponse('resp1', [markdown('a a a')])];
		const model = new ChatFindModel(() => items);
		model.setQuery('a', { isRegex: false, matchCase: false, wholeWord: false });

		assert.strictEqual(model.matches.length, 3);
		assert.strictEqual(model.activeIndex, 0);

		model.next();
		assert.strictEqual(model.activeIndex, 1);
		model.next();
		assert.strictEqual(model.activeIndex, 2);
		model.next();
		assert.strictEqual(model.activeIndex, 0, 'wraps to first match');

		model.previous();
		assert.strictEqual(model.activeIndex, 2, 'wraps to last match');
		model.dispose();
	});

	test('clearing the query clears matches', () => {
		const items = [fakeResponse('resp1', [markdown('needle')])];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 1);

		model.setQuery('', { isRegex: false, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 0);
		assert.strictEqual(model.activeIndex, -1);
		model.dispose();
	});

	test('includes error details as a searchable part', () => {
		const items = [fakeResponse('resp1', [], { message: 'Request failed: needle not found' })];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });

		assert.strictEqual(model.matches.length, 1);
		assert.strictEqual(model.matches[0].partIndex, -1);
		model.dispose();
	});

	test('scopes error-detail matches past code citations as well as the response body', () => {
		// The same word appears in the body and in the error, so the error match must not be
		// resolved against the body or citation occurrences when it is revealed.
		const items = [fakeResponse('resp1', [markdown('needle in the body')], { message: 'failed: needle' }, [{ value: 'cite' }])];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });

		assert.deepStrictEqual(model.matches.map(match => ({
			partIndex: match.partIndex,
			scopeStartPartIndex: match.scopeStartPartIndex,
			occurrenceIndex: match.occurrenceIndex,
		})), [
			{ partIndex: 1, scopeStartPartIndex: undefined, occurrenceIndex: 0 },
			{ partIndex: -1, scopeStartPartIndex: 3, occurrenceIndex: 0 },
		]);
		model.dispose();
	});

	test('preserves the active match anchor across recompute (e.g. streaming updates)', () => {
		let items: ChatTreeItem[] = [fakeResponse('resp1', [markdown('alpha needle beta')])];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 1);
		const anchoredMatch = model.activeMatch;
		assert.ok(anchoredMatch);

		// Simulate a streaming update that adds more content before the match.
		items = [fakeResponse('resp1', [markdown('prefix content'), markdown('alpha needle beta')])];
		model.recompute();

		assert.strictEqual(model.matches.length, 1);
		assert.strictEqual(model.activeIndex, 0);
		assert.strictEqual(model.matches[0].itemId, anchoredMatch!.itemId);
		assert.strictEqual(model.matches[0].partIndex, 1);
		model.dispose();
	});

	test('disposing the model does not throw and stops further use', () => {
		const items = [fakeResponse('resp1', [markdown('needle')])];
		const model = new ChatFindModel(() => items);
		model.setQuery('needle', { isRegex: false, matchCase: false, wholeWord: false });
		assert.strictEqual(model.matches.length, 1);
		model.dispose();
		// clear() after dispose should be a safe no-op (no listeners are dispatched).
		model.clear();
		assert.strictEqual(model.matches.length, 0);
	});
});
