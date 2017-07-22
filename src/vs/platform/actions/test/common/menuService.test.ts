/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { NullCommandService } from 'vs/platform/commands/common/commands';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { AbstractExtensionService, ActivatedExtension } from 'vs/platform/extensions/common/abstractExtensionService';

// --- service instances

const extensionService = new class extends AbstractExtensionService<ActivatedExtension> {
	protected _showMessage(): void {
		console.log(arguments);
	}
	protected _createFailedExtension() {
		return null;
	}
	protected _actualActivateExtension() {
		return null;
	}
}(true);

const contextKeyService = new class extends MockContextKeyService {
	contextMatchesRules() {
		return true;
	}
};

// --- tests

suite('MenuService', function () {

	let menuService: MenuService;
	let disposables: IDisposable[];

	setup(function () {
		menuService = new MenuService(extensionService, NullCommandService);
		disposables = [];
	});

	teardown(function () {
		dispose(disposables);
	});

	test('group sorting', function () {

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'one', title: 'FOO' },
			group: '0_hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'two', title: 'FOO' },
			group: 'hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'three', title: 'FOO' },
			group: 'Hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'four', title: 'FOO' },
			group: ''
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'five', title: 'FOO' },
			group: 'navigation'
		}));

		const groups = menuService.createMenu(MenuId.ExplorerContext, contextKeyService).getActions();

		assert.equal(groups.length, 5);
		const [one, two, three, four, five] = groups;

		assert.equal(one[0], 'navigation');
		assert.equal(two[0], '0_hello');
		assert.equal(three[0], 'hello');
		assert.equal(four[0], 'Hello');
		assert.equal(five[0], '');
	});

	test('in group sorting, by title', function () {

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'a', title: 'aaa' },
			group: 'Hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'b', title: 'fff' },
			group: 'Hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'c', title: 'zzz' },
			group: 'Hello'
		}));

		const groups = menuService.createMenu(MenuId.ExplorerContext, contextKeyService).getActions();

		assert.equal(groups.length, 1);
		const [[, actions]] = groups;

		assert.equal(actions.length, 3);
		const [one, two, three] = actions;
		assert.equal(one.id, 'a');
		assert.equal(two.id, 'b');
		assert.equal(three.id, 'c');
	});

	test('in group sorting, by title and order', function () {

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'a', title: 'aaa' },
			group: 'Hello',
			order: 10
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'b', title: 'fff' },
			group: 'Hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'c', title: 'zzz' },
			group: 'Hello',
			order: -1
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'd', title: 'yyy' },
			group: 'Hello',
			order: -1
		}));

		const groups = menuService.createMenu(MenuId.ExplorerContext, contextKeyService).getActions();

		assert.equal(groups.length, 1);
		const [[, actions]] = groups;

		assert.equal(actions.length, 4);
		const [one, two, three, four] = actions;
		assert.equal(one.id, 'd');
		assert.equal(two.id, 'c');
		assert.equal(three.id, 'b');
		assert.equal(four.id, 'a');
	});


	test('in group sorting, special: navigation', function () {

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'a', title: 'aaa' },
			group: 'navigation',
			order: 1.3
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'b', title: 'fff' },
			group: 'navigation',
			order: 1.2
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'c', title: 'zzz' },
			group: 'navigation',
			order: 1.1
		}));

		const groups = menuService.createMenu(MenuId.ExplorerContext, contextKeyService).getActions();

		assert.equal(groups.length, 1);
		const [[, actions]] = groups;

		assert.equal(actions.length, 3);
		const [one, two, three] = actions;
		assert.equal(one.id, 'c');
		assert.equal(two.id, 'b');
		assert.equal(three.id, 'a');
	});

	test('special MenuId palette', function () {

		disposables.push(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: { id: 'a', title: 'Explicit' }
		}));

		MenuRegistry.addCommand({ id: 'b', title: 'Implicit' });

		const [first, second] = MenuRegistry.getMenuItems(MenuId.CommandPalette);
		assert.equal(first.command.id, 'a');
		assert.equal(first.command.title, 'Explicit');

		assert.equal(second.command.id, 'b');
		assert.equal(second.command.title, 'Implicit');
	});
});
