/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../../../base/common/actions.js';
import { Event } from '../../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { openOnboardingTarget, ONBOARDING_TARGET_ATTR } from '../../../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ModelPickerActionItem, IModelPickerDelegate } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { ChatOnboardingTarget } from '../../../../../common/onboarding/modelPickerTryout.js';

suite('ModelPickerActionItem onboarding', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('owns the target across rendering, opening, and disposal', async () => {
		const widgetElement = $('button');
		let opens = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stubInstance(ModelPickerWidget, {
			onDidChangeSelection: Event.None,
			onDidChangeMinimumWidth: Event.None,
			domNode: widgetElement,
			nameButton: undefined,
			minimumWidth: 60,
			setSelectedModel: () => { },
			setCompact: () => { },
			render: container => container.appendChild(widgetElement),
			show: () => opens++,
			dispose: () => { },
		});
		const action: IAction = { id: 'test.modelPicker', label: '', tooltip: '', class: undefined, enabled: true, run: async () => { } };
		const delegate: IModelPickerDelegate = {
			currentModel: constObservable(undefined),
			setModel: () => { },
			getModels: () => [],
			getPresentationOptions: () => ({
				useGroupedModelPicker: true,
				showManageModelsAction: false,
				showUnavailableFeatured: false,
				showFeatured: false,
				showAutoModel: true,
				showModelIcon: true,
			}),
		};
		const item = new ModelPickerActionItem(
			action,
			delegate,
			{ compact: constObservable(false) },
			instantiationService,
			new MockContextKeyService(),
			new MockKeybindingService(),
		);
		const first = $('div');
		const second = $('div');

		item.render(first);
		item.render(second);
		await openOnboardingTarget(second);
		const beforeDispose = {
			first: first.getAttribute(ONBOARDING_TARGET_ATTR),
			second: second.getAttribute(ONBOARDING_TARGET_ATTR),
			opens,
		};
		item.dispose();

		assert.deepStrictEqual({
			beforeDispose,
			afterDispose: second.getAttribute(ONBOARDING_TARGET_ATTR),
		}, {
			beforeDispose: {
				first: null,
				second: ChatOnboardingTarget.ModelPicker,
				opens: 1,
			},
			afterDispose: null,
		});
	});
});
