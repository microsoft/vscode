/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArtifactRequestPresentation } from '../../common/artifactIntegration.js';

export function createTestArtifactRequestPresentation(overrides: Partial<ArtifactRequestPresentation> = {}): ArtifactRequestPresentation {
	return {
		version: 1,
		integrationLabel: 'Experiments',
		source: 'automation',
		action: { label: 'Analyse Scorecard', iconId: 'graph' },
		artifact: { resource: 'https://example.test/experiments/42', label: 'Experiment 42', description: 'Search ranking', icon: { id: 'beaker' } },
		details: [{
			title: 'Scorecard',
			description: 'Results are ready to analyse.',
			availability: { kind: 'available' },
			facts: [{ id: 'state', label: 'State', value: 'Completed' }],
			links: [],
			items: [{ id: 'metric', label: 'Successful searches', description: '+2.3%', icon: { id: 'pass', colorId: 'charts.green' }, resource: 'https://example.test/experiments/42/scorecard' }],
			completeness: 'complete',
		}],
		...overrides,
	};
}
