/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CreateChatParams } from '../../state/protocol/channels-chat/commands.js';
import type { InitializeResult } from '../../state/protocol/common/commands.js';

/** Advertised on initialize and requested on createChat to retain side-chat provenance without source context. */
export const AgentHostSideChatWithoutContextMetaKey = 'vscode.sideChatWithoutContext';

export function supportsAgentHostSideChatWithoutContext(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSideChatWithoutContextMetaKey] === true;
}

/** Returns the requested context exclusion, or 'invalid' for malformed metadata. */
export function readSideChatWithoutContext(params: CreateChatParams): boolean | 'invalid' | undefined {
	const value = params._meta?.[AgentHostSideChatWithoutContextMetaKey];
	return value === undefined || typeof value === 'boolean' ? value : 'invalid';
}

export function withSideChatWithoutContext(meta: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
	return { ...meta, [AgentHostSideChatWithoutContextMetaKey]: true };
}
