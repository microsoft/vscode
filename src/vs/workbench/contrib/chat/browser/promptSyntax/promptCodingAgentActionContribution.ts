/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { registerEditorContribution, EditorContributionInstantiation } from '../../../../../editor/browser/editorExtensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { PromptCodingAgentFloatingMenu } from './promptCodingAgentActionOverlay.js';

export class PromptCodingAgentActionContribution extends Disposable {
	static readonly ID = 'promptCodingAgentActionContribution';

	private readonly _floatingMenus = this._register(new DisposableMap<ICodeEditor, PromptCodingAgentFloatingMenu>());

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._register(this._editor.onDidChangeModel(() => {
			this._updateFloatingMenu();
		}));

		this._updateFloatingMenu();
	}

	private _updateFloatingMenu(): void {
		const model = this._editor.getModel();

		// Remove existing floating menu if present
		this._floatingMenus.deleteAndDispose(this._editor);

		// Add floating menu if this is a prompt file
		if (model && model.getLanguageId() === PROMPT_LANGUAGE_ID) {
			const floatingMenu = this._instantiationService.createInstance(PromptCodingAgentFloatingMenu, this._editor);
			this._floatingMenus.set(this._editor, floatingMenu);
		}
	}
}

registerEditorContribution(PromptCodingAgentActionContribution.ID, PromptCodingAgentActionContribution, EditorContributionInstantiation.AfterFirstRender);
