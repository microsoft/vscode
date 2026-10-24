/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../common/layoutConstants.js';
import { ChatWindowCards, ChatWindowCardsPart, CHAT_WINDOW_CARD_CLASS, } from '../../browser/chatWindowCards.js';

class FakePart implements ChatWindowCardsPart {

	readonly gaps: number[] = [];
	groups: IEditorGroup[] = [];

	private readonly _onDidAddGroup = new Emitter<IEditorGroup>();
	readonly onDidAddGroup = this._onDidAddGroup.event;
	private readonly _onDidRemoveGroup = new Emitter<IEditorGroup>();
	readonly onDidRemoveGroup = this._onDidRemoveGroup.event;

	setGroupGap(gap: number): void {
		this.gaps.push(gap);
	}

	addGroup(id: number): HTMLElement {
		const element = mainWindow.document.createElement('div');
		const group = { id, element } as unknown as IEditorGroup;
		this.groups.push(group);
		this._onDidAddGroup.fire(group);
		return element;
	}

	removeGroup(id: number): void {
		const group = this.groups.find(candidate => candidate.id === id)!;
		this.groups = this.groups.filter(candidate => candidate !== group);
		this._onDidRemoveGroup.fire(group);
	}

	dispose(): void {
		this._onDidAddGroup.dispose();
		this._onDidRemoveGroup.dispose();
	}
}

suite('Chat window cards', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(compact: boolean) {
		const root = mainWindow.document.createElement('div');
		root.classList.toggle('modern-ui-compact', compact);
		const part = new FakePart();
		store.add({ dispose: () => part.dispose() });
		const first = part.addGroup(1);
		const cards = store.add(new ChatWindowCards(part, root, new TestThemeService()));
		return { root, part, first, cards };
	}

	// A class change on the root is delivered as a microtask, queued before this one.
	const settle = () => new Promise<void>(resolve => queueMicrotask(resolve));

	test('groups are cards with the gap in the layout unless density is compact', () => {
		const { part, first, cards } = create(false);
		const second = part.addGroup(2);
		assert.deepStrictEqual({
			enabled: cards.enabled,
			gaps: part.gaps,
			first: first.classList.contains(CHAT_WINDOW_CARD_CLASS),
			second: second.classList.contains(CHAT_WINDOW_CARD_CLASS),
		}, { enabled: true, gaps: [AGENTS_FLOATING_PANEL_GAP], first: true, second: true });
	});

	test('compact density keeps the groups flush', () => {
		const { part, cards } = create(true);
		assert.deepStrictEqual({ enabled: cards.enabled, gaps: part.gaps }, { enabled: false, gaps: [0] });
	});

	test('follows the density while the window is open', async () => {
		const { root, part } = create(false);
		root.classList.add('modern-ui-compact');
		await settle();
		root.classList.remove('modern-ui-compact');
		await settle();
		assert.deepStrictEqual(part.gaps, [AGENTS_FLOATING_PANEL_GAP, 0, AGENTS_FLOATING_PANEL_GAP]);
	});

	test('an unrelated class change leaves the gap alone, and a removed group stops being a card', async () => {
		const { root, part, first } = create(false);
		root.classList.add('other');
		await settle();
		part.removeGroup(1);
		assert.deepStrictEqual({ gaps: part.gaps, card: first.classList.contains(CHAT_WINDOW_CARD_CLASS) }, { gaps: [AGENTS_FLOATING_PANEL_GAP], card: false });
	});
});
