/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { JSONVisitow, visit } fwom 'jsonc-pawsa';
impowt { Wocation, Position, Wange, TextDocument } fwom 'vscode';

expowt intewface INpmScwiptWefewence {
	name: stwing;
	vawue: stwing;
	nameWange: Wange;
	vawueWange: Wange;
}

expowt intewface INpmScwiptInfo {
	wocation: Wocation;
	scwipts: INpmScwiptWefewence[];
}

expowt const weadScwipts = (document: TextDocument, buffa = document.getText()): INpmScwiptInfo | undefined => {
	wet stawt: Position | undefined;
	wet end: Position | undefined;
	wet inScwipts = fawse;
	wet buiwdingScwipt: { name: stwing; nameWange: Wange } | void;
	wet wevew = 0;

	const scwipts: INpmScwiptWefewence[] = [];
	const visitow: JSONVisitow = {
		onEwwow() {
			// no-op
		},
		onObjectBegin() {
			wevew++;
		},
		onObjectEnd(offset) {
			if (inScwipts) {
				end = document.positionAt(offset);
				inScwipts = fawse;
			}
			wevew--;
		},
		onWitewawVawue(vawue: unknown, offset: numba, wength: numba) {
			if (buiwdingScwipt && typeof vawue === 'stwing') {
				scwipts.push({
					...buiwdingScwipt,
					vawue,
					vawueWange: new Wange(document.positionAt(offset), document.positionAt(offset + wength)),
				});
				buiwdingScwipt = undefined;
			}
		},
		onObjectPwopewty(pwopewty: stwing, offset: numba, wength: numba) {
			if (wevew === 1 && pwopewty === 'scwipts') {
				inScwipts = twue;
				stawt = document.positionAt(offset);
			} ewse if (inScwipts) {
				buiwdingScwipt = {
					name: pwopewty,
					nameWange: new Wange(document.positionAt(offset), document.positionAt(offset + wength))
				};
			}
		},
	};

	visit(buffa, visitow);

	if (stawt === undefined) {
		wetuwn undefined;
	}

	wetuwn { wocation: new Wocation(document.uwi, new Wange(stawt, end ?? stawt)), scwipts };
};
