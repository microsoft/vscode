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
import { HoverStartMode, HoverStartSource } from '../../hover/browser/hoverOperation.js';
import { ContentHoverController } from '../../hover/browser/contentHoverController.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';
import { ColorHoverParticipant } from './colorHoverParticipant.js';



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
			console.log('not on color decorator');
			return;
		}
		console.log('on color decorator');
		const hoverController = this._editor.getContribution<ContentHoverController>(ContentHoverController.ID);
		if (!hoverController) {
			console.log('return 1');
			return;
		}
		if (hoverController.isColorPickerVisible) {
			console.log('return 2');
			return;
		}
		const target = mouseEvent.target;
		if (!target.range) {
			console.log('return 3');
			return;
		}
		const range = new Range(
			target.range.startLineNumber,
			target.range.startColumn + 1,
			target.range.endLineNumber,
			target.range.endColumn + 1
		);
		console.log('before showContentHover');
		console.log('range : ', range);
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

	public shouldHideHoverOnMouseMoveEvent(mouseEvent: IEditorMouseEvent) {
		console.log('shouldHideHoverOnMouseEvent');
		const mouseOnDecorator = this._onColorDecorator(mouseEvent);
		const decoratorActivatedOn = <ColorDecoratorActivatedOn>this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		console.log('mouseOnDecorator', mouseOnDecorator);
		console.log('decoratorActivatedOn', decoratorActivatedOn);
		return mouseOnDecorator && decoratorActivatedOn === ColorDecoratorActivatedOn.Click;
	}
}

registerEditorContribution(ColorContribution.ID, ColorContribution, EditorContributionInstantiation.BeforeFirstInteraction);
HoverParticipantRegistry.register(ColorHoverParticipant);
