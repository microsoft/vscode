/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { renderArtifactDetails } from './artifactIntegrationPresentation.fixture.js';

export default defineThemedFixtureGroup({ path: 'sessions/artifactDetails' }, {
	Attention: defineComponentFixture({ render: context => renderArtifactDetails(context, 'attention') }),
	TitleHover: defineComponentFixture({ render: context => renderArtifactDetails(context, 'titleHover') }),
	Comments: defineComponentFixture({ render: context => renderArtifactDetails(context, 'comments') }),
	CommentsInformation: defineComponentFixture({ render: context => renderArtifactDetails(context, 'tabInfo') }),
	AutopilotCollapsed: defineComponentFixture({ render: context => renderArtifactDetails(context, 'autopilotCollapsed') }),
	AutopilotExpanded: defineComponentFixture({ render: context => renderArtifactDetails(context, 'autopilotExpanded') }),
	KeyboardFocus: defineComponentFixture({ render: context => renderArtifactDetails(context, 'tabFocus'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	EnumPolicy: defineComponentFixture({ render: context => renderArtifactDetails(context, 'enumPolicy') }),
	EnumPolicyNarrow: defineComponentFixture({ render: context => renderArtifactDetails(context, 'enumPolicyNarrow') }),
	ActivitiesCollapsed: defineComponentFixture({ render: context => renderArtifactDetails(context, 'activitiesCollapsed') }),
	ActivitiesExpanded: defineComponentFixture({ render: context => renderArtifactDetails(context, 'activitiesExpanded'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ActivitiesNarrow: defineComponentFixture({ render: context => renderArtifactDetails(context, 'activitiesNarrow'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	Ready: defineComponentFixture({ render: context => renderArtifactDetails(context, 'ready') }),
	Mixed: defineComponentFixture({ render: context => renderArtifactDetails(context, 'mixed') }),
	Narrow: defineComponentFixture({ render: context => renderArtifactDetails(context, 'narrow'), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	NarrowComments: defineComponentFixture({ render: context => renderArtifactDetails(context, 'narrowComments') }),
	Experiment: defineComponentFixture({ render: context => renderArtifactDetails(context, 'experiment') }),
	Delivery: defineComponentFixture({ render: context => renderArtifactDetails(context, 'delivery') }),
	DeliveryRollouts: defineComponentFixture({ render: context => renderArtifactDetails(context, 'deliveryRollouts') }),
});
