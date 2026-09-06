/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function deannotateSrc(annotatedSrc: string): {
	deannotatedSrc: string;
	annotatedRange: {
		startIndex: number;
		endIndex: number;
	};
} {
	const startIndex = annotatedSrc.indexOf('<<');
	if (startIndex === -1) {
		throw new Error('No << found in the annotated source');
	}
	const endIndex = annotatedSrc.indexOf('>>') - 2;
	if (endIndex === -3 /* because `-1-2` */) {
		throw new Error('No >> found in the annotated source');
	}
	return {
		deannotatedSrc: annotatedSrc.replace('<<', '').replace('>>', ''),
		annotatedRange: {
			startIndex,
			endIndex,
		},
	};
}
