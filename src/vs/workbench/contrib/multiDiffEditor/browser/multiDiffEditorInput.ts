/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LazyStatefulPromise, raceTimeout } from 'vs/base/common/async';
import { toDisposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { isObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ConstLazyPromise, IDocumentDiffItem, IMultiDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorViewModel';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ILanguageSupport } from 'vs/workbench/services/textfile/common/textfiles';

export class MultiDiffEditorInput extends EditorInput implements ILanguageSupport {
	static readonly ID: string = 'workbench.input.multiDiffEditor';

	get resource(): URI | undefined {
		return undefined;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override get typeId(): string {
		return MultiDiffEditorInput.ID;
	}

	override getName(): string {
		return (this.label ?? localize('name', "Multi Diff Editor")) + ` (${this.resources.length} files)`;
	}

	override get editorId(): string {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	private readonly _viewModel = new LazyStatefulPromise(async () => {
		const model = await this._createModel();
		const vm = new MultiDiffEditorViewModel(model, this._instantiationService);
		await raceTimeout(vm.waitForDiffs(), 1000);
		return vm;
	});


	constructor(
		readonly label: string | undefined,
		readonly resources: readonly MultiDiffEditorInputData[],
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextResourceConfigurationService private readonly _textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	setLanguageId(languageId: string, source?: string | undefined): void {
		const activeDiffItem = this._viewModel.requireValue().activeDiffItem.get();
		const value = activeDiffItem?.entry?.value;
		if (!value) { return; }
		const target = value.modified ?? value.original;
		if (!target) { return; }
		target.setLanguage(languageId, source);
	}

	async getViewModel(): Promise<MultiDiffEditorViewModel> {
		return this._viewModel.getPromise();
	}

	private async _createModel(): Promise<IMultiDiffEditorModel> {
		const rs = await Promise.all(this.resources.map(async r => ({
			originalRef: await this._textModelService.createModelReference(r.original!),
			modifiedRef: await this._textModelService.createModelReference(r.modified!),
			title: r.resource.fsPath,
		})));

		const textResourceConfigurationService = this._textResourceConfigurationService;

		return {
			onDidChange: () => toDisposable(() => { }),
			documents: rs.map(r => new ConstLazyPromise<IDocumentDiffItem>({
				original: r.originalRef.object.textEditorModel,
				modified: r.modifiedRef.object.textEditorModel,
				title: r.title,
				get options() {
					return computeOptions(textResourceConfigurationService.getValue(r.originalRef.object.textEditorModel.uri));
				},
				onOptionsDidChange: h => this._textResourceConfigurationService.onDidChangeConfiguration(e => {
					const uri = r.modifiedRef.object.textEditorModel.uri;
					if (e.affectsConfiguration(uri, 'editor') || e.affectsConfiguration(uri, 'diffEditor')) {
						h();
					}
				}),
			})),
		};
	}
}

function computeOptions(configuration: IEditorConfiguration): IDiffEditorOptions {
	const editorConfiguration = deepClone(configuration.editor);

	// Handle diff editor specially by merging in diffEditor configuration
	if (isObject(configuration.diffEditor)) {
		const diffEditorConfiguration: IDiffEditorOptions = deepClone(configuration.diffEditor);

		// User settings defines `diffEditor.codeLens`, but here we rename that to `diffEditor.diffCodeLens` to avoid collisions with `editor.codeLens`.
		diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
		delete diffEditorConfiguration.codeLens;

		// User settings defines `diffEditor.wordWrap`, but here we rename that to `diffEditor.diffWordWrap` to avoid collisions with `editor.wordWrap`.
		diffEditorConfiguration.diffWordWrap = <'off' | 'on' | 'inherit' | undefined>diffEditorConfiguration.wordWrap;
		delete diffEditorConfiguration.wordWrap;

		Object.assign(editorConfiguration, diffEditorConfiguration);
	}
	return editorConfiguration;
}

export class MultiDiffEditorInputData {
	constructor(
		readonly resource: URI,
		readonly original: URI | undefined,
		readonly modified: URI | undefined
	) { }
}
