/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemProvider } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { MenuId } from '../common/actions.js';


export const IActionViewItemService = createDecorator<IActionViewItemService>('IActionViewItemService');

export interface IActionViewItemService {

	_serviceBrand: undefined;

	onDidChange: Event<MenuId>;

	register(menu: MenuId, commandId: string, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable;

	lookUp(menu: MenuId, commandId: string): IActionViewItemProvider | undefined;
}

export class NullActionViewItemService implements IActionViewItemService {
	_serviceBrand: undefined;

	onDidChange: Event<MenuId> = Event.None;

	register(menu: MenuId, commandId: string, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable {
		return toDisposable(() => { });
	}

	lookUp(menu: MenuId, commandId: string): IActionViewItemProvider | undefined {
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

	register(menu: MenuId, commandId: string, provider: IActionViewItemProvider, event?: Event<unknown>): IDisposable {
		const id = this._makeKey(menu, commandId);
		if (this._providers.has(id)) {
			throw new Error(`A provider for the command ${commandId} and menu ${menu} is already registered.`);
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

	lookUp(menu: MenuId, commandId: string): IActionViewItemProvider | undefined {
		return this._providers.get(this._makeKey(menu, commandId));
	}

	private _makeKey(menu: MenuId, commandId: string) {
		return menu.id + commandId;
	}
}

registerSingleton(IActionViewItemService, ActionViewItemService, InstantiationType.Delayed);
