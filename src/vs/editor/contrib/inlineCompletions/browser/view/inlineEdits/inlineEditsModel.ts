/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { ICodeEditor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { StringText, TextEdit } from '../../../../../common/core/textEdit.js';
import { InlineCompletionsModel } from '../../model/inlineCompletionsModel.js';
import { InlineCompletionWithUpdatedRange } from '../../model/inlineCompletionsSource.js';
import { IInlineEditModel, InlineEditTabAction } from './inlineEditsViewInterface.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';

export class InlineEditModel implements IInlineEditModel {

	readonly action = this.inlineEdit.inlineCompletion.action;
	readonly displayName = this.inlineEdit.inlineCompletion.source.provider.displayName ?? localize('inlineEdit', "Inline Edit");
	readonly extensionCommands = this.inlineEdit.inlineCompletion.source.inlineCompletions.commands ?? [];

	readonly inAcceptFlow = this._model.inAcceptFlow;
	readonly inPartialAcceptFlow = this._model.inPartialAcceptFlow;

	constructor(
		private readonly _model: InlineCompletionsModel,
		readonly inlineEdit: InlineEditWithChanges,
		readonly tabAction: IObservable<InlineEditTabAction>,
	) { }

	accept() {
		this._model.accept();
	}

	jump() {
		this._model.jump();
	}

	abort(reason: string) {
		console.error(reason); // TODO: add logs/telemetry
		this._model.stop();
	}

	handleInlineEditShown() {
		this._model.handleInlineEditShown(this.inlineEdit.inlineCompletion);
	}
}


export class GhostTextIndicator {

	readonly model: InlineEditModel;

	private readonly _editorObs = observableCodeEditor(this._editor);

	constructor(
		private _editor: ICodeEditor,
		model: InlineCompletionsModel,
		readonly lineRange: LineRange,
		inlineCompletion: InlineCompletionWithUpdatedRange,
		renderExplicitly: boolean,
	) {

		const tabAction = derived<InlineEditTabAction>(this, reader => {
			if (this._editorObs.isFocused.read(reader)) {
				if (model.inlineCompletionState.read(reader)?.inlineCompletion?.sourceInlineCompletion.showInlineEditMenu) {
					return InlineEditTabAction.Accept;
				}
			}
			return InlineEditTabAction.Inactive;
		});

		this.model = new InlineEditModel(
			model,
			new InlineEditWithChanges(
				new StringText(''),
				new TextEdit([]),
				model.primaryPosition.get(),
				renderExplicitly,
				inlineCompletion.source.inlineCompletions.commands ?? [],
				inlineCompletion.inlineCompletion
			),
			tabAction,
		);
	}
}
