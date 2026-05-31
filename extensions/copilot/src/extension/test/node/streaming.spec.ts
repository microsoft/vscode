/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, it, suite } from 'vitest';
import { AsyncIterableSource, timeout } from '../../../util/vs/base/common/async';
import { forEachStreamed, replaceStringInStream } from '../../prompts/node/inline/utils/streaming';

suite('Streaming', () => {
	it('replaceStringInStream', async () => {
		const streamSrc = new AsyncIterableSource<string>();

		const resultingStream = replaceStringInStream(streamSrc.asyncIterable, 'aba', 'xxx');
		const arr = [] as string[];

		forEachStreamed(resultingStream, value => arr.push(value));
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`[]`);
		arr.length = 0;

		streamSrc.emitOne('12345'); // nothing happens
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`
			[
			  "12345",
			]
		`);
		arr.length = 0;

		streamSrc.emitOne('1aba234aba5'); // aba's get replaced
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`
			[
			  "1xxx234xxx5",
			]
		`);
		arr.length = 0;

		streamSrc.emitOne('ab'); // waits for more data
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`[]`);
		arr.length = 0;

		streamSrc.emitOne('a'); // -> replace
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`
			[
			  "xxx",
			]
		`);
		arr.length = 0;


		streamSrc.emitOne('a'); // waits for more data
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`[]`);
		arr.length = 0;

		streamSrc.emitOne('a'); // cannot emit this a yet, but the previous one
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`
			[
			  "a",
			]
		`);
		arr.length = 0;

		streamSrc.emitOne('x'); // flush buffer
		await timeout(1);
		expect(arr).toMatchInlineSnapshot(`
			[
			  "ax",
			]
		`);
		arr.length = 0;
	});
});
