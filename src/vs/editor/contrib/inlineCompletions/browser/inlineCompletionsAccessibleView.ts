/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { InlineCompletionContextKeys } from './controller/inlineCompletionContextKeys.js';
import { InlineCompletionsController } from './controller/inlineCompletionsController.js';
import { AccessibleViewType, AccessibleViewProviderId, IAccessibleViewContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InlineCompletionsModel } from './model/inlineCompletionsModel.js';
import { TextEdit } from '../../../common/core/textEdit.js';
import { LineEdit } from '../../../common/core/lineEdit.js';
import { TextModelText } from '../../../common/model/textModelText.js';
import { localize } from '../../../../nls.js';

export class InlineCompletionsAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 95;
	readonly name = 'inline-completions';
	readonly when = ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible);
	getProvider(accessor: ServicesAccessor) {
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			return;
		}

		const model = InlineCompletionsController.get(editor)?.model.get();
		if (!model?.state.get()) {
			return;
		}

		return new InlineCompletionsAccessibleViewContentProvider(editor, model);
	}
}

class InlineCompletionsAccessibleViewContentProvider extends Disposable implements IAccessibleViewContentProvider {
	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: InlineCompletionsModel,
	) {
		super();
	}

	public readonly id = AccessibleViewProviderId.InlineCompletions;
	public readonly verbositySettingKey = 'accessibility.verbosity.inlineCompletions';
	public readonly options = { language: this._editor.getModel()?.getLanguageId() ?? undefined, type: AccessibleViewType.View };

	public provideContent(): string {
		const state = this._model.state.get();
		if (!state) {
			throw new Error('Inline completion is visible but state is not available');
		}
		if (state.kind === 'ghostText') {

			const lineText = this._model.textModel.getLineContent(state.primaryGhostText.lineNumber);
			const ghostText = state.primaryGhostText.renderForScreenReader(lineText);
			if (!ghostText) {
				throw new Error('Inline completion is visible but ghost text is not available');
			}
			return lineText + ghostText;
		} else {
			const text = new TextModelText(this._model.textModel);
			const lineEdit = LineEdit.fromTextEdit(new TextEdit(state.edits), text);
			return localize('inlineEditAvailable', 'There is an inline edit available:') + '\n' + lineEdit.humanReadablePatch(text.getLines());
		}
	}
	public provideNextContent(): string | undefined {
		// asynchronously update the model and fire the event
		this._model.next().then((() => this._onDidChangeContent.fire()));
		return;
	}
	public providePreviousContent(): string | undefined {
		// asynchronously update the model and fire the event
		this._model.previous().then((() => this._onDidChangeContent.fire()));
		return;
	}
	public onClose(): void {
		this._model.stop();
		this._editor.focus();
	}
}
