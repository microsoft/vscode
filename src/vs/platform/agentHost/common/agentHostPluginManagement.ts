/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vArray, vBoolean, vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';
import type { Event } from '../../../base/common/event.js';

export const ManageAgentHostPluginsExtensionMethod = 'vscode/plugins/v1/manage';
export const AgentHostPluginsChangedNotification = 'vscode/plugins/v1/changed';
export const agentHostPluginsChangedValidator = vObj({ provider: vString() });

export const agentHostPluginManagementRequestValidator = vObj({
	provider: vString(),
	operation: vEnum('list', 'browse', 'install', 'uninstall', 'update', 'enable', 'disable'),
	// A host-side file URI, interpreted on the host rather than the client's OS.
	workingDirectory: vOptionalProp(vString()),
	target: vOptionalProp(vString()),
	directSourceId: vOptionalProp(vString()),
	marketplaceSource: vOptionalProp(vString()),
});

export type IAgentHostPluginManagementRequest = ValidatorType<typeof agentHostPluginManagementRequestValidator>;

export const agentHostPluginManagementResultValidator = vObj({
	plugins: vArray(vObj({
		name: vString(),
		marketplace: vString(),
		spec: vString(),
		enabled: vBoolean(),
		version: vOptionalProp(vString()),
		directSourceId: vOptionalProp(vString()),
		canToggle: vBoolean(),
		canUninstall: vBoolean(),
		canUpdate: vBoolean(),
	})),
	catalog: vArray(vObj({
		name: vString(),
		marketplace: vString(),
		spec: vString(),
		description: vOptionalProp(vString()),
	})),
	messages: vArray(vString()),
});

export type IAgentHostPluginManagementResult = ValidatorType<typeof agentHostPluginManagementResultValidator>;

/** Optional, policy-aware plugin management implemented by the owning provider. */
export interface IAgentHostPluginManagement {
	readonly onDidChange?: Event<void>;
	manage(request: IAgentHostPluginManagementRequest): Promise<IAgentHostPluginManagementResult>;
}
