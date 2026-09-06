/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../base/common/types.js';
import { type IDialogService } from '../../dialogs/common/dialogs.js';
import { type IProductService } from '../../product/common/productService.js';
import { type IRemoteAgentHostLocationPreferenceService } from './remoteAgentHostLocationPreference.js';
import { promptRemoteAgentHostLocationPreference } from './remoteAgentHostLocationPreferenceDialog.js';
import { type ITunnelGatewayEndpoint, type ITunnelGatewayInventory, type ITunnelGatewaySelection, type TunnelGatewayServerType } from './tunnelAgentHost.js';

/** Endpoints of `type`, sorted deterministically by `instanceId`. */
function sortedGatewayEndpoints(inventory: ITunnelGatewayInventory, type: TunnelGatewayServerType): ITunnelGatewayEndpoint[] {
	return inventory.endpoints
		.filter(endpoint => endpoint.type === type)
		.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}

/** The live `editor` endpoint to use, chosen deterministically when several exist. */
export function selectEditorGatewayEndpoint(inventory: ITunnelGatewayInventory): ITunnelGatewayEndpoint | undefined {
	return sortedGatewayEndpoints(inventory, 'editor')[0];
}

/**
 * Deterministic dedicated-agent-host selection: reuse the first live
 * standalone instance if one exists, otherwise request a new dedicated one.
 *
 * Callers must not reach this on a delegated tunnel — {@link resolveGatewaySelection}
 * short-circuits before any dedicated fallback, since a dedicated host behind
 * an editor-bound tunnel would outlive the tunnel and be unreachable.
 */
export function selectDedicatedGatewayFallback(inventory: ITunnelGatewayInventory): ITunnelGatewaySelection {
	const standalone = sortedGatewayEndpoints(inventory, 'standalone')[0];
	return standalone ? { instanceId: standalone.instanceId } : { newDedicated: true };
}

/**
 * The selection to retry with after the gateway *rejected* `rejected` (see
 * {@link isTunnelGatewaySelectionRejectedError}) — the tunnel is up and only
 * the endpoint we asked for is gone, typically an `editor` endpoint whose
 * agent host exited while its registry entry lingered. Picks a dedicated
 * host exactly like {@link selectDedicatedGatewayFallback}, but never the
 * instance that was just rejected. A delegated tunnel instead retries only
 * its bound endpoint: it must never select or spawn a dedicated host.
 *
 * Returns `undefined` when there is nothing meaningful left to try: the
 * rejected selection was itself a request for a brand new dedicated
 * instance, so the gateway failed to *spawn* a host rather than failing to
 * reach an existing one, and retrying would just fail the same way.
 */
export function selectGatewayFallbackAfterRejection(rejected: ITunnelGatewaySelection, inventory: ITunnelGatewayInventory): ITunnelGatewaySelection | undefined {
	if (inventory.delegatedInstanceId) {
		return { instanceId: inventory.delegatedInstanceId };
	}
	if (!hasKey(rejected, { instanceId: true })) {
		return undefined;
	}
	const standalone = sortedGatewayEndpoints(inventory, 'standalone').find(endpoint => endpoint.instanceId !== rejected.instanceId);
	return standalone ? { instanceId: standalone.instanceId } : { newDedicated: true };
}

/** Inputs needed to resolve a protocol-v6 gateway endpoint selection. See {@link resolveGatewaySelection}. */
export interface IGatewaySelectionRequest {
	/** Stable {@link IRemoteAgentHostLocationPreferenceService} key, e.g. `tunnel:<tunnelId>`. */
	readonly hostKey: string;
	/** User-facing tunnel name shown in the location-preference modal. */
	readonly hostLabel: string;
	/** Product name (typically {@link IProductService.nameShort}) substituted into the modal's editor-option detail text. */
	readonly productName: string;
	readonly inventory: ITunnelGatewayInventory;
	readonly userInitiated: boolean;
}

/**
 * Resolve which agent host endpoint to select for a protocol-v6 gateway
 * session, driven by the user's saved {@link IRemoteAgentHostLocationPreferenceService}
 * preference for the host rather than an endpoint picker:
 *
 * - A saved `'editor'` preference selects the live editor endpoint if one
 *   exists, or falls back to a dedicated endpoint (without changing the
 *   preference) if it doesn't — a stored editor preference is explicit
 *   consent, so this applies even for a background reconnect.
 * - A saved `'dedicated'` preference always falls back to a dedicated
 *   endpoint and never prompts.
 * - With no saved preference and no editor endpoint: selects dedicated and
 *   persists that only available location after a user-initiated connection.
 * - With no saved preference and a live editor: background connections defer
 *   until the user connects manually; user-initiated connections prompt with
 *   {@link promptRemoteAgentHostLocationPreference} and persist the choice.
 *
 * Returns `undefined` only when the user cancels that modal.
 */
export async function resolveGatewaySelection(
	locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
	dialogService: IDialogService,
	request: IGatewaySelectionRequest,
): Promise<ITunnelGatewaySelection | undefined> {
	const { hostKey, hostLabel, productName, inventory, userInitiated } = request;
	const preference = locationPreferenceService.getPreference(hostKey);
	// A dedicated host behind an editor-bound tunnel would be orphaned when
	// that editor exits, so this tunnel may only use its delegated endpoint.
	if (inventory.delegatedInstanceId) {
		if (!preference && userInitiated) {
			locationPreferenceService.setPreference(hostKey, 'editor');
		}
		return { instanceId: inventory.delegatedInstanceId };
	}
	const editor = selectEditorGatewayEndpoint(inventory);

	if (preference === 'editor') {
		return editor ? { instanceId: editor.instanceId } : selectDedicatedGatewayFallback(inventory);
	}
	if (preference === 'dedicated') {
		return selectDedicatedGatewayFallback(inventory);
	}
	if (!editor) {
		if (userInitiated) {
			locationPreferenceService.setPreference(hostKey, 'dedicated');
		}
		return selectDedicatedGatewayFallback(inventory);
	}
	if (!userInitiated) {
		return undefined;
	}

	const chosen = await promptRemoteAgentHostLocationPreference(dialogService, hostLabel, productName);
	if (!chosen) {
		return undefined;
	}
	locationPreferenceService.setPreference(hostKey, chosen);
	return chosen === 'editor' ? { instanceId: editor.instanceId } : selectDedicatedGatewayFallback(inventory);
}

/**
 * Decide whether a tunnel-failover notification should be shown after a successful factory-built connection. Fires in two cases, both of which mean the editor
 * process that used to host the connection is gone and a dedicated agent
 * host silently took its place:
 *
 * - `editorFallback`: this very attempt asked the gateway for a live-looking
 *   `editor` endpoint, was rejected because it is not actually reachable,
 *   and transparently retried against a dedicated host. The substitution
 *   happened inside a single connect, so there is no earlier registration to
 *   compare against — and it is equally surprising for a user-initiated
 *   connect, which explicitly asked for the editor host. A stale `editor`
 *   entry can linger in the remote registry for as long as its PID does, so
 *   every later reconnect repeats the same fallback; those must stay quiet
 *   once the address is already known to be on a `standalone` host, or the
 *   user would be notified again on every reconnect.
 * - An automatic/background reconnect (never a user-initiated one) that
 *   moved a previously `editor`-owned endpoint to a `standalone` one for the
 *   same stable tunnel address.
 *
 * Exported so the decision can be unit tested without constructing the full
 * service.
 */
export function shouldNotifyTunnelFailover(
	previousServerType: TunnelGatewayServerType | 'unknown' | undefined,
	newServerType: TunnelGatewayServerType | 'unknown',
	userInitiated: boolean,
	editorFallback = false,
): boolean {
	if (editorFallback) {
		return newServerType === 'standalone' && previousServerType !== 'standalone';
	}
	return !userInitiated && previousServerType === 'editor' && newServerType === 'standalone';
}

/**
 * Retains the last successfully registered endpoint's server type per
 * stable tunnel address (`tunnel:<tunnelId>`) so a later automatic
 * reconnect for the same tunnel can detect a silent editor → standalone
 * failover via {@link shouldNotifyTunnelFailover}. Server types are recorded only after a successful factory-built connection and are deliberately never cleared on relay closure, so the
 * comparison survives disconnect/reconnect cycles for the tunnel's
 * lifetime. Exported (and kept free of any IPC/protocol dependencies) so
 * the retention + decision behavior can be unit tested in isolation.
 */
export class TunnelFailoverTracker {
	private readonly _lastSelectedServerType = new Map<string, TunnelGatewayServerType | 'unknown'>();

	/**
	 * Record a successful registration for `address` and report whether it
	 * should trigger a failover notification. Always updates the retained
	 * metadata, regardless of the returned value.
	 */
	recordAndShouldNotify(address: string, newServerType: TunnelGatewayServerType | 'unknown', userInitiated: boolean, editorFallback = false): boolean {
		const previousServerType = this._lastSelectedServerType.get(address);
		const notify = shouldNotifyTunnelFailover(previousServerType, newServerType, userInitiated, editorFallback);
		this._lastSelectedServerType.set(address, newServerType);
		return notify;
	}
}
