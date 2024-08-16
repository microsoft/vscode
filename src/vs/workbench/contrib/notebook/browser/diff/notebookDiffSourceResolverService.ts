/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { NotebookDiffEditorInput } from 'vs/workbench/contrib/notebook/common/notebookDiffEditorInput';
import { NotebookDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffViewModel';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { getFormattedOutputJSON, SideBySideDiffElementViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem, type IMultiDiffSourceResolver, type IResolvedMultiDiffSource } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
// import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
// import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import type { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import type { IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { Event } from 'vs/base/common/event';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import type { ITextModel } from 'vs/editor/common/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';


export const ID_NOTEBOOK_MULTI_DIFF_SOURCE_RESOLVER_SERVICE = 'notebookDiffSourceResolverService';
export const INotebookDiffSourceResolverService = createDecorator<INotebookDiffSourceResolverService>(ID_NOTEBOOK_MULTI_DIFF_SOURCE_RESOLVER_SERVICE);

export interface INotebookDiffSourceResolverService {
	readonly _serviceBrand: undefined;
	add(uri: URI, diffEditorInput: IResourceDiffEditorInput & { id: string }): IDisposable;
}


export const NotebookMultiDiffEditorScheme = 'multi-cell-notebook-diff-editor';
export class NotebookDiffSourceResolverService extends Disposable implements IMultiDiffSourceResolver, INotebookDiffSourceResolverService {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookService private readonly notebookService: INotebookService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		// @ICodeEditorService private readonly _editorService: ICodeEditorService,
		// @IWebviewService private readonly _webviewService: IWebviewService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
		@ITextModelService textModelService: ITextModelService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
		this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellOutput, {
			provideTextContent: this.provideOutputTextContent.bind(this)
		}));
	}

	private readonly mappedInputs = new ResourceMap<IResourceDiffEditorInput & { id: string } & { disposables: DisposableStore }>();
	add(uri: URI, diffEditorInput: IResourceDiffEditorInput & { id: string }): IDisposable {
		const disposables = new DisposableStore();
		this.mappedInputs.set(uri, { ...diffEditorInput, disposables });
		return toDisposable(() => { this.mappedInputs.delete(uri); disposables.dispose(); });
	}

	canHandleUri(uri: URI): boolean {
		return this.mappedInputs.has(uri);
	}
	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const data = this.mappedInputs.get(uri);
		if (!data) {
			throw new Error('No data found');
		}
		const { modified, label, description, original, id: notebookProviderInfoId, disposables } = data;
		const nbInput = disposables.add(NotebookDiffEditorInput.create(this.instantiationService, modified.resource!, label, description, original.resource!, notebookProviderInfoId));
		const model = disposables.add(await nbInput.resolve());
		const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
		const vm = disposables.add(new NotebookDiffViewModel(model, this.notebookEditorWorkerService, this.instantiationService, this._configurationService, eventDispatcher, this.notebookService, undefined, true));
		const token = disposables.add(new CancellationTokenSource()).token;
		await vm.computeDiff(token);

		// let metadataUri: URI | undefined = undefined;
		const resources = vm.items.filter(v => v.type === 'modified').map(v => {
			const item = v as SideBySideDiffElementViewModel;
			const items = [new MultiDiffEditorItem(item.original.uri, item.modified.uri, undefined)];
			if (item.checkMetadataIfModified()) {
				const originalMetadata = CellUri.generateCellPropertyUri(original.resource!, item.original.handle, Schemas.vscodeNotebookCellMetadata);
				const modifiedMetadata = CellUri.generateCellPropertyUri(modified.resource!, item.modified.handle, Schemas.vscodeNotebookCellMetadata);
				items.push(new MultiDiffEditorItem(originalMetadata, modifiedMetadata, item.modified.uri));
				// metadataUri = modifiedMetadata;
			}
			if (item.checkIfOutputsModified()) {
				const originalOutput = CellUri.generateCellPropertyUri(original.resource!, item.original.handle, Schemas.vscodeNotebookCellOutput);
				const modifiedOutput = CellUri.generateCellPropertyUri(modified.resource!, item.modified.handle, Schemas.vscodeNotebookCellOutput);
				// // const originalModel = this.modelService.createModel(originalOutputsSource, mode, originalOutput, true);
				// // const modifiedModel = this.modelService.createModel(modifiedOutputsSource, mode, modifiedOutput, true);

				items.push(new MultiDiffEditorItem(originalOutput, modifiedOutput, item.modified.uri));
			}
			return items;
		}).flat();

		// let found = false;
		// const tryCreatingWebView = (e: ICodeEditor) => {
		// 	if (found) {
		// 		return;
		// 	}
		// 	const editor = this._editorService.listCodeEditors().find(editor => editor.getModel()?.uri.scheme === Schemas.vscodeNotebookCellMetadata);
		// 	if (!editor) {
		// 		return;
		// 	}
		// 	found = true;
		// 	const webview = disposables.add(this._webviewService.createWebviewElement({
		// 		title: undefined,
		// 		options: {
		// 			enableFindWidget: false,
		// 		},
		// 		contentOptions: { allowScripts: true },
		// 		extension: { id: { value: 'ms-toolsai.jupyter', _lower: 'ms-toolsai.jupyter' } }
		// 	}));
		// 	const webviewZone = disposables.add(new EditorWebviewZone(editor as IActiveCodeEditor, 0, 15, webview));
		// 	webviewZone.webview.setHtml('<html><body><button>Hello World!</button></body></html>');

		// };
		// this._editorService.onCodeEditorAdd(e => {
		// 	console.log(e.getModel());
		// 	if (e.getModel()) {
		// 		tryCreatingWebView(e);
		// 	} else {
		// 		e.onDidChangeModel(model => {
		// 			console.error(model);
		// 			tryCreatingWebView(e);
		// 		});
		// 	}
		// });

		return {
			resources: {
				value: resources,
				onDidChange: Event.None
			}
		};
	}
	async provideOutputTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this.modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellOutput);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		const cell = ref.object.notebook.cells.find(cell => cell.handle === data.handle);

		if (!cell) {
			ref.dispose();
			return null;
		}

		const mode = this.languageService.createById('json');
		const model = this.modelService.createModel(getFormattedOutputJSON(cell.outputs || []), mode, resource, true);
		const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
			model.setValue(getFormattedOutputJSON(cell.outputs || []));
		});

		const once = model.onWillDispose(() => {
			once.dispose();
			cellModelListener.dispose();
			ref.dispose();
		});

		return model;
	}
}
