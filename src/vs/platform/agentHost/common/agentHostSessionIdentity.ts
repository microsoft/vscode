/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { AgentSession } from './agent.js';
import { isNativeAgentHost, supportsAgentHostSessionUris } from './meta/agentHostSessionUrisMeta.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { RootState } from './state/sessionState.js';

/** Unmarked conforming hosts use AHP addressing; only a positively identified older native host needs legacy creation. */
export function newAgentHostSessionUri(provider: string, id: string, host: InitializeResult | undefined, root?: RootState): URI {
	const legacyNativeHost = !host || isNativeAgentHost(host, root) && !supportsAgentHostSessionUris(host);
	return AgentSession.uri(legacyNativeHost ? provider : 'ahp-session', id);
}
