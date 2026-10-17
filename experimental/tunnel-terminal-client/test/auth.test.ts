/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAccessToken, type AuthOptions } from '../src/auth.js';

type Dependencies = Required<NonNullable<Parameters<typeof getAccessToken>[1]>>;

const deviceResponse = {
	device_code: 'private-device-code',
	user_code: 'ABCD-EFGH',
	verification_uri: 'https://github.com/login/device',
	expires_in: 900,
	interval: 5
};
const tokenResponse = { access_token: 'private-access-token', token_type: 'bearer', scope: 'read:user' };

function harness(responses: readonly unknown[] = []) {
	let time = 0;
	let responseIndex = 0;
	const logs: string[] = [];
	const waits: number[] = [];
	const requests: { url: string; init: RequestInit | undefined }[] = [];
	const executions: { command: string; args: readonly string[]; options: { signal?: AbortSignal; timeout: number } }[] = [];
	const options: AuthOptions = { provider: 'github', clientId: 'my-own-oauth-app', log: message => logs.push(message) };
	const dependencies: Dependencies = {
		env: {},
		now: () => time,
		requestTimeoutMs: 30_000,
		sleep: async milliseconds => {
			waits.push(milliseconds);
			time += milliseconds;
		},
		fetch: async (input, init) => {
			requests.push({ url: String(input), init });
			assert.ok(responseIndex < responses.length, 'Unexpected HTTP request');
			return Response.json(responses[responseIndex++]);
		},
		execFile: async (command, args, options) => {
			executions.push({ command, args, options });
			return 'private-gh-token\n';
		}
	};
	return { options, dependencies, logs, waits, requests, executions, advance: (milliseconds: number) => { time += milliseconds; } };
}

function assertNoSecrets(messages: readonly string[]): void {
	for (const message of messages) {
		assert.doesNotMatch(message, /private-(?:access-token|device-code|gh-token|env-token)|sensitive-response/);
	}
}

function rejectedSafely(pattern: RegExp): (error: Error) => boolean {
	return error => {
		assert.match(error.message, pattern);
		assertNoSecrets([error.message, error.stack ?? '', JSON.stringify(error)]);
		assert.equal(error.cause, undefined);
		return true;
	};
}

for (const provider of ['github', 'microsoft'] as const) {
	test(`supplied environment token takes precedence for ${provider}`, async () => {
		const h = harness();
		h.options.provider = provider;
		h.dependencies.env = { TUNNEL_ACCESS_TOKEN: '  private-env-token\n' };
		assert.equal(await getAccessToken(h.options, h.dependencies), 'private-env-token');
		assert.deepEqual([h.requests, h.executions, h.waits], [[], [], []]);
		assertNoSecrets(h.logs);
	});
}

for (const token of ['', ' \t\r\n', 'token\nanother-token', 'token\u001b']) {
	test(`rejects invalid environment token ${JSON.stringify(token)} without fallback`, async () => {
		const h = harness();
		h.dependencies.env = { TUNNEL_ACCESS_TOKEN: token };
		await assert.rejects(getAccessToken(h.options, h.dependencies), /TUNNEL_ACCESS_TOKEN must contain/);
		assert.deepEqual([h.requests, h.executions], [[], []]);
	});
}

test('Microsoft without a supplied token explicitly explains the prototype limitation', async () => {
	const h = harness();
	h.options.provider = 'microsoft';
	await assert.rejects(getAccessToken(h.options, h.dependencies), /Microsoft sign-in is not implemented.*TUNNEL_ACCESS_TOKEN.*client ID alone is not supported/);
	assert.deepEqual([h.requests, h.executions], [[], []]);
});

test('GitHub without a client ID calls gh explicitly for github.com', async () => {
	const h = harness();
	delete h.options.clientId;
	assert.equal(await getAccessToken(h.options, h.dependencies), 'private-gh-token');
	assert.deepEqual(h.executions, [{
		command: 'gh',
		args: ['auth', 'token', '--hostname', 'github.com'],
		options: { signal: undefined, timeout: 30_000 }
	}]);
	assert.deepEqual(h.requests, []);
	assertNoSecrets(h.logs);
});

test('gh failure is actionable, sanitized and never falls back to OAuth', async () => {
	const h = harness();
	delete h.options.clientId;
	h.dependencies.execFile = async () => {
		throw new Error('sensitive-response private-gh-token');
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/gh auth login --hostname github.com.*your own GitHub OAuth client ID.*No other credential source was tried/));
	assert.deepEqual(h.requests, []);
	assertNoSecrets(h.logs);
});

for (const output of ['', ' \n', 'private-gh-token\nsensitive-response']) {
	test(`invalid gh output fails explicitly (${JSON.stringify(output)})`, async () => {
		const h = harness();
		delete h.options.clientId;
		h.dependencies.execFile = async () => output;
		await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/GitHub CLI did not return a valid token.*gh auth login/));
		assert.deepEqual(h.requests, []);
	});
}

test('an explicitly empty OAuth client ID does not silently select gh', async () => {
	const h = harness();
	h.options.clientId = ' \t';
	await assert.rejects(getAccessToken(h.options, h.dependencies), /non-empty client ID/);
	assert.deepEqual([h.requests, h.executions], [[], []]);
});

test('device flow requests read:user for the supplied client, waits, and polls through pending', async () => {
	const h = harness([deviceResponse, { error: 'authorization_pending' }, tokenResponse]);
	assert.equal(await getAccessToken(h.options, h.dependencies), 'private-access-token');
	assert.deepEqual({
		waits: h.waits,
		executions: h.executions,
		requests: h.requests.map(({ url, init }) => ({
			url,
			method: init?.method,
			headers: init?.headers,
			redirect: init?.redirect,
			body: Object.fromEntries(new URLSearchParams(String(init?.body))),
			hasSignal: init?.signal instanceof AbortSignal
		}))
	}, {
		waits: [5000, 5000],
		executions: [],
		requests: [
			{
				url: 'https://github.com/login/device/code',
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				redirect: 'error',
				body: { client_id: 'my-own-oauth-app', scope: 'read:user' },
				hasSignal: true
			},
			...Array.from({ length: 2 }, () => ({
				url: 'https://github.com/login/oauth/access_token',
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				redirect: 'error',
				body: { client_id: 'my-own-oauth-app', device_code: 'private-device-code', grant_type: 'urn:ietf:params:oauth:grant-type:device_code' },
				hasSignal: true
			}))
		]
	});
	assert.match(h.logs.join('\n'), /https:\/\/github.com\/login\/device.*ABCD-EFGH/);
	assertNoSecrets(h.logs);
});

test('slow_down adds five seconds permanently and honors a longer server interval', async () => {
	const h = harness([
		{ ...deviceResponse, interval: 2 },
		{ error: 'slow_down' },
		{ error: 'authorization_pending' },
		{ error: 'slow_down', interval: 20 },
		{ error: 'slow_down', interval: 1 },
		tokenResponse
	]);
	assert.equal(await getAccessToken(h.options, h.dependencies), 'private-access-token');
	assert.deepEqual(h.waits, [2000, 7000, 7000, 20_000, 25_000]);
});

test('missing initial interval uses the OAuth five-second default', async () => {
	const h = harness([{ ...deviceResponse, interval: undefined }, tokenResponse]);
	assert.equal(await getAccessToken(h.options, h.dependencies), 'private-access-token');
	assert.deepEqual(h.waits, [5000]);
});

for (const [code, message] of [
	['access_denied', /authorization was denied/],
	['expired_token', /authorization expired/],
	['token_expired', /authorization expired/],
	['device_flow_disabled', /Enable device flow in your own GitHub OAuth app/],
	['incorrect_client_credentials', /rejected the OAuth client ID/],
	['incorrect_device_code', /rejected the device authorization/],
	['unsupported_grant_type', /device authorization failed/],
	['sensitive-response', /device authorization failed/]
] as const) {
	test(`device flow handles ${code} without leaking the response`, async () => {
		const h = harness([deviceResponse, { error: code, error_description: 'sensitive-response private-device-code' }]);
		await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(message));
		assert.deepEqual([h.waits, h.requests.length, h.executions], [[5000], 2, []]);
		assertNoSecrets(h.logs);
	});
}

test('initial device authorization error does not start polling', async () => {
	const h = harness([{ error: 'device_flow_disabled', error_description: 'sensitive-response' }]);
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/Enable device flow/));
	assert.deepEqual(h.waits, []);
});

test('local expiration stops polling even when GitHub keeps returning pending', async () => {
	const h = harness([{ ...deviceResponse, expires_in: 12 }, { error: 'authorization_pending' }, { error: 'authorization_pending' }]);
	await assert.rejects(getAccessToken(h.options, h.dependencies), /authorization expired/);
	assert.deepEqual([h.waits, h.requests.length], [[5000, 5000, 2000], 3]);
});

test('a code expiring before the first interval never sends a token request', async () => {
	const h = harness([{ ...deviceResponse, expires_in: 2 }]);
	await assert.rejects(getAccessToken(h.options, h.dependencies), /authorization expired/);
	assert.deepEqual([h.waits, h.requests.length], [[2000], 1]);
});

test('token responses arriving after local expiration are not accepted', async () => {
	const h = harness([{ ...deviceResponse, expires_in: 6 }, tokenResponse]);
	const fetch = h.dependencies.fetch;
	h.dependencies.fetch = async (input, init) => {
		if (String(input).endsWith('/access_token')) {
			h.advance(1000);
		}
		return fetch(input, init);
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), /authorization expired/);
});

for (const [name, response] of [
	['null', null],
	['array', []],
	['missing fields', {}],
	['empty device code', { ...deviceResponse, device_code: '' }],
	['user code containing terminal escape', { ...deviceResponse, user_code: 'ABCD-EFGH\u001b' }],
	['untrusted verification URL', { ...deviceResponse, verification_uri: 'https://attacker.invalid/sensitive-response' }],
	['insecure verification URL', { ...deviceResponse, verification_uri: 'http://github.com/login/device' }],
	['zero expiry', { ...deviceResponse, expires_in: 0 }],
	['string expiry', { ...deviceResponse, expires_in: '900' }],
	['overflow expiry', { ...deviceResponse, expires_in: 1e20 }],
	['negative interval', { ...deviceResponse, interval: -1 }],
	['zero interval', { ...deviceResponse, interval: 0 }],
	['fractional interval', { ...deviceResponse, interval: 0.5 }]
] as const) {
	test(`rejects malformed device response: ${name}`, async () => {
		const h = harness([response]);
		await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/invalid authentication response/));
		assert.deepEqual([h.waits, h.logs, h.executions], [[], [], []]);
	});
}

for (const [name, response] of [
	['missing result', {}],
	['empty token', { ...tokenResponse, access_token: '' }],
	['whitespace token', { ...tokenResponse, access_token: ' \n' }],
	['token with control character', { ...tokenResponse, access_token: 'private-access-token\u001b' }],
	['wrong token type', { ...tokenResponse, token_type: 'unexpected' }],
	['missing token type', { access_token: 'private-access-token' }],
	['success mixed with error', { ...tokenResponse, error: 'authorization_pending' }],
	['invalid slow_down interval', { error: 'slow_down', interval: 'sensitive-response' }]
] as const) {
	test(`rejects malformed token response: ${name}`, async () => {
		const h = harness([deviceResponse, response]);
		await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/invalid authentication response/));
		assertNoSecrets(h.logs);
	});
}

test('malformed JSON is sanitized', async () => {
	const h = harness();
	h.dependencies.fetch = async () => new Response('sensitive-response private-device-code', { status: 200 });
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/invalid authentication response/));
});

test('HTTP errors do not expose response bodies', async () => {
	const h = harness();
	h.dependencies.fetch = async () => new Response('sensitive-response private-access-token', { status: 503 });
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/HTTP 503/));
});

test('network errors do not expose their original error or try gh', async () => {
	const h = harness();
	h.dependencies.fetch = async () => { throw new Error('sensitive-response private-device-code'); };
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/Could not contact GitHub/));
	assert.deepEqual(h.executions, []);
});

test('HTTPS requests time out and abort the underlying fetch', async () => {
	const h = harness();
	h.dependencies.requestTimeoutMs = 5;
	let requestSignal: AbortSignal | undefined;
	h.dependencies.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
		requestSignal = init?.signal ?? undefined;
		assert.ok(requestSignal);
		requestSignal.addEventListener('abort', () => reject(new Error('sensitive-response private-device-code')), { once: true });
	});
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/request timed out/));
	assert.equal(requestSignal?.aborted, true);
});

test('response body reads are covered by the request timeout', async () => {
	const h = harness();
	h.dependencies.requestTimeoutMs = 5;
	h.dependencies.fetch = async (_input, init) => {
		const signal = init?.signal;
		assert.ok(signal);
		return new Response(new ReadableStream<Uint8Array>({
			start: controller => {
				signal.addEventListener('abort', () => controller.error(new Error('sensitive-response')), { once: true });
			}
		}));
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/request timed out/));
});

test('local expiration aborts an in-flight token request before the request timeout', async () => {
	const h = harness([{ ...deviceResponse, expires_in: 6 }]);
	const fetch = h.dependencies.fetch;
	h.dependencies.sleep = async milliseconds => h.advance(milliseconds + 999);
	h.dependencies.fetch = async (input, init) => {
		if (!String(input).endsWith('/access_token')) {
			return fetch(input, init);
		}
		return new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			assert.ok(signal);
			signal.addEventListener('abort', () => reject(new Error('sensitive-response private-device-code')), { once: true });
		});
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/authorization expired/));
});

test('polling request timeout fails explicitly rather than silently retrying', async () => {
	const h = harness([deviceResponse]);
	const fetch = h.dependencies.fetch;
	h.dependencies.requestTimeoutMs = 5;
	h.dependencies.fetch = async (input, init) => {
		if (!String(input).endsWith('/access_token')) {
			return fetch(input, init);
		}
		return new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			assert.ok(signal);
			signal.addEventListener('abort', () => reject(new Error('sensitive-response private-device-code')), { once: true });
		});
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/request timed out/));
	assert.deepEqual(h.waits, [5000]);
});

test('already-aborted requests do not read even supplied credentials', async () => {
	const h = harness();
	h.options.signal = AbortSignal.abort('sensitive-response');
	h.dependencies.env = { TUNNEL_ACCESS_TOKEN: 'private-env-token' };
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/cancelled/));
	assert.deepEqual([h.requests, h.executions, h.logs], [[], [], []]);
});

test('abort interrupts fetch and sanitizes the caller-provided abort reason', async () => {
	const h = harness();
	const controller = new AbortController();
	h.options.signal = controller.signal;
	h.dependencies.fetch = async (_input, init) => {
		assert.ok(init?.signal);
		controller.abort('sensitive-response private-device-code');
		assert.equal(init.signal.aborted, true);
		throw new Error('sensitive-response');
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), error => {
		assert.ok(error instanceof Error);
		assert.equal(error.name, 'AbortError');
		return rejectedSafely(/cancelled/)(error);
	});
});

test('abort while polling never sends another request', async () => {
	const h = harness([deviceResponse]);
	const controller = new AbortController();
	h.options.signal = controller.signal;
	h.dependencies.sleep = async (_milliseconds, signal) => {
		assert.equal(signal, controller.signal);
		controller.abort('sensitive-response');
		throw new Error('sensitive-response');
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/cancelled/));
	assert.equal(h.requests.length, 1);
});

test('abort is preserved when gh rejects', async () => {
	const h = harness();
	delete h.options.clientId;
	const controller = new AbortController();
	h.options.signal = controller.signal;
	h.dependencies.execFile = async (_command, _args, options) => {
		assert.equal(options.signal, controller.signal);
		controller.abort('sensitive-response');
		throw new Error('private-gh-token');
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/cancelled/));
});

test('a gh result returned after cancellation is not accepted', async () => {
	const h = harness();
	delete h.options.clientId;
	const controller = new AbortController();
	h.options.signal = controller.signal;
	h.dependencies.execFile = async () => {
		controller.abort();
		return 'private-gh-token';
	};
	await assert.rejects(getAccessToken(h.options, h.dependencies), rejectedSafely(/cancelled/));
});
