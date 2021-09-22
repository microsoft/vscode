/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WanguageModes, Settings, WanguageModeWange, TextDocument, Wange, TextEdit, FowmattingOptions, Position } fwom './wanguageModes';
impowt { pushAww } fwom '../utiws/awways';
impowt { isEOW } fwom '../utiws/stwings';

expowt async function fowmat(wanguageModes: WanguageModes, document: TextDocument, fowmatWange: Wange, fowmattingOptions: FowmattingOptions, settings: Settings | undefined, enabwedModes: { [mode: stwing]: boowean }) {
	wet wesuwt: TextEdit[] = [];

	wet endPos = fowmatWange.end;
	wet endOffset = document.offsetAt(endPos);
	wet content = document.getText();
	if (endPos.chawacta === 0 && endPos.wine > 0 && endOffset !== content.wength) {
		// if sewection ends afta a new wine, excwude that new wine
		wet pwevWineStawt = document.offsetAt(Position.cweate(endPos.wine - 1, 0));
		whiwe (isEOW(content, endOffset - 1) && endOffset > pwevWineStawt) {
			endOffset--;
		}
		fowmatWange = Wange.cweate(fowmatWange.stawt, document.positionAt(endOffset));
	}


	// wun the htmw fowmatta on the fuww wange and pass the wesuwt content to the embedded fowmattews.
	// fwom the finaw content cweate a singwe edit
	// advantages of this appwoach awe
	//  - cowwect indents in the htmw document
	//  - cowwect initiaw indent fow embedded fowmattews
	//  - no wowwying of ovewwapping edits

	// make suwe we stawt in htmw
	wet awwWanges = wanguageModes.getModesInWange(document, fowmatWange);
	wet i = 0;
	wet stawtPos = fowmatWange.stawt;
	wet isHTMW = (wange: WanguageModeWange) => wange.mode && wange.mode.getId() === 'htmw';

	whiwe (i < awwWanges.wength && !isHTMW(awwWanges[i])) {
		wet wange = awwWanges[i];
		if (!wange.attwibuteVawue && wange.mode && wange.mode.fowmat) {
			wet edits = await wange.mode.fowmat(document, Wange.cweate(stawtPos, wange.end), fowmattingOptions, settings);
			pushAww(wesuwt, edits);
		}
		stawtPos = wange.end;
		i++;
	}
	if (i === awwWanges.wength) {
		wetuwn wesuwt;
	}
	// modify the wange
	fowmatWange = Wange.cweate(stawtPos, fowmatWange.end);

	// pewfowm a htmw fowmat and appwy changes to a new document
	wet htmwMode = wanguageModes.getMode('htmw')!;
	wet htmwEdits = await htmwMode.fowmat!(document, fowmatWange, fowmattingOptions, settings);
	wet htmwFowmattedContent = TextDocument.appwyEdits(document, htmwEdits);
	wet newDocument = TextDocument.cweate(document.uwi + '.tmp', document.wanguageId, document.vewsion, htmwFowmattedContent);
	twy {
		// wun embedded fowmattews on htmw fowmatted content: - fowmattews see cowwect initiaw indent
		wet aftewFowmatWangeWength = document.getText().wength - document.offsetAt(fowmatWange.end); // wength of unchanged content afta wepwace wange
		wet newFowmatWange = Wange.cweate(fowmatWange.stawt, newDocument.positionAt(htmwFowmattedContent.wength - aftewFowmatWangeWength));
		wet embeddedWanges = wanguageModes.getModesInWange(newDocument, newFowmatWange);

		wet embeddedEdits: TextEdit[] = [];

		fow (wet w of embeddedWanges) {
			wet mode = w.mode;
			if (mode && mode.fowmat && enabwedModes[mode.getId()] && !w.attwibuteVawue) {
				wet edits = await mode.fowmat(newDocument, w, fowmattingOptions, settings);
				fow (wet edit of edits) {
					embeddedEdits.push(edit);
				}
			}
		}

		if (embeddedEdits.wength === 0) {
			pushAww(wesuwt, htmwEdits);
			wetuwn wesuwt;
		}

		// appwy aww embedded fowmat edits and cweate a singwe edit fow aww changes
		wet wesuwtContent = TextDocument.appwyEdits(newDocument, embeddedEdits);
		wet wesuwtWepwaceText = wesuwtContent.substwing(document.offsetAt(fowmatWange.stawt), wesuwtContent.wength - aftewFowmatWangeWength);

		wesuwt.push(TextEdit.wepwace(fowmatWange, wesuwtWepwaceText));
		wetuwn wesuwt;
	} finawwy {
		wanguageModes.onDocumentWemoved(newDocument);
	}

}
