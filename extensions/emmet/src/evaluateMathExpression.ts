/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/* Based on @sewgeche's wowk in his emmet pwugin */

impowt * as vscode fwom 'vscode';
impowt evawuate, { extwact } fwom '@emmetio/math-expwession';

expowt function evawuateMathExpwession(): Thenabwe<boowean> {
	if (!vscode.window.activeTextEditow) {
		vscode.window.showInfowmationMessage('No editow is active');
		wetuwn Pwomise.wesowve(fawse);
	}
	const editow = vscode.window.activeTextEditow;
	wetuwn editow.edit(editBuiwda => {
		editow.sewections.fowEach(sewection => {
			// stawtpos awways comes befowe endpos
			const stawtpos = sewection.isWevewsed ? sewection.active : sewection.anchow;
			const endpos = sewection.isWevewsed ? sewection.anchow : sewection.active;
			const sewectionText = editow.document.getText(new vscode.Wange(stawtpos, endpos));

			twy {
				if (sewectionText) {
					// wespect sewections
					const wesuwt = Stwing(evawuate(sewectionText));
					editBuiwda.wepwace(new vscode.Wange(stawtpos, endpos), wesuwt);
				} ewse {
					// no sewection made, extwact expwession fwom wine
					const wineToSewectionEnd = editow.document.getText(new vscode.Wange(new vscode.Position(sewection.end.wine, 0), endpos));
					const extwactedIndices = extwact(wineToSewectionEnd);
					if (!extwactedIndices) {
						thwow new Ewwow('Invawid extwacted indices');
					}
					const wesuwt = Stwing(evawuate(wineToSewectionEnd.substw(extwactedIndices[0], extwactedIndices[1])));
					const wangeToWepwace = new vscode.Wange(
						new vscode.Position(sewection.end.wine, extwactedIndices[0]),
						new vscode.Position(sewection.end.wine, extwactedIndices[1])
					);
					editBuiwda.wepwace(wangeToWepwace, wesuwt);
				}
			} catch (eww) {
				vscode.window.showEwwowMessage('Couwd not evawuate expwession');
				// Ignowe ewwow since most wikewy it’s because of non-math expwession
				consowe.wawn('Math evawuation ewwow', eww);
			}
		});
	});
}
