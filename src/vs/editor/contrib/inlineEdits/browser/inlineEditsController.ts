/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { derived, derivedObservableWithCache, observableFromEvent } from 'vs/base/common/observable';
import { derivedDisposable } from 'vs/base/common/observableInternal/derived';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { observableCodeEditor } from 'vs/editor/browser/observableCodeEditor';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Selection } from 'vs/editor/common/core/selection';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { inlineEditVisible } from 'vs/editor/contrib/inlineEdits/browser/consts';
import { InlineEditsModel } from 'vs/editor/contrib/inlineEdits/browser/inlineEditsModel';
import { InlineEditsWidget } from 'vs/editor/contrib/inlineEdits/browser/inlineEditsWidget';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { bindContextKey } from 'vs/platform/observable/common/platformObservableUtils';

export class InlineEditsController extends Disposable {
	static ID = 'editor.contrib.inlineEditsController';

	public static get(editor: ICodeEditor): InlineEditsController | null {
		return editor.getContribution<InlineEditsController>(InlineEditsController.ID);
	}

	private readonly _editorObs = observableCodeEditor(this.editor);
	private readonly _selection = derived(this, reader => this._editorObs.cursorSelection.read(reader) ?? new Selection(1, 1, 1, 1));
	private readonly _enabledInConfig = observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);
	private readonly _enabled = derived(this, reader => this._enabledInConfig.read(reader));

	private readonly _debounceValue = this._debounceService.for(
		this._languageFeaturesService.inlineCompletionsProvider,
		'InlineEditsDebounce',
		{ min: 50, max: 50 }
	);

	public readonly model = derivedDisposable<InlineEditsModel | undefined>(this, reader => {
		if (this._editorObs.isReadonly.read(reader)) { return undefined; }
		const textModel = this._editorObs.model.read(reader);
		if (!textModel) { return undefined; }

		const model: InlineEditsModel = this._instantiationService.createInstance(
			readHotReloadableExport(InlineEditsModel, reader),
			textModel,
			this._editorObs.versionId,
			this._selection,
			this._debounceValue,
			this._enabled,
		);
		return model;
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _hadInlineEdit = derivedObservableWithCache<boolean>(this, (reader, lastValue) => lastValue || this.model.read(reader)?.inlineEdit.read(reader) !== undefined);

	private readonly widget = derivedDisposable(this, reader => {
		if (!this._hadInlineEdit.read(reader)) { return undefined; }
		return this._instantiationService.createInstance(
			readHotReloadableExport(InlineEditsWidget, reader),
			this.editor,
			this.model.map((m, reader) => m?.inlineEdit.read(reader)),
		);
	}).recomputeInitiallyAndOnChange(this._store);

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageFeatureDebounceService private readonly _debounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this._register(bindContextKey(inlineEditVisible, this._contextKeyService, r => !!this.model.read(r)?.inlineEdit.read(r)));
	}
}
