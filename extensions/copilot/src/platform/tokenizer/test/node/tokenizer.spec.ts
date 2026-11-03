/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { beforeAll, suite, test } from 'vitest';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { ITokenizerProvider, TokenizerProvider } from '../../node/tokenizer';

suite('Tokenization', function () {
	let multiModelTokenizer: ITokenizerProvider;
	beforeAll(() => {
		multiModelTokenizer = new TokenizerProvider(false, new NullTelemetryService());
	});

	test('Counts tokens - basic', async function () {
		const tokens = await multiModelTokenizer.acquireTokenizer({ tokenizer: TokenizerType.O200K }).tokenLength('Hello world!');
		assert.deepStrictEqual(tokens, 3);
	});

	test('Counts tokens - advanced', async function () {
		const tokens = await multiModelTokenizer.acquireTokenizer({ tokenizer: TokenizerType.O200K }).tokenLength('functionfibonacci(n:number):number{if(n<=0){return0;}elseif(n==1){return1;}else{returnfibonacci(n-1)+fibonacci(n-2);}}');
		assert.deepStrictEqual(tokens, 39);
	});
});
