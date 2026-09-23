/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostTimingCapabilityMetaKey = 'vscode.agentHostTiming';

/** The host accepts renderer timing diagnostics only when its OTel pipeline is enabled. */
export function supportsAgentHostTiming(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostTimingCapabilityMetaKey] === true;
}
