/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IChatAutoModeResolutionPart } from './chatService/chatService.js';

/**
 * Experiment treatment that hides Auto's routing explainability: the routing row
 * disappears and the response footer reports "Auto" rather than the model the
 * router picked. The Copilot extension reads the same treatment for local
 * sessions, so one assignment moves both harnesses together.
 */
export const HIDE_AUTO_EXPLAINABILITY_TREATMENT = 'copilotchat.hideAutoExplainability';

/** Collapsed row label: the router is still deciding, or it has answered. */
export function autoModeRoutingTitle(part: IChatAutoModeResolutionPart): string {
	return part.resolved
		? localize('autoMode.routed', "Routed task")
		: localize('autoMode.routing', "Routing task…");
}

/** Expanded row body, or `undefined` while there is nothing to explain yet. */
export function autoModeRoutingDetail(part: IChatAutoModeResolutionPart): string | undefined {
	return part.resolved
		? localize('autoMode.routedTo', "Auto routed your task to {0}", part.resolved.name)
		: undefined;
}
