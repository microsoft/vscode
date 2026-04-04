/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthHelper } from './authHelper';
import { AgentHostManager } from './agentHostManager';
import { TunnelManager } from './tunnelManager';
import { CodamenteClient } from './codamenteClient';

function isWeb(): boolean {
	return vscode.env.uiKind === vscode.UIKind.Web;
}

export function activate(context: vscode.ExtensionContext): void {
	const auth = new AuthHelper();
	const client = new CodamenteClient();

	context.subscriptions.push(auth);

	if (!isWeb()) {
		registerShareCommand(context, auth, client);
	} else {
		registerConnectCommand(context, auth, client);
	}
}

export function deactivate(): void {
	// Cleanup is handled by disposables registered on the context
}

// ---------------------------------------------------------------------------
// Desktop: Share Agent Host
// ---------------------------------------------------------------------------

function registerShareCommand(
	context: vscode.ExtensionContext,
	auth: AuthHelper,
	client: CodamenteClient,
): void {
	const agentHost = new AgentHostManager();
	const tunnel = new TunnelManager();

	context.subscriptions.push(agentHost, tunnel);

	context.subscriptions.push(
		vscode.commands.registerCommand('codamente.shareAgentHost', async () => {
			try {
				// 1. Authenticate
				const token = await auth.getToken({ createIfNone: true });
				if (!token) {
					vscode.window.showWarningMessage(
						vscode.l10n.t("GitHub sign-in is required to share the agent host.")
					);
					return;
				}

				// 2. Determine workspace root
				const rootPath = getRootPath();
				if (!rootPath) {
					vscode.window.showWarningMessage(
						vscode.l10n.t("A workspace folder is required to start the agent host.")
					);
					return;
				}

				// 3. Start agent host
				const hostName = `${vscode.env.appName} Agent Host`;
				const registryUrl = 'https://codamente.com/api/hosts';
				const { port, connectionToken } = await agentHost.start(
					rootPath, registryUrl, token, hostName
				);

				// 4. Open tunnel
				const tunnelInstance = await tunnel.open(port);
				const tunnelAddress = typeof tunnelInstance.localAddress === 'string'
					? tunnelInstance.localAddress
					: `${tunnelInstance.localAddress.host}:${tunnelInstance.localAddress.port}`;

				// 5. Register with Codamente
				await client.register(tunnelAddress, connectionToken, hostName, token);

				vscode.window.showInformationMessage(
					vscode.l10n.t("Agent host shared! Connect from any device via codamente.com.")
				);
			} catch (e) {
				vscode.window.showErrorMessage(
					vscode.l10n.t("Failed to share agent host: {0}", (e as Error).message)
				);
			}
		})
	);

	// Clean up the heartbeat on deactivation
	context.subscriptions.push({
		dispose: () => {
			client.dispose();
		}
	});
}

// ---------------------------------------------------------------------------
// Web: Connect to Agent Host
// ---------------------------------------------------------------------------

function registerConnectCommand(
	context: vscode.ExtensionContext,
	auth: AuthHelper,
	client: CodamenteClient,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('codamente.connectToHost', async () => {
			try {
				// 1. Authenticate
				const token = await auth.getToken({ createIfNone: true });
				if (!token) {
					vscode.window.showWarningMessage(
						vscode.l10n.t("GitHub sign-in is required to connect to an agent host.")
					);
					return;
				}

				// 2. Fetch available hosts
				const hosts = await client.listHosts(token);
				if (hosts.length === 0) {
					vscode.window.showInformationMessage(
						vscode.l10n.t("No shared agent hosts found. Start one from VS Code desktop first.")
					);
					return;
				}

				// 3. Pick a host
				const items = hosts.map(h => ({
					label: h.hostName,
					description: h.tunnelUrl,
					host: h,
				}));

				const picked = await vscode.window.showQuickPick(items, {
					placeHolder: vscode.l10n.t("Select an agent host to connect to"),
				});

				if (!picked) {
					return;
				}

				// 4. Open the host URL
				await vscode.env.openExternal(vscode.Uri.parse(picked.host.tunnelUrl));

				vscode.window.showInformationMessage(
					vscode.l10n.t("Connecting to {0}...", picked.host.hostName)
				);
			} catch (e) {
				vscode.window.showErrorMessage(
					vscode.l10n.t("Failed to connect to agent host: {0}", (e as Error).message)
				);
			}
		})
	);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getRootPath(): string | undefined {
	const folders = vscode.workspace.workspaceFolders;
	if (folders && folders.length > 0) {
		return folders[0].uri.fsPath;
	}
	return undefined;
}
