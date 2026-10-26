/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatRequestViewModel } from '../common/model/chatViewModel.js';
import { getAgentMergeRequestLabel } from './widget/chatContentParts/chatAgentMergeContentPart.js';
import { getArtifactRequestAccessibleText, getArtifactRequestLabel, getArtifactRequestPresentation } from './widget/chatContentParts/chatArtifactActionContentPart.js';

/**
 * Display text for the timeline, transcript find and screen readers, with Agent Merge
 * summaries and system-notification wrappers handled without changing the request.
 */
export function getChatRequestText(item: IChatRequestViewModel): string {
	const artifactRequest = getArtifactRequestPresentation(item);
	if (artifactRequest) {
		return getArtifactRequestLabel(artifactRequest);
	}
	const agentMergeLabel = getAgentMergeRequestLabel(item);
	if (agentMergeLabel !== undefined) {
		return agentMergeLabel;
	}
	return item.isSystemInitiated ? stripSystemNotificationWrapper(item.messageText) : item.messageText;
}

/** Removes the outer runtime notification wrapper and its padding newline for display. */
export function stripSystemNotificationWrapper(text: string): string {
	const match = /^\s*<system_notification>(?:\r?\n)?(?<content>[\s\S]*?)(?:\r?\n)?<\/system_notification>\s*$/.exec(text);
	return match?.groups?.content ?? text;
}

export function getChatRequestAccessibleText(item: IChatRequestViewModel): string {
	const artifactRequest = getArtifactRequestPresentation(item);
	return artifactRequest ? getArtifactRequestAccessibleText(artifactRequest) : getChatRequestText(item);
}
