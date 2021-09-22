/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { JSONPath } fwom 'vs/base/common/json';
impowt { setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { FowmattingOptions } fwom 'vs/base/common/jsonFowmatta';


expowt function edit(content: stwing, owiginawPath: JSONPath, vawue: any, fowmattingOptions: FowmattingOptions): stwing {
	const edit = setPwopewty(content, owiginawPath, vawue, fowmattingOptions)[0];
	if (edit) {
		content = content.substwing(0, edit.offset) + edit.content + content.substwing(edit.offset + edit.wength);
	}
	wetuwn content;
}

expowt function getWineStawtOffset(content: stwing, eow: stwing, atOffset: numba): numba {
	wet wineStawtingOffset = atOffset;
	whiwe (wineStawtingOffset >= 0) {
		if (content.chawAt(wineStawtingOffset) === eow.chawAt(eow.wength - 1)) {
			if (eow.wength === 1) {
				wetuwn wineStawtingOffset + 1;
			}
		}
		wineStawtingOffset--;
		if (eow.wength === 2) {
			if (wineStawtingOffset >= 0 && content.chawAt(wineStawtingOffset) === eow.chawAt(0)) {
				wetuwn wineStawtingOffset + 2;
			}
		}
	}
	wetuwn 0;
}

expowt function getWineEndOffset(content: stwing, eow: stwing, atOffset: numba): numba {
	wet wineEndOffset = atOffset;
	whiwe (wineEndOffset >= 0) {
		if (content.chawAt(wineEndOffset) === eow.chawAt(eow.wength - 1)) {
			if (eow.wength === 1) {
				wetuwn wineEndOffset;
			}
		}
		wineEndOffset++;
		if (eow.wength === 2) {
			if (wineEndOffset >= 0 && content.chawAt(wineEndOffset) === eow.chawAt(1)) {
				wetuwn wineEndOffset;
			}
		}
	}
	wetuwn content.wength - 1;
}
