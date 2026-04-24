/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { CustomizationRef, SessionCustomization } from './state/sessionState.js';

export const IAgentPluginManager = createDecorator<IAgentPluginManager>('agentPluginManager');

/**
 * A synced customization with its local plugin directory (when available).
 */
export interface ISyncedCustomization {
	/** The session customization with loading/error status. */
	readonly customization: SessionCustomization;
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
	 * Syncs a set of client-provided customization refs to local storage.
	 *
	 * Each ref is copied to a local directory, respecting nonce-based
	 * caching. The optional {@link progress} callback fires as individual
	 * customizations complete or fail, allowing callers to publish
	 * incremental status updates.
	 *
	 * Concurrent calls for the same plugin URI are serialized so that
	 * overlapping syncs do not clobber each other.
	 *
	 * @returns Final status for every customization, with `pluginDir`
	 * defined when the sync was successful.
	 */
	syncCustomizations(clientId: string, customizations: CustomizationRef[], progress?: (status: SessionCustomization[]) => void): Promise<ISyncedCustomization[]>;
}
