/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Color } from '../../../../../base/common/color.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { localize } from '../../../../../nls.js';
import { editorHoverBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { CloseButton } from './colorPickerCloseButton.js';
import { ColorPickerWidgetType } from '../colorPickerParticipantUtils.js';

const $ = dom.$;

export class ColorPickerHeader extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _pickedColorNode: HTMLElement;
	private readonly _pickedColorPresentation: HTMLElement;
	private readonly _originalColorNode: HTMLElement;
	private readonly _closeButton: CloseButton | null = null;
	private backgroundColor: Color;

	constructor(container: HTMLElement, private readonly model: ColorPickerModel, themeService: IThemeService, private type: ColorPickerWidgetType) {
		super();

		this._domNode = $('.colorpicker-header');
		dom.append(container, this._domNode);

		this._pickedColorNode = dom.append(this._domNode, $('.picked-color'));
		dom.append(this._pickedColorNode, $('span.codicon.codicon-color-mode'));
		this._pickedColorPresentation = dom.append(this._pickedColorNode, document.createElement('span'));
		this._pickedColorPresentation.classList.add('picked-color-presentation');

		const tooltip = localize('clickToToggleColorOptions', "Click to toggle color options (rgb/hsl/hex)");
		this._pickedColorNode.setAttribute('title', tooltip);

		this._originalColorNode = dom.append(this._domNode, $('.original-color'));
		this._originalColorNode.style.backgroundColor = Color.Format.CSS.format(this.model.originalColor) || '';

		this.backgroundColor = themeService.getColorTheme().getColor(editorHoverBackground) || Color.white;
		this._register(themeService.onDidColorThemeChange(e => {
			this.backgroundColor = e.theme.getColor(editorHoverBackground) || Color.white;
		}));

		this._register(dom.addDisposableListener(this._pickedColorNode, dom.EventType.CLICK, () => this.model.selectNextColorPresentation()));
		this._register(dom.addDisposableListener(this._originalColorNode, dom.EventType.CLICK, () => {
			this.model.color = this.model.originalColor;
			this.model.flushColor();
		}));
		this._register(model.onDidChangeColor(this.onDidChangeColor, this));
		this._register(model.onDidChangePresentation(this.onDidChangePresentation, this));
		this._pickedColorNode.style.backgroundColor = Color.Format.CSS.format(model.color) || '';
		this._pickedColorNode.classList.toggle('light', model.color.rgba.a < 0.5 ? this.backgroundColor.isLighter() : model.color.isLighter());

		this.onDidChangeColor(this.model.color);

		// When the color picker widget is a standalone color picker widget, then add a close button
		if (this.type === ColorPickerWidgetType.Standalone) {
			this._domNode.classList.add('standalone-colorpicker');
			this._closeButton = this._register(new CloseButton(this._domNode));
		}
	}

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public get closeButton(): CloseButton | null {
		return this._closeButton;
	}

	public get pickedColorNode(): HTMLElement {
		return this._pickedColorNode;
	}

	public get originalColorNode(): HTMLElement {
		return this._originalColorNode;
	}

	private onDidChangeColor(color: Color): void {
		this._pickedColorNode.style.backgroundColor = Color.Format.CSS.format(color) || '';
		this._pickedColorNode.classList.toggle('light', color.rgba.a < 0.5 ? this.backgroundColor.isLighter() : color.isLighter());
		this.onDidChangePresentation();
	}

	private onDidChangePresentation(): void {
		this._pickedColorPresentation.textContent = this.model.presentation ? this.model.presentation.label : '';
	}
}
