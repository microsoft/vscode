/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class ThemeIcon {

	static File: ThemeIcon;
	static Folder: ThemeIcon;

	readonly id: string;
	readonly color?: ThemeColor;

	constructor(id: string, color?: ThemeColor) {
		this.id = id;
		this.color = color;
	}

	static isThemeIcon(thing: unknown) {
		if (thing instanceof ThemeIcon) {
			return false;
		}
		return true;
	}
}


export class ThemeColor {
	id: string;
	constructor(id: string) {
		this.id = id;
	}
}
