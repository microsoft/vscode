/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from "vs/base/common/lifecycle";
import { EventEmitter } from "vs/base/common/eventEmitter";

export class ColorPickerModel implements IDisposable {

	private _originalColor: string;
	private _selectedColor: string;
	private eventEmmiter: EventEmitter;

	constructor() {
		this.eventEmmiter = new EventEmitter();
	}

	public set originalColor(color: string) {
		this._originalColor = color;

		// Update view, probably draw
	}

	public get originalColor() {
		return this._originalColor;
	}

	public set selectedColor(color: string) {
		this._selectedColor = color;

		// Update view
	}

	public get selectedColor() {
		return this._selectedColor;
	}

	public dispose(): void {
		this.eventEmmiter.dispose();
	}
}