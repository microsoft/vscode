/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { init } from 'web-tree-sitter';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IModelService } from 'vs/editor/common/services/model';
import { FileAccess } from 'vs/base/common/network';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TreeSitterColorizationTree } from 'vs/editor/browser/services/treeSitterTrees/colorization/treeSitterColorizationTree';
import { Iterable } from 'vs/base/common/iterator';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ITreeSitterService } from 'vs/editor/browser/services/treeSitterServices/treeSitterService';
import { IFileService } from 'vs/platform/files/common/files';

const ITreeSitterColorizationService = createDecorator<ITreeSitterColorizationService>('ITreeSitterColorizationService');

export interface ITreeSitterColorizationService {
	readonly _serviceBrand: undefined;
	registerTreeSittersForColorization(): void,
	dispose(): void
}

export class TreeSitterColorizationService implements ITreeSitterColorizationService {

	readonly _serviceBrand: undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private readonly _treeSittersColorizationTrees: TreeSitterColorizationTree[] = [];

	constructor(
		@ITreeSitterService private readonly _treeSitterService: ITreeSitterService,
		@IModelService private readonly _modelService: IModelService,
		@IThemeService private readonly _themeService: IThemeService,
		@IFileService private readonly _fileService: IFileService
	) {

		init({
			locateFile(_file: string, _folder: string) {
				return FileAccess.asBrowserUri('../../../../../../node_modules/web-tree-sitter/tree-sitter.wasm', require).toString(true);
			}
		}).then(async () => {
			this._disposableStore.add(_modelService.onModelAdded((model) => {
				if (model.getLanguageId() === 'typescript') {
					// ! true before
					this._treeSittersColorizationTrees.push(new TreeSitterColorizationTree(model, this._treeSitterService, this._themeService, this._fileService, false));
				}
			}));
			this._disposableStore.add(_modelService.onModelLanguageChanged((event) => {
				const model = event.model;
				if (model.getLanguageId() === 'typescript') {
					// ! true before
					this._treeSittersColorizationTrees.push(new TreeSitterColorizationTree(model, this._treeSitterService, this._themeService, this._fileService, false));
				}
			}))
			this._disposableStore.add(_modelService.onModelRemoved((model) => {
				if (model.getLanguageId() === 'typescript') {
					const treeSitterTreeToDispose = Iterable.find(this._treeSittersColorizationTrees, tree => tree.id === model.id);
					if (treeSitterTreeToDispose) {
						treeSitterTreeToDispose.dispose();
					}
				}
			}));
		});
	}

	registerTreeSittersForColorization() {
		const models = this._modelService.getModels();
		for (const model of models) {
			if (model.getLanguageId() === 'typescript') {
				// ! true before
				this._treeSittersColorizationTrees.push(new TreeSitterColorizationTree(model, this._treeSitterService, this._themeService, this._fileService, false));
			}
		}
	}

	dispose(): void {
		this._disposableStore.dispose();
		for (const tree of this._treeSittersColorizationTrees) {
			tree.dispose();
		}
	}
}

registerSingleton(ITreeSitterColorizationService, TreeSitterColorizationService, true);

registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'toggleTreeSitterColorization', title: 'Toggle Tree-Sitter Colorization', f1: true });
	}
	run(accessor: ServicesAccessor) {
		const treeSitterTokenizationService = accessor.get(ITreeSitterColorizationService);
		treeSitterTokenizationService.registerTreeSittersForColorization();
	}
});
