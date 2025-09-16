/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { FloatingEditorToolbarWidget } from './floatingMenuWidget.js';

export class FloatingEditorToolbar extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.floatingToolbar';

	private readonly _widget: FloatingEditorToolbarWidget;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._widget = instantiationService.createInstance(FloatingEditorToolbarWidget, this.editor);
		this.editor.addOverlayWidget(this._widget);
	}

	override dispose(): void {
		this.editor.removeOverlayWidget(this._widget);
		this._widget.dispose();

		super.dispose();
	}
}

registerEditorContribution(FloatingEditorToolbar.ID, FloatingEditorToolbar, EditorContributionInstantiation.AfterFirstRender);
