/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IBrowserViewPromptRequestEvent } from '../../common/browserView.js';
import { BrowserViewPrompts } from '../../electron-main/browserViewPrompts.js';

suite('BrowserViewPrompts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(canPrompt = true) {
		const prompts = store.add(new BrowserViewPrompts(() => canPrompt));
		const requests: IBrowserViewPromptRequestEvent[] = [];
		store.add(prompts.onDidRequestPrompt(e => requests.push(e)));
		const answers: (string | null)[] = [];
		const ask = (message: string) => prompts.request('https://example.com', message, 'default', value => answers.push(value));
		return { prompts, requests, answers, ask };
	}

	test('fires a request and returns the answer', () => {
		const { prompts, requests, answers, ask } = create();
		ask('Name?');
		assert.deepStrictEqual(requests.map(({ origin, message, defaultValue }) => ({ origin, message, defaultValue })), [{ origin: 'https://example.com', message: 'Name?', defaultValue: 'default' }]);
		assert.deepStrictEqual(answers, []);

		prompts.respond(requests[0].requestId, 'Ada');
		prompts.respond(requests[0].requestId, 'ignored');
		assert.deepStrictEqual(answers, ['Ada']);
	});

	test('answers null right away when nothing can show the prompt', () => {
		const { requests, answers, ask } = create(false);
		ask('Name?');
		assert.deepStrictEqual({ requests: requests.length, answers }, { requests: 0, answers: [null] });
	});

	test('settleAll cancels every pending prompt, for example on navigation', () => {
		const { prompts, answers, ask } = create();
		ask('one');
		ask('two');
		prompts.settleAll();
		assert.deepStrictEqual(answers, [null, null]);
	});

	test('dispose cancels pending prompts', () => {
		const { prompts, answers, ask } = create();
		ask('one');
		prompts.dispose();
		assert.deepStrictEqual(answers, [null]);
	});
});
