/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentMetadataSource } from './metadata.js';
import { hasVSCodeToolCallMeta } from './vscode/agentToolCallMeta.js';
import { readPermissionRequestMeta, type IAgentPermissionRequestMeta } from './copilotd/agentPermissionRequestMeta.js';

export { AgentPermissionRequestKind } from './copilotd/agentPermissionRequestMeta.js';
export type { IAgentPermissionRequestMeta } from './copilotd/agentPermissionRequestMeta.js';

export function readAgentPermissionRequestMeta(source: IAgentMetadataSource): IAgentPermissionRequestMeta {
	return hasVSCodeToolCallMeta(source) ? {} : readPermissionRequestMeta(source);
}
