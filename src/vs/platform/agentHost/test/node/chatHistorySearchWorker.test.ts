/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MessageKind, ResponsePartKind, Turn, TurnState } from '../../common/state/sessionState.js';
import { ChatHistoryQueries } from '../../node/chatHistoryQueries.js';

suite('Chat history search worker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('searches each displayed Markdown part independently in protocol order', async () => {
		const turns: Turn[] = [{
			id: 'opaque-turn', message: { text: 'map', origin: { kind: MessageKind.User } }, usage: undefined, state: TurnState.Complete,
			responseParts: [
				{ kind: ResponsePartKind.Markdown, id: 'list', content: '> - **[map &amp; `filter`](https://example.org/map)**' },
				{ kind: ResponsePartKind.Reasoning, id: 'thinking', content: 'map' },
				{ kind: ResponsePartKind.Markdown, id: 'code', content: '```ts\nfilter(map)\n```' },
			],
		}];
		const history = new ChatHistoryQueries();
		const search = async (query: string) => (await history.search(turns, { channel: 'custom:chat', query, isRegex: true }))
			.items.map(hit => [hit.kind, hit.occurrence]);
		assert.deepStrictEqual({
			hits: await search('map|(?=.)'),
			visible: await search('map & filter'),
			crossBoundary: await search('filter\\s*filter'),
		}, { hits: [['response', 1], ['response', 0], ['request', 0]], visible: [['response', 0]], crossBoundary: [] });
	});
});
