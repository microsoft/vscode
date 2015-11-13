/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface ISelection {

	/**
	 * Returns if the selection is empty or not.
	 */
	isEmpty(): boolean;
}

export interface IStructuredSelection extends ISelection {

	/**
	 * Returns an array of selected elements.
	 */
	toArray(): any[];
}

export class Selection implements ISelection {
	static EMPTY = new Selection([]);

	private _selection: any[];

	constructor(selection: any[]) {
		this._selection = selection || [];
	}

	public get selection() {
		return this._selection;
	}

	public isEmpty(): boolean {
		return this._selection.length === 0;
	}
}

export class StructuredSelection extends Selection implements IStructuredSelection {
	public toArray(): any[] {
		return this.selection;
	}
}