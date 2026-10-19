/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ISessionCollection, ISessionCollectionsService } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { SessionPaletteColor } from '../../../../services/sessions/common/sessionColors.js';
import { ISessionCollectionsSwitcherDelegate, SessionCollectionAttention, SessionCollectionTitleButton, SessionCollectionsIconStrip } from '../../browser/sessionCollectionsSwitcher.js';

suite('SessionCollectionsSwitcher', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestCollectionsService extends Disposable {
		readonly collections = observableValue<readonly ISessionCollection[]>(this, [
			{ id: 'engineering', name: 'Engineering', icon: 'graph', color: SessionPaletteColor.Blue },
			{ id: 'personal', name: 'Personal', icon: 'home', color: SessionPaletteColor.Green },
		]);
		readonly activeCollectionId = observableValue<string>(this, 'engineering');
		readonly defaultCollectionId = constObservable('engineering');
	}

	const delegate = new class extends mock<ISessionCollectionsSwitcherDelegate>() {
		override getCollectionAttention(): SessionCollectionAttention { return SessionCollectionAttention.None; }
		override getCollectionKeybindingLabel(): string | undefined { return undefined; }
		override registerCollectionAnchor() { return Disposable.None; }
	};

	function setup() {
		const instantiationService = store.add(new TestInstantiationService());
		const collectionsService = store.add(new TestCollectionsService());
		instantiationService.stub(ISessionCollectionsService, collectionsService as Partial<ISessionCollectionsService>);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() { });
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		const container = mainWindow.document.createElement('div');
		const titleContainer = mainWindow.document.createElement('div');
		mainWindow.document.body.append(container, titleContainer);
		store.add({ dispose: () => { container.remove(); titleContainer.remove(); } });
		return { instantiationService, collectionsService, container, titleContainer };
	}

	test('adding, editing and switching collections keeps the existing buttons, so open popovers stay anchored', () => {
		const { instantiationService, collectionsService, container, titleContainer } = setup();
		store.add(instantiationService.createInstance(SessionCollectionsIconStrip, container, delegate));
		store.add(instantiationService.createInstance(SessionCollectionTitleButton, titleContainer, { shouldShow: () => true }, delegate));
		const buttons = () => [...container.querySelectorAll<HTMLElement>(':scope > button')];
		const [engineering, personal, add] = buttons();
		const title = titleContainer.firstElementChild;

		const [first, second] = collectionsService.collections.get();
		collectionsService.collections.set([{ ...first, name: 'Eng' }, second, { id: 'misc', name: 'Misc', icon: 'briefcase', color: SessionPaletteColor.Orange }], undefined);
		collectionsService.activeCollectionId.set('personal', undefined);
		const [engineeringAfter, personalAfter, misc, addAfter] = buttons();

		assert.deepStrictEqual({
			reused: [engineeringAfter === engineering, personalAfter === personal, addAfter === add, titleContainer.firstElementChild === title],
			ids: [engineeringAfter, personalAfter, misc].map(button => button.dataset.collectionId),
			selected: [engineeringAfter, personalAfter, misc].map(button => button.getAttribute('aria-selected')),
			addIsLast: container.lastElementChild === add,
			titleCollection: (title as HTMLElement | null)?.dataset.collectionId,
		}, {
			reused: [true, true, true, true],
			ids: ['engineering', 'personal', 'misc'],
			selected: ['false', 'true', 'false'],
			addIsLast: true,
			titleCollection: 'personal',
		});
	});
});
