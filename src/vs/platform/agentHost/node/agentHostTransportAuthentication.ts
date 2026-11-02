/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IProtocolTransport } from '../common/state/sessionTransport.js';

const authenticatedTransports = new WeakSet<IProtocolTransport>();

/** Trusted local IPC or a connection validated against the single-user host token. */
export function authenticateAgentHostTransport(transport: IProtocolTransport): void {
	authenticatedTransports.add(transport);
}

export function isAuthenticatedAgentHostTransport(transport: IProtocolTransport): boolean {
	return authenticatedTransports.has(transport);
}
