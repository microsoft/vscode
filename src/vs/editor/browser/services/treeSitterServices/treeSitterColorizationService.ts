/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
// eslint-disable-next-line local/code-import-patterns

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IModelService } from 'vs/editor/common/services/model';
import { AppResourcePath, FileAccess, nodeModulesPath } from 'vs/base/common/network';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TreeSitterColorizationTree } from 'vs/editor/browser/services/treeSitterTrees/colorization/treeSitterColorizationTree';
import { Iterable } from 'vs/base/common/iterator';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ITreeSitterService } from 'vs/editor/browser/services/treeSitterServices/treeSitterService';
import { IFileService } from 'vs/platform/files/common/files';
import { importAMDNodeModule } from 'vs/amdX';

const ITreeSitterColorizationService = createDecorator<ITreeSitterColorizationService>('ITreeSitterColorizationService');

export interface ITreeSitterColorizationService {
	readonly _serviceBrand: undefined;
	registerTreeSittersForColorization(asynchronous: boolean): Promise<void>;
	dispose(): void;
	clearCache(): void;
}

export class TreeSitterColorizationService implements ITreeSitterColorizationService {

	readonly _serviceBrand: undefined;
	private readonly _disposableStore: DisposableStore = new DisposableStore();
	private readonly _treeSittersColorizationTrees: TreeSitterColorizationTree[] = [];
	private _isInit: Promise<void> | undefined;

	constructor(
		@ITreeSitterService private readonly _treeSitterService: ITreeSitterService,
		@IModelService private readonly _modelService: IModelService,
		@IThemeService private readonly _themeService: IThemeService,
		@IFileService private readonly _fileService: IFileService
	) { }

	async registerTreeSittersForColorization(asynchronous: boolean = true) {
		await this._initializeTreeSitterService(asynchronous);
		const models = this._modelService.getModels();
		for (const model of models) {
			if (model.getLanguageId() === 'typescript') {
				model.tokenization.setTokens([]);
				this._treeSittersColorizationTrees.push(new TreeSitterColorizationTree(model, this._treeSitterService, this._themeService, this._fileService, asynchronous));
			}
		}
	}

	private async _initializeTreeSitterService(asynchronous: boolean = true) {
		if (!this._isInit) {
			const importTreeSitter = async () => {
				const Parser = await importAMDNodeModule<typeof import('web-tree-sitter')>('web-tree-sitter', 'tree-sitter.js');
				await Parser.init({
					locateFile(_file: string, _folder: string) {
						const wasmPath: AppResourcePath = `${nodeModulesPath}/web-tree-sitter/tree-sitter.wasm`;
						return FileAccess.asBrowserUri(wasmPath).toString(true);
					}
				});
			};
			this._isInit = new Promise<void>((resolve, reject) => {
				importTreeSitter().then(() => {
					resolve();
				}).catch((error) => {
					console.error(nls.localize('treeSitterError', "Error initializing tree-sitter: {0}", error));
					reject(error);
				}).finally(() => {
					console.log('finally');
				});
			});
		}

		await this._isInit;

		this._disposableStore.add(this._modelService.onModelAdded((model) => {
			if (model.getLanguageId() === 'typescript') {
				model.tokenization.setTokens([]);
				this._treeSittersColorizationTrees.push(new TreeSitterColorizationTree(model, this._treeSitterService, this._themeService, this._fileService, asynchronous));
			}
		}));
		this._disposableStore.add(this._modelService.onModelLanguageChanged((event) => {
			const model = event.model;
			if (model.getLanguageId() === 'typescript') {
				model.tokenization.setTokens([]);
				this._treeSittersColorizationTrees.push(new TreeSitterColorizationTree(model, this._treeSitterService, this._themeService, this._fileService, asynchronous));
			}
		}));
		this._disposableStore.add(this._modelService.onModelRemoved((model) => {
			if (model.getLanguageId() === 'typescript') {
				const treeSitterTreeToDispose = Iterable.find(this._treeSittersColorizationTrees, tree => tree.id === model.id);
				if (treeSitterTreeToDispose) {
					treeSitterTreeToDispose.dispose();
				}
			}
		}));

	}

	dispose(): void {
		this._disposableStore.dispose();
		for (const tree of this._treeSittersColorizationTrees) {
			tree.dispose();
		}
	}

	clearCache(): void {
		for (const tree of this._treeSittersColorizationTrees) {
			tree.dispose();
		}
		this._treeSittersColorizationTrees.length = 0;
		this._disposableStore.clear();
		this._treeSitterService.clearCache();
	}
}

registerSingleton(ITreeSitterColorizationService, TreeSitterColorizationService, InstantiationType.Delayed);

// Asynchronous colorization that runs when the process is idle
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'toggleAsynchronousTreeSitterColorization', title: { value: nls.localize('toggleAsyncTreeSitter', "Toggle Asynchronous Tree-Sitter Colorization"), original: 'Toggle Asynchronous Tree-Sitter Colorization' }, f1: true });
	}
	run(accessor: ServicesAccessor) {
		const treeSitterTokenizationService = accessor.get(ITreeSitterColorizationService);
		treeSitterTokenizationService.clearCache();
		return treeSitterTokenizationService.registerTreeSittersForColorization(true);
	}
});

// Synchronous colorization for testing the performance
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'toggleSynchronousTreeSitterColorization', title: { value: nls.localize('toggleSyncTreeSitter', "Toggle Synchronous Tree-Sitter Colorization"), original: 'Toggle Synchronous Tree-Sitter Colorization' }, f1: true });
	}
	run(accessor: ServicesAccessor) {
		const treeSitterTokenizationService = accessor.get(ITreeSitterColorizationService);
		treeSitterTokenizationService.clearCache();
		return treeSitterTokenizationService.registerTreeSittersForColorization(false);
	}
});
