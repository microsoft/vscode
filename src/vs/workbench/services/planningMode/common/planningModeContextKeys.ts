/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const InPlanningModeContext = new RawContextKey<boolean>('planningMode.active', false, {
	type: 'boolean',
	description: 'Whether planning mode is currently active'
});

export const PlanningModeConversationCountContext = new RawContextKey<number>('planningMode.conversationCount', 0, {
	type: 'number',
	description: 'Number of conversation entries in planning mode'
});

export const PlanningModeHasConversationContext = new RawContextKey<boolean>('planningMode.hasConversation', false, {
	type: 'boolean',
	description: 'Whether planning mode has conversation entries'
});
