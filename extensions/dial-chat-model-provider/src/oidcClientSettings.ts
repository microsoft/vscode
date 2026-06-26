import * as vscode from 'vscode';
import { DialSecrets } from './dialSecrets';
import { dialLog } from './logger';
import { type DialConfig, type Nullable } from './types';

const MANAGED_FLAG = 'dial.oidcClientManaged';

/**
 * Persist dynamically registered client credentials.
 * - `client_id` is a public identifier → user settings (visible, syncable).
 * - `client_secret` is sensitive → {@link vscode.SecretStorage} (OS keychain).
 */
export async function persistRegisteredOidcClient(
	context: vscode.ExtensionContext,
	clientId: string,
	clientSecret: Nullable<string>,
): Promise<void> {
	const cfg = vscode.workspace.getConfiguration('dial');
	await cfg.update('oidcClientId', clientId, vscode.ConfigurationTarget.Global);

	const secrets = new DialSecrets(context);
	await secrets.setOidcClientSecret(clientSecret);

	await context.secrets.store(MANAGED_FLAG, 'true');
	dialLog.info(
		'OIDC client saved',
		`client_id=${clientId}`,
		clientSecret ? 'client_secret=stored-in-keychain' : 'client_secret=none',
	);
}

export async function isExtensionManagedOidcClient(
	context: vscode.ExtensionContext,
): Promise<boolean> {
	return (await context.secrets.get(MANAGED_FLAG)) === 'true';
}

/** Clear the auto-registered OIDC client from settings (no-op for user-supplied clients). */
export async function clearOidcClientCredentials(
	context: vscode.ExtensionContext,
): Promise<Nullable<string>> {
	const managed = await isExtensionManagedOidcClient(context);
	if (!managed) {
		return undefined;
	}

	const cfg = vscode.workspace.getConfiguration('dial');
	const clearedId = cfg.get<string>('oidcClientId')?.trim();
	await cfg.update('oidcClientId', undefined, vscode.ConfigurationTarget.Global);
	const secrets = new DialSecrets(context);
	await secrets.setOidcClientSecret(undefined);
	await context.secrets.delete(MANAGED_FLAG);

	if (clearedId) {
		dialLog.info('Cleared OIDC client', `client_id=${clearedId}`);
	}
	return clearedId;
}

export async function describeOidcClientSource(
	context: vscode.ExtensionContext,
	config: DialConfig,
): Promise<string> {
	const clientId = config.oidcClientId?.trim();
	if (!clientId) {
		return '(none — will register on next login)';
	}
	if (await isExtensionManagedOidcClient(context)) {
		return `settings (auto-registered): ${clientId}`;
	}
	return `settings: ${clientId}`;
}
