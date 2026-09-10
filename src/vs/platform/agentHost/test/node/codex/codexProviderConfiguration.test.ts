/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { resolve } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { type ClientRequestMethod, type ClientRequestParams, type ICodexAppServerClient, JsonRpcError } from '../../../node/codex/codexAppServerClient.js';
import { createCodexProviderConfiguration, ensurePortableCodexProxyProvider } from '../../../node/codex/codexProviderConfiguration.js';
import type { JsonValue } from '../../../node/codex/protocol/generated/serde_json/JsonValue.js';
import type { ConfigBatchWriteParams } from '../../../node/codex/protocol/generated/v2/ConfigBatchWriteParams.js';
import type { ConfigReadResponse } from '../../../node/codex/protocol/generated/v2/ConfigReadResponse.js';

const portableProvider = { name: 'OpenAI', wire_api: 'responses', requires_openai_auth: true };

function userConfiguration(config: JsonValue = {}, version = 'version-1'): ConfigReadResponse {
	return {
		config: {
			model: null,
			review_model: null,
			model_context_window: null,
			model_auto_compact_token_limit: null,
			model_auto_compact_token_limit_scope: null,
			model_provider: null,
			approval_policy: null,
			approvals_reviewer: null,
			sandbox_mode: null,
			sandbox_workspace_write: null,
			forced_chatgpt_workspace_id: null,
			forced_login_method: null,
			web_search: null,
			tools: null,
			instructions: null,
			developer_instructions: null,
			compact_prompt: null,
			model_reasoning_effort: null,
			model_reasoning_summary: null,
			model_verbosity: null,
			service_tier: null,
			analytics: null,
			apps: null,
			desktop: null,
			model_providers: { 'vscode-proxy': { name: 'VS Code Proxy', base_url: 'http://127.0.0.1:1234/v1', env_key: 'OPENAI_API_KEY', requires_openai_auth: false } },
		},
		origins: {},
		layers: [{ name: { type: 'user', file: '/custom-codex/config.toml', profile: null }, config, version, disabledReason: null }],
	};
}

class TestConfigurationClient implements Pick<ICodexAppServerClient, 'request'> {
	readonly writes: ConfigBatchWriteParams[] = [];
	readCount = 0;

	constructor(
		private readonly read: () => ConfigReadResponse,
		private readonly write: (params: ConfigBatchWriteParams) => void = () => { },
	) { }

	async request<M extends ClientRequestMethod, R = unknown>(method: M, params: ClientRequestParams<M>): Promise<R> {
		if (method === 'config/read') {
			assert.deepStrictEqual(params, { includeLayers: true });
			this.readCount++;
			return this.read() as R;
		}
		assert.strictEqual(method, 'config/batchWrite');
		const edit = params as ConfigBatchWriteParams;
		this.writes.push(edit);
		this.write(edit);
		return {} as R;
	}
}

suite('CodexProviderConfiguration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens the default user configuration without CODEX_HOME', () => {
		const registration = createCodexProviderConfiguration(URI.file('/users/test'));
		assert.strictEqual(registration.configurationFile?.resource, URI.file('/users/test/.codex/config.toml').toString());
	});

	test('opens the effective CODEX_HOME configuration', () => {
		const codexHome = URI.file(isWindows ? 'C:\\custom codex' : '/custom codex');
		const registration = createCodexProviderConfiguration(URI.file('/users/test'), codexHome.fsPath);
		assert.strictEqual(registration.configurationFile?.resource, URI.joinPath(codexHome, 'config.toml').toString());
	});

	test('resolves a relative CODEX_HOME against the host working directory', () => {
		const registration = createCodexProviderConfiguration(URI.file('/users/test'), 'custom-codex');
		assert.strictEqual(registration.configurationFile?.resource, URI.file(resolve(process.cwd(), 'custom-codex/config.toml')).toString());
	});

	test('treats an empty CODEX_HOME as the default', () => {
		const registration = createCodexProviderConfiguration(URI.file('/users/test'), '');
		assert.strictEqual(registration.configurationFile?.resource, URI.file('/users/test/.codex/config.toml').toString());
	});

	test('installs only the portable alias without persisting process overrides or changing defaults', async () => {
		const client = new TestConfigurationClient(() => userConfiguration({ personality: 'friendly', model_provider: 'openai' }));
		await ensurePortableCodexProxyProvider(client);
		assert.deepStrictEqual(client.writes, [{
			edits: [{ keyPath: 'model_providers.vscode-proxy', value: portableProvider, mergeStrategy: 'replace' }],
			expectedVersion: 'version-1',
			reloadUserConfig: false,
		}]);
	});

	test('leaves an existing native-auth alias and transport tuning untouched', async () => {
		const client = new TestConfigurationClient(() => userConfiguration({ model_providers: { 'vscode-proxy': { ...portableProvider, supports_websockets: false, request_max_retries: 2 } } }));
		await ensurePortableCodexProxyProvider(client);
		assert.deepStrictEqual(client.writes, []);
	});

	for (const override of [
		{ name: 'Existing provider' },
		{ wire_api: 'chat' },
		{ requires_openai_auth: false },
		{ base_url: 'https://example.com/v1' },
		{ env_key: 'CUSTOM_TOKEN' },
		{ experimental_bearer_token: 'existing-test-token' },
		{ auth: { command: 'custom-auth-helper' } },
		{ http_headers: { Authorization: 'existing-test-token' } },
		{ env_http_headers: { Authorization: 'CUSTOM_TOKEN' } },
		{ query_params: { 'api-version': 'custom' } },
	]) {
		test(`never overwrites an existing alias with incompatible ${Object.keys(override)[0]}`, async () => {
			const client = new TestConfigurationClient(() => userConfiguration({ model_providers: { 'vscode-proxy': { ...portableProvider, ...override } } }));
			await assert.rejects(ensurePortableCodexProxyProvider(client), /already defines an incompatible/);
			assert.deepStrictEqual(client.writes, []);
		});
	}

	test('rereads the user configuration on a version conflict', async () => {
		const client = new TestConfigurationClient(() => userConfiguration({ personality: 'pragmatic' }, `version-${client.readCount}`), () => {
			if (client.writes.length === 1) {
				throw new JsonRpcError(-32600, 'Changed concurrently', { config_write_error_code: 'configVersionConflict' });
			}
		});
		await ensurePortableCodexProxyProvider(client);
		assert.deepStrictEqual(client.writes.map(write => write.expectedVersion), ['version-1', 'version-2']);
	});

	test('preserves an alias installed concurrently by another client', async () => {
		const client = new TestConfigurationClient(() => userConfiguration(client.readCount === 1 ? {} : { model_providers: { 'vscode-proxy': portableProvider } }), () => {
			throw new JsonRpcError(-32600, 'Changed concurrently', { config_write_error_code: 'configVersionConflict' });
		});
		await ensurePortableCodexProxyProvider(client);
		assert.deepStrictEqual({ reads: client.readCount, writes: client.writes.length }, { reads: 2, writes: 1 });
	});

	test('does not overwrite a conflicting alias introduced by a concurrent edit', async () => {
		const client = new TestConfigurationClient(() => userConfiguration(client.readCount === 1 ? {} : { model_providers: { 'vscode-proxy': { name: 'User provider', env_key: 'CUSTOM_TOKEN' } } }), () => {
			throw new JsonRpcError(-32600, 'Changed concurrently', { config_write_error_code: 'configVersionConflict' });
		});
		await assert.rejects(ensurePortableCodexProxyProvider(client), /already defines an incompatible/);
		assert.deepStrictEqual({ reads: client.readCount, writes: client.writes.length }, { reads: 2, writes: 1 });
	});

	test('bounds retries when the user configuration keeps changing', async () => {
		const conflict = new JsonRpcError(-32600, 'Changed concurrently', { config_write_error_code: 'configVersionConflict' });
		const client = new TestConfigurationClient(() => userConfiguration(), () => { throw conflict; });
		await assert.rejects(ensurePortableCodexProxyProvider(client), error => error === conflict);
		assert.deepStrictEqual({ reads: client.readCount, writes: client.writes.length }, { reads: 3, writes: 3 });
	});

	test('propagates write failures without retrying or guessing a config path', async () => {
		const failure = new JsonRpcError(-32600, 'Configuration was modified', { config_write_error_code: 'configFileReadError' });
		const client = new TestConfigurationClient(() => userConfiguration(), () => { throw failure; });
		await assert.rejects(ensurePortableCodexProxyProvider(client), error => error === failure);
		assert.deepStrictEqual({ reads: client.readCount, writes: client.writes.length }, { reads: 1, writes: 1 });
	});

	test('reads the base user layer rather than the selected profile', async () => {
		const response = userConfiguration();
		response.layers!.unshift({ name: { type: 'user', profile: 'selected', file: '/custom-codex/config.toml' }, version: 'profile-version', config: { personality: 'pragmatic', model_providers: { 'vscode-proxy': { supports_websockets: false } } }, disabledReason: null });
		const client = new TestConfigurationClient(() => response);
		await ensurePortableCodexProxyProvider(client);
		assert.strictEqual(client.writes[0].expectedVersion, 'version-1');
	});

	test('does not ignore a persistent endpoint inherited from another config layer', async () => {
		const response = userConfiguration({ model_providers: { 'vscode-proxy': portableProvider } });
		response.layers!.unshift({ name: { type: 'system', file: '/system/config.toml' }, version: 'system-version', config: { model_providers: { 'vscode-proxy': { base_url: 'https://example.com/v1' } } }, disabledReason: null });
		const client = new TestConfigurationClient(() => response);
		await assert.rejects(ensurePortableCodexProxyProvider(client), /already defines an incompatible/);
		assert.deepStrictEqual(client.writes, []);
	});

	test('ignores runtime proxy overrides and disabled persistent layers', async () => {
		const response = userConfiguration();
		response.layers!.push(
			{ name: { type: 'sessionFlags' }, version: 'runtime-version', config: response.config as JsonValue, disabledReason: null },
			{ name: { type: 'project', dotCodexFolder: '/untrusted/.codex' }, version: 'project-version', config: response.config as JsonValue, disabledReason: 'Untrusted project' },
		);
		const client = new TestConfigurationClient(() => response);
		await ensurePortableCodexProxyProvider(client);
		assert.deepStrictEqual(client.writes[0].edits[0].value, portableProvider);
	});

	test('refuses to write when only a profile layer is available', async () => {
		const response = userConfiguration();
		response.layers![0].name = { type: 'user', profile: 'selected', file: '/custom-codex/config.toml' };
		const client = new TestConfigurationClient(() => response);
		await assert.rejects(ensurePortableCodexProxyProvider(client), /could not be read safely/);
		assert.deepStrictEqual(client.writes, []);
	});

	test('refuses to write when the user layer is disabled', async () => {
		const response = userConfiguration();
		response.layers![0].disabledReason = 'Managed configuration';
		const client = new TestConfigurationClient(() => response);
		await assert.rejects(ensurePortableCodexProxyProvider(client), /could not be read safely/);
		assert.deepStrictEqual(client.writes, []);
	});
});
