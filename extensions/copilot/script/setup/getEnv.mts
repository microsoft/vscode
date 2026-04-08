/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureCliCredential, ChainedTokenCredential, DeviceCodeCredential, InteractiveBrowserCredential, ManagedIdentityCredential, TokenCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import * as fs from 'fs';
import * as process from 'process';

const useColors = (process.stdout.isTTY && typeof process.stdout.hasColors === 'function' && process.stdout.hasColors());
function red(s: string) { return useColors ? `\x1b[31m${s}\x1b[0m` : s; }

async function setupSecretClient(vaultUri: string) {
	const credentialOptions: TokenCredential[] = [];

	// Only add managed identity credential if the client ID is provided
	if (process.env.AZURE_CLIENT_ID) {
		credentialOptions.push(new ManagedIdentityCredential({ clientId: process.env.AZURE_CLIENT_ID }));
	}

	// Always add the Azure CLI as an option
	credentialOptions.push(new AzureCliCredential({ tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47" }));

	// Check if terminal is interactive, non-interactive environments can't use
	// InteractiveBrowserCredential and don't necessarily have access to a keychain
	// For SSH sessions into Azure VMs, keychain is not available, requires managed identity
	if (process.stdin.isTTY && !process.env.AZURE_CLIENT_ID && !process.env.CODESPACES) {
		credentialOptions.push(new InteractiveBrowserCredential({ tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47" }));
	}

	// Use DeviceCodeCredential in Codespaces
	if (process.env.CODESPACES) {
		const deviceCodeCredential = new DeviceCodeCredential({
			tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
			userPromptCallback: (info) => {
				console.log("To authenticate, visit:", info.verificationUri);
				console.log("Enter the code:", info.userCode);
			}
		});
		credentialOptions.push(deviceCodeCredential);
	}

	const credential = new ChainedTokenCredential(...credentialOptions);
	return new SecretClient(vaultUri, credential);
}

async function fetchSecret(secretClient: SecretClient, secretName: string): Promise<string | undefined> {
	const secret = await secretClient.getSecret(secretName);
	return secret.value;
}

async function fetchSecrets(): Promise<{ [key: string]: string | undefined }> {
	const keyVaultClient = await setupSecretClient("https://copilot-automation.vault.azure.net/");

	const secrets: { [key: string]: string | undefined } = {};
	secrets["HMAC_SECRET"] = await fetchSecret(keyVaultClient, "hmac-secret");

	if (!process.stdin.isTTY) { // only in automation
		secrets["GITHUB_OAUTH_TOKEN"] = await fetchSecret(keyVaultClient, "capi-oauth");
		secrets["VSCODE_COPILOT_CHAT_TOKEN"] = await fetchSecret(keyVaultClient, "copilot-token");
		secrets["GHCR_PAT"] = await fetchSecret(keyVaultClient, "ghcr-pat");
		secrets["BLACKBIRD_EMBEDDINGS_KEY"] = await fetchSecret(keyVaultClient, "vsc-aoai-key");
		secrets["BLACKBIRD_REDIS_CACHE_KEY"] = await fetchSecret(keyVaultClient, "blackbird-redis-cache-key");

		try {
			secrets["ANTHROPIC_API_KEY"] = await fetchSecret(keyVaultClient, "anthropic-key");
			secrets["DEEPSEEK_API_KEY"] = await fetchSecret(keyVaultClient, "deepseek-key");
		} catch (error) {
			console.log(red(`Failed to fetch optional evaluation tokens. Skipping...`));
		}
	}

	return secrets;
}

async function main() {
	const env = Object.entries(await fetchSecrets());

	const raw = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
	const result = raw.split('\n')
		.filter(line => !env.some(([key]) => line.startsWith(`${key}=`)))
		.concat(env.map(([key, value]) => `${key}=${value}`))
		.filter(line => line.trim() !== '') // Remove empty lines
		.join('\n');

	fs.writeFileSync('.env', result);
	console.log('Wrote secrets to .env');
	process.exit(0);
}

main().catch(error => {
	console.error(red(`Error when setting up .env file:\n${error}`));
});
