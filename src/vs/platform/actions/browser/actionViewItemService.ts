/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { MenuId } from '../common/actions.js';


export const IActionViewItemService = createDecorator<IActionViewItemService>('IActionViewItemService');

export interface IActionViewItemService {

	_serviceBrand: undefined;

	onDidChange: Event<MenuId>;

	register(menu: MenuId, submenu: MenuId, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable;
	register(menu: MenuId, commandId: string, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable;

	lookUp(menu: MenuId, submenu: MenuId): IActionViewItemProvider | undefined;
	lookUp(menu: MenuId, commandId: string): IActionViewItemProvider | undefined;
}

export class NullActionViewItemService implements IActionViewItemService {
	_serviceBrand: undefined;

	onDidChange: Event<MenuId> = Event.None;

	register(menu: MenuId, commandId: string | MenuId, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable {
		return Disposable.None;
	}

	lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemProvider | undefined {
		return undefined;
	}
}

class ActionViewItemService implements IActionViewItemService {

	declare _serviceBrand: undefined;

	private readonly _providers = new Map<string, IActionViewItemProvider>();

	private readonly _onDidChange = new Emitter<MenuId>();
	readonly onDidChange: Event<MenuId> = this._onDidChange.event;

	dispose(): void {
		this._onDidChange.dispose();
	}

	register(menu: MenuId, commandOrSubmenuId: string | MenuId, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable {
		const id = this._makeKey(menu, commandOrSubmenuId);
		if (this._providers.has(id)) {
			throw new Error(`A provider for the command ${commandOrSubmenuId} and menu ${menu} is already registered.`);
		}
		this._providers.set(id, provider);

		const listener = event?.(() => {
			this._onDidChange.fire(menu);
		});

		return toDisposable(() => {
			listener?.dispose();
			this._providers.delete(id);
		});
	}

	lookUp(menu: MenuId, commandOrMenuId: string | MenuId): IActionViewItemProvider | undefined {
		return this._providers.get(this._makeKey(menu, commandOrMenuId));
	}

	private _makeKey(menu: MenuId, commandOrMenuId: string | MenuId) {
		return `${menu.id}/${(commandOrMenuId instanceof MenuId ? commandOrMenuId.id : commandOrMenuId)}`;
	}
}

registerSingleton(IActionViewItemService, ActionViewItemService, InstantiationType.Delayed);
