/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from "vs/base/common/lifecycle";
import { EventEmitter } from "vs/base/common/eventEmitter";
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";

export class ColorPickerModel implements IDisposable {
	public dragging: boolean;

	private _widget: ColorPickerWidget;
	private _originalColor: string;
	private _selectedColor: string;

	private eventEmmiter: EventEmitter;

	constructor() {
		this.dragging = false;

		this.eventEmmiter = new EventEmitter();
	}

	public set widget(widget: ColorPickerWidget) {
		this._widget = widget;
	}

	public get widget() {
		return this._widget;
	}

	public set originalColor(color: string) {
		this._originalColor = color;

		// Update view, probably draw
	}

	public get originalColor() {
		return this._originalColor;
	}

	public set selectedColor(color: string) {
		console.log('Updating a view based on selected color + ' + color);
		this._selectedColor = color;

		if (this.widget.header) {
			this.widget.header.updatePickedColor();
			this.widget.body.updateOpacityGradient();
		}
	}

	public get selectedColor() {
		return this._selectedColor;
	}

	public dispose(): void {
		this.eventEmmiter.dispose();
	}
}