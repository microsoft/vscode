/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry, SubmenuItemAction } from '../../common/actions.js';
import { MenuService } from '../../common/menuService.js';
import { NullCommandService } from '../../../commands/test/common/nullCommandService.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../contextkey/common/contextkey.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';

// --- service instances

class TestContextKeyService extends MockContextKeyService {
	override contextMatchesRules(rules: ContextKeyExpression | undefined) {
		return !rules || rules.evaluate({ getValue: key => this.getContextKeyValue(key) });
	}
}

const contextKeyService = new TestContextKeyService();

// --- tests

suite('MenuService', function () {

	let menuService: MenuService;
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let testMenuId: MenuId;

	setup(function () {
		menuService = disposables.add(new MenuService(NullCommandService, new MockKeybindingService(), disposables.add(new InMemoryStorageService())));
		testMenuId = new MenuId(`testo/${generateUuid()}`);
	});

	teardown(function () {
		sinon.restore();
	});

	test('createMenu collects menu items only once', () => {
		const getMenuItems = sinon.spy(MenuRegistry, 'getMenuItems');
		disposables.add(menuService.createMenu(testMenuId, contextKeyService));

		assert.strictEqual(getMenuItems.withArgs(testMenuId).callCount, 1);
	});

	test('getMenuActions filters before sorting and does not collect event dependencies', () => {
		const when = ContextKeyExpr.equals('view', 'anotherView');
		const keys = sinon.spy(when, 'keys');
		let hiddenTitleReads = 0;
		for (let i = 0; i < 875; i++) {
			disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
				command: {
					id: `hidden${i}`,
					get title() {
						hiddenTitleReads++;
						return `Hidden ${i}`;
					},
				},
				when,
			}));
		}
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, { command: { id: 'z', title: 'Z' } }));
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, { command: { id: 'a', title: 'A' } }));
		const getMenuItems = sinon.spy(MenuRegistry, 'getMenuItems');
		const listen = sinon.spy(MenuRegistry, 'onDidChangeMenu');

		const groups = menuService.getMenuActions(testMenuId, contextKeyService);

		assert.deepStrictEqual({
			actions: groups.map(([group, actions]) => [group, actions.map(action => action.id)]),
			menuReads: getMenuItems.withArgs(testMenuId).callCount,
			hiddenTitleReads,
			contextKeyCollections: keys.callCount,
			listeners: listen.callCount,
		}, {
			actions: [['', ['a', 'z']]],
			menuReads: 1,
			hiddenTitleReads: 0,
			contextKeyCollections: 0,
			listeners: 0,
		});
	});

	test('getMenuActions evaluates each row context independently', () => {
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'file', title: 'File' },
			when: ContextKeyExpr.equals('viewItem', 'file'),
		}));
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'folder', title: 'Folder' },
			when: ContextKeyExpr.equals('viewItem', 'folder'),
		}));
		const actionIds: string[] = [];

		for (let i = 0; i < 100; i++) {
			const rowContext = disposables.add(new TestContextKeyService());
			rowContext.createKey('viewItem', i % 2 === 0 ? 'file' : 'folder');
			const groups = menuService.getMenuActions(testMenuId, rowContext);
			actionIds.push(...groups.flatMap(([, actions]) => actions.map(action => action.id)));
		}

		const contexts = [...menuService.getMenuContexts(testMenuId)];

		assert.deepStrictEqual({
			actionIds,
			contexts,
		}, {
			actionIds: Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 'file' : 'folder'),
			contexts: ['viewItem'],
		});
	});

	test('one-shot and persistent menus use the same group and item ordering', () => {
		const items: IMenuItem[] = [
			{ command: { id: 'z', title: 'Z' } },
			{ command: { id: 'hidden', title: 'Hidden' }, group: '', when: ContextKeyExpr.has('hidden') },
			{ command: { id: 'a', title: 'A' } },
			{ command: { id: 'first', title: 'First' }, group: '', order: -1 },
			{ command: { id: 'navigation', title: 'Navigation' }, group: 'navigation' },
			{ command: { id: 'localized', title: { value: 'ZZZ', original: 'AAA' } }, group: 'primary' },
			{ command: { id: 'middle', title: 'BBB' }, group: 'primary' },
			{ command: { id: 'tie', title: 'BBB' }, group: 'primary' },
		];
		disposables.add(MenuRegistry.appendMenuItems(items.map(item => ({ id: testMenuId, item }))));
		const menu = disposables.add(menuService.createMenu(testMenuId, contextKeyService));
		const snapshots = [menu.getActions(), menuService.getMenuActions(testMenuId, contextKeyService)]
			.map(groups => groups.map(([group, actions]) => [group, actions.map(action => action.id)]));
		const expected = [
			['navigation', ['navigation']],
			['primary', ['localized', 'middle', 'tie']],
			['', ['first', 'a', 'z']],
		];

		assert.deepStrictEqual(snapshots, [expected, expected]);
	});

	test('getMenuActions observes menu registrations synchronously', () => {
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'b', title: 'B' },
		}));
		const getIds = () => menuService.getMenuActions(testMenuId, contextKeyService).flatMap(([, actions]) => actions.map(action => action.id));
		const snapshots = [getIds()];
		const contexts = [[...menuService.getMenuContexts(testMenuId)]];
		const registration = disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'a', title: 'A' },
			when: ContextKeyExpr.not('missing'),
		}));
		snapshots.push(getIds());
		contexts.push([...menuService.getMenuContexts(testMenuId)]);
		registration.dispose();
		snapshots.push(getIds());
		contexts.push([...menuService.getMenuContexts(testMenuId)]);
		assert.deepStrictEqual({
			snapshots,
			contexts,
		}, {
			snapshots: [['b'], ['a', 'b'], ['b']],
			contexts: [[], ['missing'], []],
		});
	});

	test('getMenuActions omits empty submenus and observes nested registrations', () => {
		const submenuId = new MenuId(`testo/${generateUuid()}`);
		const nestedSubmenuId = new MenuId(`testo/${generateUuid()}`);
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, { title: 'Submenu', submenu: submenuId }));
		disposables.add(MenuRegistry.appendMenuItem(submenuId, { title: 'Nested submenu', submenu: nestedSubmenuId }));
		const before = menuService.getMenuActions(testMenuId, contextKeyService);
		const registration = disposables.add(MenuRegistry.appendMenuItem(nestedSubmenuId, {
			command: { id: 'nested', title: 'Nested' },
		}));
		const [, [submenu]] = menuService.getMenuActions(testMenuId, contextKeyService)[0];
		assert.ok(submenu instanceof SubmenuItemAction);
		const nestedSubmenu = submenu.actions[0];
		assert.ok(nestedSubmenu instanceof SubmenuItemAction);
		registration.dispose();
		const after = menuService.getMenuActions(testMenuId, contextKeyService);

		assert.deepStrictEqual({
			before,
			nestedActions: nestedSubmenu.actions.map(action => action.id),
			after,
		}, {
			before: [],
			nestedActions: ['nested'],
			after: [],
		});
	});

	test('getMenuActions observes implicit command palette items synchronously', () => {
		const commandId = `testo/${generateUuid()}`;
		const containsCommand = () => menuService.getMenuActions(MenuId.CommandPalette, contextKeyService)
			.some(([, actions]) => actions.some(action => action.id === commandId));
		const snapshots = [containsCommand()];
		const registration = disposables.add(MenuRegistry.addCommand({ id: commandId, title: 'Implicit' }));
		snapshots.push(containsCommand());
		registration.dispose();
		snapshots.push(containsCommand());

		assert.deepStrictEqual(snapshots, [false, true, false]);
	});

	test('getMenuActions observes changes to registered titles, orders and groups', () => {
		const item: IMenuItem = { command: { id: 'dynamic', title: 'A' }, group: 'primary' };
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, item));
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, { command: { id: 'fixed', title: 'B' }, group: 'primary' }));
		const snapshot = () => menuService.getMenuActions(testMenuId, contextKeyService)
			.map(([group, actions]) => [group, actions.map(action => action.label)]);
		const snapshots = [snapshot()];
		item.command.title = 'Z';
		snapshots.push(snapshot());
		item.order = -1;
		snapshots.push(snapshot());
		item.group = 'navigation';
		snapshots.push(snapshot());

		assert.deepStrictEqual(snapshots, [
			[['primary', ['A', 'B']]],
			[['primary', ['B', 'Z']]],
			[['primary', ['Z', 'B']]],
			[['navigation', ['Z']], ['primary', ['B']]],
		]);
	});

	test('getMenuContexts observes changes to registered expressions', () => {
		const item: IMenuItem = {
			command: {
				id: 'command', title: 'Command',
				precondition: ContextKeyExpr.has('enabled'),
				toggled: { condition: ContextKeyExpr.has('toggled') },
			},
			when: ContextKeyExpr.has('visible'),
		};
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, item));
		const snapshots = [[...menuService.getMenuContexts(testMenuId)].sort()];
		item.when = ContextKeyExpr.has('newVisible');
		item.command.precondition = ContextKeyExpr.has('newEnabled');
		item.command.toggled = { condition: ContextKeyExpr.has('newToggled') };
		snapshots.push([...menuService.getMenuContexts(testMenuId)].sort());

		assert.deepStrictEqual(snapshots, [
			['enabled', 'toggled', 'visible'],
			['newEnabled', 'newToggled', 'newVisible'],
		]);
	});

	test('getMenuActions observes changes to implicit command palette exclusions', () => {
		const prefix = `testo/${generateUuid()}`;
		const first = { id: `${prefix}/first`, title: 'First' };
		const second = { id: `${prefix}/second`, title: 'Second' };
		disposables.add(MenuRegistry.addCommand(first));
		disposables.add(MenuRegistry.addCommand(second));
		const item: IMenuItem = { command: { id: `${prefix}/explicit`, title: 'Explicit' }, alt: first };
		disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, item));
		const snapshot = () => menuService.getMenuActions(MenuId.CommandPalette, contextKeyService)
			.flatMap(([, actions]) => actions.filter(action => action.id.startsWith(prefix)).map(action => action.label));
		const snapshots = [snapshot()];
		item.alt = second;
		snapshots.push(snapshot());

		assert.deepStrictEqual(snapshots, [['Explicit', 'Second'], ['Explicit', 'First']]);
	});

	test('createMenu still emits changes for nested submenu registrations', async () => {
		const submenuId = new MenuId(`testo/${generateUuid()}`);
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, { title: 'Submenu', submenu: submenuId }));
		const menu = disposables.add(menuService.createMenu(testMenuId, contextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 }));
		const before = menu.getActions();
		const changed = Event.toPromise(menu.onDidChange);
		disposables.add(MenuRegistry.appendMenuItem(submenuId, { command: { id: 'nested', title: 'Nested' } }));
		const event = await changed;
		const submenu = menu.getActions()[0][1][0];
		assert.ok(submenu instanceof SubmenuItemAction);

		assert.deepStrictEqual({
			before,
			actions: submenu.actions.map(action => action.id),
			changes: [event.isStructuralChange, event.isEnablementChange, event.isToggleChange],
		}, {
			before: [],
			actions: ['nested'],
			changes: [true, true, true],
		});
	});

	test('getMenuActions reevaluates enablement, toggled state and alternate actions', () => {
		const context = disposables.add(new TestContextKeyService());
		const enabled = context.createKey<boolean>('enabled', true);
		const toggled = context.createKey<boolean>('toggled', false);
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: {
				id: 'command', title: 'Command',
				precondition: ContextKeyExpr.has('enabled'),
				toggled: { condition: ContextKeyExpr.has('toggled'), title: 'Toggled' },
			},
			alt: { id: 'alt', title: 'Alternate', precondition: ContextKeyExpr.has('enabled') },
		}));
		const menu = disposables.add(menuService.createMenu(testMenuId, context));
		const snapshots = [];

		for (const getActions of [() => menu.getActions(), () => menuService.getMenuActions(testMenuId, context)]) {
			enabled.set(true);
			toggled.set(false);
			for (let i = 0; i < 2; i++) {
				const action = getActions()[0][1][0];
				assert.ok(!(action instanceof SubmenuItemAction));
				snapshots.push({ enabled: action.enabled, checked: action.checked, label: action.label, altEnabled: action.alt?.enabled });
				enabled.set(false);
				toggled.set(true);
			}
		}

		const expected = [
			{ enabled: true, checked: false, label: 'Command', altEnabled: true },
			{ enabled: false, checked: true, label: 'Toggled', altEnabled: false },
		];
		assert.deepStrictEqual(snapshots, [...expected, ...expected]);
	});

	test('getMenuActions preserves per-call options and current hidden state', async () => {
		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'command', title: 'Long title', shortTitle: 'Short' },
			isHiddenByDefault: true,
		}));
		const executeCommand = sinon.spy(NullCommandService, 'executeCommand');
		const first = menuService.getMenuActions(testMenuId, contextKeyService, { renderShortTitle: true, args: ['first'], shouldForwardArgs: true })[0][1][0];
		assert.ok(first.hideActions);
		const hidden = [first.hideActions.isHidden];
		await first.hideActions.toggle.run();
		const second = menuService.getMenuActions(testMenuId, contextKeyService, { arg: 'second' })[0][1][0];
		assert.ok(second.hideActions);
		hidden.push(second.hideActions.isHidden);
		menuService.resetHiddenStates([testMenuId]);
		const third = menuService.getMenuActions(testMenuId, contextKeyService)[0][1][0];
		assert.ok(third.hideActions);
		hidden.push(third.hideActions.isHidden);
		await first.run('forwarded');
		await second.run('ignored');

		assert.deepStrictEqual({
			labels: [first.label, second.label],
			hidden,
			calls: executeCommand.getCalls().map(call => call.args),
		}, {
			labels: ['Short', 'Long title'],
			hidden: [true, false, true],
			calls: [['command', 'first', 'forwarded'], ['command', 'second']],
		});
	});

	test('group sorting', function () {

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'one', title: 'FOO' },
			group: '0_hello'
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'two', title: 'FOO' },
			group: 'hello'
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'three', title: 'FOO' },
			group: 'Hello'
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'four', title: 'FOO' },
			group: ''
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'five', title: 'FOO' },
			group: 'navigation'
		}));

		const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();

		assert.strictEqual(groups.length, 5);
		const [one, two, three, four, five] = groups;

		assert.strictEqual(one[0], 'navigation');
		assert.strictEqual(two[0], '0_hello');
		assert.strictEqual(three[0], 'hello');
		assert.strictEqual(four[0], 'Hello');
		assert.strictEqual(five[0], '');
	});

	test('in group sorting, by title', function () {

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'a', title: 'aaa' },
			group: 'Hello'
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'b', title: 'fff' },
			group: 'Hello'
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'c', title: 'zzz' },
			group: 'Hello'
		}));

		const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();

		assert.strictEqual(groups.length, 1);
		const [, actions] = groups[0];

		assert.strictEqual(actions.length, 3);
		const [one, two, three] = actions;
		assert.strictEqual(one.id, 'a');
		assert.strictEqual(two.id, 'b');
		assert.strictEqual(three.id, 'c');
	});

	test('in group sorting, by title and order', function () {

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'a', title: 'aaa' },
			group: 'Hello',
			order: 10
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'b', title: 'fff' },
			group: 'Hello'
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'c', title: 'zzz' },
			group: 'Hello',
			order: -1
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'd', title: 'yyy' },
			group: 'Hello',
			order: -1
		}));

		const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();

		assert.strictEqual(groups.length, 1);
		const [, actions] = groups[0];

		assert.strictEqual(actions.length, 4);
		const [one, two, three, four] = actions;
		assert.strictEqual(one.id, 'd');
		assert.strictEqual(two.id, 'c');
		assert.strictEqual(three.id, 'b');
		assert.strictEqual(four.id, 'a');
	});


	test('in group sorting, special: navigation', function () {

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'a', title: 'aaa' },
			group: 'navigation',
			order: 1.3
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'b', title: 'fff' },
			group: 'navigation',
			order: 1.2
		}));

		disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
			command: { id: 'c', title: 'zzz' },
			group: 'navigation',
			order: 1.1
		}));

		const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();

		assert.strictEqual(groups.length, 1);
		const [[, actions]] = groups;

		assert.strictEqual(actions.length, 3);
		const [one, two, three] = actions;
		assert.strictEqual(one.id, 'c');
		assert.strictEqual(two.id, 'b');
		assert.strictEqual(three.id, 'a');
	});

	test('special MenuId palette', function () {

		disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: { id: 'a', title: 'Explicit' }
		}));

		disposables.add(MenuRegistry.addCommand({ id: 'b', title: 'Implicit' }));

		let foundA = false;
		let foundB = false;
		for (const item of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
			if (isIMenuItem(item)) {
				if (item.command.id === 'a') {
					assert.strictEqual(item.command.title, 'Explicit');
					foundA = true;
				}
				if (item.command.id === 'b') {
					assert.strictEqual(item.command.title, 'Implicit');
					foundB = true;
				}
			}
		}
		assert.strictEqual(foundA, true);
		assert.strictEqual(foundB, true);
	});

	test('Extension contributed submenus missing with errors in output #155030', function () {

		const id = generateUuid();
		const menu = new MenuId(id);

		assert.throws(() => new MenuId(id));
		assert.ok(menu === MenuId.for(id));
	});
});
