/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
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
	{
		id: 'chatgpt-oauth',
		displayName: 'ChatGPT / Codex (OpenAI)',
		authorizationEndpoint: 'https://auth.openai.com/authorize',
		tokenEndpoint: 'https://auth.openai.com/oauth/token',
		scopes: ['openid', 'profile', 'email', 'offline_access'],
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
		try {
			await broker.connect(providerId);
		} catch (err) {
			// When the user clicks Connect Claude / Connect ChatGPT before configuring
			// a clientId, the broker has no provider registered and throws
			// "Unknown provider: <id>". Surface this as an actionable warning that
			// deep-links into settings, instead of bubbling a raw error to the wizard.
			const message = err instanceof Error ? err.message : String(err);
			if (/^Unknown provider:/.test(message)) {
				const isClaude = providerId === 'anthropic-oauth';
				const providerName = isClaude ? 'Claude' : 'ChatGPT / Codex';
				const apiKeySetting = isClaude ? 'sota.apiKey' : 'sota.openaiApiKey';
				const choice = await vscode.window.showWarningMessage(
					`${providerName} OAuth sign-in is not available — neither Anthropic nor OpenAI offers public OAuth client registration for third-party tools right now. Use an API key instead.`,
					'Open API Key Settings',
					'Configure Client ID Anyway',
				);
				if (choice === 'Open API Key Settings') {
					await vscode.commands.executeCommand('workbench.action.openSettings', apiKeySetting);
				} else if (choice === 'Configure Client ID Anyway') {
					await vscode.commands.executeCommand('workbench.action.openSettings', `sotaAuth.${providerId}.clientId`);
				}
				return { ok: false, reason: 'missing-client-id' } as const;
			}
			throw err;
		}
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
