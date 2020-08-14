/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';

export type styleFn = (colors: { [name: string]: Color | undefined }) => void;

export interface IThemable {
	style: styleFn;
}

/**
 * CSSStyleDeclaration property excluding readonly properties and functions.
 */
export type CSSStyleDeclarationMutableProperty = Exclude<keyof CSSStyleDeclaration, 'length' | 'parentRule' | 'getPropertyPriority' | 'getPropertyValue' | 'item' | 'removeProperty' | 'setProperty'>;

/**
 * CSSStyleDeclaration with only mutable string properties.
 */
export class CSSStyleDeclarationMutable {
	styles: Map<CSSStyleDeclarationMutableProperty, string>;

	constructor() {
		this.styles = new Map();
	}
	set(key: CSSStyleDeclarationMutableProperty, value: string) {
		this.styles.set(key, value);
	}
	get(key: CSSStyleDeclarationMutableProperty): string {
		return this.styles.get(key) || '';
	}
}

