/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuActionOptions, IMenuCreateOptions, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SCMRepositoryMenus } from '../../browser/menus.js';
import { ISCMProvider, ISCMRepository } from '../../common/scm.js';

class TestMenuService implements IMenuService {

	declare readonly _serviceBrand: undefined;

	private readonly menus = new Map<MenuId, { disposed: boolean }>();

	createMenu(id: MenuId, _contextKeyService: IContextKeyService, _options?: IMenuCreateOptions): IMenu {
		const state = { disposed: false };
		this.menus.set(id, state);

		return {
			onDidChange: Event.None,
			getActions: () => [],
			dispose: () => state.disposed = true,
		};
	}

	getMenuActions(_id: MenuId, _contextKeyService: IContextKeyService, _options?: IMenuActionOptions) {
		return [];
	}

	getMenuContexts(_id: MenuId): ReadonlySet<string> {
		return new Set<string>();
	}

	resetHiddenStates(_menuIds?: readonly MenuId[]): void { }

	isDisposed(id: MenuId): boolean {
		return this.menus.get(id)?.disposed ?? false;
	}
}

suite('SCMRepositoryMenus', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes repository context menu', () => {
		const contextKeyService = new MockContextKeyService();
		const menuService = new TestMenuService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.set(IContextKeyService, contextKeyService);
		instantiationService.set(IMenuService, menuService);

		const provider = {
			contextValue: { get: () => 'git' },
			groups: [],
			onDidChangeResourceGroups: Event.None,
			providerId: 'git',
		} as unknown as ISCMProvider;
		const repository = { provider } as ISCMRepository;
		const menus = new SCMRepositoryMenus(provider, contextKeyService, instantiationService, menuService);

		menus.getRepositoryContextMenu(repository);
		menus.dispose();

		assert.strictEqual(menuService.isDisposed(MenuId.SCMSourceControl), true);
	});
});
