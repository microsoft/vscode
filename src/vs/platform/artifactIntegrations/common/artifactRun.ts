/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArtifactJsonValue, ArtifactPrompt, ArtifactPromptReceipt, ArtifactRequestPresentation, ArtifactRun, ArtifactRunState } from './artifactIntegration.js';

type ArtifactRunStateTransition = {
	readonly state: ArtifactRunState;
	readonly reason?: string;
	readonly receipt?: ArtifactPromptReceipt;
	readonly dispatched?: boolean;
	readonly indeterminate?: boolean;
	readonly result?: ArtifactJsonValue;
};

type ArtifactRunPreparationTransition = {
	readonly prompt: ArtifactPrompt;
	readonly presentation: ArtifactRequestPresentation;
};

export type ArtifactRunTransition = ArtifactRunStateTransition | ArtifactRunPreparationTransition;

export function applyArtifactRunTransition(run: ArtifactRun, transition: ArtifactRunTransition, updatedAt: number): ArtifactRun {
	return { ...run, ...transition, updatedAt };
}
