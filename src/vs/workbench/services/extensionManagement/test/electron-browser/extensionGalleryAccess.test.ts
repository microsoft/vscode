/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getEffectiveAuthProvider, isSafeTokenTarget } from '../../electron-browser/extensionGalleryAccess.js';

suite('ExtensionGalleryAccess', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getEffectiveAuthProvider', () => {

		test('resolves microsoft only when configured and Entra auth is enabled', () => {
			const cases = ([
				['microsoft', true],
				['microsoft', false],
				['github', true],
				['github', false],
				[undefined, true],
				[undefined, false],
				['Microsoft', true], // case-sensitive: not the 'microsoft' literal
			] as const).map(([provider, entraEnabled]) => getEffectiveAuthProvider(provider, entraEnabled));

			assert.deepStrictEqual(cases, ['microsoft', 'github', 'github', 'github', 'github', 'github', 'github']);
		});
	});

	suite('isSafeTokenTarget', () => {

		test('permits only HTTPS same-origin targets, failing closed on anything else', () => {
			const base = 'https://marketplace.example.com/_apis/gallery';
			const cases = ([
				['https://marketplace.example.com/_apis/public/gallery/eligibility', base], // same origin
				['https://MARKETPLACE.EXAMPLE.COM/eligibility', base], // host compared case-insensitively
				['https://marketplace.example.com:443/eligibility', 'https://marketplace.example.com:443'], // explicit matching port
				['https://evil.example.com/eligibility', base], // cross-origin host
				['http://marketplace.example.com/eligibility', base], // cleartext scheme
				['https://marketplace.example.com:8443/eligibility', base], // differing port
				['not a url', base], // unparseable target
				['https://marketplace.example.com/eligibility', 'not a url'], // unparseable base
			] as const).map(([target, baseUrl]) => isSafeTokenTarget(target, baseUrl));

			assert.deepStrictEqual(cases, [true, true, true, false, false, false, false, false]);
		});
	});
});
