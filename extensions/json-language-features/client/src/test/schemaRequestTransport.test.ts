/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'mocha';
import { createSchemaClient, RequestOptions } from './schemaRequestTestUtils';
import { connectionBlocked, createNativeSchemaTransport } from './schemaRequestTransportTestUtils';

type SchemaClient = Awaited<ReturnType<typeof createSchemaClient>>;
type NativeTransport = ReturnType<typeof createNativeSchemaTransport>;

const punctuationHosts = [
	{ name: 'literal semicolon', punctuation: ';', canonical: ';' },
	{ name: 'encoded semicolon', punctuation: '%3B', canonical: ';' },
	{ name: 'literal backtick', punctuation: '`', canonical: '`' },
	{ name: 'encoded backtick', punctuation: '%60', canonical: '`' },
	{ name: 'literal opening brace', punctuation: '{', canonical: '{' },
	{ name: 'encoded opening brace', punctuation: '%7B', canonical: '{' },
	{ name: 'literal closing brace', punctuation: '}', canonical: '}' },
	{ name: 'encoded closing brace', punctuation: '%7D', canonical: '}' }
];

async function withNativeClient(options: RequestOptions, run: (client: SchemaClient, transport: NativeTransport) => Promise<void>) {
	const transport = createNativeSchemaTransport();
	try {
		const client = await createSchemaClient('node', options, { 'request-light': transport.requestLight });
		try {
			await run(client, transport);
		} finally {
			await client.dispose();
		}
	} finally {
		transport.dispose();
	}
}

async function assertBlocked(client: SchemaClient, transport: NativeTransport, input: string, checked: { url: string; allowed: boolean }[], code = 5) {
	const error = await client.request(input).then(() => undefined, error => ({ code: error.code, message: error.message }));
	assert.deepStrictEqual({
		code: error?.code,
		hasMessage: typeof error?.message === 'string' && error.message.length > 0,
		checked: client.checked,
		calls: transport.calls,
		requests: transport.requests,
		destinations: transport.destinations
	}, {
		code,
		hasMessage: true,
		checked,
		calls: [],
		requests: [],
		destinations: []
	});
}

suite('JSON schema desktop native transport agreement', () => {
	for (const { name, punctuation, canonical } of punctuationHosts) {
		test(`regression: rejects ${name} host before native dispatch`, async () => {
			await withNativeClient({ trustedDomains: { 'https://*.trusted.example': true } }, async (client, transport) => {
				await assertBlocked(client, transport, `https://attacker.example${punctuation}.trusted.example/schema.json`, [
					{ url: `https://attacker.example${canonical}.trusted.example/schema.json`, allowed: true }
				]);
			});
		});
	}

	test('regression: HTTP also rejects a host changed by request-light', async () => {
		const url = 'http://attacker.example;.trusted.example/schema.json';
		await withNativeClient({ trustedDomains: { 'http://*.trusted.example': true } }, async (client, transport) => {
			await assertBlocked(client, transport, url, [{ url, allowed: true }]);
		});
	});

	test('regression: a native destination denial cannot be bypassed by a broader allowance', async () => {
		const url = 'https://attacker.example;.trusted.example/schema.json';
		await withNativeClient({ trustedDomains: { 'https://attacker.example': false, '*': true } }, async (client, transport) => {
			await assertBlocked(client, transport, url, [{ url, allowed: true }]);
		});
	});

	test('regression: an implicit localhost allowance cannot select a different native host', async () => {
		const url = 'https://attacker.example;.localhost/schema.json';
		await withNativeClient({ trustedDomains: {} }, async (client, transport) => {
			await assertBlocked(client, transport, url, [{ url, allowed: true }]);
		});
	});

	for (const association of ['configured', 'extension-contributed'] as const) {
		test(`regression: ${association} schema allowances cannot select a different native host`, async () => {
			const input = 'https://attacker.example%3B.trusted.example/schema.json';
			const options: RequestOptions = association === 'configured'
				? { trustedDomains: {}, schemas: [{ url: input }] }
				: { trustedDomains: {}, extensionSchemas: [input] };
			await withNativeClient(options, async (client, transport) => {
				await assertBlocked(client, transport, input, [
					{ url: 'https://attacker.example;.trusted.example/schema.json', allowed: false }
				]);
			});
		});
	}

	for (const protocol of ['http:', 'https:'] as const) {
		test(`regression: ${protocol} port zero cannot select the native default port`, async () => {
			const url = `${protocol}//api.trusted.example:0/schema.json`;
			await withNativeClient({ trustedDomains: { [`${protocol}//api.trusted.example:0`]: true } }, async (client, transport) => {
				await assertBlocked(client, transport, url, [{ url, allowed: true }]);
			});
		});
	}

	for (const { name, suffix } of [
		{ name: 'path apostrophe', suffix: '/schema\'name.json' },
		{ name: 'query backtick', suffix: '/schema.json?value=`' },
		{ name: 'query braces', suffix: '/schema.json?value={}' }
	]) {
		test(`regression: rejects a ${name} changed by request-light`, async () => {
			const url = `https://api.trusted.example${suffix}`;
			await withNativeClient({ trustedDomains: { 'https://api.trusted.example': true } }, async (client, transport) => {
				await assertBlocked(client, transport, url, [{ url, allowed: true }]);
			});
		});
	}

	for (const { name, input, url, hostname, port, path } of [
		{ name: 'ordinary HTTPS', input: 'https://api.trusted.example/schema.json', url: 'https://api.trusted.example/schema.json', hostname: 'api.trusted.example', port: 443, path: '/schema.json' },
		{ name: 'HTTPS default port', input: 'https://API.trusted.example:443/schema.json', url: 'https://api.trusted.example/schema.json', hostname: 'api.trusted.example', port: 443, path: '/schema.json' },
		{ name: 'HTTP default port', input: 'http://api.trusted.example:80/schema.json', url: 'http://api.trusted.example/schema.json', hostname: 'api.trusted.example', port: 80, path: '/schema.json' },
		{ name: 'nondefault port and query', input: 'https://api.trusted.example:8443/schema.json?q=1', url: 'https://api.trusted.example:8443/schema.json?q=1', hostname: 'api.trusted.example', port: 8443, path: '/schema.json?q=1' },
		{ name: 'IPv6 default port', input: 'https://[2001:db8::1]:443/schema.json', url: 'https://[2001:db8::1]/schema.json', hostname: '2001:db8::1', port: 443, path: '/schema.json' },
		{ name: 'IPv6 nondefault port', input: 'https://[2001:db8::1]:8443/schema.json?q=1', url: 'https://[2001:db8::1]:8443/schema.json?q=1', hostname: '2001:db8::1', port: 8443, path: '/schema.json?q=1' },
		{ name: 'IPv6 localhost', input: 'http://[::1]:80/schema.json', url: 'http://[::1]/schema.json', hostname: '::1', port: 80, path: '/schema.json' },
		{ name: 'encoded space, dot segments and fragment', input: 'https://api.trusted.example/schemas/../schemas/schema%20name.json?q=1#definition', url: 'https://api.trusted.example/schemas/schema%20name.json?q=1#definition', hostname: 'api.trusted.example', port: 443, path: '/schemas/schema%20name.json?q=1' },
		{ name: 'punctuation in a path rather than a host', input: 'https://api.trusted.example/schema;.json', url: 'https://api.trusted.example/schema;.json', hostname: 'api.trusted.example', port: 443, path: '/schema;.json' },
		{ name: 'empty query', input: 'https://api.trusted.example/schema.json?', url: 'https://api.trusted.example/schema.json', hostname: 'api.trusted.example', port: 443, path: '/schema.json' }
	]) {
		test(`controls: ${name} reaches the approved native destination`, async () => {
			await withNativeClient({ trustedDomains: { [new URL(url).origin]: true } }, async (client, transport) => {
				const error = await client.request(input).then(() => undefined, error => ({ code: error.code, message: error.message }));
				assert.deepStrictEqual({
					code: error?.code,
					stoppedBeforeSocket: error?.message.includes(connectionBlocked),
					checked: client.checked,
					requests: transport.requests,
					destinations: transport.destinations
				}, {
					code: 5,
					stoppedBeforeSocket: true,
					checked: [{ url, allowed: true }],
					requests: [{ protocol: new URL(url).protocol, hostname, port, path, method: 'GET', rejectUnauthorized: true }],
					destinations: [{ protocol: new URL(url).protocol, hostname, host: hostname, port, servername: hostname.includes(':') ? '' : hostname }]
				});
			});
		});
	}

	test('controls: a scoped denial precedes a broader allowance and transport validation', async () => {
		const url = 'https://attacker.example;.trusted.example/private/schema.json';
		await withNativeClient({ trustedDomains: { 'https://*.trusted.example/private/': false, '*': true } }, async (client, transport) => {
			await assertBlocked(client, transport, url, [{ url, allowed: false }], 2);
		});
	});

	test('controls: ordinary domain and path denials make no native requests', async () => {
		for (const url of ['https://denied.example/schema.json', 'https://api.trusted.example/private/schema.json']) {
			await withNativeClient({ trustedDomains: { 'https://denied.example': false, 'https://*.trusted.example/private/': false, '*': true } }, async (client, transport) => {
				await assertBlocked(client, transport, url, [{ url, allowed: false }], 2);
			});
		}
	});

	test('controls: an earlier allowance retains its order before a later denial', async () => {
		const url = 'https://api.trusted.example/schema.json';
		await withNativeClient({ trustedDomains: { 'https://api.trusted.example': true, '*': false } }, async (client, transport) => {
			await assert.rejects(client.request(url), { code: 5 });
			assert.deepStrictEqual({
				checked: client.checked,
				hostnames: transport.destinations.map(destination => destination.hostname)
			}, { checked: [{ url, allowed: true }], hostnames: ['api.trusted.example'] });
		});
	});

	test('controls: configured and contributed ordinary schemas retain native dispatch', async () => {
		const configured = 'https://configured.example:443/schema.json';
		const contributed = 'https://contributed.example/schema.json';
		await withNativeClient({ trustedDomains: {}, schemas: [{ url: configured }], extensionSchemas: [contributed] }, async (client, transport) => {
			await assert.rejects(client.request(configured), { code: 5 });
			await assert.rejects(client.request(contributed), { code: 5 });
			assert.deepStrictEqual({
				checked: client.checked,
				hostnames: transport.destinations.map(destination => destination.hostname)
			}, {
				checked: [{ url: 'https://configured.example/schema.json', allowed: false }, { url: contributed, allowed: false }],
				hostnames: ['configured.example', 'contributed.example']
			});
		});
	});

	test('controls: download and workspace gates run before trust and transport validation', async () => {
		const url = 'https://attacker.example;.trusted.example/schema.json';
		for (const { options, code } of [
			{ options: { trustedDomains: { '*': true }, downloadEnabled: false }, code: 4 },
			{ options: { trustedDomains: { '*': true }, workspaceTrusted: false }, code: 1 }
		]) {
			await withNativeClient(options, async (client, transport) => {
				await assertBlocked(client, transport, url, [], code);
			});
		}
	});

	test('controls: encoded backslash denials remain before the native boundary', async () => {
		const domains: Record<string, boolean>[] = [
			{ 'https://*.trusted.example': true },
			{ 'https://attacker.example': false, '*': true }
		];
		for (const trustedDomains of domains) {
			await withNativeClient({ trustedDomains }, async (client, transport) => {
				await assertBlocked(client, transport, 'https://attacker.example%5Cfake.trusted.example/schema.json', [
					{ url: 'https://attacker.example/fake.trusted.example/schema.json', allowed: false }
				], 2);
			});
		}
	});

	test('controls: non-network resources never reach request-light', async () => {
		await withNativeClient({ trustedDomains: {}, downloadEnabled: false, workspaceTrusted: false }, async (client, transport) => {
			const contents = [
				await client.request('file:///schemas/schema.json'),
				await client.request('vscode://schemas/schema.json')
			];
			assert.deepStrictEqual({ contents, calls: transport.calls, destinations: transport.destinations }, {
				contents: ['{"type":"object"}', '{"type":"object"}'],
				calls: [],
				destinations: []
			});
		});
	});

	test('controls: request-light retains schema headers, TLS configuration and redirect limit', async () => {
		const url = 'https://api.trusted.example/schema.json';
		await withNativeClient({ trustedDomains: { '*': true } }, async (client, transport) => {
			transport.requestLight.configure(undefined, false);
			await assert.rejects(client.request(url), { code: 5 });
			assert.deepStrictEqual({
				calls: transport.calls.map(call => ({ url: call.url, followRedirects: call.followRedirects, headers: { ...call.headers } })),
				tls: transport.requests.map(request => request.rejectUnauthorized)
			}, {
				calls: [{ url, followRedirects: 5, headers: { 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'Schema Tests (node)' } }],
				tls: [false]
			});
		});
	});

	test('controls: native validation rejects an unescaped space before the nonconnecting Agent', () => {
		const transport = createNativeSchemaTransport();
		try {
			assert.throws(() => transport.request('https:', {
				hostname: 'api.trusted.example', port: 443, path: '/invalid space.json', method: 'GET'
			}), { code: 'ERR_UNESCAPED_CHARACTERS' });
			assert.deepStrictEqual(transport.destinations, []);
		} finally {
			transport.dispose();
		}
	});

	test('controls: browser fetch retains WHATWG punctuation hosts without desktop validation', async () => {
		for (const { punctuation, canonical } of punctuationHosts) {
			const client = await createSchemaClient('browser', { trustedDomains: { 'https://*.trusted.example': true } });
			try {
				const content = await client.request(`https://attacker.example${punctuation}.trusted.example/schema.json`);
				const url = `https://attacker.example${canonical}.trusted.example/schema.json`;
				assert.deepStrictEqual({ content, checked: client.checked, requests: client.requests }, {
					content: '{"type":"object"}',
					checked: [{ url, allowed: true }],
					requests: [{ url, host: `attacker.example${canonical}.trusted.example`, path: '/schema.json' }]
				});
			} finally {
				await client.dispose();
			}
		}
	});
});
