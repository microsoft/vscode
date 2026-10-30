/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ArtifactAuthority, ArtifactAutomationOption, ArtifactContributionSnapshot } from './artifactIntegration.js';

/** Where an integration's automation runs and where its automatic prompts go. */
export function describeArtifactAutomationScope(location: ArtifactAuthority['location']): string {
	return location === 'client'
		? localize('artifactLocalScope', "Runs on this computer while connected. Automatic prompts go to the artifact's original chat.")
		: localize('artifactHostScope', "Runs on the agent host for this session. Automatic prompts go to the artifact's original chat.");
}

export interface IArtifactAutomationConsentOptions {
	/** The value being turned on, to describe the selected mode of a choice option. */
	readonly value?: boolean | string;
	/** Includes where the automation runs. */
	readonly location?: ArtifactAuthority['location'];
}

/**
 * What a person agrees to by turning an option on: its effect, the selected mode, where it runs, the actions it may
 * take, and its attempt limit. Plain-text paragraphs shared by every surface that asks for this consent.
 */
export function describeArtifactAutomationConsent(contribution: Pick<ArtifactContributionSnapshot, 'actions'>, option: ArtifactAutomationOption, options: IArtifactAutomationConsentOptions = {}): readonly string[] {
	const choice = option.kind === 'enum' && options.value !== undefined ? option.choices.find(choice => choice.value === options.value) : undefined;
	return [
		option.description,
		...(choice ? [localize('artifactAutomationConsentMode', "Mode: {0}.", choice.label), ...(choice.description ? [choice.description] : [])] : []),
		...(options.location ? [describeArtifactAutomationScope(options.location)] : []),
		localize('artifactPermittedActions', "Allowed actions: {0}.", option.actionIds.map(id => contribution.actions.find(action => action.id === id)?.label ?? id).join(', ')),
		option.maxAttempts === 1
			? localize('artifactAttemptBudgetOne', "At most 1 dispatched attempt per occurrence.")
			: localize('artifactAttemptBudget', "At most {0} dispatched attempts per occurrence.", option.maxAttempts),
	];
}
