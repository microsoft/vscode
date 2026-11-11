/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatTokenCount } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import { getReasoningEffortLabel } from '../../../../platform/agentHost/common/reasoningEffort.js';
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
	if (part.router) {
		if (!part.resolved) {
			return localize('modelRouter.routing', "{0} picking a model", part.router);
		}
		const title = part.playbook
			? modelRouterPlaybookTitle(part.router, part.playbook, part.resolved.name, part)
			: part.switchedFrom
				? localize('modelRouter.switched', "{0} switched from {1} to {2}", part.router, part.switchedFrom, part.resolved.name)
				: part.kept
					? localize('modelRouter.kept', "{0} stayed on {1}", part.router, part.resolved.name)
					: part.defaulted
						? localize('modelRouter.defaulted', "{0} used {1}, its first route", part.router, part.resolved.name)
						: localize('modelRouter.routed', "{0} picked {1}", part.router, part.resolved.name);
		const withEffort = part.effort
			? localize('modelRouter.withEffort', "{0} \u00b7 {1} effort", title, getReasoningEffortLabel(part.effort))
			: title;
		return part.contextSize
			? localize({ key: 'modelRouter.withContextSize', comment: ['{0} is a sentence about the model a router picked, {1} is a context window size such as 1M or 200K'] }, "{0} \u00b7 {1}", withEffort, formatTokenCount(part.contextSize))
			: withEffort;
	}
	if (!part.resolved) {
		return localize('autoMode.routing', "Auto routing task");
	}
	return part.resolved.reason ?? (part.fusion
		? localize('autoMode.fusionRoutedTo', "Copilot Fusion routed task to {0}", part.resolved.name)
		: localize('autoMode.routedTo', "Auto routed task to {0}", part.resolved.name));
}

/** The routing line for a router written as playbooks: it names the playbook as well as the model it runs on. */
function modelRouterPlaybookTitle(router: string, playbook: string, model: string, part: Pick<IChatAutoModeResolutionPart, 'switchedFrom' | 'kept' | 'defaulted'>): string {
	// A chat that moves to the router gets one routing line, so it has to name the playbook too.
	if (part.switchedFrom) {
		return localize('modelRouter.playbookSwitched', "{0} switched from {1} to its {2} playbook on {3}", router, part.switchedFrom, playbook, model);
	}
	if (part.kept) {
		return localize('modelRouter.playbookKept', "{0} stayed on its {1} playbook on {2}", router, playbook, model);
	}
	return part.defaulted
		? localize('modelRouter.playbookDefaulted', "{0} used its {1} playbook on {2}, its fallback", router, playbook, model)
		: localize('modelRouter.playbookRouted', "{0} picked its {1} playbook on {2}", router, playbook, model);
}

/** Why a host-side router made its pick, for the routing line's hover. Auto explains itself in its title. */
export function autoModeRoutingHover(part: IChatAutoModeResolutionPart): string | undefined {
	if (!part.router || !part.resolved) {
		return undefined;
	}
	return part.kept
		? localize('modelRouter.hover.kept', "The chat stays on its model unless the work clearly changes, because switching loses the prompt cache.")
		: part.defaulted
			? localize('modelRouter.hover.defaulted', "No route clearly fit this request, or routing was unavailable.")
			: part.preference
				? localize('modelRouter.hover.route', "Route: {0}", part.preference)
				: undefined;
}
