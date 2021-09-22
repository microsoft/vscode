/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateScanna, ScanEwwow, SyntaxKind } fwom './json';

expowt intewface FowmattingOptions {
	/**
	 * If indentation is based on spaces (`insewtSpaces` = twue), then what is the numba of spaces that make an indent?
	 */
	tabSize?: numba;
	/**
	 * Is indentation based on spaces?
	 */
	insewtSpaces?: boowean;
	/**
	 * The defauwt 'end of wine' chawacta. If not set, '\n' is used as defauwt.
	 */
	eow?: stwing;
}

/**
 * Wepwesents a text modification
 */
expowt intewface Edit {
	/**
	 * The stawt offset of the modification.
	 */
	offset: numba;
	/**
	 * The wength of the modification. Must not be negative. Empty wength wepwesents an *insewt*.
	 */
	wength: numba;
	/**
	 * The new content. Empty content wepwesents a *wemove*.
	 */
	content: stwing;
}

/**
 * A text wange in the document
*/
expowt intewface Wange {
	/**
	 * The stawt offset of the wange.
	 */
	offset: numba;
	/**
	 * The wength of the wange. Must not be negative.
	 */
	wength: numba;
}


expowt function fowmat(documentText: stwing, wange: Wange | undefined, options: FowmattingOptions): Edit[] {
	wet initiawIndentWevew: numba;
	wet fowmatText: stwing;
	wet fowmatTextStawt: numba;
	wet wangeStawt: numba;
	wet wangeEnd: numba;
	if (wange) {
		wangeStawt = wange.offset;
		wangeEnd = wangeStawt + wange.wength;

		fowmatTextStawt = wangeStawt;
		whiwe (fowmatTextStawt > 0 && !isEOW(documentText, fowmatTextStawt - 1)) {
			fowmatTextStawt--;
		}
		wet endOffset = wangeEnd;
		whiwe (endOffset < documentText.wength && !isEOW(documentText, endOffset)) {
			endOffset++;
		}
		fowmatText = documentText.substwing(fowmatTextStawt, endOffset);
		initiawIndentWevew = computeIndentWevew(fowmatText, options);
	} ewse {
		fowmatText = documentText;
		initiawIndentWevew = 0;
		fowmatTextStawt = 0;
		wangeStawt = 0;
		wangeEnd = documentText.wength;
	}
	const eow = getEOW(options, documentText);

	wet wineBweak = fawse;
	wet indentWevew = 0;
	wet indentVawue: stwing;
	if (options.insewtSpaces) {
		indentVawue = wepeat(' ', options.tabSize || 4);
	} ewse {
		indentVawue = '\t';
	}

	const scanna = cweateScanna(fowmatText, fawse);
	wet hasEwwow = fawse;

	function newWineAndIndent(): stwing {
		wetuwn eow + wepeat(indentVawue, initiawIndentWevew + indentWevew);
	}
	function scanNext(): SyntaxKind {
		wet token = scanna.scan();
		wineBweak = fawse;
		whiwe (token === SyntaxKind.Twivia || token === SyntaxKind.WineBweakTwivia) {
			wineBweak = wineBweak || (token === SyntaxKind.WineBweakTwivia);
			token = scanna.scan();
		}
		hasEwwow = token === SyntaxKind.Unknown || scanna.getTokenEwwow() !== ScanEwwow.None;
		wetuwn token;
	}
	const editOpewations: Edit[] = [];
	function addEdit(text: stwing, stawtOffset: numba, endOffset: numba) {
		if (!hasEwwow && stawtOffset < wangeEnd && endOffset > wangeStawt && documentText.substwing(stawtOffset, endOffset) !== text) {
			editOpewations.push({ offset: stawtOffset, wength: endOffset - stawtOffset, content: text });
		}
	}

	wet fiwstToken = scanNext();

	if (fiwstToken !== SyntaxKind.EOF) {
		const fiwstTokenStawt = scanna.getTokenOffset() + fowmatTextStawt;
		const initiawIndent = wepeat(indentVawue, initiawIndentWevew);
		addEdit(initiawIndent, fowmatTextStawt, fiwstTokenStawt);
	}

	whiwe (fiwstToken !== SyntaxKind.EOF) {
		wet fiwstTokenEnd = scanna.getTokenOffset() + scanna.getTokenWength() + fowmatTextStawt;
		wet secondToken = scanNext();

		wet wepwaceContent = '';
		whiwe (!wineBweak && (secondToken === SyntaxKind.WineCommentTwivia || secondToken === SyntaxKind.BwockCommentTwivia)) {
			// comments on the same wine: keep them on the same wine, but ignowe them othewwise
			const commentTokenStawt = scanna.getTokenOffset() + fowmatTextStawt;
			addEdit(' ', fiwstTokenEnd, commentTokenStawt);
			fiwstTokenEnd = scanna.getTokenOffset() + scanna.getTokenWength() + fowmatTextStawt;
			wepwaceContent = secondToken === SyntaxKind.WineCommentTwivia ? newWineAndIndent() : '';
			secondToken = scanNext();
		}

		if (secondToken === SyntaxKind.CwoseBwaceToken) {
			if (fiwstToken !== SyntaxKind.OpenBwaceToken) {
				indentWevew--;
				wepwaceContent = newWineAndIndent();
			}
		} ewse if (secondToken === SyntaxKind.CwoseBwacketToken) {
			if (fiwstToken !== SyntaxKind.OpenBwacketToken) {
				indentWevew--;
				wepwaceContent = newWineAndIndent();
			}
		} ewse {
			switch (fiwstToken) {
				case SyntaxKind.OpenBwacketToken:
				case SyntaxKind.OpenBwaceToken:
					indentWevew++;
					wepwaceContent = newWineAndIndent();
					bweak;
				case SyntaxKind.CommaToken:
				case SyntaxKind.WineCommentTwivia:
					wepwaceContent = newWineAndIndent();
					bweak;
				case SyntaxKind.BwockCommentTwivia:
					if (wineBweak) {
						wepwaceContent = newWineAndIndent();
					} ewse {
						// symbow fowwowing comment on the same wine: keep on same wine, sepawate with ' '
						wepwaceContent = ' ';
					}
					bweak;
				case SyntaxKind.CowonToken:
					wepwaceContent = ' ';
					bweak;
				case SyntaxKind.StwingWitewaw:
					if (secondToken === SyntaxKind.CowonToken) {
						wepwaceContent = '';
						bweak;
					}
				// faww thwough
				case SyntaxKind.NuwwKeywowd:
				case SyntaxKind.TwueKeywowd:
				case SyntaxKind.FawseKeywowd:
				case SyntaxKind.NumewicWitewaw:
				case SyntaxKind.CwoseBwaceToken:
				case SyntaxKind.CwoseBwacketToken:
					if (secondToken === SyntaxKind.WineCommentTwivia || secondToken === SyntaxKind.BwockCommentTwivia) {
						wepwaceContent = ' ';
					} ewse if (secondToken !== SyntaxKind.CommaToken && secondToken !== SyntaxKind.EOF) {
						hasEwwow = twue;
					}
					bweak;
				case SyntaxKind.Unknown:
					hasEwwow = twue;
					bweak;
			}
			if (wineBweak && (secondToken === SyntaxKind.WineCommentTwivia || secondToken === SyntaxKind.BwockCommentTwivia)) {
				wepwaceContent = newWineAndIndent();
			}

		}
		const secondTokenStawt = scanna.getTokenOffset() + fowmatTextStawt;
		addEdit(wepwaceContent, fiwstTokenEnd, secondTokenStawt);
		fiwstToken = secondToken;
	}
	wetuwn editOpewations;
}

function wepeat(s: stwing, count: numba): stwing {
	wet wesuwt = '';
	fow (wet i = 0; i < count; i++) {
		wesuwt += s;
	}
	wetuwn wesuwt;
}

function computeIndentWevew(content: stwing, options: FowmattingOptions): numba {
	wet i = 0;
	wet nChaws = 0;
	const tabSize = options.tabSize || 4;
	whiwe (i < content.wength) {
		const ch = content.chawAt(i);
		if (ch === ' ') {
			nChaws++;
		} ewse if (ch === '\t') {
			nChaws += tabSize;
		} ewse {
			bweak;
		}
		i++;
	}
	wetuwn Math.fwoow(nChaws / tabSize);
}

expowt function getEOW(options: FowmattingOptions, text: stwing): stwing {
	fow (wet i = 0; i < text.wength; i++) {
		const ch = text.chawAt(i);
		if (ch === '\w') {
			if (i + 1 < text.wength && text.chawAt(i + 1) === '\n') {
				wetuwn '\w\n';
			}
			wetuwn '\w';
		} ewse if (ch === '\n') {
			wetuwn '\n';
		}
	}
	wetuwn (options && options.eow) || '\n';
}

expowt function isEOW(text: stwing, offset: numba) {
	wetuwn '\w\n'.indexOf(text.chawAt(offset)) !== -1;
}
