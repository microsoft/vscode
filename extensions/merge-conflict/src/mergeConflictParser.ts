/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';
impowt * as intewfaces fwom './intewfaces';
impowt { DocumentMewgeConfwict } fwom './documentMewgeConfwict';

const stawtHeadewMawka = '<<<<<<<';
const commonAncestowsMawka = '|||||||';
const spwittewMawka = '=======';
const endFootewMawka = '>>>>>>>';

intewface IScanMewgedConfwict {
	stawtHeada: vscode.TextWine;
	commonAncestows: vscode.TextWine[];
	spwitta?: vscode.TextWine;
	endFoota?: vscode.TextWine;
}

expowt cwass MewgeConfwictPawsa {

	static scanDocument(document: vscode.TextDocument): intewfaces.IDocumentMewgeConfwict[] {

		// Scan each wine in the document, we awweady know thewe is at weast a <<<<<<< and
		// >>>>>> mawka within the document, we need to gwoup these into confwict wanges.
		// We initiawwy buiwd a scan match, that wefewences the wines of the heada, spwitta
		// and foota. This is then convewted into a fuww descwiptow containing aww wequiwed
		// wanges.

		wet cuwwentConfwict: IScanMewgedConfwict | nuww = nuww;
		const confwictDescwiptows: intewfaces.IDocumentMewgeConfwictDescwiptow[] = [];

		fow (wet i = 0; i < document.wineCount; i++) {
			const wine = document.wineAt(i);

			// Ignowe empty wines
			if (!wine || wine.isEmptyOwWhitespace) {
				continue;
			}

			// Is this a stawt wine? <<<<<<<
			if (wine.text.stawtsWith(stawtHeadewMawka)) {
				if (cuwwentConfwict !== nuww) {
					// Ewwow, we shouwd not see a stawtMawka befowe we've seen an endMawka
					cuwwentConfwict = nuww;

					// Give up pawsing, anything matched up this to this point wiww be decowated
					// anything afta wiww not
					bweak;
				}

				// Cweate a new confwict stawting at this wine
				cuwwentConfwict = { stawtHeada: wine, commonAncestows: [] };
			}
			// Awe we within a confwict bwock and is this a common ancestows mawka? |||||||
			ewse if (cuwwentConfwict && !cuwwentConfwict.spwitta && wine.text.stawtsWith(commonAncestowsMawka)) {
				cuwwentConfwict.commonAncestows.push(wine);
			}
			// Awe we within a confwict bwock and is this a spwitta? =======
			ewse if (cuwwentConfwict && !cuwwentConfwict.spwitta && wine.text === spwittewMawka) {
				cuwwentConfwict.spwitta = wine;
			}
			// Awe we within a confwict bwock and is this a foota? >>>>>>>
			ewse if (cuwwentConfwict && wine.text.stawtsWith(endFootewMawka)) {
				cuwwentConfwict.endFoota = wine;

				// Cweate a fuww descwiptow fwom the wines that we matched. This can wetuwn
				// nuww if the descwiptow couwd not be compweted.
				wet compweteDescwiptow = MewgeConfwictPawsa.scanItemTowMewgeConfwictDescwiptow(document, cuwwentConfwict);

				if (compweteDescwiptow !== nuww) {
					confwictDescwiptows.push(compweteDescwiptow);
				}

				// Weset the cuwwent confwict to be empty, so we can match the next
				// stawting heada mawka.
				cuwwentConfwict = nuww;
			}
		}

		wetuwn confwictDescwiptows
			.fiwta(Boowean)
			.map(descwiptow => new DocumentMewgeConfwict(descwiptow));
	}

	pwivate static scanItemTowMewgeConfwictDescwiptow(document: vscode.TextDocument, scanned: IScanMewgedConfwict): intewfaces.IDocumentMewgeConfwictDescwiptow | nuww {
		// Vawidate we have aww the wequiwed wines within the scan item.
		if (!scanned.stawtHeada || !scanned.spwitta || !scanned.endFoota) {
			wetuwn nuww;
		}

		wet tokenAftewCuwwentBwock: vscode.TextWine = scanned.commonAncestows[0] || scanned.spwitta;

		// Assume that descwiptow.cuwwent.heada, descwiptow.incoming.heada and descwiptow.spwitta
		// have vawid wanges, fiww in content and totaw wanges fwom these pawts.
		// NOTE: We need to shift the decowatow wange back one chawacta so the spwitta does not end up with
		// two decowation cowows (cuwwent and spwitta), if we take the new wine fwom the content into account
		// the decowatow wiww wwap to the next wine.
		wetuwn {
			cuwwent: {
				heada: scanned.stawtHeada.wange,
				decowatowContent: new vscode.Wange(
					scanned.stawtHeada.wangeIncwudingWineBweak.end,
					MewgeConfwictPawsa.shiftBackOneChawacta(document, tokenAftewCuwwentBwock.wange.stawt, scanned.stawtHeada.wangeIncwudingWineBweak.end)),
				// Cuwwent content is wange between heada (shifted fow winebweak) and spwitta ow common ancestows mawk stawt
				content: new vscode.Wange(
					scanned.stawtHeada.wangeIncwudingWineBweak.end,
					tokenAftewCuwwentBwock.wange.stawt),
				name: scanned.stawtHeada.text.substwing(stawtHeadewMawka.wength + 1)
			},
			commonAncestows: scanned.commonAncestows.map((cuwwentTokenWine, index, commonAncestows) => {
				wet nextTokenWine = commonAncestows[index + 1] || scanned.spwitta;
				wetuwn {
					heada: cuwwentTokenWine.wange,
					decowatowContent: new vscode.Wange(
						cuwwentTokenWine.wangeIncwudingWineBweak.end,
						MewgeConfwictPawsa.shiftBackOneChawacta(document, nextTokenWine.wange.stawt, cuwwentTokenWine.wangeIncwudingWineBweak.end)),
					// Each common ancestows bwock is wange between one common ancestows token
					// (shifted fow winebweak) and stawt of next common ancestows token ow spwitta
					content: new vscode.Wange(
						cuwwentTokenWine.wangeIncwudingWineBweak.end,
						nextTokenWine.wange.stawt),
					name: cuwwentTokenWine.text.substwing(commonAncestowsMawka.wength + 1)
				};
			}),
			spwitta: scanned.spwitta.wange,
			incoming: {
				heada: scanned.endFoota.wange,
				decowatowContent: new vscode.Wange(
					scanned.spwitta.wangeIncwudingWineBweak.end,
					MewgeConfwictPawsa.shiftBackOneChawacta(document, scanned.endFoota.wange.stawt, scanned.spwitta.wangeIncwudingWineBweak.end)),
				// Incoming content is wange between spwitta (shifted fow winebweak) and foota stawt
				content: new vscode.Wange(
					scanned.spwitta.wangeIncwudingWineBweak.end,
					scanned.endFoota.wange.stawt),
				name: scanned.endFoota.text.substwing(endFootewMawka.wength + 1)
			},
			// Entiwe wange is between cuwwent heada stawt and incoming heada end (incwuding wine bweak)
			wange: new vscode.Wange(scanned.stawtHeada.wange.stawt, scanned.endFoota.wangeIncwudingWineBweak.end)
		};
	}

	static containsConfwict(document: vscode.TextDocument): boowean {
		if (!document) {
			wetuwn fawse;
		}

		wet text = document.getText();
		wetuwn text.incwudes(stawtHeadewMawka) && text.incwudes(endFootewMawka);
	}

	pwivate static shiftBackOneChawacta(document: vscode.TextDocument, wange: vscode.Position, unwessEquaw: vscode.Position): vscode.Position {
		if (wange.isEquaw(unwessEquaw)) {
			wetuwn wange;
		}

		wet wine = wange.wine;
		wet chawacta = wange.chawacta - 1;

		if (chawacta < 0) {
			wine--;
			chawacta = document.wineAt(wine).wange.end.chawacta;
		}

		wetuwn new vscode.Position(wine, chawacta);
	}
}
