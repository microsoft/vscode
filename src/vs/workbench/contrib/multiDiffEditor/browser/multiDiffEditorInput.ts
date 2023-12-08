/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LazyStatefulPromise, raceTimeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { isDefined, isObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ConstLazyPromise, IDocumentDiffItem, IMultiDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { MultiDiffEditorViewModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorViewModel';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorConfiguration } from 'vs/workbench/browser/parts/editor/textEditor';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ILanguageSupport } from 'vs/workbench/services/textfile/common/textfiles';

/* hot-reload:patch-prototype-methods */
export class MultiDiffEditorInput extends EditorInput implements ILanguageSupport {
	static readonly ID: string = 'workbench.input.multiDiffEditor';

	public readonly id: string;

	get resource(): URI | undefined {
		return URI.parse(`multi-diff-editor:${this.id}`);
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

	constructor(
		readonly label: string | undefined,
		readonly resources: readonly MultiDiffEditorInputData[],
		id: string | undefined,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextResourceConfigurationService private readonly _textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();
		this.id = id || new Date().getMilliseconds().toString() + Math.random().toString();
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

	private readonly _viewModel = new LazyStatefulPromise(async () => {
		const model = await this._createModel();
		this._register(model);
		const vm = new MultiDiffEditorViewModel(model, this._instantiationService);
		this._register(vm);
		await raceTimeout(vm.waitForDiffs(), 1000);
		return vm;
	});

	private async _createModel(): Promise<IMultiDiffEditorModel & IDisposable> {
		const store = new DisposableStore();
		const rs = (await Promise.all(this.resources.map(async r => {
			try {
				return {
					originalRef: r.original ? store.add(await this._textModelService.createModelReference(r.original)) : undefined,
					originalModel: !r.original ? store.add(this._modelService.createModel('', null)) : undefined,
					modifiedRef: r.modified ? store.add(await this._textModelService.createModelReference(r.modified)) : undefined,
					modifiedModel: !r.modified ? store.add(this._modelService.createModel('', null)) : undefined,
					title: r.resource.fsPath,
				};
			} catch (e) {
				// e.g. "File seems to be binary and cannot be opened as text"
				console.error(e);
				onUnexpectedError(e);
				return undefined;
			}
		}))).filter(isDefined);

		const textResourceConfigurationService = this._textResourceConfigurationService;

		return {
			dispose: () => store.dispose(),
			onDidChange: () => toDisposable(() => { }),
			documents: rs.map(r => {
				const uri = (r.originalRef ?? r.modifiedRef!).object.textEditorModel.uri;
				return new ConstLazyPromise<IDocumentDiffItem>({
					original: r.originalRef ? r.originalRef.object.textEditorModel : r.originalModel!,
					modified: r.modifiedRef ? r.modifiedRef.object.textEditorModel : r.modifiedModel!,
					title: r.title,
					get options() {
						r.modifiedRef?.object.isReadonly;

						return {
							...getReadonlyConfiguration(r.modifiedRef?.object.isReadonly() ?? true),
							...computeOptions(textResourceConfigurationService.getValue(uri)),
						} satisfies IDiffEditorOptions;
					},
					onOptionsDidChange: h => this._textResourceConfigurationService.onDidChangeConfiguration(e => {
						if (e.affectsConfiguration(uri, 'editor') || e.affectsConfiguration(uri, 'diffEditor')) {
							h();
						}
					}),
				});
			}),
		};
	}
}

function getReadonlyConfiguration(isReadonly: boolean | IMarkdownString | undefined): { readOnly: boolean; readOnlyMessage: IMarkdownString | undefined } {
	return {
		readOnly: !!isReadonly,
		readOnlyMessage: typeof isReadonly !== 'boolean' ? isReadonly : undefined
	};
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
