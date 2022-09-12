/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Language, init } from 'web-tree-sitter';
import { FileAccess } from 'vs/base/common/network';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Iterable } from 'vs/base/common/iterator';
import { TreeSitterForColorization } from './treeSitterForColorization';
import { TreeSitterForFolding } from './treeSitterForFolding';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/model';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { FoldingDecorationProvider } from 'vs/editor/contrib/folding/browser/foldingDecorations';

//? For some reason need to make a change before the tokenization correctly appears
export class TreeSitterController implements IEditorContribution {

	static readonly ID = 'store.contrib.treeSitterController';
	private readonly _editor: ICodeEditor;


	private _language: Language | undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private readonly _treeSittersForColorization: TreeSitterForColorization[] = [];
	private readonly _treeSittersForFolding: TreeSitterForFolding[] = [];
	private readonly _themeService: IThemeService;

	constructor(
		_editor: ICodeEditor,
		@IThemeService _themeService: IThemeService,
		@IModelService private readonly _modelService: IModelService
	) {

		this._editor = _editor;
		this._themeService = _themeService;
		init({
			locateFile(_file: string, _folder: string) {
				return FileAccess.asBrowserUri('../../../../../node_modules/web-tree-sitter/tree-sitter.wasm', require).toString(true);
			}
		}).then(async () => {
			const result = await fetch(FileAccess.asBrowserUri('./tree-sitter-typescript.wasm', require).toString(true));
			const langData = new Uint8Array(await result.arrayBuffer());
			this._language = await Language.load(langData);

			// Colorization
			this.registerTreeSittersForColorization();
			this._disposableStore.add(_modelService.onModelAdded((model) => {
				if (model.getLanguageId() === 'typescript' && this._language) {
					this._treeSittersForColorization.push(new TreeSitterForColorization(model, this._language, this._themeService));
				}
			}));
			this._disposableStore.add(_modelService.onModelLanguageChanged((event) => {
				const model = event.model;
				if (model.getLanguageId() === 'typescript' && this._language) {
					this._treeSittersForColorization.push(new TreeSitterForColorization(model, this._language, this._themeService));
				}
			}))
			this._disposableStore.add(_modelService.onModelRemoved((model) => {
				if (model.getLanguageId() === 'typescript' && this._language) {
					const treeSitterTreeToDispose = Iterable.find(this._treeSittersForColorization, tree => tree.id === model.id);
					if (treeSitterTreeToDispose) {
						treeSitterTreeToDispose.dispose();
					}
				}
			}));

			// Folding
			this.registerTreeSittersForFolding();
		});
	}

	registerTreeSittersForColorization() {
		const models = this._modelService.getModels();
		for (const model of models) {
			if (model.getLanguageId() === 'typescript' && this._language) {
				this._treeSittersForColorization.push(new TreeSitterForColorization(model, this._language, this._themeService));
			}
		}
	}

	registerTreeSittersForFolding() {
		const foldingDecorationProvider = new FoldingDecorationProvider(this._editor);
		const models = this._modelService.getModels();
		for (const model of models) {
			if (this._language) {
				this._treeSittersForFolding.push(new TreeSitterForFolding(model, this._language, foldingDecorationProvider));
			}
		}
	}

	dispose(): void {
		this._disposableStore.dispose();
		for (const tree of this._treeSittersForColorization) {
			tree.dispose();
		}
	}
}
