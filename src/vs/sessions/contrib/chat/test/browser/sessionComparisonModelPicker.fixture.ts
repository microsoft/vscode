/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { renderPicker } from '../../../../../workbench/test/browser/componentFixtures/chat/tabbedModelPicker.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionComparisonModelSelection } from '../../browser/sessionComparisonModelSelection.js';

type ComparisonPickerState = 'single' | 'empty' | 'attempts' | 'judge' | 'synthesizer' | 'folderless';

function renderComparisonPicker(context: ComponentFixtureContext, state: ComparisonPickerState): Promise<void> {
	const instantiationService = context.disposableStore.add(new TestInstantiationService());
	instantiationService.stub(IStorageService, context.disposableStore.add(new InMemoryStorageService()));
	const selection = context.disposableStore.add(instantiationService.createInstance(SessionComparisonModelSelection, constObservable(true), constObservable(false), undefined, constObservable(state !== 'folderless'), constObservable(true)));
	if (state !== 'single') {
		selection.start();
	}
	if (state !== 'empty' && state !== 'single') {
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
	return renderPicker(context, { comparison: selection, entitlement: ChatEntitlement.Pro, motionReduced: true });
}

export default defineThemedFixtureGroup({ path: 'sessions/compareModels/' }, {
	SingleModelPicker: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderComparisonPicker(context, 'single') }),
	FolderlessAttempts: defineComponentFixture({ render: context => renderComparisonPicker(context, 'folderless') }),
	NoAttemptsSelected: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderComparisonPicker(context, 'empty') }),
	AttemptsSelected: defineComponentFixture({ additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderComparisonPicker(context, 'attempts') }),
	JudgeSelected: defineComponentFixture({ render: context => renderComparisonPicker(context, 'judge') }),
	SynthesizerSelected: defineComponentFixture({ render: context => renderComparisonPicker(context, 'synthesizer') }),
});
