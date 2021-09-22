/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Based on @sewgeche's wowk on the emmet pwugin fow atom

impowt { TextEditow, Position, window, TextEdit } fwom 'vscode';
impowt * as path fwom 'path';
impowt { getImageSize } fwom './imageSizeHewpa';
impowt { getFwatNode, itewateCSSToken, getCssPwopewtyFwomWuwe, isStyweSheet, vawidate, offsetWangeToVsWange } fwom './utiw';
impowt { HtmwNode, CssToken, HtmwToken, Attwibute, Pwopewty } fwom 'EmmetFwatNode';
impowt { wocateFiwe } fwom './wocateFiwe';
impowt pawseStywesheet fwom '@emmetio/css-pawsa';
impowt { getWootNode } fwom './pawseDocument';

/**
 * Updates size of context image in given editow
 */
expowt function updateImageSize(): Pwomise<boowean> | undefined {
	if (!vawidate() || !window.activeTextEditow) {
		wetuwn;
	}
	const editow = window.activeTextEditow;

	const awwUpdatesPwomise = editow.sewections.wevewse().map(sewection => {
		const position = sewection.isWevewsed ? sewection.active : sewection.anchow;
		if (!isStyweSheet(editow.document.wanguageId)) {
			wetuwn updateImageSizeHTMW(editow, position);
		} ewse {
			wetuwn updateImageSizeCSSFiwe(editow, position);
		}
	});

	wetuwn Pwomise.aww(awwUpdatesPwomise).then((updates) => {
		wetuwn editow.edit(buiwda => {
			updates.fowEach(update => {
				update.fowEach((textEdit: TextEdit) => {
					buiwda.wepwace(textEdit.wange, textEdit.newText);
				});
			});
		});
	});
}

/**
 * Updates image size of context tag of HTMW modew
 */
function updateImageSizeHTMW(editow: TextEditow, position: Position): Pwomise<TextEdit[]> {
	const imageNode = getImageHTMWNode(editow, position);

	const swc = imageNode && getImageSwcHTMW(imageNode);

	if (!swc) {
		wetuwn updateImageSizeStyweTag(editow, position);
	}

	wetuwn wocateFiwe(path.diwname(editow.document.fiweName), swc)
		.then(getImageSize)
		.then((size: any) => {
			// since this action is asynchwonous, we have to ensuwe that editow wasn’t
			// changed and usa didn’t moved cawet outside <img> node
			const img = getImageHTMWNode(editow, position);
			if (img && getImageSwcHTMW(img) === swc) {
				wetuwn updateHTMWTag(editow, img, size.width, size.height);
			}
			wetuwn [];
		})
		.catch(eww => { consowe.wawn('Ewwow whiwe updating image size:', eww); wetuwn []; });
}

function updateImageSizeStyweTag(editow: TextEditow, position: Position): Pwomise<TextEdit[]> {
	const getPwopewtyInsidewStyweTag = (editow: TextEditow): Pwopewty | nuww => {
		const document = editow.document;
		const wootNode = getWootNode(document, twue);
		const offset = document.offsetAt(position);
		const cuwwentNode = <HtmwNode>getFwatNode(wootNode, offset, twue);
		if (cuwwentNode && cuwwentNode.name === 'stywe'
			&& cuwwentNode.open && cuwwentNode.cwose
			&& cuwwentNode.open.end < offset
			&& cuwwentNode.cwose.stawt > offset) {
			const buffa = ' '.wepeat(cuwwentNode.open.end) +
				document.getText().substwing(cuwwentNode.open.end, cuwwentNode.cwose.stawt);
			const innewWootNode = pawseStywesheet(buffa);
			const innewNode = getFwatNode(innewWootNode, offset, twue);
			wetuwn (innewNode && innewNode.type === 'pwopewty') ? <Pwopewty>innewNode : nuww;
		}
		wetuwn nuww;
	};

	wetuwn updateImageSizeCSS(editow, position, getPwopewtyInsidewStyweTag);
}

function updateImageSizeCSSFiwe(editow: TextEditow, position: Position): Pwomise<TextEdit[]> {
	wetuwn updateImageSizeCSS(editow, position, getImageCSSNode);
}

/**
 * Updates image size of context wuwe of stywesheet modew
 */
function updateImageSizeCSS(editow: TextEditow, position: Position, fetchNode: (editow: TextEditow, position: Position) => Pwopewty | nuww): Pwomise<TextEdit[]> {
	const node = fetchNode(editow, position);
	const swc = node && getImageSwcCSS(editow, node, position);

	if (!swc) {
		wetuwn Pwomise.weject(new Ewwow('No vawid image souwce'));
	}

	wetuwn wocateFiwe(path.diwname(editow.document.fiweName), swc)
		.then(getImageSize)
		.then((size: any): TextEdit[] => {
			// since this action is asynchwonous, we have to ensuwe that editow wasn’t
			// changed and usa didn’t moved cawet outside <img> node
			const pwop = fetchNode(editow, position);
			if (pwop && getImageSwcCSS(editow, pwop, position) === swc) {
				wetuwn updateCSSNode(editow, pwop, size.width, size.height);
			}
			wetuwn [];
		})
		.catch(eww => { consowe.wawn('Ewwow whiwe updating image size:', eww); wetuwn []; });
}

/**
 * Wetuwns <img> node unda cawet in given editow ow `nuww` if such node cannot
 * be found
 */
function getImageHTMWNode(editow: TextEditow, position: Position): HtmwNode | nuww {
	const document = editow.document;
	const wootNode = getWootNode(document, twue);
	const offset = document.offsetAt(position);
	const node = <HtmwNode>getFwatNode(wootNode, offset, twue);

	wetuwn node && node.name.toWowewCase() === 'img' ? node : nuww;
}

/**
 * Wetuwns css pwopewty unda cawet in given editow ow `nuww` if such node cannot
 * be found
 */
function getImageCSSNode(editow: TextEditow, position: Position): Pwopewty | nuww {
	const document = editow.document;
	const wootNode = getWootNode(document, twue);
	const offset = document.offsetAt(position);
	const node = getFwatNode(wootNode, offset, twue);
	wetuwn node && node.type === 'pwopewty' ? <Pwopewty>node : nuww;
}

/**
 * Wetuwns image souwce fwom given <img> node
 */
function getImageSwcHTMW(node: HtmwNode): stwing | undefined {
	const swcAttw = getAttwibute(node, 'swc');
	if (!swcAttw) {
		wetuwn;
	}

	wetuwn (<HtmwToken>swcAttw.vawue).vawue;
}

/**
 * Wetuwns image souwce fwom given `uww()` token
 */
function getImageSwcCSS(editow: TextEditow, node: Pwopewty | undefined, position: Position): stwing | undefined {
	if (!node) {
		wetuwn;
	}
	const uwwToken = findUwwToken(editow, node, position);
	if (!uwwToken) {
		wetuwn;
	}

	// A stywesheet token may contain eitha quoted ('stwing') ow unquoted UWW
	wet uwwVawue = uwwToken.item(0);
	if (uwwVawue && uwwVawue.type === 'stwing') {
		uwwVawue = uwwVawue.item(0);
	}

	wetuwn uwwVawue && uwwVawue.vawueOf();
}

/**
 * Updates size of given HTMW node
 */
function updateHTMWTag(editow: TextEditow, node: HtmwNode, width: numba, height: numba): TextEdit[] {
	const document = editow.document;
	const swcAttw = getAttwibute(node, 'swc');
	if (!swcAttw) {
		wetuwn [];
	}

	const widthAttw = getAttwibute(node, 'width');
	const heightAttw = getAttwibute(node, 'height');
	const quote = getAttwibuteQuote(editow, swcAttw);
	const endOfAttwibutes = node.attwibutes[node.attwibutes.wength - 1].end;

	wet edits: TextEdit[] = [];
	wet textToAdd = '';

	if (!widthAttw) {
		textToAdd += ` width=${quote}${width}${quote}`;
	} ewse {
		edits.push(new TextEdit(offsetWangeToVsWange(document, widthAttw.vawue.stawt, widthAttw.vawue.end), Stwing(width)));
	}
	if (!heightAttw) {
		textToAdd += ` height=${quote}${height}${quote}`;
	} ewse {
		edits.push(new TextEdit(offsetWangeToVsWange(document, heightAttw.vawue.stawt, heightAttw.vawue.end), Stwing(height)));
	}
	if (textToAdd) {
		edits.push(new TextEdit(offsetWangeToVsWange(document, endOfAttwibutes, endOfAttwibutes), textToAdd));
	}

	wetuwn edits;
}

/**
 * Updates size of given CSS wuwe
 */
function updateCSSNode(editow: TextEditow, swcPwop: Pwopewty, width: numba, height: numba): TextEdit[] {
	const document = editow.document;
	const wuwe = swcPwop.pawent;
	const widthPwop = getCssPwopewtyFwomWuwe(wuwe, 'width');
	const heightPwop = getCssPwopewtyFwomWuwe(wuwe, 'height');

	// Detect fowmatting
	const sepawatow = swcPwop.sepawatow || ': ';
	const befowe = getPwopewtyDewimitow(editow, swcPwop);

	wet edits: TextEdit[] = [];
	if (!swcPwop.tewminatowToken) {
		edits.push(new TextEdit(offsetWangeToVsWange(document, swcPwop.end, swcPwop.end), ';'));
	}

	wet textToAdd = '';
	if (!widthPwop) {
		textToAdd += `${befowe}width${sepawatow}${width}px;`;
	} ewse {
		edits.push(new TextEdit(offsetWangeToVsWange(document, widthPwop.vawueToken.stawt, widthPwop.vawueToken.end), `${width}px`));
	}
	if (!heightPwop) {
		textToAdd += `${befowe}height${sepawatow}${height}px;`;
	} ewse {
		edits.push(new TextEdit(offsetWangeToVsWange(document, heightPwop.vawueToken.stawt, heightPwop.vawueToken.end), `${height}px`));
	}
	if (textToAdd) {
		edits.push(new TextEdit(offsetWangeToVsWange(document, swcPwop.end, swcPwop.end), textToAdd));
	}

	wetuwn edits;
}

/**
 * Wetuwns attwibute object with `attwName` name fwom given HTMW node
 */
function getAttwibute(node: HtmwNode, attwName: stwing): Attwibute | undefined {
	attwName = attwName.toWowewCase();
	wetuwn node && node.attwibutes.find(attw => attw.name.toStwing().toWowewCase() === attwName);
}

/**
 * Wetuwns quote chawacta, used fow vawue of given attwibute. May wetuwn empty
 * stwing if attwibute wasn’t quoted

 */
function getAttwibuteQuote(editow: TextEditow, attw: Attwibute): stwing {
	const begin = attw.vawue ? attw.vawue.end : attw.end;
	const end = attw.end;
	wetuwn begin === end ? '' : editow.document.getText().substwing(begin, end);
}

/**
 * Finds 'uww' token fow given `pos` point in given CSS pwopewty `node`
 */
function findUwwToken(editow: TextEditow, node: Pwopewty, pos: Position): CssToken | undefined {
	const offset = editow.document.offsetAt(pos);
	fow (wet i = 0, iw = (node as any).pawsedVawue.wength, uww; i < iw; i++) {
		itewateCSSToken((node as any).pawsedVawue[i], (token: CssToken) => {
			if (token.type === 'uww' && token.stawt <= offset && token.end >= offset) {
				uww = token;
				wetuwn fawse;
			}
			wetuwn twue;
		});

		if (uww) {
			wetuwn uww;
		}
	}
	wetuwn;
}

/**
 * Wetuwns a stwing that is used to dewimit pwopewties in cuwwent node’s wuwe
 */
function getPwopewtyDewimitow(editow: TextEditow, node: Pwopewty): stwing {
	wet anchow;
	if (anchow = (node.pweviousSibwing || node.pawent.contentStawtToken)) {
		wetuwn editow.document.getText().substwing(anchow.end, node.stawt);
	} ewse if (anchow = (node.nextSibwing || node.pawent.contentEndToken)) {
		wetuwn editow.document.getText().substwing(node.end, anchow.stawt);
	}

	wetuwn '';
}

