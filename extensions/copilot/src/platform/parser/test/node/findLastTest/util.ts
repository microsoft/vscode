/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { _findLastTest } from '../../../node/testGenParsing';
import { WASMLanguage } from '../../../node/treeSitterLanguages';
import { insertRangeMarkers, MarkerRange } from '../markers';

export async function srcWithAnnotatedLastTest(language: WASMLanguage, src: string) {

	const result = await _findLastTest(
		language,
		src,
	);

	if (result === null) {
		return 'test NOT FOUND';
	}

	const markers: MarkerRange[] = [];

	markers.push({
		startIndex: result.startIndex,
		endIndex: result.endIndex,
		kind: 'TEST',
	});


	return insertRangeMarkers(src, markers);
}
