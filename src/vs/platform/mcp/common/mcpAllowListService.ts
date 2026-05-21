/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * State of the enterprise MCP allow list service.
 */
export const enum McpAllowListState {
	/** Enterprise allow list enforcement is not applicable (no enterprise entries). */
	NotApplicable,
	/** The allow list is currently being fetched. */
	Loading,
	/** The allow list has been loaded and is ready for enforcement. */
	Ready,
	/** The allow list could not be loaded (network failure, etc.). */
	Unavailable,
}

/**
 * Service that manages enterprise MCP server allow lists.
 *
 * When a user is in an enterprise with MCP allow list policies, this service
 * fetches the allow list from the enterprise registry and gates server launches.
 */
export const IMcpAllowListService = createDecorator<IMcpAllowListService>('IMcpAllowListService');
export interface IMcpAllowListService {
	readonly _serviceBrand: undefined;

	/** State of the allow list service. */
	readonly state: McpAllowListState;

	/**
	 * Waits until the allow list is loaded or the service determines that
	 * enterprise allow list enforcement is not applicable. Returns immediately
	 * if already resolved.
	 */
	waitForReady(token?: CancellationToken): Promise<void>;

	/**
	 * Checks whether a server (identified by its fingerprint) is allowed to run.
	 *
	 * @param fingerprint The computed SHA-256 fingerprint of the server's identity.
	 * @returns `true` if the server is allowed, or an `IMarkdownString` explaining why it was blocked.
	 */
	isAllowed(fingerprint: string): true | IMarkdownString;
}
