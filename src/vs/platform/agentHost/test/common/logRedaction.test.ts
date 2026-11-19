/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { containsCredential, dropCredentialEntries, dropCredentialItems, errorCodeForLog, hasSignedUrlParameter, hasUrlUserinfo, identifierForLog, isSafeRegistryIdentifier, originsOnlyForLog, redactSecretsInText, reportDroppedStorageEntries } from '../../common/logRedaction.js';

suite('logRedaction', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('signed-URL parameters are found in plain, percent-encoded, nested and parsed forms; benign queries are not', () => {
		const cases = {
			plain: 'https://example.com/license?si=policy&sig=SECRET',
			encodedName: 'https://example.com/license?si=policy&%73ig=SECRET',
			encodedEquals: 'https://example.com/license?si=policy&sig%3DSECRET',
			nestedEncoding: 'https://example.com/license?%2573ig=SECRET',
			tripleEncoding: 'https://example.com/license?%252573ig=SECRET',
			upperCaseName: 'https://example.com/license?SIG=SECRET',
			encodedUpperCase: 'https://example.com/license?%53%49%47=SECRET',
			encodedQuery: 'https://example.com/blob%3Fsig%3DSECRET',
			relative: 'model.gguf?se=2030-01-01&sig=SECRET',
			bareVersion: '5?sv=2021&sig=SECRET',
			malformedEscape: 'https://example.com/license?%zz=1&%73ig=SECRET%',
			benignQuery: 'https://example.com/license?view=full',
			benignText: 'Example Flash 1.0',
			benignPercent: '100% local, 50%-off',
			benignWord: 'first=1&design=2',
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, text]) => [name, hasSignedUrlParameter(text)])), {
			plain: true,
			encodedName: true,
			encodedEquals: true,
			nestedEncoding: true,
			tripleEncoding: true,
			upperCaseName: true,
			encodedUpperCase: true,
			encodedQuery: true,
			relative: true,
			bareVersion: true,
			malformedEscape: true,
			benignQuery: false,
			benignText: false,
			benignPercent: false,
			benignWord: false,
		});
	});

	test('redaction removes encoded credentials and userinfo, and leaves benign text alone', () => {
		const texts = [
			'license https://example.com/license?si=policy&%73ig=SECRET',
			'name model?si=policy&%73ig=SECRET.gguf',
			'version 5%26sig%3DSECRET',
			'proxy https://user:SECRET@proxy.example.com/path',
			'proxy https%3A%2F%2Fuser%3ASECRET%40proxy.example.com',
			'size 100% of 2 GB',
		];
		const redacted = texts.map(text => redactSecretsInText(text));
		assert.deepStrictEqual({
			redacted,
			leaks: redacted.filter(text => text.includes('SECRET')),
			origins: originsOnlyForLog('ProxyResolver#resolveProxy https://acct.blob.core.windows.net/models/MAI-Code/5/MAI.gguf?sv=2024&sig=SECRET DIRECT; proxy http://user:SECRET@proxy.example.com:8080/x'),
		}, {
			redacted: [
				'license https://example.com/license?<redacted>',
				'name model?si=policy&<redacted>',
				'version <redacted>',
				'proxy https://<redacted>@proxy.example.com/path',
				'proxy <redacted>',
				'size 100% of 2 GB',
			],
			leaks: [],
			origins: 'ProxyResolver#resolveProxy https://acct.blob.core.windows.net DIRECT; proxy http://proxy.example.com:8080',
		});
	});

	test('logs carry only error codes and validated identifiers', () => {
		const withCode = Object.assign(new Error('connect ECONNRESET https://acct.blob.core.windows.net/c/m.gguf?sig=SECRET'), { code: 'ECONNRESET' });
		const withUrlCode = Object.assign(new Error('x'), { code: 'https://x/?sig=SECRET' });
		class LocalModelThing extends Error { override readonly name = 'LocalModelThing'; }
		assert.deepStrictEqual({
			codes: [withCode, withUrlCode, new TypeError('fetch failed for https://x/?sig=SECRET'), new LocalModelThing('m'), Object.assign(new Error('e'), { code: 404 }), 'https://x/?sig=SECRET', undefined].map(errorCodeForLog),
			identifiers: ['mai-code-1.1-flash-local', 'Qwen3.5-4B-Q4-K-M', '5', 'x?sig=SECRET-local', 'Example Flash 1.0', '../x', '', 42].map(value => identifierForLog(value)),
			registryIdentifiers: ['MAI-Code-1.1-Flash', '5', '.hidden', 'a/b', 'a'.repeat(129), 'x%73ig'].map(isSafeRegistryIdentifier),
		}, {
			codes: ['ECONNRESET', 'Error', 'TypeError', 'LocalModelThing', '404', 'error', 'error'],
			identifiers: ['mai-code-1.1-flash-local', 'Qwen3.5-4B-Q4-K-M', '5', '<family>', '<family>', '<family>', '<family>', '<family>'],
			registryIdentifiers: [true, true, false, false, false, false],
		});
	});

	test('containsCredential walks keys, values and arrays, and fails closed beyond its bounds', () => {
		let deep: unknown = 'ok';
		for (let i = 0; i < 20; i++) {
			deep = { child: deep };
		}
		const cases = {
			clean: { familyId: 'mai-code-1.1-flash-local', sizes: [1, 2], licenseUrl: 'https://example.com/license?view=full', ok: true, nothing: null },
			signedValue: { profile: { modelUri: 'https://acct.blob.core.windows.net/c/m.gguf?sv=1&sig=SECRET' } },
			encodedValue: { licenseUrl: 'https://example.com/license?si=policy&%73ig=SECRET' },
			signedKey: { 'c:/x?sig=SECRET|1|2': 'abc' },
			inArray: [['fine', 'still fine', 'x&se=2030&sig=SECRET']],
			userinfo: { proxy: 'https://user:SECRET@proxy.example.com' },
			tooDeep: deep,
			tooLarge: Array.from({ length: 20_000 }, (_, index) => index),
			number: 42,
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, containsCredential(value)])), {
			clean: false,
			signedValue: true,
			encodedValue: true,
			signedKey: true,
			inArray: true,
			userinfo: true,
			tooDeep: true,
			tooLarge: true,
			number: false,
		});
		assert.deepStrictEqual({ userinfo: hasUrlUserinfo('see https://user:pw@host/x'), noUserinfo: hasUrlUserinfo('mail me@example.com, see https://host/x@y') }, { userinfo: true, noUserinfo: false });
	});

	test('the persistence scrubber drops only the offending entries and reports a redacted count', () => {
		const items = dropCredentialItems(['a-local', 'b?sig=SECRET', 'c-local']);
		const entries = dropCredentialEntries({ 'a-local': { contentId: 'x' }, 'b-local': { version: '5%26sig%3DSECRET' }, 'c?se=1&sig=SECRET': { contentId: 'y' } });
		const warnings: string[] = [];
		reportDroppedStorageEntries({ warn: message => warnings.push(message) }, 'localModel.catalog', items.dropped + entries.dropped);
		reportDroppedStorageEntries({ warn: message => warnings.push(message) }, 'localModel.catalog', 0);
		assert.deepStrictEqual({ items, entries, warnings }, {
			items: { kept: ['a-local', 'c-local'], dropped: 1 },
			entries: { kept: { 'a-local': { contentId: 'x' } }, dropped: 2 },
			warnings: ['[LocalModel] Dropped 3 invalid or credential-bearing entries from localModel.catalog'],
		});
	});
});
