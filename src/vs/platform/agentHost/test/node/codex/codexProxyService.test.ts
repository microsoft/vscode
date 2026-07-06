/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import {
	type ICopilotApiService,
	type ICopilotApiServiceRequestOptions,
} from '../../../node/shared/copilotApiService.js';
import { CodexProxyService } from '../../../node/codex/codexProxyService.js';

// #region Test fakes

interface IResponsesCall {
	githubToken: string;
	body: string;
	options: ICopilotApiServiceRequestOptions | undefined;
}

class FakeCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	async resolveRestrictedTelemetryContext() { return { restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined }; }
	async resolveApiEndpoint() { return undefined; }

	readonly responsesCalls: IResponsesCall[] = [];

	messages(): never {
		throw new Error('messages not used by Codex proxy tests');
	}

	async countTokens(): Promise<never> {
		throw new Error('countTokens not used by Codex proxy tests');
	}

	async models(): Promise<never> {
		throw new Error('models not used by Codex proxy tests');
	}

	async responses(githubToken: string, body: string, options?: ICopilotApiServiceRequestOptions): Promise<Response> {
		this.responsesCalls.push({ githubToken, body, options });
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('event: response.completed\ndata: {}\n\n'));
				controller.close();
			},
		});
		return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
	}

	async utilityChatCompletion(): Promise<never> {
		throw new Error('utilityChatCompletion not used by Codex proxy tests');
	}
}

// #endregion

// #region HTTP helpers

let _httpModule: typeof http | undefined;
async function getHttp(): Promise<typeof http> {
	if (!_httpModule) {
		_httpModule = await import('http');
	}
	return _httpModule;
}

function postResponses(url: string, init: { headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }> {
	return getHttp().then(httpMod => new Promise((resolve, reject) => {
		const u = new URL(url);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: 'POST',
			headers: init.headers,
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
			res.on('error', reject);
		});
		req.on('error', reject);
		if (init.body !== undefined) {
			req.write(init.body);
		}
		req.end();
	}));
}

// #endregion

const TOKEN = 'gh-test-token';

suite('CodexProxyService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	async function withProxy(fn: (handle: { baseUrl: string; nonce: string }, fake: FakeCopilotApiService) => Promise<void>): Promise<void> {
		const fake = new FakeCopilotApiService();
		const service = new CodexProxyService(new NullLogService(), fake);
		const handle = await service.start(TOKEN);
		try {
			await fn(handle, fake);
		} finally {
			handle.dispose();
			service.dispose();
		}
	}

	test('forwards transformed user-agent to CAPI responses', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'codex/1.2.3' },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.['User-Agent'], 'vscode_codex/1.2.3');
		});
	});

	test('keeps the suffix when transforming a multi-segment user-agent', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}`, 'User-Agent': 'OpenAI/Python/1.0' },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.['User-Agent'], 'vscode_codex/Python/1.0');
		});
	});

	test('omits User-Agent when the inbound request has none', async () => {
		await withProxy(async (handle, fake) => {
			await postResponses(`${handle.baseUrl}/v1/responses`, {
				headers: { 'Authorization': `Bearer ${handle.nonce}` },
				body: JSON.stringify({ model: 'gpt-5', stream: true, input: [] }),
			});
			assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.['User-Agent'], undefined);
		});
	});
});
