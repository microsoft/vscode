/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ColorDecorationInjectedTextMarker } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { HoverController } from 'vs/editor/contrib/hover/browser/hover';
import { HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';

enum ColorDecoratorActivatedOn {
	Hover = 'hover',
	Click = 'click',
	ClickAndHover = 'clickAndHover'
}

export class ColorContribution extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.colorContribution';

	static readonly RECOMPUTE_TIME = 1000; // ms

	constructor(private readonly _editor: ICodeEditor) {
		super();
		this._register(_editor.onMouseDown((e) => this._onMouseDown(e)));
	}

	override dispose(): void {
		super.dispose();
	}

	private _onMouseDown(mouseEvent: IEditorMouseEvent) {

		const colorDecoratorsActivatedOn = this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		if (colorDecoratorsActivatedOn === ColorDecoratorActivatedOn.Hover) {
			return;
		}

		if (!this._onColorDecorator(mouseEvent)) {
			return;
		}
		const hoverController = this._editor.getContribution<HoverController>(HoverController.ID);
		if (!hoverController) {
			return;
		}
		if (hoverController.isColorPickerVisible) {
			return;
		}
		const target = mouseEvent.target;
		if (!target.range) {
			return;
		}
		const range = new Range(target.range.startLineNumber, target.range.startColumn + 1, target.range.endLineNumber, target.range.endColumn + 1);
		hoverController.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Mouse, false);
	}

	private _onColorDecorator(mouseEvent: IEditorMouseEvent): boolean {
		const target = mouseEvent.target;
		if (target.type !== MouseTargetType.CONTENT_TEXT) {
			return false;
		}
		if (!target.detail.injectedText) {
			return false;
		}
		if (target.detail.injectedText.options.attachedData !== ColorDecorationInjectedTextMarker) {
			return false;
		}
		return true;
	}

	public shouldHideHoverOnMouseEvent(mouseEvent: IEditorMouseEvent) {
		const mouseOnDecorator = this._onColorDecorator(mouseEvent);
		const decoratorActivatedOn = <ColorDecoratorActivatedOn>this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		if (mouseOnDecorator && decoratorActivatedOn === ColorDecoratorActivatedOn.Click) {
			return true;
		}
		return false;
	}
}

registerEditorContribution(ColorContribution.ID, ColorContribution, EditorContributionInstantiation.BeforeFirstInteraction);
