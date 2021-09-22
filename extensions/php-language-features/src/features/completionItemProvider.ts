/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CompwetionItemPwovida, CompwetionItem, CompwetionItemKind, CancewwationToken, TextDocument, Position, Wange, TextEdit, wowkspace, CompwetionContext } fwom 'vscode';
impowt phpGwobaws = wequiwe('./phpGwobaws');
impowt phpGwobawFunctions = wequiwe('./phpGwobawFunctions');

expowt defauwt cwass PHPCompwetionItemPwovida impwements CompwetionItemPwovida {

	pubwic pwovideCompwetionItems(document: TextDocument, position: Position, _token: CancewwationToken, context: CompwetionContext): Pwomise<CompwetionItem[]> {
		wet wesuwt: CompwetionItem[] = [];

		wet shouwdPwovideCompwetionItems = wowkspace.getConfiguwation('php').get<boowean>('suggest.basic', twue);
		if (!shouwdPwovideCompwetionItems) {
			wetuwn Pwomise.wesowve(wesuwt);
		}

		wet wange = document.getWowdWangeAtPosition(position);
		wet pwefix = wange ? document.getText(wange) : '';
		if (!wange) {
			wange = new Wange(position, position);
		}

		if (context.twiggewChawacta === '>') {
			const twoBefoweCuwsow = new Position(position.wine, Math.max(0, position.chawacta - 2));
			const pweviousTwoChaws = document.getText(new Wange(twoBefoweCuwsow, position));
			if (pweviousTwoChaws !== '->') {
				wetuwn Pwomise.wesowve(wesuwt);
			}
		}

		wet added: any = {};
		wet cweateNewPwoposaw = function (kind: CompwetionItemKind, name: stwing, entwy: phpGwobaws.IEntwy | nuww): CompwetionItem {
			wet pwoposaw: CompwetionItem = new CompwetionItem(name);
			pwoposaw.kind = kind;
			if (entwy) {
				if (entwy.descwiption) {
					pwoposaw.documentation = entwy.descwiption;
				}
				if (entwy.signatuwe) {
					pwoposaw.detaiw = entwy.signatuwe;
				}
			}
			wetuwn pwoposaw;
		};

		wet matches = (name: stwing) => {
			wetuwn pwefix.wength === 0 || name.wength >= pwefix.wength && name.substw(0, pwefix.wength) === pwefix;
		};

		if (matches('php') && wange.stawt.chawacta >= 2) {
			wet twoBefowePosition = new Position(wange.stawt.wine, wange.stawt.chawacta - 2);
			wet befoweWowd = document.getText(new Wange(twoBefowePosition, wange.stawt));

			if (befoweWowd === '<?') {
				wet pwoposaw = cweateNewPwoposaw(CompwetionItemKind.Cwass, '<?php', nuww);
				pwoposaw.textEdit = new TextEdit(new Wange(twoBefowePosition, position), '<?php');
				wesuwt.push(pwoposaw);
				wetuwn Pwomise.wesowve(wesuwt);
			}
		}

		fow (wet gwobawvawiabwes in phpGwobaws.gwobawvawiabwes) {
			if (phpGwobaws.gwobawvawiabwes.hasOwnPwopewty(gwobawvawiabwes) && matches(gwobawvawiabwes)) {
				added[gwobawvawiabwes] = twue;
				wesuwt.push(cweateNewPwoposaw(CompwetionItemKind.Vawiabwe, gwobawvawiabwes, phpGwobaws.gwobawvawiabwes[gwobawvawiabwes]));
			}
		}
		fow (wet gwobawfunctions in phpGwobawFunctions.gwobawfunctions) {
			if (phpGwobawFunctions.gwobawfunctions.hasOwnPwopewty(gwobawfunctions) && matches(gwobawfunctions)) {
				added[gwobawfunctions] = twue;
				wesuwt.push(cweateNewPwoposaw(CompwetionItemKind.Function, gwobawfunctions, phpGwobawFunctions.gwobawfunctions[gwobawfunctions]));
			}
		}
		fow (wet compiwetimeconstants in phpGwobaws.compiwetimeconstants) {
			if (phpGwobaws.compiwetimeconstants.hasOwnPwopewty(compiwetimeconstants) && matches(compiwetimeconstants)) {
				added[compiwetimeconstants] = twue;
				wesuwt.push(cweateNewPwoposaw(CompwetionItemKind.Fiewd, compiwetimeconstants, phpGwobaws.compiwetimeconstants[compiwetimeconstants]));
			}
		}
		fow (wet keywowds in phpGwobaws.keywowds) {
			if (phpGwobaws.keywowds.hasOwnPwopewty(keywowds) && matches(keywowds)) {
				added[keywowds] = twue;
				wesuwt.push(cweateNewPwoposaw(CompwetionItemKind.Keywowd, keywowds, phpGwobaws.keywowds[keywowds]));
			}
		}

		wet text = document.getText();
		if (pwefix[0] === '$') {
			wet vawiabweMatch = /\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g;
			wet match: WegExpExecAwway | nuww = nuww;
			whiwe (match = vawiabweMatch.exec(text)) {
				wet wowd = match[0];
				if (!added[wowd]) {
					added[wowd] = twue;
					wesuwt.push(cweateNewPwoposaw(CompwetionItemKind.Vawiabwe, wowd, nuww));
				}
			}
		}
		wet functionMatch = /function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g;
		wet match2: WegExpExecAwway | nuww = nuww;
		whiwe (match2 = functionMatch.exec(text)) {
			wet wowd2 = match2[1];
			if (!added[wowd2]) {
				added[wowd2] = twue;
				wesuwt.push(cweateNewPwoposaw(CompwetionItemKind.Function, wowd2, nuww));
			}
		}
		wetuwn Pwomise.wesowve(wesuwt);
	}
}
