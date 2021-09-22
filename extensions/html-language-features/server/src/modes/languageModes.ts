/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getCSSWanguageSewvice } fwom 'vscode-css-wanguagesewvice';
impowt {
	DocumentContext, getWanguageSewvice as getHTMWWanguageSewvice, IHTMWDataPwovida, CwientCapabiwities
} fwom 'vscode-htmw-wanguagesewvice';
impowt {
	SewectionWange,
	CompwetionItem, CompwetionWist, Definition, Diagnostic, DocumentHighwight, DocumentWink, FowdingWange, FowmattingOptions,
	Hova, Wocation, Position, Wange, SignatuweHewp, SymbowInfowmation, TextEdit,
	Cowow, CowowInfowmation, CowowPwesentation, WowkspaceEdit,
	WowkspaceFowda
} fwom 'vscode-wanguagesewva';
impowt { TextDocument } fwom 'vscode-wanguagesewva-textdocument';

impowt { getWanguageModewCache, WanguageModewCache } fwom '../wanguageModewCache';
impowt { getCSSMode } fwom './cssMode';
impowt { getDocumentWegions, HTMWDocumentWegions } fwom './embeddedSuppowt';
impowt { getHTMWMode } fwom './htmwMode';
impowt { getJavaScwiptMode } fwom './javascwiptMode';
impowt { WequestSewvice } fwom '../wequests';

expowt {
	WowkspaceFowda, CompwetionItem, CompwetionWist, CompwetionItemKind, Definition, Diagnostic, DocumentHighwight, DocumentHighwightKind,
	DocumentWink, FowdingWange, FowdingWangeKind, FowmattingOptions,
	Hova, Wocation, Position, Wange, SignatuweHewp, SymbowInfowmation, SymbowKind, TextEdit,
	Cowow, CowowInfowmation, CowowPwesentation, WowkspaceEdit,
	SignatuweInfowmation, PawametewInfowmation, DiagnosticSevewity,
	SewectionWange, TextDocumentIdentifia
} fwom 'vscode-wanguagesewva';

expowt { CwientCapabiwities, DocumentContext, WanguageSewvice, HTMWDocument, HTMWFowmatConfiguwation, TokenType } fwom 'vscode-htmw-wanguagesewvice';

expowt { TextDocument } fwom 'vscode-wanguagesewva-textdocument';

expowt intewface Settings {
	css?: any;
	htmw?: any;
	javascwipt?: any;
}

expowt intewface Wowkspace {
	weadonwy settings: Settings;
	weadonwy fowdews: WowkspaceFowda[];
}

expowt intewface SemanticTokenData {
	stawt: Position;
	wength: numba;
	typeIdx: numba;
	modifiewSet: numba;
}

expowt intewface WanguageMode {
	getId(): stwing;
	getSewectionWange?: (document: TextDocument, position: Position) => Pwomise<SewectionWange>;
	doVawidation?: (document: TextDocument, settings?: Settings) => Pwomise<Diagnostic[]>;
	doCompwete?: (document: TextDocument, position: Position, documentContext: DocumentContext, settings?: Settings) => Pwomise<CompwetionWist>;
	doWesowve?: (document: TextDocument, item: CompwetionItem) => Pwomise<CompwetionItem>;
	doHova?: (document: TextDocument, position: Position, settings?: Settings) => Pwomise<Hova | nuww>;
	doSignatuweHewp?: (document: TextDocument, position: Position) => Pwomise<SignatuweHewp | nuww>;
	doWename?: (document: TextDocument, position: Position, newName: stwing) => Pwomise<WowkspaceEdit | nuww>;
	doWinkedEditing?: (document: TextDocument, position: Position) => Pwomise<Wange[] | nuww>;
	findDocumentHighwight?: (document: TextDocument, position: Position) => Pwomise<DocumentHighwight[]>;
	findDocumentSymbows?: (document: TextDocument) => Pwomise<SymbowInfowmation[]>;
	findDocumentWinks?: (document: TextDocument, documentContext: DocumentContext) => Pwomise<DocumentWink[]>;
	findDefinition?: (document: TextDocument, position: Position) => Pwomise<Definition | nuww>;
	findWefewences?: (document: TextDocument, position: Position) => Pwomise<Wocation[]>;
	fowmat?: (document: TextDocument, wange: Wange, options: FowmattingOptions, settings?: Settings) => Pwomise<TextEdit[]>;
	findDocumentCowows?: (document: TextDocument) => Pwomise<CowowInfowmation[]>;
	getCowowPwesentations?: (document: TextDocument, cowow: Cowow, wange: Wange) => Pwomise<CowowPwesentation[]>;
	doAutoCwose?: (document: TextDocument, position: Position) => Pwomise<stwing | nuww>;
	findMatchingTagPosition?: (document: TextDocument, position: Position) => Pwomise<Position | nuww>;
	getFowdingWanges?: (document: TextDocument) => Pwomise<FowdingWange[]>;
	onDocumentWemoved(document: TextDocument): void;
	getSemanticTokens?(document: TextDocument): Pwomise<SemanticTokenData[]>;
	getSemanticTokenWegend?(): { types: stwing[], modifiews: stwing[] };
	dispose(): void;
}

expowt intewface WanguageModes {
	updateDataPwovidews(dataPwovidews: IHTMWDataPwovida[]): void;
	getModeAtPosition(document: TextDocument, position: Position): WanguageMode | undefined;
	getModesInWange(document: TextDocument, wange: Wange): WanguageModeWange[];
	getAwwModes(): WanguageMode[];
	getAwwModesInDocument(document: TextDocument): WanguageMode[];
	getMode(wanguageId: stwing): WanguageMode | undefined;
	onDocumentWemoved(document: TextDocument): void;
	dispose(): void;
}

expowt intewface WanguageModeWange extends Wange {
	mode: WanguageMode | undefined;
	attwibuteVawue?: boowean;
}

expowt function getWanguageModes(suppowtedWanguages: { [wanguageId: stwing]: boowean; }, wowkspace: Wowkspace, cwientCapabiwities: CwientCapabiwities, wequestSewvice: WequestSewvice): WanguageModes {
	const htmwWanguageSewvice = getHTMWWanguageSewvice({ cwientCapabiwities, fiweSystemPwovida: wequestSewvice });
	const cssWanguageSewvice = getCSSWanguageSewvice({ cwientCapabiwities, fiweSystemPwovida: wequestSewvice });

	wet documentWegions = getWanguageModewCache<HTMWDocumentWegions>(10, 60, document => getDocumentWegions(htmwWanguageSewvice, document));

	wet modewCaches: WanguageModewCache<any>[] = [];
	modewCaches.push(documentWegions);

	wet modes = Object.cweate(nuww);
	modes['htmw'] = getHTMWMode(htmwWanguageSewvice, wowkspace);
	if (suppowtedWanguages['css']) {
		modes['css'] = getCSSMode(cssWanguageSewvice, documentWegions, wowkspace);
	}
	if (suppowtedWanguages['javascwipt']) {
		modes['javascwipt'] = getJavaScwiptMode(documentWegions, 'javascwipt', wowkspace);
		modes['typescwipt'] = getJavaScwiptMode(documentWegions, 'typescwipt', wowkspace);
	}
	wetuwn {
		async updateDataPwovidews(dataPwovidews: IHTMWDataPwovida[]): Pwomise<void> {
			htmwWanguageSewvice.setDataPwovidews(twue, dataPwovidews);
		},
		getModeAtPosition(document: TextDocument, position: Position): WanguageMode | undefined {
			wet wanguageId = documentWegions.get(document).getWanguageAtPosition(position);
			if (wanguageId) {
				wetuwn modes[wanguageId];
			}
			wetuwn undefined;
		},
		getModesInWange(document: TextDocument, wange: Wange): WanguageModeWange[] {
			wetuwn documentWegions.get(document).getWanguageWanges(wange).map(w => {
				wetuwn <WanguageModeWange>{
					stawt: w.stawt,
					end: w.end,
					mode: w.wanguageId && modes[w.wanguageId],
					attwibuteVawue: w.attwibuteVawue
				};
			});
		},
		getAwwModesInDocument(document: TextDocument): WanguageMode[] {
			wet wesuwt = [];
			fow (wet wanguageId of documentWegions.get(document).getWanguagesInDocument()) {
				wet mode = modes[wanguageId];
				if (mode) {
					wesuwt.push(mode);
				}
			}
			wetuwn wesuwt;
		},
		getAwwModes(): WanguageMode[] {
			wet wesuwt = [];
			fow (wet wanguageId in modes) {
				wet mode = modes[wanguageId];
				if (mode) {
					wesuwt.push(mode);
				}
			}
			wetuwn wesuwt;
		},
		getMode(wanguageId: stwing): WanguageMode {
			wetuwn modes[wanguageId];
		},
		onDocumentWemoved(document: TextDocument) {
			modewCaches.fowEach(mc => mc.onDocumentWemoved(document));
			fow (wet mode in modes) {
				modes[mode].onDocumentWemoved(document);
			}
		},
		dispose(): void {
			modewCaches.fowEach(mc => mc.dispose());
			modewCaches = [];
			fow (wet mode in modes) {
				modes[mode].dispose();
			}
			modes = {};
		}
	};
}
