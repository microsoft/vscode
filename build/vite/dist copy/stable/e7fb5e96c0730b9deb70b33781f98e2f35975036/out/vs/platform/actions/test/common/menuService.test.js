/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../common/actions.js';
import { MenuService } from '../../common/menuService.js';
import { NullCommandService } from '../../../commands/test/common/nullCommandService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
// --- service instances
const contextKeyService = new class extends MockContextKeyService {
    contextMatchesRules() {
        return true;
    }
};
// --- tests
suite('MenuService', function () {
    let menuService;
    const disposables = new DisposableStore();
    let testMenuId;
    setup(function () {
        menuService = new MenuService(NullCommandService, new MockKeybindingService(), new InMemoryStorageService());
        testMenuId = new MenuId(`testo/${generateUuid()}`);
        disposables.clear();
    });
    teardown(function () {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudVNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FjdGlvbnMvdGVzdC9jb21tb24vbWVudVNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDeEgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFNUUsd0JBQXdCO0FBRXhCLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxLQUFNLFNBQVEscUJBQXFCO0lBQ3ZELG1CQUFtQjtRQUMzQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRCxDQUFDO0FBRUYsWUFBWTtBQUVaLEtBQUssQ0FBQyxhQUFhLEVBQUU7SUFFcEIsSUFBSSxXQUF3QixDQUFDO0lBQzdCLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsSUFBSSxVQUFrQixDQUFDO0lBRXZCLEtBQUssQ0FBQztRQUNMLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxrQkFBa0Is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