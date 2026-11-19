/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ViewMenuActions } from '../../../../browser/parts/views/viewMenuActions.js';

suite('ViewMenuActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createViewMenuActions(primary: string[], secondary: string[]): { actions: ViewMenuActions; changed: Emitter<void> } {
		const changed = store.add(new Emitter<void>());
		const toActions = (ids: string[]) => ids.map(id => store.add(new Action(id, id)));
		const menu = {
			onDidChange: changed.event as Event<never>,
			getActions: () => [
				...(primary.length ? [['navigation', toActions(primary)] as [string, IAction[]]] : []),
				...(secondary.length ? [['other', toActions(secondary)] as [string, IAction[]]] : []),
			],
			dispose: () => { },
		};
		const menuService = { createMenu: () => menu as unknown as IMenu } as unknown as IMenuService;
		const contextKeyService = store.add(new MockContextKeyService()) as unknown as IContextKeyService;
		return { actions: store.add(new ViewMenuActions(MenuId.ViewTitle, undefined, undefined, undefined, contextKeyService, menuService)), changed };
	}

	const ids = (actions: IAction[]) => actions.map(a => a instanceof Separator ? '---' : a.id);

	test('shows the actions of an added source after its own, separating the secondary ones, until disposed', () => {
		const { actions } = createViewMenuActions(['own1'], ['ownMore']);
		const { actions: source } = createViewMenuActions(['src1', 'src2'], ['srcMore']);
		let changes = 0;
		store.add(actions.onDidChange(() => changes++));

		const registration = actions.addActions(source);
		const added = { primary: ids(actions.getPrimaryActions()), secondary: ids(actions.getSecondaryActions()), changes };
		registration.dispose();
		const removed = { primary: ids(actions.getPrimaryActions()), secondary: ids(actions.getSecondaryActions()), changes };

		assert.deepStrictEqual({ added, removed }, {
			added: { primary: ['own1', 'src1', 'src2'], secondary: ['ownMore', '---', 'srcMore'], changes: 1 },
			removed: { primary: ['own1'], secondary: ['ownMore'], changes: 2 },
		});
	});

	test('has no leading separator when it has no secondary actions of its own, and follows the changes of the source', () => {
		const { actions } = createViewMenuActions([], []);
		const { actions: source, changed } = createViewMenuActions(['src1'], ['srcMore']);
		let changes = 0;
		store.add(actions.onDidChange(() => changes++));
		store.add(actions.addActions(source));

		const secondary = ids(actions.getSecondaryActions());
		const before = changes;
		changed.fire();

		assert.deepStrictEqual({ secondary, changesFromSource: changes - before }, { secondary: ['srcMore'], changesFromSource: 1 });
	});

	test('disposing a source registration twice does not remove another source', () => {
		const { actions } = createViewMenuActions([], []);
		const { actions: first } = createViewMenuActions(['first'], []);
		const { actions: second } = createViewMenuActions(['second'], []);
		const firstRegistration = actions.addActions(first);
		store.add(actions.addActions(second));

		firstRegistration.dispose();
		firstRegistration.dispose();

		assert.deepStrictEqual(ids(actions.getPrimaryActions()), ['second']);
	});
});
