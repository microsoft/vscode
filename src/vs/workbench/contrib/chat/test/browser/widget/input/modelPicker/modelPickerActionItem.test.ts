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
import { ModelPickerActionItem, IModelPickerDelegate } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';

suite('ModelPickerActionItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders and opens the owned widget and disposes it with the action item', () => {
		const widgetElement = $('button');
		const anchors: (HTMLElement | undefined)[] = [];
		let disposed = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stubInstance(ModelPickerWidget, {
			onDidChangeSelection: Event.None,
			onDidChangeMinimumWidth: Event.None,
			domNode: widgetElement,
			nameButton: undefined,
			minimumWidth: 60,
			setSelectedModel: () => { },
			setCompact: () => { },
			setContextViewLayer: () => { },
			setForceTabbedPicker: () => { },
			render: container => container.appendChild(widgetElement),
			show: anchor => anchors.push(anchor),
			dispose: () => disposed++,
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
		const item = disposables.add(new ModelPickerActionItem(
			action,
			delegate,
			{ compact: constObservable(false) },
			instantiationService,
			new MockContextKeyService(),
			new MockKeybindingService(),
		));
		const first = $('div');
		const second = $('div');

		item.render(first);
		item.render(second);
		item.openModelPicker();
		item.show(second);
		const rendered = { first: first.childElementCount, second: second.contains(widgetElement) };
		item.dispose();

		assert.deepStrictEqual({
			rendered,
			defaultAnchor: anchors[0] === widgetElement,
			explicitAnchor: anchors[1] === second,
			disposed,
		}, {
			rendered: { first: 0, second: true },
			defaultAnchor: true,
			explicitAnchor: true,
			disposed: 1,
		});
	});
});
