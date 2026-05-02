/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { activateAuth, AuthActivationDeps } from '../src/auth/activation';
import type { SecretStore } from '../src/auth/types';

class FakeSecretStore implements SecretStore {
	private readonly data = new Map<string, string>();
	get(key: string): Promise<string | undefined> { return Promise.resolve(this.data.get(key)); }
	store(key: string, value: string): Promise<void> { this.data.set(key, value); return Promise.resolve(); }
	delete(key: string): Promise<void> { this.data.delete(key); return Promise.resolve(); }
}

interface FakeDisposable {
	dispose(): void;
}

function makeDeps(overrides: Partial<AuthActivationDeps> & { configValues?: Record<string, unknown> } = {}): {
	deps: AuthActivationDeps;
	registeredCommands: Map<string, (...args: unknown[]) => unknown>;
	disposed: string[];
	configValues: Record<string, unknown>;
} {
	const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
	const disposed: string[] = [];
	const configValues = overrides.configValues ?? {};

	const deps: AuthActivationDeps = {
		secrets: overrides.secrets ?? new FakeSecretStore(),
		openExternal: overrides.openExternal ?? (() => Promise.resolve(true)),
		getConfig: overrides.getConfig ?? ((section: string) => ({
			get: <T>(key: string) => configValues[`${section}.${key}`] as T | undefined,
		})),
		registerCommand: overrides.registerCommand ?? ((id, handler) => {
			registeredCommands.set(id, handler);
			const d: FakeDisposable = { dispose: () => disposed.push(id) };
			return d as never;
		}),
	};

	return { deps, registeredCommands, disposed, configValues };
}

suite('activateAuth', () => {

	test('registers expected commands regardless of provider config', () => {
		const { deps, registeredCommands } = makeDeps();
		activateAuth(deps);
		assert.deepStrictEqual(
			[...registeredCommands.keys()].sort(),
			['sotaAuth.connect', 'sotaAuth.disconnect', 'sotaAuth.status'],
		);
	});

	test('connect throws for unknown provider when no clientId configured', async () => {
		const { deps, registeredCommands } = makeDeps();
		activateAuth(deps);
		const connect = registeredCommands.get('sotaAuth.connect')!;
		await assert.rejects(
			() => Promise.resolve(connect('anthropic-oauth')),
			/Unknown provider/,
		);
	});

	test('connect command rejects when called without a providerId argument', async () => {
		const { deps, registeredCommands } = makeDeps();
		activateAuth(deps);
		const connect = registeredCommands.get('sotaAuth.connect')!;
		await assert.rejects(
			() => Promise.resolve(connect()),
			/providerId/,
		);
	});

	test('status returns provider list once a clientId is configured', async () => {
		const { deps, registeredCommands } = makeDeps({
			configValues: { 'sotaAuth.anthropic-oauth.clientId': 'test-client-id' },
		});
		activateAuth(deps);
		const status = registeredCommands.get('sotaAuth.status')!;
		const result = (await status()) as { providers: Array<{ id: string; displayName: string; connected: boolean }> };
		assert.deepStrictEqual(
			{
				providers: result.providers.map(p => ({ id: p.id, connected: p.connected, displayName: p.displayName })),
			},
			{
				providers: [{ id: 'anthropic-oauth', connected: false, displayName: 'Claude (Anthropic)' }],
			},
		);
	});

	test('disposables returned correspond one-to-one with registered commands', () => {
		const { deps, registeredCommands, disposed } = makeDeps();
		const result = activateAuth(deps);
		assert.strictEqual(result.disposables.length, registeredCommands.size);
		for (const d of result.disposables) {
			d.dispose();
		}
		assert.deepStrictEqual(disposed.sort(), ['sotaAuth.connect', 'sotaAuth.disconnect', 'sotaAuth.status']);
	});
});
