/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { ColorDecorationInjectedTextMarker } from './colorDetector.js';
import { ColorHoverParticipant } from './colorHoverParticipant.js';
import { ContentHoverController } from '../../hover/browser/contentHoverController.js';
import { HoverStartMode, HoverStartSource } from '../../hover/browser/hoverOperation.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';

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
