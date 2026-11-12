/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Menus, SessionActivityBarGroup } from '../menus.js';

/**
 * Shows the entries extensions contribute to `agents/sessionActivityBar` ({@link MenuId.AgentsSessionActivityBar}) in
 * the Session Activity Bar, in a group of their own after its built-in groups. Their order follows the groups and
 * orders the extensions gave them, as in any menu, but they never land among the built-in entries, whose groups decide
 * what a checked entry hides when clicked. The bar shows only icons, so it leaves out commands without one.
 */
export class SessionActivityBarExtensionEntries extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionActivityBarExtensionEntries';

	private readonly entries = this._register(new DisposableStore());

	constructor() {
		super();
		this.update();
		this._register(MenuRegistry.onDidChangeMenu(event => {
			if (event.has(MenuId.AgentsSessionActivityBar)) {
				// The registry drops a change made while it reports another, so the strip would never hear of this one.
				queueMicrotask(() => {
					if (!this._store.isDisposed) {
						this.update();
					}
				});
			}
		}));
	}

	private update(): void {
		this.entries.clear();
		const items = MenuRegistry.getMenuItems(MenuId.AgentsSessionActivityBar).filter((item): item is IMenuItem => isIMenuItem(item) && !!item.command.icon).sort(compareEntries);
		items.forEach((item, index) => this.entries.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { ...item, group: SessionActivityBarGroup.Extensions, order: index })));
	}
}

/** Like a menu's own order: the `navigation` group first, then the other groups by name, then by order within a group. */
function compareEntries(a: IMenuItem, b: IMenuItem): number {
	const aGroup = a.group ?? '';
	const bGroup = b.group ?? '';
	if (aGroup !== bGroup) {
		return aGroup === 'navigation' ? -1 : bGroup === 'navigation' ? 1 : aGroup.localeCompare(bGroup);
	}
	return (a.order ?? 0) - (b.order ?? 0);
}
