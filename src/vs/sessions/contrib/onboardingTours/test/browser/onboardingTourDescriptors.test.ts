/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { NEW_SESSION_TOUR_ID } from '../../browser/tours/newSessionTour.js';
import { NEW_SESSION_VIEW_TOUR_ID } from '../../browser/tours/newSessionViewTour.js';
import { NEW_SESSION_VIEW_V2_TOUR_ID, NEW_SESSION_VIEW_V2_VARIATIONS } from '../../browser/tours/newSessionViewV2Tour.js';
import { AGENTS_WINDOW_INVITATION_TOUR_ID } from '../../browser/tours/agentsWindowInvitationTour.js';
import { NEW_SESSION_VIEW_V3_TOUR_ID, NEW_SESSION_VIEW_V3_VARIATIONS } from '../../browser/tours/newSessionViewV3Tour.js';
import { SESSION_ARCHIVE_TOUR_ID } from '../../browser/tours/sessionArchiveTour.js';

suite('OnboardingTourDescriptors', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('declares every session onboarding tour for developer settings', () => {
		const descriptors = new Map(onboardingScenarioRegistry.getScenarioDescriptors().map(descriptor => [descriptor.id, descriptor]));

		assert.deepStrictEqual([
			NEW_SESSION_TOUR_ID,
			NEW_SESSION_VIEW_TOUR_ID,
			NEW_SESSION_VIEW_V2_TOUR_ID,
			AGENTS_WINDOW_INVITATION_TOUR_ID,
			NEW_SESSION_VIEW_V3_TOUR_ID,
			SESSION_ARCHIVE_TOUR_ID,
		].filter(id => !descriptors.has(id)), []);
		assert.deepStrictEqual(NEW_SESSION_VIEW_V2_VARIATIONS, ['default', 'workspaceAndModel']);
		assert.deepStrictEqual(descriptors.get(NEW_SESSION_VIEW_V2_TOUR_ID)?.developerModeVariations, ['default', 'workspaceAndModel']);
		assert.deepStrictEqual(NEW_SESSION_VIEW_V3_VARIATIONS, ['prompt', 'githubPrompt', 'options']);
		assert.deepStrictEqual(descriptors.get(NEW_SESSION_VIEW_V3_TOUR_ID)?.developerModeVariations, ['prompt', 'githubPrompt', 'options']);
	});
});
