/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatRequestViewModel } from '../common/model/chatViewModel.js';
import { getAgentMergeRequestLabel } from './widget/chatContentParts/chatAgentMergeContentPart.js';

/**
 * Text that stands for a request wherever its row is described rather than
 * rendered — the timeline, transcript find and screen readers. A request whose
 * row shows something other than its own text (an Agent Merge turn renders a
 * summary of its machine-facing state block) contributes its own label; every
 * other request keeps its message text. Further kinds add a check of their own.
 */
export function getChatRequestText(item: IChatRequestViewModel): string {
	const agentMergeLabel = getAgentMergeRequestLabel(item);
	if (agentMergeLabel !== undefined) {
		return agentMergeLabel;
	}
	return item.messageText;
}
