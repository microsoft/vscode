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

/** The row label, naming the model once the router has picked one. */
export function autoModeRoutingTitle(part: IChatAutoModeResolutionPart): string {
	return part.resolved
		? localize('autoMode.routedTo', "Auto routed task to {0}", part.resolved.name)
		: localize('autoMode.routing', "Auto routing task");
}
