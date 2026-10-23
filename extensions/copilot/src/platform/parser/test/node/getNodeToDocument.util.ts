/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deannotateSrc } from '../../../../util/common/test/annotatedSrc';
import { _getNodeToDocument } from '../../node/docGenParsing';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { insertRangeMarkers, MarkerRange } from './markers';

export async function srcWithAnnotatedNodeToDoc(language: WASMLanguage, source: string, includeSelection = false) {
	const { deannotatedSrc, annotatedRange: selection } = deannotateSrc(source);

	const result = await _getNodeToDocument(
		language,
		deannotatedSrc,
		selection
	);

	const identifier = result.nodeIdentifier;

	const markers: MarkerRange[] = [];

	if (identifier !== undefined && identifier !== '') {
		const identIx = deannotatedSrc.indexOf(identifier);
		if (identIx !== -1) {
			markers.push({
				startIndex: identIx,
				endIndex: identIx + identifier.length,
				kind: 'IDENT'
			});
		}
	}

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
			startIndex: result.nodeToDocument.startIndex,
			endIndex: result.nodeToDocument.endIndex,
			kind: result.nodeToDocument.type.toUpperCase(),
		}
	);

	return insertRangeMarkers(deannotatedSrc, markers);
}
