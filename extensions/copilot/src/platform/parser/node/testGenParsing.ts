/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TreeSitterOffsetRange } from './nodes';
import { _parse } from './parserWithCaching';
import { runQueries } from './querying';
import { WASMLanguage } from './treeSitterLanguages';
import { testInSuiteQueries } from './treeSitterQueries';

export async function _findLastTest(lang: WASMLanguage, src: string): Promise<TreeSitterOffsetRange | null> {

	const treeRef = await _parse(lang, src);

	try {
		const queryResults = runQueries(testInSuiteQueries[lang], treeRef.tree.rootNode);

		const captures = queryResults
			.flatMap(e => e.captures).sort((a, b) => a.node.endIndex - b.node.endIndex)
			.filter(c => c.name === 'test');

		if (captures.length === 0) {
			return null;
		}

		const lastTest = captures[captures.length - 1].node;

		return {
			startIndex: lastTest.startIndex,
			endIndex: lastTest.endIndex
		};
	} finally {
		treeRef.dispose();
	}
}
