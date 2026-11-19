/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, suiteSetup, test } from 'mocha';
import { createMatcher, createSchemaClient, RequestOptions } from './schemaRequestTestUtils';

const disguisedHost = 'https://attacker.example%5Cfake.trusted.example/schema.json';
const encodedSeparators = ['%252F', '%252f'];

suite('JSON schema URL matching', () => {
	let matches: Awaited<ReturnType<typeof createMatcher>>;
	suiteSetup(async () => { matches = await createMatcher(); });

	test('regression: a decoded backslash cannot grant a scoped wildcard domain allowance', () => {
		assert.strictEqual(matches(disguisedHost, { 'https://*.trusted.example': true }), false);
	});

	test('regression: a decoded backslash cannot evade a scoped destination denial', () => {
		assert.strictEqual(matches(disguisedHost, { 'https://attacker.example': false, '*': true }), false);
	});

	test('regression: a decoded backslash cannot grant implicit localhost trust', () => {
		assert.strictEqual(matches('https://attacker.example%5Cfake.localhost/schema.json', {}), false);
	});

	test('regression: canonical paths cannot escape an allowed schema directory', () => {
		assert.strictEqual(matches('https://api.trusted.example/schemas/../private/schema.json', { 'https://*.trusted.example/schemas/': true }), false);
	});

	test('regression: canonical paths retain a scoped denial before a broader allowance', () => {
		assert.strictEqual(matches('https://api.trusted.example/schemas/../private/schema.json', {
			'https://*.trusted.example/private/': false,
			'https://*.trusted.example': true
		}), false);
	});

	for (const separator of encodedSeparators) {
		test(`regression: ${separator} remains encoded during path-scope matching`, () => {
			const url = `https://api.trusted.example/schemas${separator}..${separator}private/schema.json`;
			assert.strictEqual(matches(url, { 'https://api.trusted.example/schemas/': true }), false);
		});
	}

	test('controls: request and pattern paths preserve the same encoded characters', () => {
		assert.deepStrictEqual([
			matches('https://api.trusted.example/schema%20files/main.json', { 'https://api.trusted.example/schema%20files/': true }),
			matches('https://api.trusted.example/schemas%252Fdata/main.json', { 'https://api.trusted.example/schemas%252Fdata/': true }),
			matches('https://api.trusted.example/schemas%252F..%252Fprivate/schema.json', {
				'https://api.trusted.example/schemas%252F..%252Fprivate/': false,
				'https://api.trusted.example': true
			}),
			matches('https://api.trusted.example/schemas/../private/schema.json', { 'https://api.trusted.example/schemas/': true }),
			matches('https://api.trusted.example/schemas%255C..%255Cprivate/schema.json', { 'https://api.trusted.example/schemas/': true }),
		], [true, true, false, false, false]);
	});

	test('controls: ordinary domains, ports, paths, schemes and ordered denials', () => {
		const domains = {
			'https://*.trusted.example/private/': false,
			'https://*.trusted.example/schemas/': true,
			'https://api.trusted.example:8443/schemas/': true
		};
		assert.deepStrictEqual([
			matches('https://trusted.example/schemas/schema.json', domains),
			matches('https://api.trusted.example/schemas/schema.json', domains),
			matches('https://api.trusted.example:8443/schemas/schema.json', domains),
			matches('https://api.trusted.example:8444/schemas/schema.json', domains),
			matches('http://api.trusted.example/schemas/schema.json', domains),
			matches('https://api.trusted.example/schemas-other/schema.json', domains),
			matches('https://api.trusted.example/private/schema.json', domains),
			matches('https://api.trusted.example/schema.json', { 'https://*.trusted.example': false, '*': true }),
			matches('https://api.trusted.example/schema.json', { '*': false }),
			matches('https://api.trusted.example:443/schemas/schema.json', { 'https://api.trusted.example:443/schemas/': true }),
			matches('file:///schemas/schema.json', { 'file:///schemas/': true })
		], [true, true, true, false, false, false, false, false, false, true, true]);
	});
});

for (const transport of ['browser', 'node'] as const) {
	suite(`JSON schema ${transport} request dispatch`, () => {
		async function withClient(options: RequestOptions, run: (client: Awaited<ReturnType<typeof createSchemaClient>>) => Promise<void>) {
			const client = await createSchemaClient(transport, options);
			try {
				await run(client);
			} finally {
				await client.dispose();
			}
		}

		test('regression: a suffix-only allowance dispatches zero requests', async () => {
			await withClient({ trustedDomains: { 'https://*.trusted.example': true } }, async client => {
				const result = await client.request(disguisedHost).then(() => undefined, error => error.code);
				assert.deepStrictEqual({ error: result, requests: client.requests }, { error: 2, requests: [] });
			});
		});

		test('regression: a scoped destination denial dispatches zero requests', async () => {
			await withClient({ trustedDomains: { 'https://attacker.example': false, '*': true } }, async client => {
				const result = await client.request(disguisedHost).then(() => undefined, error => error.code);
				assert.deepStrictEqual({ error: result, requests: client.requests }, { error: 2, requests: [] });
			});
		});

		for (const separator of encodedSeparators) {
			test(`regression: ${separator} cannot enter an allowed path by decoding again`, async () => {
				await withClient({ trustedDomains: { 'https://api.trusted.example/schemas/': true } }, async client => {
					const url = `https://api.trusted.example/schemas${separator}..${separator}private/schema.json`;
					const error = await client.request(url).then(() => undefined, error => error.code);
					assert.deepStrictEqual({ error, requests: client.requests }, { error: 2, requests: [] });
				});
			});
		}

		test('regression: the checked and fetched canonical destinations are identical', async () => {
			await withClient({ trustedDomains: { 'https://*.trusted.example/schemas/': true } }, async client => {
				await client.request('https://api.trusted.example/schemas/../schemas/schema%20name.json');
				const url = 'https://api.trusted.example/schemas/schema%20name.json';
				assert.deepStrictEqual({
					checked: client.checked,
					requests: client.requests
				}, {
					checked: [{ url, allowed: true }],
					requests: [{ url, host: 'api.trusted.example', path: '/schemas/schema%20name.json' }]
				});
			});
		});

		for (const association of ['configured', 'extension-contributed'] as const) {
			test(`regression: ${association} schema allowances use the same canonical destination`, async () => {
				const input = 'https://configured.example:443/schemas/../schemas/schema name.json';
				const options: RequestOptions = association === 'configured'
					? { trustedDomains: {}, schemas: [{ url: input }] }
					: { trustedDomains: {}, extensionSchemas: [input] };
				await withClient(options, async client => {
					await client.request(input);
					const url = 'https://configured.example/schemas/schema%20name.json';
					assert.deepStrictEqual({
						checked: client.checked,
						requests: client.requests
					}, {
						checked: [{ url, allowed: false }],
						requests: [{ url, host: 'configured.example', path: '/schemas/schema%20name.json' }]
					});
				});
			});
		}

		test('controls: ordinary allowed schemas keep explicit ports and paths', async () => {
			await withClient({ trustedDomains: { 'https://api.trusted.example:8443/schemas/': true } }, async client => {
				const url = 'https://api.trusted.example:8443/schemas/schema.json';
				const content = await client.request(url);
				assert.deepStrictEqual({
					content,
					checked: client.checked,
					requests: client.requests
				}, {
					content: '{"type":"object"}',
					checked: [{ url, allowed: true }],
					requests: [{ url, host: 'api.trusted.example:8443', path: '/schemas/schema.json' }]
				});
			});
		});

		test('controls: configured and extension-contributed schemas remain allowed', async () => {
			const configured = 'https://configured.example/schema.json';
			const contributed = 'https://contributed.example/schema.json';
			await withClient({ trustedDomains: {}, schemas: [{ url: configured }], extensionSchemas: [contributed] }, async client => {
				await client.request(configured);
				await client.request(contributed);
				assert.deepStrictEqual(client.requests.map(request => request.url), [configured, contributed]);
			});
		});

		test('controls: ordinary scoped denials dispatch zero requests', async () => {
			await withClient({ trustedDomains: { 'https://*.trusted.example/private/': false, '*': true } }, async client => {
				const result = await client.request('https://api.trusted.example/private/schema.json').then(() => undefined, error => error.code);
				assert.deepStrictEqual({ error: result, requests: client.requests }, { error: 2, requests: [] });
			});
		});

		test('controls: disabled downloads dispatch zero requests before trust checks', async () => {
			await withClient({ trustedDomains: { '*': true }, downloadEnabled: false }, async client => {
				const result = await client.request(disguisedHost).then(() => undefined, error => error.code);
				assert.deepStrictEqual({ error: result, checked: client.checked, requests: client.requests }, { error: 4, checked: [], requests: [] });
			});
		});

		test('controls: untrusted workspaces dispatch zero requests before domain checks', async () => {
			await withClient({ trustedDomains: { '*': true }, workspaceTrusted: false }, async client => {
				const result = await client.request(disguisedHost).then(() => undefined, error => error.code);
				assert.deepStrictEqual({ error: result, checked: client.checked, requests: client.requests }, { error: 1, checked: [], requests: [] });
			});
		});

		test('controls: non-network resources retain their existing handlers', async () => {
			await withClient({ trustedDomains: {}, downloadEnabled: false, workspaceTrusted: false }, async client => {
				const document = 'file:///schemas/schema.json';
				const resource = 'vscode://schemas/schema.json';
				const contents = [await client.request(document), await client.request(resource)];
				const untitledError = await client.request('untitled:Untitled-1').then(() => undefined, error => error.code);
				assert.deepStrictEqual({
					contents,
					untitledError,
					documents: client.documents,
					files: client.files,
					requests: client.requests,
					checked: client.checked
				}, {
					contents: ['{"type":"object"}', '{"type":"object"}'],
					untitledError: 7,
					documents: [document],
					files: [resource],
					requests: [],
					checked: []
				});
			});
		});
	});
}

suite('JSON schema cache invalidation', () => {
	test('regression: cache clearing invalidates every original schema ID sharing a canonical URL', async () => {
		let version = 1;
		const canonical = 'https://json.schemastore.org/package.json';
		const aliases = ['https://json.schemastore.org:443/package.json', 'https://json.schemastore.org/folder/../package.json'];
		const client = await createSchemaClient('node', {
			trustedDomains: { 'https://json.schemastore.org': true },
			cache: true,
			schemaResponse: () => ({ content: JSON.stringify({ title: `schema-${version}` }), etag: `etag-${version}` })
		});
		try {
			const initial = await client.request(aliases[0]);
			version = 2;
			const cachedAlias = await client.request(aliases[1]);
			const cachedCanonical = await client.request(canonical);
			const requestsBeforeClear = client.requests.length;
			await client.clearCache();
			const refreshed = await client.request(aliases[0]);

			assert.deepStrictEqual({
				contents: [initial, cachedAlias, cachedCanonical, refreshed].map(content => JSON.parse(content).title),
				requestsBeforeClear,
				requestUrls: client.requests.map(request => request.url),
				invalidated: client.schemaNotifications,
			}, {
				contents: ['schema-1', 'schema-1', 'schema-1', 'schema-2'],
				requestsBeforeClear: 1,
				requestUrls: [canonical, canonical],
				invalidated: [[canonical, ...aliases]],
			});
		} finally {
			await client.dispose();
		}
	});

	test('regression: cache clearing discards aliases for responses without ETags', async () => {
		let cacheResponses = false;
		const canonical = 'https://json.schemastore.org/package.json';
		const aliases = ['https://json.schemastore.org:443/package.json', 'https://json.schemastore.org/folder/../package.json'];
		const client = await createSchemaClient('node', {
			trustedDomains: { 'https://json.schemastore.org': true },
			cache: true,
			schemaResponse: () => ({ content: '{"type":"object"}', etag: cacheResponses ? 'cached-etag' : undefined })
		});
		try {
			for (const alias of aliases) {
				await client.request(alias);
			}
			await client.clearCache();
			cacheResponses = true;
			await client.request(canonical);
			await client.clearCache();

			assert.deepStrictEqual({
				requestUrls: client.requests.map(request => request.url),
				invalidated: client.schemaNotifications,
			}, {
				requestUrls: [canonical, canonical, canonical],
				invalidated: [[], [canonical]],
			});
		} finally {
			await client.dispose();
		}
	});

	test('controls: cache clearing preserves aliases refreshed while the cache is being cleared', async () => {
		let cacheResponses = false;
		const canonical = 'https://json.schemastore.org/package.json';
		const alias = 'https://json.schemastore.org:443/package.json';
		const client = await createSchemaClient('node', {
			trustedDomains: { 'https://json.schemastore.org': true },
			cache: true,
			schemaResponse: () => ({ content: '{"type":"object"}', etag: cacheResponses ? 'cached-etag' : undefined }),
			onCacheUpdate: async () => {
				if (!cacheResponses) {
					cacheResponses = true;
					await client.request(alias);
				}
			}
		});
		try {
			await client.request(alias);
			await client.clearCache();
			await client.clearCache();

			assert.deepStrictEqual({
				requestUrls: client.requests.map(request => request.url),
				invalidated: client.schemaNotifications,
			}, {
				requestUrls: [canonical, canonical],
				invalidated: [[], [canonical, alias]],
			});
		} finally {
			await client.dispose();
		}
	});

	test('controls: clearing a canonical cache entry preserves its schema ID', async () => {
		const canonical = 'https://json.schemastore.org/package.json';
		const client = await createSchemaClient('node', {
			trustedDomains: { 'https://json.schemastore.org': true },
			cache: true,
			schemaResponse: () => ({ content: '{"type":"object"}', etag: 'canonical-etag' })
		});
		try {
			await client.request(canonical);
			await client.clearCache();
			assert.deepStrictEqual(client.schemaNotifications, [[canonical]]);
		} finally {
			await client.dispose();
		}
	});
});
