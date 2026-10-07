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

/**
 * The row label. Once the router has picked a model, its explanation is
 * preferred because it already names the model.
 */
export function autoModeRoutingTitle(part: IChatAutoModeResolutionPart): string {
	if (!part.resolved) {
		return localize('autoMode.routing', "Auto routing task");
	}
	return part.resolved.reason ?? localize('autoMode.routedTo', "Auto routed task to {0}", part.resolved.name);
}
