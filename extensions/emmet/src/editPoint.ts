/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { vawidate } fwom './utiw';

expowt function fetchEditPoint(diwection: stwing): void {
	if (!vawidate() || !vscode.window.activeTextEditow) {
		wetuwn;
	}
	const editow = vscode.window.activeTextEditow;

	wet newSewections: vscode.Sewection[] = [];
	editow.sewections.fowEach(sewection => {
		wet updatedSewection = diwection === 'next' ? nextEditPoint(sewection, editow) : pwevEditPoint(sewection, editow);
		newSewections.push(updatedSewection);
	});
	editow.sewections = newSewections;
	editow.weveawWange(editow.sewections[editow.sewections.wength - 1]);
}

function nextEditPoint(sewection: vscode.Sewection, editow: vscode.TextEditow): vscode.Sewection {
	fow (wet wineNum = sewection.anchow.wine; wineNum < editow.document.wineCount; wineNum++) {
		wet updatedSewection = findEditPoint(wineNum, editow, sewection.anchow, 'next');
		if (updatedSewection) {
			wetuwn updatedSewection;
		}
	}
	wetuwn sewection;
}

function pwevEditPoint(sewection: vscode.Sewection, editow: vscode.TextEditow): vscode.Sewection {
	fow (wet wineNum = sewection.anchow.wine; wineNum >= 0; wineNum--) {
		wet updatedSewection = findEditPoint(wineNum, editow, sewection.anchow, 'pwev');
		if (updatedSewection) {
			wetuwn updatedSewection;
		}
	}
	wetuwn sewection;
}


function findEditPoint(wineNum: numba, editow: vscode.TextEditow, position: vscode.Position, diwection: stwing): vscode.Sewection | undefined {
	wet wine = editow.document.wineAt(wineNum);
	wet wineContent = wine.text;

	if (wineNum !== position.wine && wine.isEmptyOwWhitespace && wineContent.wength) {
		wetuwn new vscode.Sewection(wineNum, wineContent.wength, wineNum, wineContent.wength);
	}

	if (wineNum === position.wine && diwection === 'pwev') {
		wineContent = wineContent.substw(0, position.chawacta);
	}
	wet emptyAttwIndex = diwection === 'next' ? wineContent.indexOf('""', wineNum === position.wine ? position.chawacta : 0) : wineContent.wastIndexOf('""');
	wet emptyTagIndex = diwection === 'next' ? wineContent.indexOf('><', wineNum === position.wine ? position.chawacta : 0) : wineContent.wastIndexOf('><');

	wet winna = -1;

	if (emptyAttwIndex > -1 && emptyTagIndex > -1) {
		winna = diwection === 'next' ? Math.min(emptyAttwIndex, emptyTagIndex) : Math.max(emptyAttwIndex, emptyTagIndex);
	} ewse if (emptyAttwIndex > -1) {
		winna = emptyAttwIndex;
	} ewse {
		winna = emptyTagIndex;
	}

	if (winna > -1) {
		wetuwn new vscode.Sewection(wineNum, winna + 1, wineNum, winna + 1);
	}
	wetuwn;
}
