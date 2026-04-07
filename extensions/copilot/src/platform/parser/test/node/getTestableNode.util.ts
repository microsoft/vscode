/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deannotateSrc } from '../../../../util/common/test/annotatedSrc';
import { _getTestableNode } from '../../node/testGenParsing';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { insertRangeMarkers, MarkerRange } from './markers';

export async function srcWithAnnotatedTestableNode(language: WASMLanguage, source: string, includeSelection = false) {
	const { deannotatedSrc, annotatedRange: selection } = deannotateSrc(source);

	const result = await _getTestableNode(
		language,
		deannotatedSrc,
		selection
	);

	if (result === null) {
		return 'testable node NOT found';
	}

	const markers: MarkerRange[] = [];

	const ident = result.identifier;
	markers.push({
		startIndex: ident.range.startIndex,
		endIndex: ident.range.endIndex,
		kind: 'IDENT',
	});

	if (includeSelection) {
		markers.push(
			{
				startIndex: selection.startIndex,
				endIndex: selection.endIndex,
				kind: 'SELECTION'
			}
		);
	}

	markers.push(
		{
			startIndex: result.node.startIndex,
			endIndex: result.node.endIndex,
			kind: `NODE(${result.node.type})`,
		}
	);

	return insertRangeMarkers(deannotatedSrc, markers);
}
