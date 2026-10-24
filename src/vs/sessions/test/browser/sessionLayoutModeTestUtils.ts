/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../base/common/actions.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { MenuId, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { MenuService } from '../../../platform/actions/common/menuService.js';
import { NullCommandService } from '../../../platform/commands/test/common/nullCommandService.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyValue } from '../../../platform/contextkey/common/contextkey.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../platform/storage/common/storage.js';
import { Menus, SessionActivityBarGroup } from '../../browser/menus.js';

/** An item of the Layout group of the Session Activity Bar, and the entries of its submenu, if it opens one. */
export interface ISessionActivityBarLayoutItem {
	readonly label: string;
	readonly icon: string | undefined;
	readonly entries?: readonly { readonly id: string; readonly label: string; readonly checked: boolean; readonly enabled: boolean }[];
}

/**
 * Describes the items of `group` of `menuId` as the menu service builds them, with `contextKeys` set and `settings`
 * configured, and the entries of those that open a submenu.
 */
export function describeMenuGroup(store: Pick<DisposableStore, 'add'>, menuId: MenuId, group: string | undefined, contextKeys: Record<string, ContextKeyValue>, settings: Record<string, unknown>): ISessionActivityBarLayoutItem[] {
	const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService(settings)));
	for (const [key, value] of Object.entries(contextKeys)) {
		contextKeyService.createKey(key, value);
	}
	const menuService = store.add(new MenuService(NullCommandService, new MockKeybindingService(), store.add(new InMemoryStorageService())));
	const menu = store.add(menuService.createMenu(menuId, contextKeyService));
	const actions = menu.getActions().filter(([candidate]) => group === undefined || candidate === group).flatMap(([, groupActions]) => groupActions);
	return actions.map(action => {
		if (!(action instanceof SubmenuItemAction)) {
			return { label: action.label, icon: undefined };
		}
		const icon = action.item.icon;
		return {
			label: action.label,
			icon: ThemeIcon.isThemeIcon(icon) ? icon.id : undefined,
			entries: action.actions.filter(entry => !(entry instanceof Separator)).map(entry => ({ id: entry.id, label: entry.label, checked: !!entry.checked, enabled: entry.enabled })),
		};
	});
}

/**
 * Describes the Layout group of the Session Activity Bar as the menu service builds it, with `contextKeys` set and
 * `settings` configured.
 */
export function describeSessionActivityBarLayout(store: Pick<DisposableStore, 'add'>, contextKeys: Record<string, ContextKeyValue>, settings: Record<string, unknown>): ISessionActivityBarLayoutItem[] {
	return describeMenuGroup(store, Menus.SessionActivityBar, SessionActivityBarGroup.Layout, contextKeys, settings);
}
