/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { renderPicker } from '../../../../../workbench/test/browser/componentFixtures/chat/tabbedModelPicker.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';

type ComparisonPickerState = 'empty' | 'attempts' | 'judge' | 'synthesizer';

function renderComparisonPicker(context: ComponentFixtureContext, state: ComparisonPickerState): Promise<void> {
	const selection = context.disposableStore.add(new SessionComparisonModelSelection(constObservable(true)));
	selection.start();
	if (state !== 'empty') {
		selection.select('copilot/gpt-5-5');
		selection.select('copilot/claude-sonnet-5');
		selection.select('copilot/gemini-3-5-flash');
	}
	if (state === 'judge' || state === 'synthesizer') {
		selection.next();
		selection.select('copilot/gpt-5-5');
	}
	if (state === 'synthesizer') {
		selection.next();
		selection.select('copilot/claude-sonnet-5');
	}
	return renderPicker(context, { workflow: selection, entitlement: ChatEntitlement.Pro, motionReduced: true });
}

export default defineThemedFixtureGroup({ path: 'sessions/compareModels/' }, {
	NoAttemptsSelected: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderComparisonPicker(context, 'empty') }),
	AttemptsSelected: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderComparisonPicker(context, 'attempts') }),
	JudgeSelected: defineComponentFixture({ render: context => renderComparisonPicker(context, 'judge') }),
	SynthesizerSelected: defineComponentFixture({ render: context => renderComparisonPicker(context, 'synthesizer') }),
});
