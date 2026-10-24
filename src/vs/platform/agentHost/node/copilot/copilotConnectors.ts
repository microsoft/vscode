/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectorCatalogResult, ConnectorStatus, CopilotSession } from '@github/copilot-sdk';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { ILogService } from '../../../log/common/log.js';

/** One Connector-owned runtime MCP server. */
export interface ICopilotConnectorServer {
	/** Canonical Connector name, used for targeted reconciliation. */
	readonly connectorName: string;
	/** Catalog display name, falling back to {@link connectorName}. */
	readonly displayName: string;
}

/** The Connector-owned runtime servers of one SDK session and whether the account must authorize Connectors. */
export interface ICopilotConnectorServers {
	/** Keyed by runtime server ID, which is also the MCP server name. */
	readonly servers: ReadonlyMap<string, ICopilotConnectorServer>;
	/** The runtime reports that the session account lacks the Connector authorization scope. */
	readonly authorizationRequired: boolean;
}

/** The outcome of one Connector reconciliation attempt. */
export interface ICopilotConnectorReconcileResult {
	/** The requested reconciliation ran; a deferred request or a targeted addition alone leaves this false. */
	readonly reconciled: boolean;
	readonly connectorServers?: ICopilotConnectorServers;
	/** A deferred ordinary refresh checked the refreshed catalog and added any newly connected Connectors. */
	readonly newlyConnectedChecked?: boolean;
}

/** Uses this SDK session's account handle; a failed attempt retains current state for publication and retry. */
export async function reconcileCopilotConnectors(
	session: CopilotSession,
	logService: ILogService,
	options: {
		readonly forceConnectorName?: string;
		readonly canReconcile?: () => boolean;
		readonly preserveStoppedServers?: boolean;
		/** When an ordinary refresh must defer to preserve stopped servers, still add newly connected Connectors. */
		readonly addNewlyConnected?: boolean;
		readonly token?: CancellationToken;
		readonly onReconcileRequested?: (rpc: Promise<ConnectorStatus>) => void;
	} = {},
): Promise<ICopilotConnectorReconcileResult> {
	const { forceConnectorName, canReconcile = () => true, token = CancellationToken.None } = options;
	let status: ConnectorStatus;
	let reconciled = false;
	let newlyConnectedChecked = false;
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
		let targets: readonly (string | undefined)[] = [forceConnectorName];
		let refreshCatalog = true;
		let addingNewlyConnected = false;
		if (options.preserveStoppedServers) {
			let current = await raceCancellationError(session.rpc.connectors.getStatus(), token);
			if (!canReconcile()) {
				return { reconciled };
			}
			// Ordinary reconciliation restarts a stopped server whose definition changed, and drops stopped and disabled
			// servers from the session's configured MCP inventory, after which they can no longer be started or enabled.
			if (current.runtimeServers.some(server =>
				(forceConnectorName === undefined || server.connectorName === forceConnectorName)
				&& (server.status === 'stopped' || server.status === 'not_configured' || server.status === 'disabled')
			)) {
				if (forceConnectorName === undefined && options.addNewlyConnected && capabilities.targetedReconcile) {
					// A targeted reconcile adds only its target, without restarting, reconfiguring or removing other
					// servers, so it cannot satisfy this ordinary refresh, which stays deferred.
					const { catalog, added } = await newlyConnectedConnectors(session, account.accountId, current, token);
					if (!canReconcile()) {
						return { reconciled };
					}
					current = { ...current, catalog };
					targets = added;
					addingNewlyConnected = added.length > 0;
					newlyConnectedChecked = !addingNewlyConnected;
				}
				if (!addingNewlyConnected) {
					logService.info(`[Copilot:${session.sessionId}] Deferring Connector MCP reconciliation to preserve stopped, disabled or not configured servers`);
					return { reconciled, connectorServers: copilotConnectorServers(current), newlyConnectedChecked };
				}
				logService.info(`[Copilot:${session.sessionId}] Adding ${targets.length} newly connected Connector(s) through targeted reconciliation; ordinary reconciliation remains deferred to preserve stopped, disabled or not configured servers`);
				refreshCatalog = false;
			}
		}
		let latest: ConnectorStatus | undefined;
		for (const target of targets) {
			if (latest && !canReconcile()) {
				// Connectors added so far stay projected; the remaining ones are found again on retry.
				return { reconciled, connectorServers: copilotConnectorServers(latest) };
			}
			const reconcile = session.rpc.connectors.reconcile({
				accountId: account.accountId,
				refreshCatalog,
				...(target !== undefined ? { forceConnectorName: target } : {}),
			});
			options.onReconcileRequested?.(reconcile);
			latest = await raceCancellationError(reconcile, token);
		}
		if (!latest) {
			return { reconciled };
		}
		status = latest;
		reconciled = !addingNewlyConnected;
		newlyConnectedChecked = addingNewlyConnected;
		logService.info(addingNewlyConnected
			? `[Copilot:${session.sessionId}] Added newly connected Connectors; ${status.runtimeServers.length} connector MCP server(s) are projected and ordinary reconciliation remains deferred`
			: `[Copilot:${session.sessionId}] Reconciled ${status.runtimeServers.length} connector MCP server(s) through the Copilot runtime`);
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
		connectorServers: copilotConnectorServers(status),
		newlyConnectedChecked,
	};
}

/** Refreshes the catalog and returns it with the connected Connectors, in name order, that have no runtime server in this session yet. */
async function newlyConnectedConnectors(session: CopilotSession, accountId: string, current: ConnectorStatus, token: CancellationToken): Promise<{ readonly catalog: ConnectorCatalogResult; readonly added: string[] }> {
	const catalog = await raceCancellationError(session.rpc.connectors.refresh({ accountId }), token);
	const projected = new Set(current.runtimeServers.map(server => server.connectorName));
	const added = catalog.connectors.filter(connector => connector.status === 'connected' && !projected.has(connector.name)).map(connector => connector.name);
	return { catalog, added: added.sort() };
}

function copilotConnectorServers(status: ConnectorStatus): ICopilotConnectorServers {
	const names = new Map(status.catalog?.connectors.map(connector => [connector.name, connector.displayName.trim() || connector.name]));
	return {
		servers: new Map(status.runtimeServers.map(server => [server.runtimeServerId, {
			connectorName: server.connectorName,
			displayName: names.get(server.connectorName) ?? server.connectorName,
		}])),
		authorizationRequired: status.authorizationRequirement !== undefined,
	};
}
