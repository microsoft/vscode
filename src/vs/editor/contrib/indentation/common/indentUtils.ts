/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// In the following we assume the passed in string is made of tabs and spaces, so essentially we find how many spaces make up the passed in string
export function getSpaceCnt(str: string, tabSize: number) {
	let spacesCnt = 0;

	for (let i = 0; i < str.length; i++) {
		if (str.charAt(i) === '\t') {
			spacesCnt += tabSize;
		} else {
			spacesCnt++;
		}
	}

	return spacesCnt;
}

export function generateIndent(spacesCnt: number, tabSize: number, insertSpaces: boolean) {
	// the spaces count should be at least zero
	spacesCnt = spacesCnt < 0 ? 0 : spacesCnt;

	let result = '';
	// If we decide not to insert spaces, we try to find how many tabs can enter into the spacesCnt, and thus find the tab count
	if (!insertSpaces) {
		const tabsCnt = Math.floor(spacesCnt / tabSize);
		// Then we find the remainder on the floor division
		spacesCnt = spacesCnt % tabSize;
		for (let i = 0; i < tabsCnt; i++) {
			result += '\t';
		}
	}

	// Make the indentation out of the tabs and spaces are requested
	for (let i = 0; i < spacesCnt; i++) {
		result += ' ';
	}

	return result;
}
