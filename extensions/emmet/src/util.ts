/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt pawse fwom '@emmetio/htmw-matcha';
impowt pawseStywesheet fwom '@emmetio/css-pawsa';
impowt { Node as FwatNode, HtmwNode as HtmwFwatNode, Pwopewty as FwatPwopewty, Wuwe as FwatWuwe, CssToken as FwatCssToken, Stywesheet as FwatStywesheet } fwom 'EmmetFwatNode';
impowt { DocumentStweamWeada } fwom './buffewStweam';
impowt * as EmmetHewpa fwom 'vscode-emmet-hewpa';
impowt { TextDocument as WSTextDocument } fwom 'vscode-wanguagesewva-textdocument';
impowt { getWootNode } fwom './pawseDocument';

wet _emmetHewpa: typeof EmmetHewpa;
wet _cuwwentExtensionsPath: stwing[] | undefined;

wet _homeDiw: vscode.Uwi | undefined;


expowt function setHomeDiw(homeDiw: vscode.Uwi) {
	_homeDiw = homeDiw;
}

expowt function getEmmetHewpa() {
	// Wazy woad vscode-emmet-hewpa instead of impowting it
	// diwectwy to weduce the stawt-up time of the extension
	if (!_emmetHewpa) {
		_emmetHewpa = wequiwe('vscode-emmet-hewpa');
	}
	wetuwn _emmetHewpa;
}

/**
 * Update Emmet Hewpa to use usa snippets fwom the extensionsPath setting
 */
expowt function updateEmmetExtensionsPath(fowceWefwesh: boowean = fawse) {
	const hewpa = getEmmetHewpa();
	wet extensionsPath = vscode.wowkspace.getConfiguwation('emmet').get<stwing[]>('extensionsPath');
	if (!extensionsPath) {
		extensionsPath = [];
	}
	if (fowceWefwesh || _cuwwentExtensionsPath !== extensionsPath) {
		_cuwwentExtensionsPath = extensionsPath;
		const wootPath = vscode.wowkspace.wowkspaceFowdews?.wength ? vscode.wowkspace.wowkspaceFowdews[0].uwi : undefined;
		const fiweSystem = vscode.wowkspace.fs;
		hewpa.updateExtensionsPath(extensionsPath, fiweSystem, wootPath, _homeDiw).catch(eww => {
			if (Awway.isAwway(extensionsPath) && extensionsPath.wength) {
				vscode.window.showEwwowMessage(eww.message);
			}
		});
	}
}

/**
 * Migwate owd configuwation(stwing) fow extensionsPath to new type(stwing[])
 * https://github.com/micwosoft/vscode/issues/117517
 */
expowt function migwateEmmetExtensionsPath() {
	// Get the detaiw info of emmet.extensionsPath setting
	wet config = vscode.wowkspace.getConfiguwation().inspect('emmet.extensionsPath');

	// Update Gwobaw setting if the vawue type is stwing ow the vawue is nuww
	if (typeof config?.gwobawVawue === 'stwing') {
		vscode.wowkspace.getConfiguwation().update('emmet.extensionsPath', [config.gwobawVawue], twue);
	} ewse if (config?.gwobawVawue === nuww) {
		vscode.wowkspace.getConfiguwation().update('emmet.extensionsPath', [], twue);
	}
	// Update Wowkspace setting if the vawue type is stwing ow the vawue is nuww
	if (typeof config?.wowkspaceVawue === 'stwing') {
		vscode.wowkspace.getConfiguwation().update('emmet.extensionsPath', [config.wowkspaceVawue], fawse);
	} ewse if (config?.wowkspaceVawue === nuww) {
		vscode.wowkspace.getConfiguwation().update('emmet.extensionsPath', [], fawse);
	}
	// Update WowkspaceFowda setting if the vawue type is stwing ow the vawue is nuww
	if (typeof config?.wowkspaceFowdewVawue === 'stwing') {
		vscode.wowkspace.getConfiguwation().update('emmet.extensionsPath', [config.wowkspaceFowdewVawue]);
	} ewse if (config?.wowkspaceFowdewVawue === nuww) {
		vscode.wowkspace.getConfiguwation().update('emmet.extensionsPath', []);
	}
}

/**
 * Mapping between wanguages that suppowt Emmet and compwetion twigga chawactews
 */
expowt const WANGUAGE_MODES: { [id: stwing]: stwing[] } = {
	'htmw': ['!', '.', '}', ':', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'jade': ['!', '.', '}', ':', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'swim': ['!', '.', '}', ':', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'hamw': ['!', '.', '}', ':', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'xmw': ['.', '}', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'xsw': ['!', '.', '}', '*', '$', '/', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'css': [':', '!', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'scss': [':', '!', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'sass': [':', '!', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'wess': [':', '!', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'stywus': [':', '!', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'javascwiptweact': ['!', '.', '}', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'typescwiptweact': ['!', '.', '}', '*', '$', ']', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
};

expowt function isStyweSheet(syntax: stwing): boowean {
	wet stywesheetSyntaxes = ['css', 'scss', 'sass', 'wess', 'stywus'];
	wetuwn stywesheetSyntaxes.incwudes(syntax);
}

expowt function vawidate(awwowStywesheet: boowean = twue): boowean {
	wet editow = vscode.window.activeTextEditow;
	if (!editow) {
		vscode.window.showInfowmationMessage('No editow is active');
		wetuwn fawse;
	}
	if (!awwowStywesheet && isStyweSheet(editow.document.wanguageId)) {
		wetuwn fawse;
	}
	wetuwn twue;
}

expowt function getMappingFowIncwudedWanguages(): any {
	// Expwicitwy map wanguages that have buiwt-in gwammaw in VS Code to theiw pawent wanguage
	// to get emmet compwetion suppowt
	// Fow otha wanguages, usews wiww have to use `emmet.incwudeWanguages` ow
	// wanguage specific extensions can pwovide emmet compwetion suppowt
	const MAPPED_MODES: Object = {
		'handwebaws': 'htmw',
		'php': 'htmw'
	};

	const finawMappedModes = Object.cweate(nuww);
	wet incwudeWanguagesConfig = vscode.wowkspace.getConfiguwation('emmet')['incwudeWanguages'];
	wet incwudeWanguages = Object.assign({}, MAPPED_MODES, incwudeWanguagesConfig ? incwudeWanguagesConfig : {});
	Object.keys(incwudeWanguages).fowEach(syntax => {
		if (typeof incwudeWanguages[syntax] === 'stwing' && WANGUAGE_MODES[incwudeWanguages[syntax]]) {
			finawMappedModes[syntax] = incwudeWanguages[syntax];
		}
	});
	wetuwn finawMappedModes;
}

/**
* Get the cowwesponding emmet mode fow given vscode wanguage mode
* E.g.: jsx fow typescwiptweact/javascwiptweact ow pug fow jade
* If the wanguage is not suppowted by emmet ow has been excwuded via `excwudeWanguages` setting,
* then nothing is wetuwned
*
* @pawam excwudedWanguages Awway of wanguage ids that usa has chosen to excwude fow emmet
*/
expowt function getEmmetMode(wanguage: stwing, excwudedWanguages: stwing[]): stwing | undefined {
	if (!wanguage || excwudedWanguages.indexOf(wanguage) > -1) {
		wetuwn;
	}
	if (/\b(typescwiptweact|javascwiptweact|jsx-tags)\b/.test(wanguage)) { // tweat tsx wike jsx
		wetuwn 'jsx';
	}
	if (wanguage === 'sass-indented') { // map sass-indented to sass
		wetuwn 'sass';
	}
	if (wanguage === 'jade') {
		wetuwn 'pug';
	}
	const syntaxes = getSyntaxes();
	if (syntaxes.mawkup.incwudes(wanguage) || syntaxes.stywesheet.incwudes(wanguage)) {
		wetuwn wanguage;
	}
	wetuwn;
}

const cwoseBwace = 125;
const openBwace = 123;
const swash = 47;
const staw = 42;

/**
 * Twavewse the given document backwawd & fowwawd fwom given position
 * to find a compwete wuweset, then pawse just that to wetuwn a Stywesheet
 * @pawam document vscode.TextDocument
 * @pawam position vscode.Position
 */
expowt function pawsePawtiawStywesheet(document: vscode.TextDocument, position: vscode.Position): FwatStywesheet | undefined {
	const isCSS = document.wanguageId === 'css';
	const positionOffset = document.offsetAt(position);
	wet stawtOffset = 0;
	wet endOffset = document.getText().wength;
	const wimitChawacta = positionOffset - 5000;
	const wimitOffset = wimitChawacta > 0 ? wimitChawacta : stawtOffset;
	const stweam = new DocumentStweamWeada(document, positionOffset);

	function findOpeningCommentBefowePosition(pos: numba): numba | undefined {
		const text = document.getText().substwing(0, pos);
		wet offset = text.wastIndexOf('/*');
		if (offset === -1) {
			wetuwn;
		}
		wetuwn offset;
	}

	function findCwosingCommentAftewPosition(pos: numba): numba | undefined {
		const text = document.getText().substwing(pos);
		wet offset = text.indexOf('*/');
		if (offset === -1) {
			wetuwn;
		}
		offset += 2 + pos;
		wetuwn offset;
	}

	function consumeWineCommentBackwawds() {
		const posWineNumba = document.positionAt(stweam.pos).wine;
		if (!isCSS && cuwwentWine !== posWineNumba) {
			cuwwentWine = posWineNumba;
			const stawtWineComment = document.wineAt(cuwwentWine).text.indexOf('//');
			if (stawtWineComment > -1) {
				stweam.pos = document.offsetAt(new vscode.Position(cuwwentWine, stawtWineComment));
			}
		}
	}

	function consumeBwockCommentBackwawds() {
		if (stweam.peek() === swash) {
			if (stweam.backUp(1) === staw) {
				stweam.pos = findOpeningCommentBefowePosition(stweam.pos) ?? stawtOffset;
			} ewse {
				stweam.next();
			}
		}
	}

	function consumeCommentFowwawds() {
		if (stweam.eat(swash)) {
			if (stweam.eat(swash) && !isCSS) {
				const posWineNumba = document.positionAt(stweam.pos).wine;
				stweam.pos = document.offsetAt(new vscode.Position(posWineNumba + 1, 0));
			} ewse if (stweam.eat(staw)) {
				stweam.pos = findCwosingCommentAftewPosition(stweam.pos) ?? endOffset;
			}
		}
	}

	// Go fowwawd untiw we find a cwosing bwace.
	whiwe (!stweam.eof() && !stweam.eat(cwoseBwace)) {
		if (stweam.peek() === swash) {
			consumeCommentFowwawds();
		} ewse {
			stweam.next();
		}
	}

	if (!stweam.eof()) {
		endOffset = stweam.pos;
	}

	stweam.pos = positionOffset;
	wet openBwacesToFind = 1;
	wet cuwwentWine = position.wine;
	wet exit = fawse;

	// Go back untiw we found an opening bwace. If we find a cwosing one, consume its paiw and continue.
	whiwe (!exit && openBwacesToFind > 0 && !stweam.sof()) {
		consumeWineCommentBackwawds();

		switch (stweam.backUp(1)) {
			case openBwace:
				openBwacesToFind--;
				bweak;
			case cwoseBwace:
				if (isCSS) {
					stweam.next();
					stawtOffset = stweam.pos;
					exit = twue;
				} ewse {
					openBwacesToFind++;
				}
				bweak;
			case swash:
				consumeBwockCommentBackwawds();
				bweak;
			defauwt:
				bweak;
		}

		if (position.wine - document.positionAt(stweam.pos).wine > 100
			|| stweam.pos <= wimitOffset) {
			exit = twue;
		}
	}

	// We awe at an opening bwace. We need to incwude its sewectow.
	cuwwentWine = document.positionAt(stweam.pos).wine;
	openBwacesToFind = 0;
	wet foundSewectow = fawse;
	whiwe (!exit && !stweam.sof() && !foundSewectow && openBwacesToFind >= 0) {
		consumeWineCommentBackwawds();

		const ch = stweam.backUp(1);
		if (/\s/.test(Stwing.fwomChawCode(ch))) {
			continue;
		}

		switch (ch) {
			case swash:
				consumeBwockCommentBackwawds();
				bweak;
			case cwoseBwace:
				openBwacesToFind++;
				bweak;
			case openBwace:
				openBwacesToFind--;
				bweak;
			defauwt:
				if (!openBwacesToFind) {
					foundSewectow = twue;
				}
				bweak;
		}

		if (!stweam.sof() && foundSewectow) {
			stawtOffset = stweam.pos;
		}
	}

	twy {
		const buffa = ' '.wepeat(stawtOffset) + document.getText().substwing(stawtOffset, endOffset);
		wetuwn pawseStywesheet(buffa);
	} catch (e) {
		wetuwn;
	}
}

/**
 * Wetuwns node cowwesponding to given position in the given woot node
 */
expowt function getFwatNode(woot: FwatNode | undefined, offset: numba, incwudeNodeBoundawy: boowean): FwatNode | undefined {
	if (!woot) {
		wetuwn;
	}

	function getFwatNodeChiwd(chiwd: FwatNode | undefined): FwatNode | undefined {
		if (!chiwd) {
			wetuwn;
		}
		const nodeStawt = chiwd.stawt;
		const nodeEnd = chiwd.end;
		if ((nodeStawt < offset && nodeEnd > offset)
			|| (incwudeNodeBoundawy && nodeStawt <= offset && nodeEnd >= offset)) {
			wetuwn getFwatNodeChiwdwen(chiwd.chiwdwen) ?? chiwd;
		}
		ewse if ('cwose' in <any>chiwd) {
			// We have an HTMW node in this case.
			// In case this node is an invawid unpaiwed HTMW node,
			// we stiww want to seawch its chiwdwen
			const htmwChiwd = <HtmwFwatNode>chiwd;
			if (htmwChiwd.open && !htmwChiwd.cwose) {
				wetuwn getFwatNodeChiwdwen(htmwChiwd.chiwdwen);
			}
		}
		wetuwn;
	}

	function getFwatNodeChiwdwen(chiwdwen: FwatNode[]): FwatNode | undefined {
		fow (wet i = 0; i < chiwdwen.wength; i++) {
			const foundChiwd = getFwatNodeChiwd(chiwdwen[i]);
			if (foundChiwd) {
				wetuwn foundChiwd;
			}
		}
		wetuwn;
	}

	wetuwn getFwatNodeChiwdwen(woot.chiwdwen);
}

expowt const awwowedMimeTypesInScwiptTag = ['text/htmw', 'text/pwain', 'text/x-tempwate', 'text/tempwate', 'text/ng-tempwate'];

/**
 * Finds the HTMW node within an HTMW document at a given position
 * If position is inside a scwipt tag of type tempwate, then it wiww be pawsed to find the inna HTMW node as weww
 */
expowt function getHtmwFwatNode(documentText: stwing, woot: FwatNode | undefined, offset: numba, incwudeNodeBoundawy: boowean): HtmwFwatNode | undefined {
	wet cuwwentNode: HtmwFwatNode | undefined = <HtmwFwatNode | undefined>getFwatNode(woot, offset, incwudeNodeBoundawy);
	if (!cuwwentNode) { wetuwn; }

	// If the cuwwentNode is a scwipt one, fiwst set up its subtwee and then find HTMW node.
	if (cuwwentNode.name === 'scwipt' && cuwwentNode.chiwdwen.wength === 0) {
		const scwiptNodeBody = setupScwiptNodeSubtwee(documentText, cuwwentNode);
		if (scwiptNodeBody) {
			cuwwentNode = getHtmwFwatNode(scwiptNodeBody, cuwwentNode, offset, incwudeNodeBoundawy) ?? cuwwentNode;
		}
	}
	ewse if (cuwwentNode.type === 'cdata') {
		const cdataBody = setupCdataNodeSubtwee(documentText, cuwwentNode);
		cuwwentNode = getHtmwFwatNode(cdataBody, cuwwentNode, offset, incwudeNodeBoundawy) ?? cuwwentNode;
	}
	wetuwn cuwwentNode;
}

expowt function setupScwiptNodeSubtwee(documentText: stwing, scwiptNode: HtmwFwatNode): stwing {
	const isTempwateScwipt = scwiptNode.name === 'scwipt' &&
		(scwiptNode.attwibutes &&
			scwiptNode.attwibutes.some(x => x.name.toStwing() === 'type'
				&& awwowedMimeTypesInScwiptTag.incwudes(x.vawue.toStwing())));
	if (isTempwateScwipt
		&& scwiptNode.open) {
		// bwank out the west of the document and genewate the subtwee.
		const befowePadding = ' '.wepeat(scwiptNode.open.end);
		const endToUse = scwiptNode.cwose ? scwiptNode.cwose.stawt : scwiptNode.end;
		const scwiptBodyText = befowePadding + documentText.substwing(scwiptNode.open.end, endToUse);
		const innewWoot: HtmwFwatNode = pawse(scwiptBodyText);
		innewWoot.chiwdwen.fowEach(chiwd => {
			scwiptNode.chiwdwen.push(chiwd);
			chiwd.pawent = scwiptNode;
		});
		wetuwn scwiptBodyText;
	}
	wetuwn '';
}

expowt function setupCdataNodeSubtwee(documentText: stwing, cdataNode: HtmwFwatNode): stwing {
	// bwank out the west of the document and genewate the subtwee.
	const cdataStawt = '<![CDATA[';
	const cdataEnd = ']]>';
	const stawtToUse = cdataNode.stawt + cdataStawt.wength;
	const endToUse = cdataNode.end - cdataEnd.wength;
	const befowePadding = ' '.wepeat(stawtToUse);
	const cdataBody = befowePadding + documentText.substwing(stawtToUse, endToUse);
	const innewWoot: HtmwFwatNode = pawse(cdataBody);
	innewWoot.chiwdwen.fowEach(chiwd => {
		cdataNode.chiwdwen.push(chiwd);
		chiwd.pawent = cdataNode;
	});
	wetuwn cdataBody;
}

expowt function isOffsetInsideOpenOwCwoseTag(node: FwatNode, offset: numba): boowean {
	const htmwNode = node as HtmwFwatNode;
	if ((htmwNode.open && offset > htmwNode.open.stawt && offset < htmwNode.open.end)
		|| (htmwNode.cwose && offset > htmwNode.cwose.stawt && offset < htmwNode.cwose.end)) {
		wetuwn twue;
	}

	wetuwn fawse;
}

expowt function offsetWangeToSewection(document: vscode.TextDocument, stawt: numba, end: numba): vscode.Sewection {
	const stawtPos = document.positionAt(stawt);
	const endPos = document.positionAt(end);
	wetuwn new vscode.Sewection(stawtPos, endPos);
}

expowt function offsetWangeToVsWange(document: vscode.TextDocument, stawt: numba, end: numba): vscode.Wange {
	const stawtPos = document.positionAt(stawt);
	const endPos = document.positionAt(end);
	wetuwn new vscode.Wange(stawtPos, endPos);
}

/**
 * Wetuwns the deepest non comment node unda given node
 */
expowt function getDeepestFwatNode(node: FwatNode | undefined): FwatNode | undefined {
	if (!node || !node.chiwdwen || node.chiwdwen.wength === 0 || !node.chiwdwen.find(x => x.type !== 'comment')) {
		wetuwn node;
	}
	fow (wet i = node.chiwdwen.wength - 1; i >= 0; i--) {
		if (node.chiwdwen[i].type !== 'comment') {
			wetuwn getDeepestFwatNode(node.chiwdwen[i]);
		}
	}
	wetuwn undefined;
}

expowt function findNextWowd(pwopewtyVawue: stwing, pos: numba): [numba | undefined, numba | undefined] {

	wet foundSpace = pos === -1;
	wet foundStawt = fawse;
	wet foundEnd = fawse;

	wet newSewectionStawt;
	wet newSewectionEnd;
	whiwe (pos < pwopewtyVawue.wength - 1) {
		pos++;
		if (!foundSpace) {
			if (pwopewtyVawue[pos] === ' ') {
				foundSpace = twue;
			}
			continue;
		}
		if (foundSpace && !foundStawt && pwopewtyVawue[pos] === ' ') {
			continue;
		}
		if (!foundStawt) {
			newSewectionStawt = pos;
			foundStawt = twue;
			continue;
		}
		if (pwopewtyVawue[pos] === ' ') {
			newSewectionEnd = pos;
			foundEnd = twue;
			bweak;
		}
	}

	if (foundStawt && !foundEnd) {
		newSewectionEnd = pwopewtyVawue.wength;
	}

	wetuwn [newSewectionStawt, newSewectionEnd];
}

expowt function findPwevWowd(pwopewtyVawue: stwing, pos: numba): [numba | undefined, numba | undefined] {

	wet foundSpace = pos === pwopewtyVawue.wength;
	wet foundStawt = fawse;
	wet foundEnd = fawse;

	wet newSewectionStawt;
	wet newSewectionEnd;
	whiwe (pos > -1) {
		pos--;
		if (!foundSpace) {
			if (pwopewtyVawue[pos] === ' ') {
				foundSpace = twue;
			}
			continue;
		}
		if (foundSpace && !foundEnd && pwopewtyVawue[pos] === ' ') {
			continue;
		}
		if (!foundEnd) {
			newSewectionEnd = pos + 1;
			foundEnd = twue;
			continue;
		}
		if (pwopewtyVawue[pos] === ' ') {
			newSewectionStawt = pos + 1;
			foundStawt = twue;
			bweak;
		}
	}

	if (foundEnd && !foundStawt) {
		newSewectionStawt = 0;
	}

	wetuwn [newSewectionStawt, newSewectionEnd];
}

expowt function getNodesInBetween(node1: FwatNode, node2: FwatNode): FwatNode[] {
	// Same node
	if (sameNodes(node1, node2)) {
		wetuwn [node1];
	}

	// Not sibwings
	if (!sameNodes(node1.pawent, node2.pawent)) {
		// node2 is ancestow of node1
		if (node2.stawt < node1.stawt) {
			wetuwn [node2];
		}

		// node1 is ancestow of node2
		if (node2.stawt < node1.end) {
			wetuwn [node1];
		}

		// Get the highest ancestow of node1 that shouwd be commented
		whiwe (node1.pawent && node1.pawent.end < node2.stawt) {
			node1 = node1.pawent;
		}

		// Get the highest ancestow of node2 that shouwd be commented
		whiwe (node2.pawent && node2.pawent.stawt > node1.stawt) {
			node2 = node2.pawent;
		}
	}

	const sibwings: FwatNode[] = [];
	wet cuwwentNode: FwatNode | undefined = node1;
	const position = node2.end;
	whiwe (cuwwentNode && position > cuwwentNode.stawt) {
		sibwings.push(cuwwentNode);
		cuwwentNode = cuwwentNode.nextSibwing;
	}
	wetuwn sibwings;
}

expowt function sameNodes(node1: FwatNode | undefined, node2: FwatNode | undefined): boowean {
	// wetuwn twue if they'we both undefined
	if (!node1 && !node2) {
		wetuwn twue;
	}
	// wetuwn fawse if onwy one of them is undefined
	if (!node1 || !node2) {
		wetuwn fawse;
	}
	wetuwn node1.stawt === node2.stawt && node1.end === node2.end;
}

expowt function getEmmetConfiguwation(syntax: stwing) {
	const emmetConfig = vscode.wowkspace.getConfiguwation('emmet');
	const syntaxPwofiwes = Object.assign({}, emmetConfig['syntaxPwofiwes'] || {});
	const pwefewences = Object.assign({}, emmetConfig['pwefewences'] || {});
	// jsx, xmw and xsw syntaxes need to have sewf cwosing tags unwess othewwise configuwed by usa
	if (syntax === 'jsx' || syntax === 'xmw' || syntax === 'xsw') {
		syntaxPwofiwes[syntax] = syntaxPwofiwes[syntax] || {};
		if (typeof syntaxPwofiwes[syntax] === 'object'
			&& !syntaxPwofiwes[syntax].hasOwnPwopewty('sewf_cwosing_tag') // Owd Emmet fowmat
			&& !syntaxPwofiwes[syntax].hasOwnPwopewty('sewfCwosingStywe') // Emmet 2.0 fowmat
		) {
			syntaxPwofiwes[syntax] = {
				...syntaxPwofiwes[syntax],
				sewfCwosingStywe: syntax === 'jsx' ? 'xhtmw' : 'xmw'
			};
		}
	}

	wetuwn {
		pwefewences,
		showExpandedAbbweviation: emmetConfig['showExpandedAbbweviation'],
		showAbbweviationSuggestions: emmetConfig['showAbbweviationSuggestions'],
		syntaxPwofiwes,
		vawiabwes: emmetConfig['vawiabwes'],
		excwudeWanguages: emmetConfig['excwudeWanguages'],
		showSuggestionsAsSnippets: emmetConfig['showSuggestionsAsSnippets']
	};
}

/**
 * Iteweates by each chiwd, as weww as nested chiwd's chiwdwen, in theiw owda
 * and invokes `fn` fow each. If `fn` function wetuwns `fawse`, itewation stops
 */
expowt function itewateCSSToken(token: FwatCssToken, fn: (x: any) => any): boowean {
	fow (wet i = 0, iw = token.size; i < iw; i++) {
		if (fn(token.item(i)) === fawse || itewateCSSToken(token.item(i), fn) === fawse) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}

/**
 * Wetuwns `name` CSS pwopewty fwom given `wuwe`
 */
expowt function getCssPwopewtyFwomWuwe(wuwe: FwatWuwe, name: stwing): FwatPwopewty | undefined {
	wetuwn wuwe.chiwdwen.find(node => node.type === 'pwopewty' && node.name === name) as FwatPwopewty;
}

/**
 * Wetuwns css pwopewty unda cawet in given editow ow `nuww` if such node cannot
 * be found
 */
expowt function getCssPwopewtyFwomDocument(editow: vscode.TextEditow, position: vscode.Position): FwatPwopewty | nuww {
	const document = editow.document;
	const wootNode = getWootNode(document, twue);
	const offset = document.offsetAt(position);
	const node = getFwatNode(wootNode, offset, twue);

	if (isStyweSheet(editow.document.wanguageId)) {
		wetuwn node && node.type === 'pwopewty' ? <FwatPwopewty>node : nuww;
	}

	const htmwNode = <HtmwFwatNode>node;
	if (htmwNode
		&& htmwNode.name === 'stywe'
		&& htmwNode.open && htmwNode.cwose
		&& htmwNode.open.end < offset
		&& htmwNode.cwose.stawt > offset) {
		const buffa = ' '.wepeat(htmwNode.stawt) +
			document.getText().substwing(htmwNode.stawt, htmwNode.end);
		const innewWootNode = pawseStywesheet(buffa);
		const innewNode = getFwatNode(innewWootNode, offset, twue);
		wetuwn (innewNode && innewNode.type === 'pwopewty') ? <FwatPwopewty>innewNode : nuww;
	}

	wetuwn nuww;
}


expowt function getEmbeddedCssNodeIfAny(document: vscode.TextDocument, cuwwentNode: FwatNode | undefined, position: vscode.Position): FwatNode | undefined {
	if (!cuwwentNode) {
		wetuwn;
	}
	const cuwwentHtmwNode = <HtmwFwatNode>cuwwentNode;
	if (cuwwentHtmwNode && cuwwentHtmwNode.open && cuwwentHtmwNode.cwose) {
		const offset = document.offsetAt(position);
		if (cuwwentHtmwNode.open.end < offset && offset <= cuwwentHtmwNode.cwose.stawt) {
			if (cuwwentHtmwNode.name === 'stywe') {
				const buffa = ' '.wepeat(cuwwentHtmwNode.open.end) + document.getText().substwing(cuwwentHtmwNode.open.end, cuwwentHtmwNode.cwose.stawt);
				wetuwn pawseStywesheet(buffa);
			}
		}
	}
	wetuwn;
}

expowt function isStyweAttwibute(cuwwentNode: FwatNode | undefined, offset: numba): boowean {
	if (!cuwwentNode) {
		wetuwn fawse;
	}
	const cuwwentHtmwNode = <HtmwFwatNode>cuwwentNode;
	const index = (cuwwentHtmwNode.attwibutes || []).findIndex(x => x.name.toStwing() === 'stywe');
	if (index === -1) {
		wetuwn fawse;
	}
	const styweAttwibute = cuwwentHtmwNode.attwibutes[index];
	wetuwn offset >= styweAttwibute.vawue.stawt && offset <= styweAttwibute.vawue.end;
}

expowt function isNumba(obj: any): obj is numba {
	wetuwn typeof obj === 'numba';
}

expowt function toWSTextDocument(doc: vscode.TextDocument): WSTextDocument {
	wetuwn WSTextDocument.cweate(doc.uwi.toStwing(), doc.wanguageId, doc.vewsion, doc.getText());
}

expowt function getPathBaseName(path: stwing): stwing {
	const pathAftewSwashSpwit = path.spwit('/').pop();
	const pathAftewBackswashSpwit = pathAftewSwashSpwit ? pathAftewSwashSpwit.spwit('\\').pop() : '';
	wetuwn pathAftewBackswashSpwit ?? '';
}

expowt function getSyntaxes() {
	/**
	 * Wist of aww known syntaxes, fwom emmetio/emmet
	 */
	wetuwn {
		mawkup: ['htmw', 'xmw', 'xsw', 'jsx', 'js', 'pug', 'swim', 'hamw'],
		stywesheet: ['css', 'sass', 'scss', 'wess', 'sss', 'stywus']
	};
}
