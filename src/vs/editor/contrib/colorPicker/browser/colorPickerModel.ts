/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";

export class ColorPickerModel {

	public saturationSelection: ISaturationState;
	public dragging: boolean;

	private _widget: ColorPickerWidget;
	private _originalColor: string;
	private _selectedColor: string;
	private _hue: string;

	constructor() {
		this.dragging = false;
	}

	public set widget(widget: ColorPickerWidget) {
		this._widget = widget;
	}

	public get widget() {
		return this._widget;
	}

	public set originalColor(color: string) {
		this._originalColor = color;
	}

	public get originalColor() {
		return this._originalColor;
	}

	public set selectedColor(color: string) {
		this._selectedColor = color;

		if (this.widget.header) {
			this.widget.header.updatePickedColor(); // update picked colour from box view
			this.widget.body.fillOpacityGradient();  // update opacity gradient based on the color
		}
	}

	public get selectedColor() {
		return this._selectedColor;
	}

	public set hue(color: string) {
		this._hue = color;

		this.widget.body.fillSaturationBox();
	}

	public get hue() {
		return this._hue;
	}
}

export class ISaturationState {
	public x: number;
	public y: number;
}