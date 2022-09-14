/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Parser = require('web-tree-sitter');
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel } from 'vs/editor/common/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { URI } from 'vs/workbench/workbench.web.main';
import { FileAccess } from 'vs/base/common/network';
import { TreeSitterTree as TreeSitterTree } from 'vs/editor/browser/services/treeSitterServices/treeSitterTree';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IModelService } from 'vs/editor/common/services/model';

export const ITreeSitterService = createDecorator<ITreeSitterService>('ITreeSitterService');

export interface ITreeSitterService {
	readonly _serviceBrand: undefined;
	getTreeSitterCaptures(model: ITextModel, queryString: string, contentChangeEvent?: IModelContentChangedEvent): Promise<Parser.QueryCapture[] | void>;
	dispose(): void
}

export class TreeSitterService implements ITreeSitterService {

	//?: For now suppose all the parsers use TypeScript
	readonly _serviceBrand: undefined;
	private _language: Parser.Language | undefined = undefined;
	private _trees: Map<URI, TreeSitterTree> = new Map();

	constructor(
		@IModelService _modelService: IModelService
	) {
		for (const model of _modelService.getModels()) {
			model.onDidChangeContent(() => {

			})
		}
	}

	private async fetchLanguage(): Promise<Parser.Language> {
		return fetch(FileAccess.asBrowserUri('./tree-sitter-typescript.wasm', require).toString(true)).then(async (result) => {
			return result.arrayBuffer().then(async (arrayBuffer) => {
				return Parser.Language.load(new Uint8Array(arrayBuffer)).then((language) => {
					return new Promise(function (resolve, _reject) {
						resolve(language);
					})
				})
			})
		})
	}

	public async getTreeSitterCaptures(model: ITextModel, queryString: string): Promise<Parser.QueryCapture[]> {
		if (!this._language) {
			return this.fetchLanguage().then((language) => {
				this._language = language;
				return this._getTreeSitterCaptures(model, queryString);
			})
		} else {
			return this._getTreeSitterCaptures(model, queryString);
		}
	}

	private async _getTreeSitterCaptures(model: ITextModel, queryString: string): Promise<Parser.QueryCapture[]> {
		if (!this._trees.has(model.uri)) {
			this._trees.set(model.uri, new TreeSitterTree(model, this._language!));
		}
		const tree = this._trees.get(model.uri);
		/*
		if (contentChangeEvent) {
			tree!.registerTreeEdits(contentChangeEvent);
		}
		*/
		return tree!.parseTree().then((parsedTree) => {
			const query = this._language!.query(queryString);
			const captures = query.captures(parsedTree.rootNode);
			query.delete();
			return new Promise(function (resolve, _reject) {
				resolve(captures);
			});
		})
	}

	dispose(): void {
		for (const tree of this._trees.values()) {
			tree.dispose();
		}
	}
}

registerSingleton(ITreeSitterService, TreeSitterService, true);
