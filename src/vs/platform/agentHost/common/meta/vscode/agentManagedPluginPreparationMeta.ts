/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const MANAGED_PLUGIN_PREPARATION_META_KEY = 'vscode.managedPluginPreparation';

export const enum AgentManagedPluginPreparationState {
	Progress = 'progress',
	Complete = 'complete',
	Failure = 'failure',
}

interface IHasManagedPluginPreparationMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Reads recognized VS Code-managed plugin preparation metadata. */
export function readAgentManagedPluginPreparationState(source: IHasManagedPluginPreparationMeta): AgentManagedPluginPreparationState | undefined {
	const value = source._meta?.[MANAGED_PLUGIN_PREPARATION_META_KEY];
	if (!isObject(value)) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	if (record.schemaVersion !== 1) {
		return undefined;
	}
	switch (record.state) {
		case AgentManagedPluginPreparationState.Progress:
		case AgentManagedPluginPreparationState.Complete:
		case AgentManagedPluginPreparationState.Failure:
			return record.state;
		default:
			return undefined;
	}
}

/** Serializes VS Code-managed plugin preparation metadata for the open protocol bag. */
export function toAgentManagedPluginPreparationMeta(state: AgentManagedPluginPreparationState): Record<string, unknown> {
	return {
		[MANAGED_PLUGIN_PREPARATION_META_KEY]: {
			schemaVersion: 1,
			state,
		},
	};
}
