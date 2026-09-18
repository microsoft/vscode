/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getRelayAdmissionMessage } from './localRelay';
import { LocalRelayPool } from './localRelayPool';
import { maxTerminalSessions, relayApprovalPendingMessage, relayCapacityMessage, relayCommands, relayVersion, validateSessionId, type RelayBatch, type RelayEndpoint } from './relayProtocol';

let stop: (() => void) | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel(vscode.l10n.t("Tunnel Terminal (Local)"));
	context.subscriptions.push(output);
	let disposed = false;
	let active: { bridgeId: string; relay: LocalRelayPool; endpoint: Promise<RelayEndpoint> } | undefined;

	const assertRuntime = () => {
		if (disposed || !vscode.workspace.isTrusted || vscode.env.uiKind !== vscode.UIKind.Desktop || !vscode.env.remoteName) {
			throw new Error(vscode.l10n.t("The local terminal companion requires a trusted remote workspace in desktop VS Code."));
		}
	};
	const dispose = () => {
		disposed = true;
		const previous = active;
		active = undefined;
		previous?.relay.dispose();
	};
	context.subscriptions.push({ dispose });
	stop = dispose;

	context.subscriptions.push(vscode.commands.registerCommand(relayCommands.localVersion, () => {
		assertRuntime();
		return relayVersion;
	}));
	context.subscriptions.push(vscode.commands.registerCommand(relayCommands.localCreate, (descriptor: unknown): Promise<RelayEndpoint> => {
		assertRuntime();
		if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor) ||
			!('version' in descriptor) || descriptor.version !== relayVersion || !('bridgeId' in descriptor)) {
			throw new Error(vscode.l10n.t("Invalid local terminal relay descriptor."));
		}
		validateSessionId(descriptor.bridgeId);
		const bridgeId = descriptor.bridgeId;
		if (active?.bridgeId === bridgeId) {
			return active.endpoint;
		}
		const previous = active;
		active = undefined;
		previous?.relay.dispose();
		let notified = false;
		let errorsLogged = 0;
		const reportError = (error: Error) => {
			if (disposed) {
				return;
			}
			const message = error.message === relayApprovalPendingMessage
				? vscode.l10n.t("Another terminal is awaiting approval. Approve or dismiss it before connecting again.")
				: error.message === relayCapacityMessage
					? vscode.l10n.t("The terminal bridge already has {0} sessions. Close one before connecting again.", maxTerminalSessions)
					: error.message;
			if (errorsLogged < 10) {
				output.appendLine(message);
				errorsLogged++;
			} else if (errorsLogged === 10) {
				output.appendLine(vscode.l10n.t("Further terminal relay errors have been suppressed. Stop and restart the bridge to reset diagnostics."));
				errorsLogged++;
			}
			if (!notified) {
				notified = true;
				void Promise.resolve(vscode.window.showErrorMessage(getRelayAdmissionMessage(error) ? message : vscode.l10n.t("The local terminal relay failed. See the Tunnel Terminal (Local) output channel."))).catch(() => {
					if (!disposed) {
						output.appendLine(vscode.l10n.t("The error notification could not be displayed."));
					}
				});
			}
		};
		const execute = async <T>(command: string, ...args: (string | string[])[]): Promise<T> => {
			try {
				return await vscode.commands.executeCommand<T>(command, ...args);
			} catch (error) {
				const message = getRelayAdmissionMessage(error);
				if (message) {
					throw new Error(message);
				}
				// Do not log cross-host exception text, which may contain connection details.
				throw new Error(vscode.l10n.t("The remote terminal relay command failed: {0}", command));
			}
		};
		const relay = new LocalRelayPool({
			createTransport: sessionId => ({
				open: () => execute<void>(relayCommands.remoteOpen, bridgeId, sessionId),
				read: () => execute<RelayBatch>(relayCommands.remoteRead, bridgeId, sessionId),
				write: messages => execute<void>(relayCommands.remoteWrite, bridgeId, sessionId, messages),
				close: () => execute<void>(relayCommands.remoteClose, bridgeId, sessionId),
			}),
			stop: () => execute<void>(relayCommands.remoteStop, bridgeId),
			onError: reportError,
			onClose: () => {
				if (active?.relay === relay) {
					active = undefined;
				}
			},
		});
		const endpoint = relay.start().then(connection => {
			if (disposed || active?.relay !== relay) {
				relay.dispose();
				throw new Error(vscode.l10n.t("The local terminal relay was stopped while starting."));
			}
			return { version: relayVersion, url: connection.url };
		}).catch(error => {
			if (!disposed && active?.relay === relay) {
				reportError(error instanceof Error ? error : new Error(vscode.l10n.t("The local terminal relay could not be started.")));
			}
			relay.dispose();
			throw error;
		});
		active = { bridgeId, relay, endpoint };
		return endpoint;
	}));
	context.subscriptions.push(vscode.commands.registerCommand(relayCommands.localStop, (bridgeId: unknown) => {
		validateSessionId(bridgeId);
		if (active?.bridgeId === bridgeId) {
			const previous = active;
			active = undefined;
			previous.relay.dispose();
		}
	}));
}

export function deactivate(): void {
	stop?.();
	stop = undefined;
}
