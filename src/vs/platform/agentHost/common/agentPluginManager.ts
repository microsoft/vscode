/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ClientPluginCustomization, PluginCustomization } from './state/sessionState.js';

export const IAgentPluginManager = createDecorator<IAgentPluginManager>('agentPluginManager');

/**
 * A synced customization with its local plugin directory (when available).
 */
export interface ISyncedCustomization {
	/** The session customization with loading/error status. */
	readonly customization: PluginCustomization;
	/** Local plugin directory URI, defined when the sync was successful. */
	readonly pluginDir?: URI;
}

/**
 * Holds captured customizations while an automation mutation is being committed.
 *
 * The customizations identify immutable host directories only. Callers must
 * parse those directories before persisting host-discovered children and load state.
 */
export interface ICustomizationCaptureLease extends IDisposable {
	readonly customizations: readonly PluginCustomization[];
}

/**
 * Manages Open Plugin directories for agent backends.
 *
 * Shared across agents and sessions. Syncs client-provided customization
 * references to local disk, tracking nonces to avoid redundant copies.
 * Concurrent syncs of the same plugin URI are serialized internally.
 */
export interface IAgentPluginManager {
	readonly _serviceBrand: undefined;

	/**
	 * Root directory under which all agent plugin data is materialized.
	 * Exposed so other host-side components can carve out sibling
	 * directories for their own bundles (e.g. session-discovered
	 * customizations) without having to thread `userDataPath` separately.
	 */
	readonly basePath: URI;

	/**
	 * Syncs a set of client-provided plugin customizations to local storage.
	 *
	 * Each plugin is copied to a local directory, respecting nonce-based
	 * caching. The optional {@link progress} callback fires with the single
	 * customization that completed or failed, allowing callers to publish
	 * targeted incremental status updates.
	 *
	 * Concurrent calls for the same plugin URI are serialized so that
	 * overlapping syncs do not clobber each other.
	 *
	 * @returns Final status for every customization, with `pluginDir`
	 * defined when the sync was successful.
	 */
	syncCustomizations(clientId: string, customizations: ClientPluginCustomization[], progress?: (status: PluginCustomization) => void): Promise<ISyncedCustomization[]>;

	/**
	 * Captures client customizations into immutable host-owned directories.
	 *
	 * Unlike ordinary synchronization, any capture failure rejects the operation.
	 * The returned customizations do not trust client-provided parsed contents.
	 */
	captureCustomizations(clientId: string, customizations: ClientPluginCustomization[]): Promise<ICustomizationCaptureLease>;

	/** Adds durable holders for captured customizations without removing existing holders. */
	retainCustomizationHolders(holders: ReadonlyMap<string, readonly PluginCustomization[]>): Promise<void>;

	/**
	 * Replaces the durable holders in one namespace while preserving all other
	 * holders.
	 */
	reconcileCustomizationHolders(holderPrefix: string, holders: ReadonlyMap<string, readonly PluginCustomization[]>): Promise<void>;

	/** Returns the host directory for a captured customization URI. */
	getCapturedPluginDir(capturedUri: string): URI | undefined;
}
