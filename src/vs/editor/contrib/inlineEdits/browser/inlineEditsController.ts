/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readHotReloadableExport } from '../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedDisposable, derivedObservableWithCache, derivedWithSetter, IReader, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey, observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';
import { Selection } from '../../../common/core/selection.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { inlineEditVisible, isPinnedContextKey } from './consts.js';
import { InlineEditsModel } from './inlineEditsModel.js';
import { InlineEditsWidget } from './inlineEditsWidget.js';

export class InlineEditsController extends Disposable {
	static ID = 'editor.contrib.inlineEditsController';

	public static get(editor: ICodeEditor): InlineEditsController | null {
		return editor.getContribution<InlineEditsController>(InlineEditsController.ID);
	}

	private readonly _enabled = observableConfigValue('editor.inlineEdits.enabled', false, this._configurationService);
	private readonly _editorObs = observableCodeEditor(this.editor);
	private readonly _selection = derived(this, reader => this._editorObs.cursorSelection.read(reader) ?? new Selection(1, 1, 1, 1));

	private readonly _debounceValue = this._debounceService.for(
		this._languageFeaturesService.inlineCompletionsProvider,
		'InlineEditsDebounce',
		{ min: 50, max: 50 }
	);

	public readonly model = derivedDisposable<InlineEditsModel | undefined>(this, reader => {
		if (!this._enabled.read(reader)) {
			return undefined;
		}
		if (this._editorObs.isReadonly.read(reader)) { return undefined; }
		const textModel = this._editorObs.model.read(reader);
		if (!textModel) { return undefined; }

		const model: InlineEditsModel = this._instantiationService.createInstance(
			readHotReloadableExport(InlineEditsModel, reader),
			textModel,
			this._editorObs.versionId,
			this._selection,
			this._debounceValue,
		);

		return model;
	});

	private readonly _hadInlineEdit = derivedObservableWithCache<boolean>(this, (reader, lastValue) => lastValue || this.model.read(reader)?.inlineEdit.read(reader) !== undefined);

	protected readonly _widget = derivedDisposable(this, reader => {
		if (!this._hadInlineEdit.read(reader)) { return undefined; }

		return this._instantiationService.createInstance(
			readHotReloadableExport(InlineEditsWidget, reader),
			this.editor,
			this.model.map((m, reader) => m?.inlineEdit.read(reader)),
			flattenSettableObservable((reader) => this.model.read(reader)?.userPrompt ?? observableValue('empty', '')),
		);
	});

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILanguageFeatureDebounceService private readonly _debounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(bindContextKey(inlineEditVisible, this._contextKeyService, r => !!this.model.read(r)?.inlineEdit.read(r)));
		this._register(bindContextKey(isPinnedContextKey, this._contextKeyService, r => !!this.model.read(r)?.isPinned.read(r)));

		this.model.recomputeInitiallyAndOnChange(this._store);
		this._widget.recomputeInitiallyAndOnChange(this._store);
	}
}

function flattenSettableObservable<TResult>(fn: (reader: IReader | undefined) => ISettableObservable<TResult>): ISettableObservable<TResult> {
	return derivedWithSetter(undefined, reader => {
		const obs = fn(reader);
		return obs.read(reader);
	}, (value, tx) => {
		fn(undefined).set(value, tx);
	});
}
