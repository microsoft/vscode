/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';

export interface IAgentsWindowInvitationCopy {
	readonly title: string;
	readonly description: string;
	readonly actionLabel: string;
}

export interface IAgentsWindowInvitationScenario extends IAgentsWindowInvitationCopy {
	readonly id: 'continueInAgentsWindow' | 'parallelWorkSameWindow' | 'parallelWorkAllWindows';
	readonly source: AgentsWindowOpenSource;
	readonly delaySeconds: number;
	readonly matches: (activity: { readonly sameWindow: number; readonly acrossWindows: boolean }) => boolean;
}

/** Ordered by relevance; only select again after the current invitation is released. */
export const agentsWindowInvitationScenarios: readonly IAgentsWindowInvitationScenario[] = [{
	id: 'parallelWorkAllWindows',
	source: AgentsWindowOpenSource.ParallelWorkAllWindows,
	delaySeconds: 15,
	matches: activity => activity.acrossWindows,
	title: localize('agentsWindowInvitation.allWindows.title', "View all your sessions in the Agents Window"),
	description: localize('agentsWindowInvitation.allWindows.description', "Keep track of agent sessions from all your editor windows in one place."),
	actionLabel: localize('agentsWindowInvitation.allWindows.action', "View All in Agents Window"),
}, {
	id: 'parallelWorkSameWindow',
	source: AgentsWindowOpenSource.ParallelWorkSameWindow,
	delaySeconds: 15,
	matches: activity => activity.sameWindow >= 2,
	title: localize('agentsWindowInvitation.sameWindow.title', "View all your sessions in the Agents Window"),
	description: localize('agentsWindowInvitation.sameWindow.description', "Keep track of your parallel tasks and switch between agent sessions in one place."),
	actionLabel: localize('agentsWindowInvitation.sameWindow.action', "View in Agents Window"),
}, {
	id: 'continueInAgentsWindow',
	source: AgentsWindowOpenSource.ContinueInAgentsWindow,
	delaySeconds: 30,
	matches: () => true,
	title: localize('agentsWindowInvitation.continue.title', "Continue in the Agents Window"),
	description: localize('agentsWindowInvitation.continue.description', "View this and other agent sessions across your projects in the Agents Window."),
	actionLabel: localize('agentsWindowInvitation.continue.action', "Continue in Agents Window"),
}];

export const agentsWindowInvitationTreatmentFields = ['enabled', 'delaySeconds', 'title', 'description', 'actionLabel'] as const;

export function getAgentsWindowInvitationTreatment(scenario: IAgentsWindowInvitationScenario, field: typeof agentsWindowInvitationTreatmentFields[number]): string {
	return `chatAgentsWindowBanner.${scenario.id}.${field}`;
}

export function isAgentsWindowInvitationSource(source: AgentsWindowOpenSource): boolean {
	return agentsWindowInvitationScenarios.some(scenario => scenario.source === source);
}
