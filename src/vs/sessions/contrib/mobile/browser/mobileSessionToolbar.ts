/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export function renderMobileSessionToolbar(instantiationService: IInstantiationService, container: HTMLElement, className: string, menu: MenuId, before?: HTMLElement): IDisposable {
	const store = new DisposableStore();
	const row = dom.$(`div.${className}`);
	store.add(toDisposable(() => row.remove()));
	container.insertBefore(row, before ?? null);
	const toolbar = store.add(instantiationService.createInstance(MenuWorkbenchToolBar, row, menu, {
		hiddenItemStrategy: HiddenItemStrategy.NoHide,
		toolbarOptions: { primaryGroup: () => true },
	}));
	const update = () => row.toggleAttribute('hidden', toolbar.getItemsLength() === 0);
	store.add(toolbar.onDidChangeMenuItems(update));
	update();
	return store;
}
