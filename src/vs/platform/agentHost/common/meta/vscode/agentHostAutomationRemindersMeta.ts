/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AutomationDefinition } from '../../state/protocol/channels-automation/state.js';
import { isObject } from '../../../../../base/common/types.js';

const reminderContextKey = 'vscode.reminderContext';

/** Opaque client context for an explicit handoff, never interpreted by the host scheduler. */
export interface IAgentHostAutomationReminderContext {
	readonly attachments?: string;
	readonly handoffId?: string;
	/** Client-owned session URI, preserved verbatim rather than mapped into host filesystem space. */
	readonly sourceSessionResource?: string;
}

export function getAgentHostAutomationReminderContext(definition: AutomationDefinition): IAgentHostAutomationReminderContext | undefined {
	const value = definition._meta?.[reminderContextKey];
	if (!isObject(value)) {
		return undefined;
	}
	const context = value as Record<string, unknown>;
	if (context.attachments !== undefined && typeof context.attachments !== 'string'
		|| context.handoffId !== undefined && typeof context.handoffId !== 'string'
		|| context.sourceSessionResource !== undefined && typeof context.sourceSessionResource !== 'string') {
		return undefined;
	}
	return {
		...(typeof context.attachments === 'string' ? { attachments: context.attachments } : {}),
		...(typeof context.handoffId === 'string' ? { handoffId: context.handoffId } : {}),
		...(typeof context.sourceSessionResource === 'string' ? { sourceSessionResource: context.sourceSessionResource } : {}),
	};
}

export function withAgentHostAutomationReminderContext(meta: Record<string, unknown> | undefined, context: IAgentHostAutomationReminderContext | undefined): Record<string, unknown> | undefined {
	if (context === undefined && meta === undefined) {
		return undefined;
	}
	const result = { ...meta };
	if (context === undefined) {
		delete result[reminderContextKey];
	} else {
		result[reminderContextKey] = { ...context };
	}
	return result;
}
