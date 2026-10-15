/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { renderPicker } from '../../../../../workbench/test/browser/componentFixtures/chat/tabbedModelPicker.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';

function renderComparisonPicker(context: ComponentFixtureContext, step: 'attempts' | 'judge' | 'synthesizer', repeated: boolean): Promise<void> {
	const selection = context.disposableStore.add(new SessionComparisonModelSelection(constObservable(true)));
	selection.start();
	selection.select('copilot/gpt-5-5');
	if (repeated) {
		selection.setCount(10);
	} else {
		selection.select('copilot/claude-sonnet-5');
	}
	if (step !== 'attempts') {
		selection.next();
	}
	if (step === 'synthesizer') {
		selection.select('copilot/gpt-5-5');
		selection.next();
	}
	return renderPicker(context, { workflow: selection, entitlement: ChatEntitlement.Pro, motionReduced: true });
}

export default defineThemedFixtureGroup({ path: 'sessions/compareModels/' }, {
	RepeatedAttempts: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderComparisonPicker(context, 'attempts', true) }),
	DistinctAttempts: defineComponentFixture({ render: context => renderComparisonPicker(context, 'attempts', false) }),
	OptionalJudge: defineComponentFixture({ render: context => renderComparisonPicker(context, 'judge', false) }),
	OptionalSynthesizer: defineComponentFixture({ render: context => renderComparisonPicker(context, 'synthesizer', false) }),
});
