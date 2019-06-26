/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { SyncDescriptor0, createSyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';

export interface IStatusbarItem {
	render(element: HTMLElement): IDisposable;
}

export class StatusbarItemDescriptor {
	readonly syncDescriptor: SyncDescriptor0<IStatusbarItem>;
	readonly id: string;
	readonly name: string;
	readonly alignment: StatusbarAlignment;
	readonly priority: number;

	constructor(
		ctor: IConstructorSignature0<IStatusbarItem>,
		id: string,
		name: string,
		alignment?: StatusbarAlignment,
		priority?: number
	) {
		this.id = id;
		this.name = name;
		this.syncDescriptor = createSyncDescriptor(ctor);
		this.alignment = alignment || StatusbarAlignment.LEFT;
		this.priority = priority || 0;
	}
}

export interface IStatusbarRegistry {

	readonly items: StatusbarItemDescriptor[];

	registerStatusbarItem(descriptor: StatusbarItemDescriptor): void;
}

class StatusbarRegistry implements IStatusbarRegistry {

	private readonly _items: StatusbarItemDescriptor[] = [];
	get items(): StatusbarItemDescriptor[] { return this._items; }

	registerStatusbarItem(descriptor: StatusbarItemDescriptor): void {
		this._items.push(descriptor);
	}
}

export const Extensions = {
	Statusbar: 'workbench.contributions.statusbar'
};

Registry.add(Extensions.Statusbar, new StatusbarRegistry());
