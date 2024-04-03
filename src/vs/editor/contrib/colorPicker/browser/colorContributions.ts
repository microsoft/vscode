/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ColorDecorationInjectedTextMarker } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorHoverParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { HoverController } from 'vs/editor/contrib/hover/browser/hover';
import { HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';

enum ColorDecoratorActivatedOn {
	Hover = 'hover',
	Click = 'click',
	ClickAndHover = 'clickAndHover'
}


export class ColorContribution extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.colorContribution';

	private _listenersStore: DisposableStore = new DisposableStore();
	private _activatedByDecoratorClick: boolean = false;
	private _hoverEnabled!: boolean;
	private _colorDecoratorsActivatedOn!: ColorDecoratorActivatedOn;

	constructor(private readonly _editor: ICodeEditor) {
		super();
		this._hookListeners();
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.hover) || e.hasChanged(EditorOption.colorDecoratorsActivatedOn)) {
				this._unhookListeners();
				this._hookListeners();
			}
		}));
	}

	private _hookListeners(): void {
		this._hoverEnabled = this._editor.getOption(EditorOption.hover).enabled;
		this._colorDecoratorsActivatedOn = <ColorDecoratorActivatedOn>this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		if (this._hoverEnabled) {
			this._register(this._editor.onMouseDown((e) => this._onMouseDown(e)));
		}
	}

	private _unhookListeners(): void {
		this._listenersStore.clear();
	}

	private _onMouseDown(mouseEvent: IEditorMouseEvent) {
		const hoverController = this._editor.getContribution<HoverController>(HoverController.ID);
		if (!hoverController) {
			return;
		}
		if (hoverController.isColorPickerVisible) {
			return;
		}
		const colorDecoratorsActivatedOn = this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		if (colorDecoratorsActivatedOn === ColorDecoratorActivatedOn.Hover) {
			return;
		}
		const onColorDecorator = this._onColorDecorator(mouseEvent);
		if (!onColorDecorator) {
			return;
		}
		const target = mouseEvent.target;
		if (!target.range) {
			return;
		}
		this._activatedByDecoratorClick = true;
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
		const decoratorActivatedOn = this._colorDecoratorsActivatedOn;
		const enabled = this._hoverEnabled;
		if ((
			mouseOnDecorator && (
				(decoratorActivatedOn === 'click' && !this._activatedByDecoratorClick) ||
				(decoratorActivatedOn === 'hover' && !enabled) ||
				(decoratorActivatedOn === 'clickAndHover' && !enabled && !this._activatedByDecoratorClick))
		) || (
				!mouseOnDecorator && !enabled && !this._activatedByDecoratorClick
			)
		) {
			return true;
		}
		return false;
	}

	override dispose(): void {
		super.dispose();
		this._unhookListeners();
	}
}

registerEditorContribution(ColorContribution.ID, ColorContribution, EditorContributionInstantiation.BeforeFirstInteraction);
HoverParticipantRegistry.register(ColorHoverParticipant);
