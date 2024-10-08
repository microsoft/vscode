/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorunWithStore, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { Position } from '../../../../common/core/position.js';
import { IInlineEdit, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider, InlineEditProvider, InlineEditTriggerKind } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';

export class InlineEditsAdapterContribution extends Disposable {
	public static ID = 'editor.contrib.inlineEditsAdapter';
	public static isFirst = true;

	constructor(
		_editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		if (InlineEditsAdapterContribution.isFirst) {
			InlineEditsAdapterContribution.isFirst = false;
			this.instantiationService.createInstance(InlineEditsAdapter);
		}
	}
}

export class InlineEditsAdapter extends Disposable {
	public static experimentalInlineEditsEnabled = 'editor.inlineSuggest.experimentalInlineEditsEnabled';
	private readonly _inlineCompletionInlineEdits = observableConfigValue(InlineEditsAdapter.experimentalInlineEditsEnabled, false, this._configurationService);

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		const didChangeSignal = observableSignalFromEvent('didChangeSignal', this._languageFeaturesService.inlineEditProvider.onDidChange);

		this._register(autorunWithStore((reader, store) => {
			if (!this._inlineCompletionInlineEdits.read(reader)) { return; }
			didChangeSignal.read(reader);

			type InlineCompletionsAndEdits = InlineCompletions & {
				edits: {
					result: IInlineEdit;
					provider: InlineEditProvider<IInlineEdit>;
				}[];
			};

			store.add(this._languageFeaturesService.inlineCompletionsProvider.register('*', new class implements InlineCompletionsProvider<InlineCompletionsAndEdits> {
				async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<InlineCompletionsAndEdits> {
					const allInlineEditProvider = _languageFeaturesService.inlineEditProvider.all(model);
					const inlineEdits = await Promise.all(allInlineEditProvider.map(async provider => {
						const result = await provider.provideInlineEdit(model, {
							triggerKind: InlineEditTriggerKind.Automatic,
						}, token);
						if (!result) { return undefined; }
						return { result, provider };
					}));

					const definedEdits = inlineEdits.filter(e => !!e);
					return {
						edits: definedEdits,
						items: definedEdits.map(e => {
							return {
								range: e.result.range,
								insertText: e.result.text,
								command: e.result.accepted,
								isInlineEdit: true,
							};
						}),
					};
				}
				freeInlineCompletions(c: InlineCompletionsAndEdits) {
					for (const e of c.edits) {
						e.provider.freeInlineEdit(e.result);
					}
				}
				toString(): string {
					return 'InlineEditsAdapter';
				}
			}));
		}));
	}
}
