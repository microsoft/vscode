/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from '../../../../../base/browser/domObservable.js';
import { readHotReloadableExport } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, mapObservableArrayCached, derivedDisposable, constObservable, derivedObservableWithCache, IObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { InlineCompletionsHintsWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { convertItemsToStableObservables } from '../utils.js';
import { GhostTextView } from './ghostText/ghostTextView.js';
import { InlineEditsViewAndDiffProducer } from './inlineEdits/inlineEditsViewAndDiffProducer.js';

export class InlineCompletionsView extends Disposable {
	private readonly _ghostTexts = derived(this, (reader) => {
		const model = this._model.read(reader);
		return model?.ghostTexts.read(reader) ?? [];
	});
	private readonly _stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);

	private readonly _ghostTextWidgets = mapObservableArrayCached(this, this._stablizedGhostTexts, (ghostText, store) => derivedDisposable((reader) => this._instantiationService.createInstance(readHotReloadableExport(GhostTextView, reader), this._editor, {
		ghostText: ghostText,
		minReservedLineCount: constObservable(0),
		targetTextModel: this._model.map(v => v?.textModel),
	})
	).recomputeInitiallyAndOnChange(store)
	).recomputeInitiallyAndOnChange(this._store);

	private readonly _inlineEdit = derived(this, reader => this._model.read(reader)?.inlineEditState.read(reader)?.inlineEdit);
	private readonly _everHadInlineEdit = derivedObservableWithCache<boolean>(this, (reader, last) => last || !!this._inlineEdit.read(reader));
	protected readonly _inlineEditWidget = derivedDisposable(reader => {
		if (!this._everHadInlineEdit.read(reader)) {
			return undefined;
		}
		return this._instantiationService.createInstance(InlineEditsViewAndDiffProducer.hot.read(reader), this._editor, this._inlineEdit, this._model);
	})
		.recomputeInitiallyAndOnChange(this._store);

	private readonly _editorObs = observableCodeEditor(this._editor);
	private readonly _fontFamily = this._editorObs.getOption(EditorOption.inlineSuggest).map(val => val.fontFamily);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._register(createStyleSheetFromObservable(derived(reader => {
			const fontFamily = this._fontFamily.read(reader);
			if (fontFamily === '' || fontFamily === 'default') { return ''; }
			return `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
		})));

		this._register(new InlineCompletionsHintsWidget(this._editor, this._model, this._instantiationService));
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._ghostTextWidgets.get()[0]?.get().ownsViewZone(viewZoneId) ?? false;
	}
}
