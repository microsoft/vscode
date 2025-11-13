/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
import { TextEdit } from '../../../../../common/core/edits/textEdit.js';
import { StringText } from '../../../../../common/core/text/abstractText.js';
import { Command, InlineCompletionCommand } from '../../../../../common/languages.js';
import { InlineCompletionsModel, isSuggestionInViewport } from '../../model/inlineCompletionsModel.js';
import { InlineCompletionItem, InlineSuggestHint } from '../../model/inlineSuggestionItem.js';
import { IInlineEditHost, InlineCompletionViewData, InlineCompletionViewKind, InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';

/**
 * Warning: This is not per inline edit id and gets created often.
*/
export class ModelPerInlineEdit implements ModelPerInlineEdit {

	readonly action: Command | undefined;
	readonly displayName: string;
	readonly extensionCommands: InlineCompletionCommand[];
	readonly isInDiffEditor: boolean;

	readonly displayLocation: InlineSuggestHint | undefined;
	readonly showCollapsed: IObservable<boolean>;

	/** Determines if the inline suggestion is fully in the view port */
	readonly inViewPort: IObservable<boolean>;

	constructor(
		private readonly _model: InlineCompletionsModel,
		readonly inlineEdit: InlineEditWithChanges,
		readonly tabAction: IObservable<InlineEditTabAction>,
	) {
		this.action = this.inlineEdit.inlineCompletion.action;
		this.displayName = this.inlineEdit.inlineCompletion.source.provider.displayName ?? localize('inlineEdit', "Inline Edit");
		this.extensionCommands = this.inlineEdit.inlineCompletion.source.inlineSuggestions.commands ?? [];
		this.isInDiffEditor = this._model.isInDiffEditor;

		this.displayLocation = this.inlineEdit.inlineCompletion.hint;
		this.showCollapsed = this._model.showCollapsed;

		this.inViewPort = derived(this, reader => isSuggestionInViewport(this._model.editor, this.inlineEdit.inlineCompletion, reader));
	}

	accept() {
		this._model.accept();
	}

	jump() {
		this._model.jump();
	}

	handleInlineEditShown(viewKind: InlineCompletionViewKind, viewData: InlineCompletionViewData) {
		this._model.handleInlineSuggestionShown(this.inlineEdit.inlineCompletion, viewKind, viewData);
	}
}

export class InlineEditHost implements IInlineEditHost {
	readonly onDidAccept: Event<void>;
	readonly inAcceptFlow: IObservable<boolean>;

	constructor(
		private readonly _model: InlineCompletionsModel,
	) {
		this.onDidAccept = this._model.onDidAccept;
		this.inAcceptFlow = this._model.inAcceptFlow;
	}
}

export class GhostTextIndicator {

	readonly model: ModelPerInlineEdit;

	constructor(
		editor: ICodeEditor,
		model: InlineCompletionsModel,
		readonly lineRange: LineRange,
		inlineCompletion: InlineCompletionItem,
	) {
		const editorObs = observableCodeEditor(editor);
		const tabAction = derived<InlineEditTabAction>(this, reader => {
			if (editorObs.isFocused.read(reader)) {
				if (inlineCompletion.showInlineEditMenu) {
					return InlineEditTabAction.Accept;
				}
			}
			return InlineEditTabAction.Inactive;
		});

		this.model = new ModelPerInlineEdit(
			model,
			new InlineEditWithChanges(
				new StringText(''),
				new TextEdit([inlineCompletion.getSingleTextEdit()]),
				model.primaryPosition.get(),
				model.allPositions.get(),
				inlineCompletion.source.inlineSuggestions.commands ?? [],
				inlineCompletion
			),
			tabAction,
		);
	}
}
