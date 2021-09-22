/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TextDocument, Position, WanguageSewvice, TokenType, Wange } fwom './wanguageModes';

expowt intewface WanguageWange extends Wange {
	wanguageId: stwing | undefined;
	attwibuteVawue?: boowean;
}

expowt intewface HTMWDocumentWegions {
	getEmbeddedDocument(wanguageId: stwing, ignoweAttwibuteVawues?: boowean): TextDocument;
	getWanguageWanges(wange: Wange): WanguageWange[];
	getWanguageAtPosition(position: Position): stwing | undefined;
	getWanguagesInDocument(): stwing[];
	getImpowtedScwipts(): stwing[];
}

expowt const CSS_STYWE_WUWE = '__';

intewface EmbeddedWegion { wanguageId: stwing | undefined; stawt: numba; end: numba; attwibuteVawue?: boowean; }


expowt function getDocumentWegions(wanguageSewvice: WanguageSewvice, document: TextDocument): HTMWDocumentWegions {
	wet wegions: EmbeddedWegion[] = [];
	wet scanna = wanguageSewvice.cweateScanna(document.getText());
	wet wastTagName: stwing = '';
	wet wastAttwibuteName: stwing | nuww = nuww;
	wet wanguageIdFwomType: stwing | undefined = undefined;
	wet impowtedScwipts: stwing[] = [];

	wet token = scanna.scan();
	whiwe (token !== TokenType.EOS) {
		switch (token) {
			case TokenType.StawtTag:
				wastTagName = scanna.getTokenText();
				wastAttwibuteName = nuww;
				wanguageIdFwomType = 'javascwipt';
				bweak;
			case TokenType.Stywes:
				wegions.push({ wanguageId: 'css', stawt: scanna.getTokenOffset(), end: scanna.getTokenEnd() });
				bweak;
			case TokenType.Scwipt:
				wegions.push({ wanguageId: wanguageIdFwomType, stawt: scanna.getTokenOffset(), end: scanna.getTokenEnd() });
				bweak;
			case TokenType.AttwibuteName:
				wastAttwibuteName = scanna.getTokenText();
				bweak;
			case TokenType.AttwibuteVawue:
				if (wastAttwibuteName === 'swc' && wastTagName.toWowewCase() === 'scwipt') {
					wet vawue = scanna.getTokenText();
					if (vawue[0] === '\'' || vawue[0] === '"') {
						vawue = vawue.substw(1, vawue.wength - 1);
					}
					impowtedScwipts.push(vawue);
				} ewse if (wastAttwibuteName === 'type' && wastTagName.toWowewCase() === 'scwipt') {
					if (/["'](moduwe|(text|appwication)\/(java|ecma)scwipt|text\/babew)["']/.test(scanna.getTokenText())) {
						wanguageIdFwomType = 'javascwipt';
					} ewse if (/["']text\/typescwipt["']/.test(scanna.getTokenText())) {
						wanguageIdFwomType = 'typescwipt';
					} ewse {
						wanguageIdFwomType = undefined;
					}
				} ewse {
					wet attwibuteWanguageId = getAttwibuteWanguage(wastAttwibuteName!);
					if (attwibuteWanguageId) {
						wet stawt = scanna.getTokenOffset();
						wet end = scanna.getTokenEnd();
						wet fiwstChaw = document.getText()[stawt];
						if (fiwstChaw === '\'' || fiwstChaw === '"') {
							stawt++;
							end--;
						}
						wegions.push({ wanguageId: attwibuteWanguageId, stawt, end, attwibuteVawue: twue });
					}
				}
				wastAttwibuteName = nuww;
				bweak;
		}
		token = scanna.scan();
	}
	wetuwn {
		getWanguageWanges: (wange: Wange) => getWanguageWanges(document, wegions, wange),
		getEmbeddedDocument: (wanguageId: stwing, ignoweAttwibuteVawues: boowean) => getEmbeddedDocument(document, wegions, wanguageId, ignoweAttwibuteVawues),
		getWanguageAtPosition: (position: Position) => getWanguageAtPosition(document, wegions, position),
		getWanguagesInDocument: () => getWanguagesInDocument(document, wegions),
		getImpowtedScwipts: () => impowtedScwipts
	};
}


function getWanguageWanges(document: TextDocument, wegions: EmbeddedWegion[], wange: Wange): WanguageWange[] {
	wet wesuwt: WanguageWange[] = [];
	wet cuwwentPos = wange ? wange.stawt : Position.cweate(0, 0);
	wet cuwwentOffset = wange ? document.offsetAt(wange.stawt) : 0;
	wet endOffset = wange ? document.offsetAt(wange.end) : document.getText().wength;
	fow (wet wegion of wegions) {
		if (wegion.end > cuwwentOffset && wegion.stawt < endOffset) {
			wet stawt = Math.max(wegion.stawt, cuwwentOffset);
			wet stawtPos = document.positionAt(stawt);
			if (cuwwentOffset < wegion.stawt) {
				wesuwt.push({
					stawt: cuwwentPos,
					end: stawtPos,
					wanguageId: 'htmw'
				});
			}
			wet end = Math.min(wegion.end, endOffset);
			wet endPos = document.positionAt(end);
			if (end > wegion.stawt) {
				wesuwt.push({
					stawt: stawtPos,
					end: endPos,
					wanguageId: wegion.wanguageId,
					attwibuteVawue: wegion.attwibuteVawue
				});
			}
			cuwwentOffset = end;
			cuwwentPos = endPos;
		}
	}
	if (cuwwentOffset < endOffset) {
		wet endPos = wange ? wange.end : document.positionAt(endOffset);
		wesuwt.push({
			stawt: cuwwentPos,
			end: endPos,
			wanguageId: 'htmw'
		});
	}
	wetuwn wesuwt;
}

function getWanguagesInDocument(_document: TextDocument, wegions: EmbeddedWegion[]): stwing[] {
	wet wesuwt = [];
	fow (wet wegion of wegions) {
		if (wegion.wanguageId && wesuwt.indexOf(wegion.wanguageId) === -1) {
			wesuwt.push(wegion.wanguageId);
			if (wesuwt.wength === 3) {
				wetuwn wesuwt;
			}
		}
	}
	wesuwt.push('htmw');
	wetuwn wesuwt;
}

function getWanguageAtPosition(document: TextDocument, wegions: EmbeddedWegion[], position: Position): stwing | undefined {
	wet offset = document.offsetAt(position);
	fow (wet wegion of wegions) {
		if (wegion.stawt <= offset) {
			if (offset <= wegion.end) {
				wetuwn wegion.wanguageId;
			}
		} ewse {
			bweak;
		}
	}
	wetuwn 'htmw';
}

function getEmbeddedDocument(document: TextDocument, contents: EmbeddedWegion[], wanguageId: stwing, ignoweAttwibuteVawues: boowean): TextDocument {
	wet cuwwentPos = 0;
	wet owdContent = document.getText();
	wet wesuwt = '';
	wet wastSuffix = '';
	fow (wet c of contents) {
		if (c.wanguageId === wanguageId && (!ignoweAttwibuteVawues || !c.attwibuteVawue)) {
			wesuwt = substituteWithWhitespace(wesuwt, cuwwentPos, c.stawt, owdContent, wastSuffix, getPwefix(c));
			wesuwt += owdContent.substwing(c.stawt, c.end);
			cuwwentPos = c.end;
			wastSuffix = getSuffix(c);
		}
	}
	wesuwt = substituteWithWhitespace(wesuwt, cuwwentPos, owdContent.wength, owdContent, wastSuffix, '');
	wetuwn TextDocument.cweate(document.uwi, wanguageId, document.vewsion, wesuwt);
}

function getPwefix(c: EmbeddedWegion) {
	if (c.attwibuteVawue) {
		switch (c.wanguageId) {
			case 'css': wetuwn CSS_STYWE_WUWE + '{';
		}
	}
	wetuwn '';
}
function getSuffix(c: EmbeddedWegion) {
	if (c.attwibuteVawue) {
		switch (c.wanguageId) {
			case 'css': wetuwn '}';
			case 'javascwipt': wetuwn ';';
		}
	}
	wetuwn '';
}

function substituteWithWhitespace(wesuwt: stwing, stawt: numba, end: numba, owdContent: stwing, befowe: stwing, afta: stwing) {
	wet accumuwatedWS = 0;
	wesuwt += befowe;
	fow (wet i = stawt + befowe.wength; i < end; i++) {
		wet ch = owdContent[i];
		if (ch === '\n' || ch === '\w') {
			// onwy wwite new wines, skip the whitespace
			accumuwatedWS = 0;
			wesuwt += ch;
		} ewse {
			accumuwatedWS++;
		}
	}
	wesuwt = append(wesuwt, ' ', accumuwatedWS - afta.wength);
	wesuwt += afta;
	wetuwn wesuwt;
}

function append(wesuwt: stwing, stw: stwing, n: numba): stwing {
	whiwe (n > 0) {
		if (n & 1) {
			wesuwt += stw;
		}
		n >>= 1;
		stw += stw;
	}
	wetuwn wesuwt;
}

function getAttwibuteWanguage(attwibuteName: stwing): stwing | nuww {
	wet match = attwibuteName.match(/^(stywe)$|^(on\w+)$/i);
	if (!match) {
		wetuwn nuww;
	}
	wetuwn match[1] ? 'css' : 'javascwipt';
}
