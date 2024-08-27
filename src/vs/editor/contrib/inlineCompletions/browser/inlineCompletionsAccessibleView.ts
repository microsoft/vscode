/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController';
import { AccessibleViewType, AccessibleViewProviderId, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel';

export class InlineCompletionsAccessibleView implements IAccessibleViewImplentation {
	readonly type = AccessibleViewType.View;
	readonly priority = 95;
	readonly name = 'inline-completions';
	readonly when = ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionVisible);
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
		const lineText = this._model.textModel.getLineContent(state.primaryGhostText.lineNumber);
		const ghostText = state.primaryGhostText.renderForScreenReader(lineText);
		if (!ghostText) {
			throw new Error('Inline completion is visible but ghost text is not available');
		}
		return lineText + ghostText;
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
