/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { CredentialBroker, OpenExternalFn } from './CredentialBroker';
import type { ProviderConfig, ProviderStatus, SecretStore } from './types';

const SETTINGS_NAMESPACE = 'sotaAuth';

/**
 * Default provider configurations. Public OAuth endpoints are hardcoded;
 * the client ID for each provider must be supplied via configuration before
 * a connect attempt will succeed.
 */
export const DEFAULT_PROVIDER_CONFIGS: ReadonlyArray<Omit<ProviderConfig, 'clientId'>> = [
	{
		id: 'anthropic-oauth',
		displayName: 'Claude (Anthropic)',
		authorizationEndpoint: 'https://claude.ai/oauth/authorize',
		tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
		scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
	},
];

/** Minimal config shape used by activation; subset of vscode.WorkspaceConfiguration. */
export interface ConfigReader {
	get<T>(key: string): T | undefined;
}

export interface AuthActivationDeps {
	readonly secrets: SecretStore;
	readonly openExternal: OpenExternalFn;
	readonly getConfig: (section: string) => ConfigReader;
	readonly registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => vscode.Disposable;
}

export interface AuthActivationResult {
	readonly broker: CredentialBroker;
	readonly disposables: vscode.Disposable[];
}

/**
 * Wires the CredentialBroker into the extension lifecycle:
 * - registers default provider configs (skipping any without a configured clientId)
 * - exposes commands the renderer-side wizard calls into
 *
 * The activation is dependency-injected so tests can drive it with fakes.
 */
export function activateAuth(deps: AuthActivationDeps): AuthActivationResult {
	const broker = new CredentialBroker(deps.secrets, deps.openExternal);
	const config = deps.getConfig(SETTINGS_NAMESPACE);

	for (const base of DEFAULT_PROVIDER_CONFIGS) {
		const clientId = readClientId(config, base.id);
		if (!clientId) {
			continue;
		}
		broker.registerProvider({ ...base, clientId });
	}

	const disposables: vscode.Disposable[] = [];

	disposables.push(deps.registerCommand('sotaAuth.connect', async (...args: unknown[]) => {
		const providerId = expectProviderId(args);
		await broker.connect(providerId);
		return { ok: true } as const;
	}));

	disposables.push(deps.registerCommand('sotaAuth.disconnect', async (...args: unknown[]) => {
		const providerId = expectProviderId(args);
		await broker.disconnect(providerId);
		return { ok: true } as const;
	}));

	disposables.push(deps.registerCommand('sotaAuth.status', async () => {
		const status = await broker.status();
		return { providers: status } satisfies { providers: ProviderStatus[] };
	}));

	return { broker, disposables };
}

function readClientId(config: ConfigReader, providerId: string): string | undefined {
	const value = config.get<string>(`${providerId}.clientId`);
	if (typeof value !== 'string' || value.trim() === '') {
		return undefined;
	}
	return value.trim();
}

function expectProviderId(args: unknown[]): string {
	const first = args[0];
	if (typeof first !== 'string' || first.trim() === '') {
		throw new Error('sotaAuth command requires a providerId argument');
	}
	return first;
}
