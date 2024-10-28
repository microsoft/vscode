/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Range } from '../../../../common/core/range.js';
import { IEditorContribution } from '../../../../common/editorCommon.js';
import { ColorDecorationInjectedTextMarker } from '../colorDetector.js';
import { ContentHoverController } from '../../../hover/browser/contentHoverController.js';
import { HoverStartMode, HoverStartSource } from '../../../hover/browser/hoverOperation.js';

export class HoverColorPickerContribution extends Disposable implements IEditorContribution {

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

		const colorDecoratorsActivatedOn = this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		if (colorDecoratorsActivatedOn !== 'click' && colorDecoratorsActivatedOn !== 'clickAndHover') {
			return;
		}

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

		const hoverController = this._editor.getContribution<ContentHoverController>(ContentHoverController.ID);
		if (!hoverController) {
			return;
		}
		if (!hoverController.isColorPickerVisible) {
			const range = new Range(target.range.startLineNumber, target.range.startColumn + 1, target.range.endLineNumber, target.range.endColumn + 1);
			hoverController.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Mouse, false, true);
		}
	}
}
