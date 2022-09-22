/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Language, init } from 'web-tree-sitter';
import { FileAccess } from 'vs/base/common/network';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/model';
import { TreeSitterFoldingTree } from 'vs/editor/browser/services/treeSitterTrees/folding/treeSitterFoldingTree';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

const ITreeSitterFoldingService = createDecorator<ITreeSitterFoldingService>('ITreeSitterFoldingService');

export interface ITreeSitterFoldingService { }

export class TreeSitterFoldingService implements ITreeSitterFoldingService {

	private _language: Language | undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private readonly _treeSittersForFolding: TreeSitterFoldingTree[] = [];

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService
	) {
		init({
			locateFile(_file: string, _folder: string) {
				return FileAccess.asBrowserUri('../../../../../node_modules/web-tree-sitter/tree-sitter.wasm', require).toString(true);
			}
		}).then(async () => {
			const result = await fetch(FileAccess.asBrowserUri('./tree-sitter-typescript.wasm', require).toString(true));
			const langData = new Uint8Array(await result.arrayBuffer());
			this._language = await Language.load(langData);
			this.registerTreeSittersForFolding();
		});
	}

	registerTreeSittersForFolding() {
		const models = this._modelService.getModels();
		for (const model of models) {
			if (this._language) {
				this._treeSittersForFolding.push(new TreeSitterFoldingTree(model, this._language, this._languageFeatureService.foldingRangeProvider));
			}
		}
	}

	dispose(): void {
		this._disposableStore.dispose();
		for (const tree of this._treeSittersForFolding) {
			tree.dispose();
		}
	}
}

registerSingleton(ITreeSitterFoldingService, TreeSitterFoldingService, true);
