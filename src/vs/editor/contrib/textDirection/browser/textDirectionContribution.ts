/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { TextDirection } from '../../../common/model.js';

export class TextDirectionContribution extends Disposable implements IEditorContribution {
	public static readonly ID: string = 'editor.contrib.textDirectionContribution';

	private _decorations: string[] = [];

	constructor(
		private readonly editor: ICodeEditor,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
	) {
		super();
		this._register(editor.onDidChangeModelContent((e) => this.updateDecorations()));
		this._register(editor.onDidChangeModelLanguage((e) => this.updateDecorations()));
		this._register(editor.onDidChangeModelLanguageConfiguration((e) => this.updateDecorations()));
		this.updateDecorations();
	}

	override dispose(): void {
		super.dispose();
	}

	updateDecorations() {
		if (!this.editor.hasModel()) {
			return;
		}

		const model = this.editor.getModel();
		const range = model.getFullModelRange();
		const isRTL = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).textDirection === TextDirection.RTL;
		if (isRTL) {
			this._decorations = model.deltaDecorations(this._decorations, [{
				range,
				options: { description: '', textDirection: TextDirection.RTL },
			}]);
		} else {
			this._decorations = model.deltaDecorations(this._decorations, []);
		}
	}
}

registerEditorContribution(TextDirectionContribution.ID, TextDirectionContribution, EditorContributionInstantiation.BeforeFirstInteraction);
