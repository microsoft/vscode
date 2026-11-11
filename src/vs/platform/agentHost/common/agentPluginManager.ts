/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ClientPluginCustomization, PluginCustomization } from './state/sessionState.js';

export const IAgentPluginManager = createDecorator<IAgentPluginManager>('agentPluginManager');

/** Static active-client identity used for host-resolved automation plugins. */
export const AUTOMATION_ACTIVE_CLIENT_ID = 'vscode.automation';

/**
 * Scheme for plugin customization URIs that name a directory on the agent
 * host's own disk. Every other URI, including `file:`, names a resource on the
 * client that published the customization.
 */
export const AGENT_HOST_FILE_SCHEME = 'vscode-agent-host-file';

/** Marks a `file:` URI as a path on the agent host's own disk. */
export function toAgentHostFileUri(uri: URI): URI {
	return uri.with({ scheme: AGENT_HOST_FILE_SCHEME });
}

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

	/** Directory for immutable host-owned plugin copies, such as automation captures. */
	readonly hostPluginsPath: URI;

	/**
	 * Syncs a set of client-provided plugin customizations to local storage.
	 * Customizations with an {@link AGENT_HOST_FILE_SCHEME} URI are already on
	 * the host's disk and are used in place without a copy or cache entry.
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
}
