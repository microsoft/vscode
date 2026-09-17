/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkflowStartOptions } from '../../workflow/common/workflow.js';
import type { AgentSelection, MessageAttachment, ModelSelection } from './state/sessionState.js';

/** Normal message selections and context applied to the workflow's first dispatched turn. */
export interface IAgentHostWorkflowStartContext {
	readonly model?: ModelSelection;
	readonly agent?: AgentSelection;
	readonly attachments?: readonly MessageAttachment[];
}

/** Model-specific configuration is carried by {@link ModelSelection.config}. */
export interface IAgentHostWorkflowStartOptions extends WorkflowStartOptions, IAgentHostWorkflowStartContext { }

/** A complete snapshot; absent extension IDs are unavailable, including removals while disconnected. */
export function isWorkflowExtensionSources(value: unknown): value is Readonly<Record<string, boolean>> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
		&& Object.entries(value).every(([id, enabled]) => id.length > 0 && id.length <= 1024 && id === id.toLowerCase() && typeof enabled === 'boolean');
}
