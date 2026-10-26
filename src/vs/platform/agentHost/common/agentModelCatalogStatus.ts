/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RootState } from './state/protocol/state.js';

const AGENT_MODEL_CATALOG_STATUS_KEY_PREFIX = 'vscode.agentModelCatalog.status.';

export type AgentModelCatalogStatus = 'pending' | 'ready' | 'error';

export function agentModelCatalogStatusKey(agent: string): string {
	return `${AGENT_MODEL_CATALOG_STATUS_KEY_PREFIX}${agent}`;
}

export function readAgentModelCatalogStatus(rootState: RootState | Error | undefined, agent: string): AgentModelCatalogStatus | undefined {
	if (!rootState || rootState instanceof Error) {
		return undefined;
	}
	const value = rootState.config?.values?.[agentModelCatalogStatusKey(agent)];
	return value === 'pending' || value === 'ready' || value === 'error' ? value : undefined;
}
