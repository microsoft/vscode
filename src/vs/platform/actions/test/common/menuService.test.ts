/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {MenuRegistry, MenuId} from 'vs/platform/actions/common/actions';
import {MenuService} from 'vs/platform/actions/common/menuService';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {NullCommandService} from 'vs/platform/commands/common/commands';
import {MockKeybindingService} from 'vs/platform/keybinding/test/common/mockKeybindingService';
import {AbstractExtensionService, ActivatedExtension} from 'vs/platform/extensions/common/abstractExtensionService';

const extensionService = new class extends AbstractExtensionService<ActivatedExtension> {

	constructor() {
		super(true);
	}

	protected _showMessage(): void {
		console.log(arguments);
	}

	protected _createFailedExtension() {
		return null;
	}

	protected _actualActivateExtension() {
		return null;
	}
};

const keybindingService = new class extends MockKeybindingService {

	contextMatchesRules() {
		return true;
	}
};


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
			group: 'Hello'
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'three', title: 'FOO' },
			group: ''
		}));

		disposables.push(MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
			command: { id: 'four', title: 'FOO' },
			group: 'navigation'
		}));

		const groups = menuService.createMenu(MenuId.ExplorerContext, keybindingService).getActions();

		assert.equal(groups.length, 4);
		const [one, two, three, four] = groups;

		assert.equal(one[0], 'navigation');
		assert.equal(two[0], '0_hello');
		assert.equal(three[0], 'Hello');
		assert.equal(four[0], '');

	});
});