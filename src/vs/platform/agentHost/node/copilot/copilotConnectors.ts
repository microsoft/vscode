/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectorStatus, CopilotSession } from '@github/copilot-sdk';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { ILogService } from '../../../log/common/log.js';

/** Outcome of {@link reconcileCopilotConnectors}. */
export interface ICopilotConnectorReconcileResult {
	readonly reconciled: boolean;
	readonly displayNames?: ReadonlyMap<string, string>;
	/**
	 * Runtime server IDs the organization's managed MCP policy refused, or `undefined` when this attempt
	 * did not determine them (for example, it was skipped, deferred, or failed for another reason).
	 * A successful reconciliation reports an empty set.
	 */
	readonly policyBlockedServers?: ReadonlySet<string>;
}

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
): Promise<ICopilotConnectorReconcileResult> {
	const { forceConnectorName, canReconcile = () => true, token = CancellationToken.None } = options;
	let status: ConnectorStatus;
	let reconciled = false;
	let policyBlockedServers: ReadonlySet<string> | undefined;
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
		policyBlockedServers = new Set();
		logService.info(`[Copilot:${session.sessionId}] Reconciled ${status.runtimeServers.length} connector MCP server(s) through the Copilot runtime`);
	} catch (error) {
		if (isCancellationError(error) && token.isCancellationRequested) {
			throw error;
		}
		logService.warn(`[Copilot:${session.sessionId}] Connector MCP reconciliation failed; using the current Connector state when available: ${getErrorMessage(error)}`);
		const blocked = parsePolicyBlockedConnectorServers(getErrorMessage(error));
		if (blocked.size > 0) {
			policyBlockedServers = blocked;
			logService.info(`[Copilot:${session.sessionId}] ${blocked.size} connector MCP server(s) are blocked by the managed MCP policy`);
		}
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
			return { reconciled, policyBlockedServers };
		}
	}
	return {
		reconciled,
		displayNames: connectorDisplayNames(status),
		policyBlockedServers,
	};
}

const policyBlockedServerPattern = /MCP server "(?<serverId>[^"]+)" is blocked by the managed policy/g;

/**
 * Extracts the runtime server IDs that a failed reconciliation reports as refused by the managed MCP policy.
 *
 * The SDK does not expose a structured per-server policy signal: `ConnectorMcpStatus` and `McpServerStatus`
 * fold a policy block into `stopped`/`not_configured`, and the reconcile RPC fails with an aggregated message.
 * Until the runtime reports this structurally, the message is the only source; an unrecognized message yields
 * an empty set, so the servers fall back to their reported lifecycle state.
 */
export function parsePolicyBlockedConnectorServers(message: string): ReadonlySet<string> {
	const result = new Set<string>();
	for (const match of message.matchAll(policyBlockedServerPattern)) {
		const serverId = match.groups?.serverId;
		if (serverId) {
			result.add(serverId);
		}
	}
	return result;
}

function connectorDisplayNames(status: ConnectorStatus): ReadonlyMap<string, string> {
	const connectors = status.catalog?.connectors ?? [];
	const names = new Map(connectors.map(connector => [connector.name, connector.displayName.trim() || connector.name]));
	const result = new Map<string, string>();
	// Catalog projections cover servers the runtime refused to start, which have no live status entry.
	for (const connector of connectors) {
		for (const runtimeServerId of connector.runtimeServerIds ?? []) {
			result.set(runtimeServerId, names.get(connector.name) ?? connector.name);
		}
	}
	for (const server of status.runtimeServers) {
		result.set(server.runtimeServerId, names.get(server.connectorName) ?? server.connectorName);
	}
	return result;
}
