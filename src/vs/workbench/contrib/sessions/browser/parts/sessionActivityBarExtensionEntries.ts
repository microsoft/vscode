/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { compareMenuItems } from '../../../../../platform/actions/common/menuService.js';
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
		const items = MenuRegistry.getMenuItems(MenuId.AgentsSessionActivityBar).filter((item): item is IMenuItem => isIMenuItem(item) && !!item.command.icon).sort(compareMenuItems);
		items.forEach((item, index) => this.entries.add(MenuRegistry.appendMenuItem(Menus.SessionActivityBar, { ...item, group: SessionActivityBarGroup.Extensions, order: index })));
	}
}
