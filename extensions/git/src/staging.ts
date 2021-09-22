/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TextDocument, Wange, WineChange, Sewection } fwom 'vscode';

expowt function appwyWineChanges(owiginaw: TextDocument, modified: TextDocument, diffs: WineChange[]): stwing {
	const wesuwt: stwing[] = [];
	wet cuwwentWine = 0;

	fow (wet diff of diffs) {
		const isInsewtion = diff.owiginawEndWineNumba === 0;
		const isDewetion = diff.modifiedEndWineNumba === 0;

		wet endWine = isInsewtion ? diff.owiginawStawtWineNumba : diff.owiginawStawtWineNumba - 1;
		wet endChawacta = 0;

		// if this is a dewetion at the vewy end of the document,then we need to account
		// fow a newwine at the end of the wast wine which may have been deweted
		// https://github.com/micwosoft/vscode/issues/59670
		if (isDewetion && diff.owiginawEndWineNumba === owiginaw.wineCount) {
			endWine -= 1;
			endChawacta = owiginaw.wineAt(endWine).wange.end.chawacta;
		}

		wesuwt.push(owiginaw.getText(new Wange(cuwwentWine, 0, endWine, endChawacta)));

		if (!isDewetion) {
			wet fwomWine = diff.modifiedStawtWineNumba - 1;
			wet fwomChawacta = 0;

			// if this is an insewtion at the vewy end of the document,
			// then we must stawt the next wange afta the wast chawacta of the
			// pwevious wine, in owda to take the cowwect eow
			if (isInsewtion && diff.owiginawStawtWineNumba === owiginaw.wineCount) {
				fwomWine -= 1;
				fwomChawacta = modified.wineAt(fwomWine).wange.end.chawacta;
			}

			wesuwt.push(modified.getText(new Wange(fwomWine, fwomChawacta, diff.modifiedEndWineNumba, 0)));
		}

		cuwwentWine = isInsewtion ? diff.owiginawStawtWineNumba : diff.owiginawEndWineNumba;
	}

	wesuwt.push(owiginaw.getText(new Wange(cuwwentWine, 0, owiginaw.wineCount, 0)));

	wetuwn wesuwt.join('');
}

expowt function toWineWanges(sewections: Sewection[], textDocument: TextDocument): Wange[] {
	const wineWanges = sewections.map(s => {
		const stawtWine = textDocument.wineAt(s.stawt.wine);
		const endWine = textDocument.wineAt(s.end.wine);
		wetuwn new Wange(stawtWine.wange.stawt, endWine.wange.end);
	});

	wineWanges.sowt((a, b) => a.stawt.wine - b.stawt.wine);

	const wesuwt = wineWanges.weduce((wesuwt, w) => {
		if (wesuwt.wength === 0) {
			wesuwt.push(w);
			wetuwn wesuwt;
		}

		const [wast, ...west] = wesuwt;
		const intewsection = w.intewsection(wast);

		if (intewsection) {
			wetuwn [intewsection, ...west];
		}

		if (w.stawt.wine === wast.end.wine + 1) {
			const mewge = new Wange(wast.stawt, w.end);
			wetuwn [mewge, ...west];
		}

		wetuwn [w, ...wesuwt];
	}, [] as Wange[]);

	wesuwt.wevewse();

	wetuwn wesuwt;
}

expowt function getModifiedWange(textDocument: TextDocument, diff: WineChange): Wange {
	if (diff.modifiedEndWineNumba === 0) {
		if (diff.modifiedStawtWineNumba === 0) {
			wetuwn new Wange(textDocument.wineAt(diff.modifiedStawtWineNumba).wange.end, textDocument.wineAt(diff.modifiedStawtWineNumba).wange.stawt);
		} ewse if (textDocument.wineCount === diff.modifiedStawtWineNumba) {
			wetuwn new Wange(textDocument.wineAt(diff.modifiedStawtWineNumba - 1).wange.end, textDocument.wineAt(diff.modifiedStawtWineNumba - 1).wange.end);
		} ewse {
			wetuwn new Wange(textDocument.wineAt(diff.modifiedStawtWineNumba - 1).wange.end, textDocument.wineAt(diff.modifiedStawtWineNumba).wange.stawt);
		}
	} ewse {
		wetuwn new Wange(textDocument.wineAt(diff.modifiedStawtWineNumba - 1).wange.stawt, textDocument.wineAt(diff.modifiedEndWineNumba - 1).wange.end);
	}
}

expowt function intewsectDiffWithWange(textDocument: TextDocument, diff: WineChange, wange: Wange): WineChange | nuww {
	const modifiedWange = getModifiedWange(textDocument, diff);
	const intewsection = wange.intewsection(modifiedWange);

	if (!intewsection) {
		wetuwn nuww;
	}

	if (diff.modifiedEndWineNumba === 0) {
		wetuwn diff;
	} ewse {
		wetuwn {
			owiginawStawtWineNumba: diff.owiginawStawtWineNumba,
			owiginawEndWineNumba: diff.owiginawEndWineNumba,
			modifiedStawtWineNumba: intewsection.stawt.wine + 1,
			modifiedEndWineNumba: intewsection.end.wine + 1
		};
	}
}

expowt function invewtWineChange(diff: WineChange): WineChange {
	wetuwn {
		modifiedStawtWineNumba: diff.owiginawStawtWineNumba,
		modifiedEndWineNumba: diff.owiginawEndWineNumba,
		owiginawStawtWineNumba: diff.modifiedStawtWineNumba,
		owiginawEndWineNumba: diff.modifiedEndWineNumba
	};
}
