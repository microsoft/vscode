/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostDevContainersCapabilityMetaKey = 'vscode.devContainers';

export const AgentHostDevContainerEnvironmentsCapabilityMetaKey = 'vscode.devContainerEnvironments';

/** Whether the host supports launching and relaying Dev Container Agent Hosts. */
export function supportsAgentHostDevContainers(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostDevContainersCapabilityMetaKey] === true;
}

/** Whether the host supports Dev Container environments created from an image. */
export function supportsAgentHostDevContainerEnvironments(result: InitializeResult | undefined): boolean {
	return supportsAgentHostDevContainers(result) && result?._meta?.[AgentHostDevContainerEnvironmentsCapabilityMetaKey] === true;
}
