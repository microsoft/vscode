/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { IFolderQuery } from './search.js';
import { TernarySearchTree, UriIterator } from '../../../../base/common/ternarySearchTree.js';
import { ResourceMap } from '../../../../base/common/map.js';

/**
 * A ternary search tree that supports URI keys and query/fragment-aware substring matching, specifically for file search.
 * This is because the traditional TST does not support query and fragments https://github.com/microsoft/vscode/issues/227836
 */
export class FolderQuerySearchTree<FolderQueryInfo extends { folder: URI }> extends TernarySearchTree<URI, Map<string, FolderQueryInfo>> {
	constructor(folderQueries: IFolderQuery<URI>[],
		getFolderQueryInfo: (fq: IFolderQuery, i: number) => FolderQueryInfo,
		ignorePathCasing: (key: URI) => boolean = () => false
	) {
		const uriIterator = new UriIterator(ignorePathCasing, () => false);
		super(uriIterator);

		const fqBySameBase = new ResourceMap<{ fq: IFolderQuery<URI>; i: number }[]>();
		folderQueries.forEach((fq, i) => {
			const uriWithoutQueryOrFragment = fq.folder.with({ query: '', fragment: '' });
			if (fqBySameBase.has(uriWithoutQueryOrFragment)) {
				fqBySameBase.get(uriWithoutQueryOrFragment)!.push({ fq, i });
			} else {
				fqBySameBase.set(uriWithoutQueryOrFragment, [{ fq, i }]);
			}
		});
		fqBySameBase.forEach((values, key) => {
			const folderQueriesWithQueries = new Map<string, FolderQueryInfo>();
			for (const fqBases of values) {
				const folderQueryInfo = getFolderQueryInfo(fqBases.fq, fqBases.i);
				folderQueriesWithQueries.set(this.encodeKey(fqBases.fq.folder), folderQueryInfo);
			}
			super.set(key, folderQueriesWithQueries);
		});
	}

	findQueryFragmentAwareSubstr(key: URI): FolderQueryInfo | undefined {

		const baseURIResult = super.findSubstr(key.with({ query: '', fragment: '' }));
		if (!baseURIResult) {
			return undefined;
		}
		const queryAndFragmentKey = this.encodeKey(key);
		return baseURIResult.get(queryAndFragmentKey);

	}

	forEachFolderQueryInfo(fn: (folderQueryInfo: FolderQueryInfo) => void): void {
		return this.forEach(elem => elem.forEach(mapElem => fn(mapElem)));
	}

	private encodeKey(key: URI): string {
		let str = '';
		if (key.query) {
			str += key.query;
		}
		if (key.fragment) {
			str += '#' + key.fragment;
		}
		return str;
	}

}
