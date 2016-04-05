/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export class ArraySet<T> {

	private _elements: T[];

	constructor(elements: T[] = []) {
		this._elements = elements.slice();
	}

	set(element: T): void {
		this.unset(element);
		this._elements.push(element);
	}

	unset(element: T): void {
		const index = this._elements.indexOf(element);

		if (index > -1) {
			this._elements.splice(index, 1);
		}
	}

	get elements(): T[] {
		return this._elements;
	}
}