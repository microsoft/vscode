/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseIntentRepository, sameIntentRepository } from '../../common/sessionIntent.js';

suite('Session intent repository context', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses explicit repository, issue, and pull request URLs through the common API', () => {
		assert.deepStrictEqual([
			parseIntentRepository('https://github.com/example/payments'),
			parseIntentRepository('https://github.com/example/payments.git'),
			parseIntentRepository('https://github.com/example/payments/issues/42'),
			parseIntentRepository('https://github.com/example/payments/pull/7?diff=split#discussion'),
			parseIntentRepository('  https://WWW.GitHub.com/Example/Payments.GIT/  '),
		], [
			{ owner: 'example', repo: 'payments' },
			{ owner: 'example', repo: 'payments' },
			{ owner: 'example', repo: 'payments' },
			{ owner: 'example', repo: 'payments' },
			{ owner: 'Example', repo: 'Payments' },
		]);
	});

	test('rejects credentials, lookalike hosts, unsupported paths, and non-URL text', () => {
		const values = [
			'https://token@github.com/example/payments',
			'https://evil-github.com/example/payments',
			'https://github.com.evil.example/example/payments',
			'http://github.com/example/payments',
			'https://github.com/example/payments/tree/main',
			'Work on https://github.com/example/payments',
			'payments',
			'',
		];
		assert.deepStrictEqual(values.map(parseIntentRepository), values.map(() => undefined));
	});

	test('compares owner and repository without case sensitivity and never matches unknown context', () => {
		const repository = { owner: 'Example', repo: 'Payments' };
		assert.deepStrictEqual([
			sameIntentRepository(repository, { owner: 'example', repo: 'payments' }),
			sameIntentRepository(repository, { owner: 'other', repo: 'payments' }),
			sameIntentRepository(repository, { owner: 'example', repo: 'other' }),
			sameIntentRepository(undefined, repository),
			sameIntentRepository(repository, undefined),
			sameIntentRepository(undefined, undefined),
		], [true, false, false, false, false, false]);
	});
});
