/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { GET_STARTED_ITEM_IDS, GetStartedItemId, IGetStartedItemState } from '../../common/getStartedChecklist.js';
import { GetStartedChecklistWidget, SessionsGetStartedFocused } from '../../browser/getStartedChecklistWidget.js';

suite('GetStartedChecklistWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createChecklist(done: readonly GetStartedItemId[], contextKeyService: IContextKeyService = new MockContextKeyService()) {
		const items = observableValue<readonly IGetStartedItemState[]>('items', GET_STARTED_ITEM_IDS.map(id => ({ id, done: done.includes(id) })));
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		const widget = disposables.add(instantiationService.createInstance(GetStartedChecklistWidget, {
			items,
			collapsed: constObservable(false),
			finished: constObservable(false),
			setCollapsed: () => { },
			showMe: async () => { },
			hide: () => { },
			dismiss: () => { },
		}, { focusSessionsList: () => { }, animate: false }));
		const headers = () => [...widget.domNode.querySelectorAll<HTMLElement>('.get-started-item-header')];
		return {
			headers,
			/** The item that shows its explanation and Show Me action, or `none`. */
			expanded: () => {
				const index = headers().findIndex(header => header.getAttribute('aria-expanded') === 'true');
				return index >= 0 ? items.get()[index].id : 'none';
			},
			select: (item: GetStartedItemId) => headers()[GET_STARTED_ITEM_IDS.indexOf(item)].click(),
			complete: (item: GetStartedItemId) => items.set(items.get().map(candidate => candidate.id === item ? { id: item, done: true } : candidate), undefined),
		};
	}

	test('selecting an item expands it and collapses the one before, and selecting the expanded item collapses it', () => {
		const checklist = createChecklist([GetStartedItemId.StartSession]);
		const states: string[] = [checklist.expanded()];
		checklist.select(GetStartedItemId.Automation);
		states.push(checklist.expanded());
		checklist.select(GetStartedItemId.Automation);
		states.push(checklist.expanded());
		checklist.complete(GetStartedItemId.RunInParallel);
		states.push(checklist.expanded());
		checklist.select(GetStartedItemId.SecondProject);
		states.push(checklist.expanded());
		checklist.complete(GetStartedItemId.SecondProject);
		states.push(checklist.expanded());
		assert.deepStrictEqual(states, [
			// The next open item, by default.
			GetStartedItemId.RunInParallel,
			GetStartedItemId.Automation,
			// Selecting the expanded item collapses it.
			'none',
			// Completing another item keeps them all collapsed.
			'none',
			GetStartedItemId.SecondProject,
			// Completing the expanded item moves on to the next open one.
			GetStartedItemId.KeepChanges,
		]);
	});

	test('the accessibility help of the checklist applies only while focus is inside it', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const checklist = createChecklist([], contextKeyService);
		// The accessibility help evaluates each help's `when` in the context of the focused element.
		const helpApplies = (focused: HTMLElement) => SessionsGetStartedFocused.evaluate(contextKeyService.getContext(focused));
		assert.deepStrictEqual({ inside: helpApplies(checklist.headers()[0]), outside: helpApplies(mainWindow.document.createElement('div')) }, { inside: true, outside: false });
	});
});
