/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as Parser from 'web-tree-sitter';
// import _ from 'tree-sitter-typescript';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IModelService } from 'vs/editor/common/services/model';

export interface ITreeSitterTokenizationService {
	toggle(): void;
}

const ITreeSitterTokenizationService = createDecorator<ITreeSitterTokenizationService>('ITreeSitterTokenizationService');

class TreeSitterTokenizationService implements ITreeSitterTokenizationService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IModelService private readonly _modelService: IModelService
	) {

		/*
		let parser: Parser;
		Parser.init().then(() => {
			parser = new Parser();
		});
		*/

		/*
		1. set language for parser
		2. install languages, npm modules, tree-sitter typescript
		3. when text model created, tokenize it, on every change
		4. text model service gives access to all the text-models, loop over them, and tokenize them all
		5. don't know the language, we installed it by hand, just assume we have the type script language now
		6. if webassembly, use it, otherwise need to transpile it oursleves?
		normal tree-sitter for node js

		TODO:
		figure out how to generate the wasm file (follow the npm registry guide) - https://www.npmjs.com/package/web-tree-sitter
		parse it on models
		fire queries from queries folder in tree-sitter-typescript - https://github.com/tree-sitter/tree-sitter-typescript/blob/master/queries/highlights.scm
		*/
	}

	toggle() {
		const models = this._modelService.getModels();
		for (const model of models) {
			if (model.getLanguageId() === 'typescript') {

			}
		}
	}
}

registerSingleton(ITreeSitterTokenizationService, TreeSitterTokenizationService, true);

registerAction2(class extends Action2 {

	constructor() {
		super({ id: 'toggleTreeSitterTokenization', title: 'Toggle Tree-Sitter Tokenization', f1: true });
	}

	run(accessor: ServicesAccessor) {
		const treeSitterTokenizationService = accessor.get(ITreeSitterTokenizationService);
		treeSitterTokenizationService.toggle();
	}
});
