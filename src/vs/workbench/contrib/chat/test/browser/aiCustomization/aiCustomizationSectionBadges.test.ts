/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { autorun, constObservable, derived, observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { aiCustomizationManagementSectionRegistry } from '../../../browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { observeVisibleSectionsBadge } from '../../../browser/aiCustomization/aiCustomizationSectionBadges.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';

suite('aiCustomizationSectionBadges', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the badge of the first visible section and does not read the badges of other sections', () => {
		const harnessId = 'test-harness';
		const enablementSetting = 'test.sectionBadges.enabled';
		const configurationService = new TestConfigurationService({ [enablementSetting]: false });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = constObservable(harnessId);
			override readonly availableHarnesses = constObservable([upcastPartial<IHarnessDescriptor>({ id: harnessId, hiddenSections: [AICustomizationManagementSection.Agents] })]);
			override findHarnessById(id: string) {
				return this.availableHarnesses.get().find(harness => harness.id === id);
			}
		});
		instantiationService.stub(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
			override readonly managementSections = [
				AICustomizationManagementSection.Agents,
				AICustomizationManagementSection.Skills,
				AICustomizationManagementSection.HarnessSettings,
				AICustomizationManagementSection.Instructions,
			];
		});
		store.add(aiCustomizationManagementSectionRegistry.register({
			id: AICustomizationManagementSection.HarnessSettings,
			label: 'Settings',
			description: '',
			icon: Codicon.settingsGear,
			enablementSettings: [enablementSetting],
			supportsHarness: id => id === harnessId,
			create: () => ({ dispose() { } }),
		}));

		const readBadges = new Set<string>();
		const trackedBadge = (badge: string) => derived(() => {
			readBadges.add(badge);
			return badge;
		});
		const skillsBadge = observableValue<string | undefined>('skills', undefined);
		store.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Agents, () => trackedBadge('hidden by harness')));
		store.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Prompts, () => trackedBadge('not a management section')));
		store.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Skills, () => skillsBadge));
		store.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.HarnessSettings, () => trackedBadge('settings')));
		store.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Instructions, () => constObservable('instructions'), id => id === harnessId));
		store.add(aiCustomizationManagementSectionRegistry.registerBadge(AICustomizationManagementSection.Instructions, () => constObservable('other harness'), () => true));

		const badges: (string | undefined)[] = [];
		const badge = instantiationService.invokeFunction(observeVisibleSectionsBadge);
		store.add(autorun(reader => { badges.push(badge.read(reader)); }));
		const readWhileDisabled = [...readBadges];

		configurationService.setUserConfiguration(enablementSetting, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === enablementSetting }));
		skillsBadge.set('skills', undefined);
		skillsBadge.set(undefined, undefined);

		assert.deepStrictEqual({ badges, readWhileDisabled, readBadges: [...readBadges] }, {
			badges: ['instructions', 'settings', 'skills', 'settings'],
			readWhileDisabled: [],
			readBadges: ['settings'],
		});
	});
});
