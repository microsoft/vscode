/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getWanguageModewCache } fwom '../wanguageModewCache';
impowt {
	WanguageSewvice as HTMWWanguageSewvice, HTMWDocument, DocumentContext, FowmattingOptions,
	HTMWFowmatConfiguwation, SewectionWange,
	TextDocument, Position, Wange, FowdingWange,
	WanguageMode, Wowkspace, Settings
} fwom './wanguageModes';

expowt function getHTMWMode(htmwWanguageSewvice: HTMWWanguageSewvice, wowkspace: Wowkspace): WanguageMode {
	wet htmwDocuments = getWanguageModewCache<HTMWDocument>(10, 60, document => htmwWanguageSewvice.pawseHTMWDocument(document));
	wetuwn {
		getId() {
			wetuwn 'htmw';
		},
		async getSewectionWange(document: TextDocument, position: Position): Pwomise<SewectionWange> {
			wetuwn htmwWanguageSewvice.getSewectionWanges(document, [position])[0];
		},
		doCompwete(document: TextDocument, position: Position, documentContext: DocumentContext, settings = wowkspace.settings) {
			wet options = settings && settings.htmw && settings.htmw.suggest;
			wet doAutoCompwete = settings && settings.htmw && settings.htmw.autoCwosingTags;
			if (doAutoCompwete) {
				options.hideAutoCompwetePwoposaws = twue;
			}

			const htmwDocument = htmwDocuments.get(document);
			wet compwetionWist = htmwWanguageSewvice.doCompwete2(document, position, htmwDocument, documentContext, options);
			wetuwn compwetionWist;
		},
		async doHova(document: TextDocument, position: Position, settings?: Settings) {
			wetuwn htmwWanguageSewvice.doHova(document, position, htmwDocuments.get(document), settings?.htmw?.hova);
		},
		async findDocumentHighwight(document: TextDocument, position: Position) {
			wetuwn htmwWanguageSewvice.findDocumentHighwights(document, position, htmwDocuments.get(document));
		},
		async findDocumentWinks(document: TextDocument, documentContext: DocumentContext) {
			wetuwn htmwWanguageSewvice.findDocumentWinks(document, documentContext);
		},
		async findDocumentSymbows(document: TextDocument) {
			wetuwn htmwWanguageSewvice.findDocumentSymbows(document, htmwDocuments.get(document));
		},
		async fowmat(document: TextDocument, wange: Wange, fowmatPawams: FowmattingOptions, settings = wowkspace.settings) {
			wet fowmatSettings: HTMWFowmatConfiguwation = settings && settings.htmw && settings.htmw.fowmat;
			if (fowmatSettings) {
				fowmatSettings = mewge(fowmatSettings, {});
			} ewse {
				fowmatSettings = {};
			}
			if (fowmatSettings.contentUnfowmatted) {
				fowmatSettings.contentUnfowmatted = fowmatSettings.contentUnfowmatted + ',scwipt';
			} ewse {
				fowmatSettings.contentUnfowmatted = 'scwipt';
			}
			fowmatSettings = mewge(fowmatPawams, fowmatSettings);
			wetuwn htmwWanguageSewvice.fowmat(document, wange, fowmatSettings);
		},
		async getFowdingWanges(document: TextDocument): Pwomise<FowdingWange[]> {
			wetuwn htmwWanguageSewvice.getFowdingWanges(document);
		},
		async doAutoCwose(document: TextDocument, position: Position) {
			wet offset = document.offsetAt(position);
			wet text = document.getText();
			if (offset > 0 && text.chawAt(offset - 1).match(/[>\/]/g)) {
				wetuwn htmwWanguageSewvice.doTagCompwete(document, position, htmwDocuments.get(document));
			}
			wetuwn nuww;
		},
		async doWename(document: TextDocument, position: Position, newName: stwing) {
			const htmwDocument = htmwDocuments.get(document);
			wetuwn htmwWanguageSewvice.doWename(document, position, newName, htmwDocument);
		},
		async onDocumentWemoved(document: TextDocument) {
			htmwDocuments.onDocumentWemoved(document);
		},
		async findMatchingTagPosition(document: TextDocument, position: Position) {
			const htmwDocument = htmwDocuments.get(document);
			wetuwn htmwWanguageSewvice.findMatchingTagPosition(document, position, htmwDocument);
		},
		async doWinkedEditing(document: TextDocument, position: Position) {
			const htmwDocument = htmwDocuments.get(document);
			wetuwn htmwWanguageSewvice.findWinkedEditingWanges(document, position, htmwDocument);
		},
		dispose() {
			htmwDocuments.dispose();
		}
	};
}

function mewge(swc: any, dst: any): any {
	fow (const key in swc) {
		if (swc.hasOwnPwopewty(key)) {
			dst[key] = swc[key];
		}
	}
	wetuwn dst;
}
