/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution, EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ColorDecorationInjectedTextMarker } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorHoverParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { ModesHoverController } from 'vs/editor/contrib/hover/browser/hover';
import { HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import 'vs/css!./colorPicker';
import { StandaloneColorPickerController } from 'vs/editor/contrib/colorPicker/browser/standaloneColorPickerWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

class ShowOrFocusStandaloneColorPicker extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showOrFocusStandaloneColorPicker',
			label: localize({
				key: 'showOrFocusStandaloneColorPicker',
				comment: [
					'Action that shows the standalone color picker or focuses on it'
				]
			}, "Show or Focus the Color Picker"),
			alias: 'Show or Focus the Color Picker',
			precondition: undefined,
			kbOpts: {
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyP),
				weight: KeybindingWeight.EditorContrib + 1000000
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		console.log('inside of showing or focusing the color picker');
		StandaloneColorPickerController.get(editor)?.showOrFocus();
	}
}

registerEditorAction(ShowOrFocusStandaloneColorPicker);

class HideStandaloneColorPicker extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.hideColorPicker',
			label: localize({
				key: 'hideColorPicker',
				comment: [
					'Action that hides the color picker'
				]
			}, "Hide the Color Picker"),
			alias: 'Hide the Color Picker',
			precondition: EditorContextKeys.colorHoverVisible.isEqualTo(true),
			kbOpts: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib + 1000000
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		console.log('inside of hide of color picker');
		StandaloneColorPickerController.get(editor)?.hide();
	}
}

registerEditorAction(HideStandaloneColorPicker);

class InsertColorFromStandaloneColorPicker extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertColorFromStandaloneColorPicker',
			label: localize({
				key: 'insertColorFromStandaloneColorPicker',
				comment: [
					'Action that inserts color from standalone color picker'
				]
			}, "Insert Color from Standalone Color Picker"),
			alias: 'Insert Color from Standalone Color Picker',
			precondition: EditorContextKeys.colorHoverVisible.isEqualTo(true),
			kbOpts: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib + 1000000
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		console.log('inside of update editor of color picker');
		StandaloneColorPickerController.get(editor)?.updateEditor();
	}
}

registerEditorAction(InsertColorFromStandaloneColorPicker);

export class ColorContribution extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.colorContribution';

	static readonly RECOMPUTE_TIME = 1000; // ms

	constructor(private readonly _editor: ICodeEditor,
	) {
		super();
		this._register(_editor.onMouseDown((e) => this.onMouseDown(e)));
	}

	override dispose(): void {
		super.dispose();
	}

	private onMouseDown(mouseEvent: IEditorMouseEvent) {
		console.log('inside of on mouse down');
		const target = mouseEvent.target;

		if (target.type !== MouseTargetType.CONTENT_TEXT) {
			return;
		}

		if (!target.detail.injectedText) {
			return;
		}

		if (target.detail.injectedText.options.attachedData !== ColorDecorationInjectedTextMarker) {
			return;
		}

		if (!target.range) {
			return;
		}

		const hoverController = this._editor.getContribution<ModesHoverController>(ModesHoverController.ID);
		if (!hoverController) {
			return;
		}
		if (!hoverController.isColorPickerVisible()) {
			console.log('in the case when the color picker is not visible');
			const range = new Range(target.range.startLineNumber, target.range.startColumn + 1, target.range.endLineNumber, target.range.endColumn + 1);
			hoverController.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Mouse, false);
		}
	}
}

registerEditorContribution(ColorContribution.ID, ColorContribution, EditorContributionInstantiation.BeforeFirstInteraction);
HoverParticipantRegistry.register(ColorHoverParticipant);
