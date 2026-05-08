/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	detectCredentials,
	hasAnyProvider,
	SECRET_KEYS,
	type CredentialState,
} from 'son-of-anton-core/credentials/credentialDetection';
import type { CredentialBroker } from 'son-of-anton-core/auth/CredentialBroker';
import type { ProviderStatus } from 'son-of-anton-core/auth/types';

// ── Fakes ─────────────────────────────────────────────────────────────────────

class FakeSecretStorage implements vscode.SecretStorage {
	private readonly data = new Map<string, string>();
	readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> = () => ({ dispose: () => { /* no-op */ } });

	get(key: string): Thenable<string | undefined> { return Promise.resolve(this.data.get(key)); }
	store(key: string, value: string): Thenable<void> { this.data.set(key, value); return Promise.resolve(); }
	delete(key: string): Thenable<void> { this.data.delete(key); return Promise.resolve(); }
	keys(): Thenable<string[]> { return Promise.resolve([...this.data.keys()]); }
}

function makeConfig(initial: Record<string, unknown> = {}): vscode.WorkspaceConfiguration {
	const cfg = {
		get<T>(key: string, defaultValue?: T): T | undefined {
			const v = initial[key];
			return v === undefined ? defaultValue : (v as T);
		},
		has(key: string): boolean { return Object.prototype.hasOwnProperty.call(initial, key); },
		inspect(): undefined { return undefined; },
		update(): Thenable<void> { return Promise.resolve(); },
	};
	return cfg as unknown as vscode.WorkspaceConfiguration;
}

function makeBroker(statuses: ProviderStatus[] = []): CredentialBroker {
	return { status: () => Promise.resolve(statuses) } as unknown as CredentialBroker;
}

/**
 * Snapshot the env vars detect() reads so individual tests can clear them
 * without leaking state across cases.
 */
const ENV_KEYS = [
	'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'FOUNDRY_API_KEY',
	'AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'GOOGLE_API_KEY', 'GEMINI_API_KEY',
];
let savedEnv: Record<string, string | undefined>;

setup(() => {
	savedEnv = {};
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});
teardown(() => {
	for (const key of ENV_KEYS) {
		const prev = savedEnv[key];
		if (prev === undefined) { delete process.env[key]; } else { process.env[key] = prev; }
	}
});

const oauthStatus = (id: string): ProviderStatus[] => [
	{ id, displayName: id, connected: true, expiresAt: Date.now() + 60_000 },
];

// ── credentialDetection tests ────────────────────────────────────────────────

suite('credentialDetection', () => {
	test('empty store + empty config + empty broker reports no providers', async () => {
		const state = await detectCredentials(new FakeSecretStorage(), makeConfig(), makeBroker());
		const expected: CredentialState = {
			anthropic: { hasApiKey: false, hasOAuth: false },
			openai: { hasApiKey: false, hasOAuth: false },
			foundry: { hasApiKey: false, hasEndpoint: false },
			bedrock: { hasAccessKey: false, hasProfile: false },
			google: { hasApiKey: false },
		};
		assert.deepStrictEqual(
			{ state, hasAny: hasAnyProvider(state) },
			{ state: expected, hasAny: false },
		);
	});

	test('Anthropic: secret produces hasApiKey=true', async () => {
		const secrets = new FakeSecretStorage();
		await secrets.store(SECRET_KEYS.anthropic, 'sk-ant-abc');
		const state = await detectCredentials(secrets, makeConfig(), makeBroker());
		assert.deepStrictEqual(state.anthropic, { hasApiKey: true, hasOAuth: false });
	});

	test('Anthropic: settings-only produces hasApiKey=true', async () => {
		const state = await detectCredentials(
			new FakeSecretStorage(),
			makeConfig({ apiKey: 'sk-ant-from-config' }),
			makeBroker(),
		);
		assert.deepStrictEqual(state.anthropic, { hasApiKey: true, hasOAuth: false });
	});

	test('Anthropic: broker OAuth status produces hasOAuth=true', async () => {
		const state = await detectCredentials(
			new FakeSecretStorage(),
			makeConfig(),
			makeBroker(oauthStatus('anthropic-oauth')),
		);
		assert.deepStrictEqual(state.anthropic, { hasApiKey: false, hasOAuth: true });
	});

	test('OpenAI: settings, secret, and OAuth each light up the right field', async () => {
		// settings
		let state = await detectCredentials(
			new FakeSecretStorage(),
			makeConfig({ openaiApiKey: 'sk-openai' }),
			makeBroker(),
		);
		assert.deepStrictEqual(state.openai, { hasApiKey: true, hasOAuth: false });

		// secret
		const secrets = new FakeSecretStorage();
		await secrets.store(SECRET_KEYS.openai, 'sk-openai-secret');
		state = await detectCredentials(secrets, makeConfig(), makeBroker());
		assert.deepStrictEqual(state.openai, { hasApiKey: true, hasOAuth: false });

		// OAuth
		state = await detectCredentials(
			new FakeSecretStorage(),
			makeConfig(),
			makeBroker(oauthStatus('chatgpt-oauth')),
		);
		assert.deepStrictEqual(state.openai, { hasApiKey: false, hasOAuth: true });
	});

	test('Foundry: secret + endpoint setting marks both flags true', async () => {
		const secrets = new FakeSecretStorage();
		await secrets.store(SECRET_KEYS.foundry, 'foundry-key');
		const state = await detectCredentials(
			secrets,
			makeConfig({ foundryEndpoint: 'https://x.openai.azure.com' }),
			makeBroker(),
		);
		assert.deepStrictEqual(state.foundry, { hasApiKey: true, hasEndpoint: true });
	});

	test('Foundry: secret only (no endpoint) leaves hasEndpoint false', async () => {
		const secrets = new FakeSecretStorage();
		await secrets.store(SECRET_KEYS.foundry, 'foundry-key');
		const state = await detectCredentials(secrets, makeConfig(), makeBroker());
		assert.deepStrictEqual(state.foundry, { hasApiKey: true, hasEndpoint: false });
	});

	test('Bedrock: profile setting (no static creds) sets hasProfile=true', async () => {
		const state = await detectCredentials(
			new FakeSecretStorage(),
			makeConfig({ bedrockProfile: 'dev-account' }),
			makeBroker(),
		);
		assert.deepStrictEqual(state.bedrock, { hasAccessKey: false, hasProfile: true });
	});

	test('Bedrock: access key secret sets hasAccessKey=true', async () => {
		const secrets = new FakeSecretStorage();
		await secrets.store(SECRET_KEYS.bedrockAccessKeyId, 'AKIA...');
		const state = await detectCredentials(secrets, makeConfig(), makeBroker());
		assert.deepStrictEqual(state.bedrock, { hasAccessKey: true, hasProfile: false });
	});

	test('Google: secret OR settings OR env vars all set hasApiKey=true', async () => {
		const secrets = new FakeSecretStorage();
		await secrets.store(SECRET_KEYS.google, 'g-key');
		const fromSecret = await detectCredentials(secrets, makeConfig(), makeBroker());

		const fromSettings = await detectCredentials(
			new FakeSecretStorage(),
			makeConfig({ googleApiKey: 'g-from-config' }),
			makeBroker(),
		);

		process.env.GEMINI_API_KEY = 'g-from-env';
		const fromEnv = await detectCredentials(new FakeSecretStorage(), makeConfig(), makeBroker());

		assert.deepStrictEqual(
			[fromSecret.google, fromSettings.google, fromEnv.google],
			[{ hasApiKey: true }, { hasApiKey: true }, { hasApiKey: true }],
		);
	});

	test('hasAnyProvider returns true when any single field is set', () => {
		const empty: CredentialState = {
			anthropic: { hasApiKey: false, hasOAuth: false },
			openai: { hasApiKey: false, hasOAuth: false },
			foundry: { hasApiKey: false, hasEndpoint: false },
			bedrock: { hasAccessKey: false, hasProfile: false },
			google: { hasApiKey: false },
		};
		const variants: CredentialState[] = [
			{ ...empty, anthropic: { hasApiKey: true, hasOAuth: false } },
			{ ...empty, openai: { hasApiKey: false, hasOAuth: true } },
			{ ...empty, bedrock: { hasAccessKey: false, hasProfile: true } },
			{ ...empty, google: { hasApiKey: true } },
		];
		assert.deepStrictEqual(
			[hasAnyProvider(empty), ...variants.map(hasAnyProvider)],
			[false, true, true, true, true],
		);
	});
});
