/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { _getTestableNodes } from '../../node/testGenParsing';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { insertRangeMarkers } from './markers';

export async function annotTestableNodes(language: WASMLanguage, source: string, includeSelection = false) {

	const result = await _getTestableNodes(
		language,
		source,
	);

	if (result === null) {
		return 'testable node NOT found';
	}

	const markers = result.flatMap(node => {
		return [
			{
				startIndex: node.node.startIndex,
				endIndex: node.node.endIndex,
				kind: 'NODE',
			},
			{
				startIndex: node.identifier.range.startIndex,
				endIndex: node.identifier.range.endIndex,
				kind: 'IDENT',
			}
		];
	});

	return insertRangeMarkers(source, markers);
}
