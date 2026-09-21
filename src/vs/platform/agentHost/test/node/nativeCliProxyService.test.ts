/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CCAModel } from '@vscode/copilot-api';
import { promises as fs } from 'fs';
import { Event, Emitter } from '../../../../base/common/event.js';
import { isWindows } from '../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { deriveGitHubEndpoints, gitHubCopilotResource } from '../../common/githubEndpoints.js';
import { INativeCliProxyConfiguration } from '../../common/nativeCliProxy.js';
import { IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { NativeCliProxyService } from '../../node/nativeCliProxyService.js';
import { ICopilotApiService } from '../../node/shared/copilotApiService.js';

suite('NativeCliProxyService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const firstId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
	const secondId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
	const models = [
		{ id: 'claude-sonnet-4.6', name: 'Claude Sonnet', vendor: 'Anthropic', model_picker_enabled: true, supported_endpoints: ['/v1/messages'] },
		{ id: 'gpt-5.4', name: 'GPT', vendor: 'OpenAI', model_picker_enabled: true, supported_endpoints: ['/responses'] },
		{ id: 'disabled', name: 'Disabled', vendor: 'OpenAI', model_picker_enabled: true, supported_endpoints: ['/responses'], policy: { state: 'disabled', terms: '' } },
		{ id: 'non-openai', name: 'Other', vendor: 'Other', model_picker_enabled: true, supported_endpoints: ['/responses'] },
	].map(model => upcastPartial<CCAModel>(model));

	function create() {
		let token: string | undefined = 'upstream-account-token';
		const tokensChanged = store.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		const auth = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = tokensChanged.event;
			override getAuthToken() { return token; }
		}();
		const endpoints = new class extends mock<IAgentHostGitHubEndpointService>() {
			override readonly onDidChange = Event.None;
			override getCopilotResource() { return gitHubCopilotResource(deriveGitHubEndpoints(undefined)); }
		}();
		const tokens: string[] = [];
		const api = new class extends mock<ICopilotApiService>() {
			override async models(value: string): Promise<CCAModel[]> {
				tokens.push(value);
				return models;
			}
		}();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(ICopilotApiService, api);
		const service = store.add(new NativeCliProxyService(auth, endpoints, api, instantiation, new NullLogService()));
		return { service, tokens, setToken: (value: string | undefined) => {
			token = value;
			tokensChanged.fire({ resource: 'https://api.github.com', scopes: ['read:user', 'user:email'], token });
		} };
	}

	async function request(configuration: INativeCliProxyConfiguration, token = configuration.token): Promise<number> {
		const http = await import('http');
		return new Promise((resolve, reject) => {
			const req = http.get(`${configuration.baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${token}` } }, response => {
				response.resume();
				response.on('end', () => resolve(response.statusCode!));
			});
			req.on('error', reject);
		});
	}

	test('only offers eligible vendor models from the authenticated Copilot catalog', async () => {
		const { service } = create();
		assert.deepStrictEqual({
			claude: await service.getNativeCliModels('claude'),
			codex: await service.getNativeCliModels('codex'),
		}, { claude: [{ id: 'claude-sonnet-4.6', name: 'Claude Sonnet' }], codex: [{ id: 'gpt-5.4', name: 'GPT' }] });
	});

	test('chooses an eligible default for Claude and Codex when no model was preselected', async () => {
		const { service } = create();
		const claude = await service.startNativeCliProxy(firstId, 'claude');
		const codex = await service.startNativeCliProxy(secondId, 'codex');
		assert.deepStrictEqual({
			claude: { model: claude.model, models: claude.models },
			codex: { model: codex.model, models: codex.models },
		}, {
			claude: { model: 'claude-sonnet-4-6', models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet' }] },
			codex: { model: 'gpt-5.4', models: [{ id: 'gpt-5.4', name: 'GPT' }] },
		});
	});

	test('uses isolated loopback capabilities, never sends the upstream token to a CLI', async () => {
		const { service } = create();
		const first = await service.startNativeCliProxy(firstId, 'codex', 'gpt-5.4');
		const second = await service.startNativeCliProxy(secondId, 'codex', 'gpt-5.4');
		assert.deepStrictEqual({
			first: await request(first),
			second: await request(second),
			crossSession: await request(second, first.token),
			upstream: JSON.stringify(first).includes('upstream-account-token'),
			reconnected: await service.retainNativeCliProxy(firstId, first.leaseId),
			wrongLease: await service.retainNativeCliProxy(firstId, second.leaseId),
		}, { first: 200, second: 200, crossSession: 401, upstream: false, reconnected: true, wrongLease: false });
		await service.releaseNativeCliProxy(firstId, first.leaseId);
		await assert.rejects(request(first));
		assert.strictEqual(await request(second), 200);
	});

	test('Claude settings are private and contain only the local proxy credential', async () => {
		const { service } = create();
		const configuration = await service.startNativeCliProxy(firstId, 'claude', 'claude-sonnet-4.6');
		assert.ok(configuration.settingsFile);
		const contents = await fs.readFile(configuration.settingsFile, 'utf8');
		const settings = JSON.parse(contents);
		assert.deepStrictEqual({
			model: configuration.model,
			baseUrl: settings.env.ANTHROPIC_BASE_URL,
			credential: settings.env.ANTHROPIC_AUTH_TOKEN === configuration.token,
			upstreamCredential: contents.includes('upstream-account-token'),
			private: isWindows || ((await fs.stat(configuration.settingsFile)).mode & 0o077) === 0,
			status: await request(configuration),
		}, { model: 'claude-sonnet-4-6', baseUrl: configuration.baseUrl, credential: true, upstreamCredential: false, private: true, status: 200 });
	});

	test('rotates upstream credentials and revokes proxy access after sign out', async () => {
		const { service, setToken, tokens } = create();
		const configuration = await service.startNativeCliProxy(firstId, 'claude', 'claude-sonnet-4.6');
		setToken('rotated-account-token');
		await request(configuration);
		assert.strictEqual(tokens.at(-1), 'rotated-account-token');
		setToken(undefined);
		assert.strictEqual(await service.retainNativeCliProxy(firstId, configuration.leaseId), false);
		await assert.rejects(request(configuration));
		await assert.rejects(service.startNativeCliProxy(firstId, 'codex', 'gpt-5.4'), /Sign in/);
	});

	test('invalid or unavailable models cannot create a proxy', async () => {
		const { service } = create();
		await assert.rejects(service.startNativeCliProxy('invalid', 'claude', 'claude-sonnet-4.6'), /Invalid/);
		await assert.rejects(service.startNativeCliProxy(firstId, 'codex', 'disabled'), /not available/);
		await assert.rejects(service.startNativeCliProxy(firstId, 'claude', 'gpt-5.4'), /not available/);
	});
});
