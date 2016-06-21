/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';

namespace schema {

	export function isValidLocation(location: string, collector: IExtensionMessageCollector): boolean {
		switch (location) {
			case 'editor/primary':
			case 'editor/secondary':
				return true;
		}
		return false;
	}

	export function isValidMenuItem(item: MenuItem, collector: IExtensionMessageCollector): boolean {

		return true;
	}

	export function isValidMenus(menu: Menus, collector: IExtensionMessageCollector): boolean {

		for (let key in menu) {
			if (menu.hasOwnProperty(key)) {
				let value = <MenuItem[]> menu[key];
				if (!isValidLocation(key, collector)) {
					collector.warn(localize('invalid', "`{0}` is not a valid menu location", key));
					continue;
				}

				if (!Array.isArray(value)) {
					collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `Array`", key));
					return false;
				}

				for (let item of value) {
					if (!isValidMenuItem(item, collector)) {
						return false;
					}
				}
			}
		}

		return true;
	}

	export const menus = <IJSONSchema>{

	};
}

export interface MenuItem {
	command: string;
	alt: string;
}

export interface Menus {
	'editor/primary': MenuItem[];
	'editor/secondary': MenuItem[];
}

ExtensionsRegistry.registerExtensionPoint<Menus>('menus', schema.menus).setHandler(extensions => {
	for (let extension of extensions) {
		const {value} = extension;

		if (schema.isValidMenus(value, extension.collector)) {
			for (var key in value) {
				if (value.hasOwnProperty(key)) {
					MenusRegistry.registerMenuItems(MenuLocations.fromString(key), value[key]);
				}
			}
		}
	}
});

export enum MenuLocations {
	EditorPrimary = 0,
	EditorSecondary = 1
}

export namespace MenuLocations {
	export function fromString(value: string): MenuLocations {
		switch (value) {
			case 'editor/primary': return MenuLocations.EditorPrimary;
			case 'editor/secondary': return MenuLocations.EditorSecondary;
		}
	}
}

export interface IMenuRegistry {
	registerMenuItems(location: MenuLocations, items: MenuItem[]): void;
	getMenuItems(location: MenuLocations): MenuItem[];
}

export const MenusRegistry: IMenuRegistry = new class {

	private _values: { [location: number]: MenuItem[] } = Object.create(null);

	registerMenuItems(location: MenuLocations, items: MenuItem[]): void {
		let array = this._values[location];
		if (array) {
			array.push(...items);
		} else {
			this._values[location] = items;
		}
	}

	getMenuItems(location: MenuLocations): MenuItem[] {
		return this._values[location];
	}
};

