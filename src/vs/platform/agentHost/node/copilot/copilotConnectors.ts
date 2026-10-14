/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectorStatus, CopilotSession } from '@github/copilot-sdk';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { ILogService } from '../../../log/common/log.js';

/** Uses this SDK session's account handle; a failed attempt retains current state for publication and retry. */
export async function reconcileCopilotConnectors(
	session: CopilotSession,
	logService: ILogService,
	options: {
		readonly forceConnectorName?: string;
		readonly canReconcile?: () => boolean;
		readonly preserveStoppedServers?: boolean;
		readonly token?: CancellationToken;
		readonly onReconcileRequested?: (rpc: Promise<ConnectorStatus>) => void;
	} = {},
): Promise<{ readonly reconciled: boolean; readonly displayNames?: ReadonlyMap<string, string> }> {
	const { forceConnectorName, canReconcile = () => true, token = CancellationToken.None } = options;
	let status: ConnectorStatus;
	let reconciled = false;
	try {
		const capabilities = await raceCancellationError(session.rpc.connectors.getCapabilities(), token);
		if (!canReconcile()) {
			return { reconciled };
		}
		if (capabilities.availability !== 'enabled') {
			logService.info(`[Copilot:${session.sessionId}] Connector MCP reconciliation unavailable: ${capabilities.availability}`);
			return { reconciled };
		}
		if (!capabilities.sessionAccountSelection) {
			logService.warn(`[Copilot:${session.sessionId}] Connector MCP reconciliation skipped because the runtime does not support session-owned Connector accounts`);
			return { reconciled };
		}
		if (forceConnectorName !== undefined && !capabilities.targetedReconcile) {
			logService.warn(`[Copilot:${session.sessionId}] Connector MCP reconciliation skipped because the runtime does not support targeted reconciliation`);
			return { reconciled };
		}
		const account = await raceCancellationError(session.rpc.connectors.getAccount(), token);
		if (!canReconcile()) {
			return { reconciled };
		}
		if (!account) {
			logService.warn(`[Copilot:${session.sessionId}] Connector MCP reconciliation skipped because the session account could not be resolved`);
			return { reconciled };
		}
		if (options.preserveStoppedServers) {
			const current = await raceCancellationError(session.rpc.connectors.getStatus(), token);
			if (!canReconcile()) {
				return { reconciled };
			}
			if (current.runtimeServers.some(server =>
				(forceConnectorName === undefined || server.connectorName === forceConnectorName)
				&& (server.status === 'stopped' || server.status === 'not_configured' || server.status === 'disabled')
			)) {
				logService.info(`[Copilot:${session.sessionId}] Deferring Connector MCP reconciliation to preserve stopped or disabled servers`);
				return { reconciled, displayNames: connectorDisplayNames(current) };
			}
		}
		const reconcile = session.rpc.connectors.reconcile({
			accountId: account.accountId,
			refreshCatalog: true,
			...(forceConnectorName !== undefined ? { forceConnectorName } : {}),
		});
		options.onReconcileRequested?.(reconcile);
		status = await raceCancellationError(reconcile, token);
		reconciled = true;
		logService.info(`[Copilot:${session.sessionId}] Reconciled ${status.runtimeServers.length} connector MCP server(s) through the Copilot runtime`);
	} catch (error) {
		if (isCancellationError(error) && token.isCancellationRequested) {
			throw error;
		}
		logService.warn(`[Copilot:${session.sessionId}] Connector MCP reconciliation failed; using the current Connector state when available: ${getErrorMessage(error)}`);
		if (!canReconcile()) {
			return { reconciled };
		}
		try {
			status = await raceCancellationError(session.rpc.connectors.getStatus(), token);
		} catch (statusError) {
			if (isCancellationError(statusError) && token.isCancellationRequested) {
				throw statusError;
			}
			logService.warn(`[Copilot:${session.sessionId}] Unable to read the current Connector state after reconciliation failed: ${getErrorMessage(statusError)}`);
			return { reconciled };
		}
	}
	return {
		reconciled,
		displayNames: connectorDisplayNames(status),
	};
}

function connectorDisplayNames(status: ConnectorStatus): ReadonlyMap<string, string> {
	const names = new Map(status.catalog?.connectors.map(connector => [connector.name, connector.displayName.trim() || connector.name]));
	return new Map(status.runtimeServers.map(server => [server.runtimeServerId, names.get(server.connectorName) ?? server.connectorName]));
}
