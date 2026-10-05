/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { getStylesLoadErrorMessage } from '../preview/preview';
import { getSafeNotificationMessage } from '../util/notification';

suite('Notification security', () => {
	test('selects the exact fallback for link syntax or command schemes and preserves other text', () => {
		const fallback = 'Unable to complete the operation.';
		const ordinary = ['', ' ordinary [file].ts ', 'https://example.com', 'command.ts', 'a] (b'];
		const suspicious = [
			'[Open](command:test.noop)',
			'[Help](https://example.com)',
			'\\[Open\\](CoMmAnD:test.noop)',
			'broken](',
			'command:',
			'prefix COMMAND:test.noop suffix',
		];
		assert.deepStrictEqual(
			[...ordinary, ...suspicious].map(message => getSafeNotificationMessage(message, fallback)),
			[...ordinary, ...suspicious.map(() => fallback)],
		);
	});

	test('stylesheet load errors preserve normal paths but exclude notification link syntax', () => {
		const inputs = [
			['styles/custom.css', 'styles/[dark].css'],
			['styles/[Open](command:test.noop).css'],
			['https://example.com/[Open](CoMmAnD:test.noop?%5B1%5D "Title").css'],
			['styles/\\[Open\\](command:test.noop).css'],
			['[Open](file:private.css)'],
			['[Help](https://example.com)'],
			['styles/COMMAND:test.noop.css'],
		];
		assert.deepStrictEqual(inputs.map(getStylesLoadErrorMessage), [
			'Could not load \'markdown.styles\': styles/custom.css, styles/[dark].css',
			...inputs.slice(1).map(() => 'Could not load the styles configured in \'markdown.styles\'.'),
		]);
	});
});
