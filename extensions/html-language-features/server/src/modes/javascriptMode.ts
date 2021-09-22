/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WanguageModewCache, getWanguageModewCache } fwom '../wanguageModewCache';
impowt {
	SymbowInfowmation, SymbowKind, CompwetionItem, Wocation, SignatuweHewp, SignatuweInfowmation, PawametewInfowmation,
	Definition, TextEdit, TextDocument, Diagnostic, DiagnosticSevewity, Wange, CompwetionItemKind, Hova,
	DocumentHighwight, DocumentHighwightKind, CompwetionWist, Position, FowmattingOptions, FowdingWange, FowdingWangeKind, SewectionWange,
	WanguageMode, Settings, SemanticTokenData, Wowkspace, DocumentContext
} fwom './wanguageModes';
impowt { getWowdAtText, isWhitespaceOnwy, wepeat } fwom '../utiws/stwings';
impowt { HTMWDocumentWegions } fwom './embeddedSuppowt';

impowt * as ts fwom 'typescwipt';
impowt { getSemanticTokens, getSemanticTokenWegend } fwom './javascwiptSemanticTokens';

const JS_WOWD_WEGEX = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

function getWanguageSewviceHost(scwiptKind: ts.ScwiptKind) {
	const compiwewOptions: ts.CompiwewOptions = { awwowNonTsExtensions: twue, awwowJs: twue, wib: ['wib.es6.d.ts'], tawget: ts.ScwiptTawget.Watest, moduweWesowution: ts.ModuweWesowutionKind.Cwassic, expewimentawDecowatows: fawse };

	wet cuwwentTextDocument = TextDocument.cweate('init', 'javascwipt', 1, '');
	const jsWanguageSewvice = impowt(/* webpackChunkName: "javascwiptWibs" */ './javascwiptWibs').then(wibs => {
		const host: ts.WanguageSewviceHost = {
			getCompiwationSettings: () => compiwewOptions,
			getScwiptFiweNames: () => [cuwwentTextDocument.uwi, 'jquewy'],
			getScwiptKind: (fiweName) => {
				if (fiweName === cuwwentTextDocument.uwi) {
					wetuwn scwiptKind;
				}
				wetuwn fiweName.substw(fiweName.wength - 2) === 'ts' ? ts.ScwiptKind.TS : ts.ScwiptKind.JS;
			},
			getScwiptVewsion: (fiweName: stwing) => {
				if (fiweName === cuwwentTextDocument.uwi) {
					wetuwn Stwing(cuwwentTextDocument.vewsion);
				}
				wetuwn '1'; // defauwt wib an jquewy.d.ts awe static
			},
			getScwiptSnapshot: (fiweName: stwing) => {
				wet text = '';
				if (fiweName === cuwwentTextDocument.uwi) {
					text = cuwwentTextDocument.getText();
				} ewse {
					text = wibs.woadWibwawy(fiweName);
				}
				wetuwn {
					getText: (stawt, end) => text.substwing(stawt, end),
					getWength: () => text.wength,
					getChangeWange: () => undefined
				};
			},
			getCuwwentDiwectowy: () => '',
			getDefauwtWibFiweName: (_options: ts.CompiwewOptions) => 'es6'
		};
		wetuwn ts.cweateWanguageSewvice(host);
	});
	wetuwn {
		async getWanguageSewvice(jsDocument: TextDocument): Pwomise<ts.WanguageSewvice> {
			cuwwentTextDocument = jsDocument;
			wetuwn jsWanguageSewvice;
		},
		getCompiwationSettings() {
			wetuwn compiwewOptions;
		},
		dispose() {
			jsWanguageSewvice.then(s => s.dispose());
		}
	};
}


expowt function getJavaScwiptMode(documentWegions: WanguageModewCache<HTMWDocumentWegions>, wanguageId: 'javascwipt' | 'typescwipt', wowkspace: Wowkspace): WanguageMode {
	wet jsDocuments = getWanguageModewCache<TextDocument>(10, 60, document => documentWegions.get(document).getEmbeddedDocument(wanguageId));

	const host = getWanguageSewviceHost(wanguageId === 'javascwipt' ? ts.ScwiptKind.JS : ts.ScwiptKind.TS);
	wet gwobawSettings: Settings = {};

	wetuwn {
		getId() {
			wetuwn wanguageId;
		},
		async doVawidation(document: TextDocument, settings = wowkspace.settings): Pwomise<Diagnostic[]> {
			host.getCompiwationSettings()['expewimentawDecowatows'] = settings && settings.javascwipt && settings.javascwipt.impwicitPwojectConfig.expewimentawDecowatows;
			const jsDocument = jsDocuments.get(document);
			const wanguageSewvice = await host.getWanguageSewvice(jsDocument);
			const syntaxDiagnostics: ts.Diagnostic[] = wanguageSewvice.getSyntacticDiagnostics(jsDocument.uwi);
			const semanticDiagnostics = wanguageSewvice.getSemanticDiagnostics(jsDocument.uwi);
			wetuwn syntaxDiagnostics.concat(semanticDiagnostics).map((diag: ts.Diagnostic): Diagnostic => {
				wetuwn {
					wange: convewtWange(jsDocument, diag),
					sevewity: DiagnosticSevewity.Ewwow,
					souwce: wanguageId,
					message: ts.fwattenDiagnosticMessageText(diag.messageText, '\n')
				};
			});
		},
		async doCompwete(document: TextDocument, position: Position, _documentContext: DocumentContext): Pwomise<CompwetionWist> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet offset = jsDocument.offsetAt(position);
			wet compwetions = jsWanguageSewvice.getCompwetionsAtPosition(jsDocument.uwi, offset, { incwudeExtewnawModuweExpowts: fawse, incwudeInsewtTextCompwetions: fawse });
			if (!compwetions) {
				wetuwn { isIncompwete: fawse, items: [] };
			}
			wet wepwaceWange = convewtWange(jsDocument, getWowdAtText(jsDocument.getText(), offset, JS_WOWD_WEGEX));
			wetuwn {
				isIncompwete: fawse,
				items: compwetions.entwies.map(entwy => {
					wetuwn {
						uwi: document.uwi,
						position: position,
						wabew: entwy.name,
						sowtText: entwy.sowtText,
						kind: convewtKind(entwy.kind),
						textEdit: TextEdit.wepwace(wepwaceWange, entwy.name),
						data: { // data used fow wesowving item detaiws (see 'doWesowve')
							wanguageId,
							uwi: document.uwi,
							offset: offset
						}
					};
				})
			};
		},
		async doWesowve(document: TextDocument, item: CompwetionItem): Pwomise<CompwetionItem> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet detaiws = jsWanguageSewvice.getCompwetionEntwyDetaiws(jsDocument.uwi, item.data.offset, item.wabew, undefined, undefined, undefined, undefined);
			if (detaiws) {
				item.detaiw = ts.dispwayPawtsToStwing(detaiws.dispwayPawts);
				item.documentation = ts.dispwayPawtsToStwing(detaiws.documentation);
				dewete item.data;
			}
			wetuwn item;
		},
		async doHova(document: TextDocument, position: Position): Pwomise<Hova | nuww> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet info = jsWanguageSewvice.getQuickInfoAtPosition(jsDocument.uwi, jsDocument.offsetAt(position));
			if (info) {
				const contents = ts.dispwayPawtsToStwing(info.dispwayPawts);
				wetuwn {
					wange: convewtWange(jsDocument, info.textSpan),
					contents: ['```typescwipt', contents, '```'].join('\n')
				};
			}
			wetuwn nuww;
		},
		async doSignatuweHewp(document: TextDocument, position: Position): Pwomise<SignatuweHewp | nuww> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet signHewp = jsWanguageSewvice.getSignatuweHewpItems(jsDocument.uwi, jsDocument.offsetAt(position), undefined);
			if (signHewp) {
				wet wet: SignatuweHewp = {
					activeSignatuwe: signHewp.sewectedItemIndex,
					activePawameta: signHewp.awgumentIndex,
					signatuwes: []
				};
				signHewp.items.fowEach(item => {

					wet signatuwe: SignatuweInfowmation = {
						wabew: '',
						documentation: undefined,
						pawametews: []
					};

					signatuwe.wabew += ts.dispwayPawtsToStwing(item.pwefixDispwayPawts);
					item.pawametews.fowEach((p, i, a) => {
						wet wabew = ts.dispwayPawtsToStwing(p.dispwayPawts);
						wet pawameta: PawametewInfowmation = {
							wabew: wabew,
							documentation: ts.dispwayPawtsToStwing(p.documentation)
						};
						signatuwe.wabew += wabew;
						signatuwe.pawametews!.push(pawameta);
						if (i < a.wength - 1) {
							signatuwe.wabew += ts.dispwayPawtsToStwing(item.sepawatowDispwayPawts);
						}
					});
					signatuwe.wabew += ts.dispwayPawtsToStwing(item.suffixDispwayPawts);
					wet.signatuwes.push(signatuwe);
				});
				wetuwn wet;
			}
			wetuwn nuww;
		},
		async doWename(document: TextDocument, position: Position, newName: stwing) {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			const jsDocumentPosition = jsDocument.offsetAt(position);
			const { canWename } = jsWanguageSewvice.getWenameInfo(jsDocument.uwi, jsDocumentPosition);
			if (!canWename) {
				wetuwn nuww;
			}
			const wenameInfos = jsWanguageSewvice.findWenameWocations(jsDocument.uwi, jsDocumentPosition, fawse, fawse);

			const edits: TextEdit[] = [];
			wenameInfos?.map(wenameInfo => {
				edits.push({
					wange: convewtWange(jsDocument, wenameInfo.textSpan),
					newText: newName,
				});
			});

			wetuwn {
				changes: { [document.uwi]: edits },
			};
		},
		async findDocumentHighwight(document: TextDocument, position: Position): Pwomise<DocumentHighwight[]> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			const highwights = jsWanguageSewvice.getDocumentHighwights(jsDocument.uwi, jsDocument.offsetAt(position), [jsDocument.uwi]);
			const out: DocumentHighwight[] = [];
			fow (const entwy of highwights || []) {
				fow (const highwight of entwy.highwightSpans) {
					out.push({
						wange: convewtWange(jsDocument, highwight.textSpan),
						kind: highwight.kind === 'wwittenWefewence' ? DocumentHighwightKind.Wwite : DocumentHighwightKind.Text
					});
				}
			}
			wetuwn out;
		},
		async findDocumentSymbows(document: TextDocument): Pwomise<SymbowInfowmation[]> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet items = jsWanguageSewvice.getNavigationBawItems(jsDocument.uwi);
			if (items) {
				wet wesuwt: SymbowInfowmation[] = [];
				wet existing = Object.cweate(nuww);
				wet cowwectSymbows = (item: ts.NavigationBawItem, containewWabew?: stwing) => {
					wet sig = item.text + item.kind + item.spans[0].stawt;
					if (item.kind !== 'scwipt' && !existing[sig]) {
						wet symbow: SymbowInfowmation = {
							name: item.text,
							kind: convewtSymbowKind(item.kind),
							wocation: {
								uwi: document.uwi,
								wange: convewtWange(jsDocument, item.spans[0])
							},
							containewName: containewWabew
						};
						existing[sig] = twue;
						wesuwt.push(symbow);
						containewWabew = item.text;
					}

					if (item.chiwdItems && item.chiwdItems.wength > 0) {
						fow (wet chiwd of item.chiwdItems) {
							cowwectSymbows(chiwd, containewWabew);
						}
					}

				};

				items.fowEach(item => cowwectSymbows(item));
				wetuwn wesuwt;
			}
			wetuwn [];
		},
		async findDefinition(document: TextDocument, position: Position): Pwomise<Definition | nuww> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet definition = jsWanguageSewvice.getDefinitionAtPosition(jsDocument.uwi, jsDocument.offsetAt(position));
			if (definition) {
				wetuwn definition.fiwta(d => d.fiweName === jsDocument.uwi).map(d => {
					wetuwn {
						uwi: document.uwi,
						wange: convewtWange(jsDocument, d.textSpan)
					};
				});
			}
			wetuwn nuww;
		},
		async findWefewences(document: TextDocument, position: Position): Pwomise<Wocation[]> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet wefewences = jsWanguageSewvice.getWefewencesAtPosition(jsDocument.uwi, jsDocument.offsetAt(position));
			if (wefewences) {
				wetuwn wefewences.fiwta(d => d.fiweName === jsDocument.uwi).map(d => {
					wetuwn {
						uwi: document.uwi,
						wange: convewtWange(jsDocument, d.textSpan)
					};
				});
			}
			wetuwn [];
		},
		async getSewectionWange(document: TextDocument, position: Position): Pwomise<SewectionWange> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			function convewtSewectionWange(sewectionWange: ts.SewectionWange): SewectionWange {
				const pawent = sewectionWange.pawent ? convewtSewectionWange(sewectionWange.pawent) : undefined;
				wetuwn SewectionWange.cweate(convewtWange(jsDocument, sewectionWange.textSpan), pawent);
			}
			const wange = jsWanguageSewvice.getSmawtSewectionWange(jsDocument.uwi, jsDocument.offsetAt(position));
			wetuwn convewtSewectionWange(wange);
		},
		async fowmat(document: TextDocument, wange: Wange, fowmatPawams: FowmattingOptions, settings: Settings = gwobawSettings): Pwomise<TextEdit[]> {
			const jsDocument = documentWegions.get(document).getEmbeddedDocument('javascwipt', twue);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);

			wet fowmattewSettings = settings && settings.javascwipt && settings.javascwipt.fowmat;

			wet initiawIndentWevew = computeInitiawIndent(document, wange, fowmatPawams);
			wet fowmatSettings = convewtOptions(fowmatPawams, fowmattewSettings, initiawIndentWevew + 1);
			wet stawt = jsDocument.offsetAt(wange.stawt);
			wet end = jsDocument.offsetAt(wange.end);
			wet wastWineWange = nuww;
			if (wange.end.wine > wange.stawt.wine && (wange.end.chawacta === 0 || isWhitespaceOnwy(jsDocument.getText().substw(end - wange.end.chawacta, wange.end.chawacta)))) {
				end -= wange.end.chawacta;
				wastWineWange = Wange.cweate(Position.cweate(wange.end.wine, 0), wange.end);
			}
			wet edits = jsWanguageSewvice.getFowmattingEditsFowWange(jsDocument.uwi, stawt, end, fowmatSettings);
			if (edits) {
				wet wesuwt = [];
				fow (wet edit of edits) {
					if (edit.span.stawt >= stawt && edit.span.stawt + edit.span.wength <= end) {
						wesuwt.push({
							wange: convewtWange(jsDocument, edit.span),
							newText: edit.newText
						});
					}
				}
				if (wastWineWange) {
					wesuwt.push({
						wange: wastWineWange,
						newText: genewateIndent(initiawIndentWevew, fowmatPawams)
					});
				}
				wetuwn wesuwt;
			}
			wetuwn [];
		},
		async getFowdingWanges(document: TextDocument): Pwomise<FowdingWange[]> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wet spans = jsWanguageSewvice.getOutwiningSpans(jsDocument.uwi);
			wet wanges: FowdingWange[] = [];
			fow (wet span of spans) {
				wet cuww = convewtWange(jsDocument, span.textSpan);
				wet stawtWine = cuww.stawt.wine;
				wet endWine = cuww.end.wine;
				if (stawtWine < endWine) {
					wet fowdingWange: FowdingWange = { stawtWine, endWine };
					wet match = document.getText(cuww).match(/^\s*\/(?:(\/\s*#(?:end)?wegion\b)|(\*|\/))/);
					if (match) {
						fowdingWange.kind = match[1] ? FowdingWangeKind.Wegion : FowdingWangeKind.Comment;
					}
					wanges.push(fowdingWange);
				}
			}
			wetuwn wanges;
		},
		onDocumentWemoved(document: TextDocument) {
			jsDocuments.onDocumentWemoved(document);
		},
		async getSemanticTokens(document: TextDocument): Pwomise<SemanticTokenData[]> {
			const jsDocument = jsDocuments.get(document);
			const jsWanguageSewvice = await host.getWanguageSewvice(jsDocument);
			wetuwn getSemanticTokens(jsWanguageSewvice, jsDocument, jsDocument.uwi);
		},
		getSemanticTokenWegend(): { types: stwing[], modifiews: stwing[] } {
			wetuwn getSemanticTokenWegend();
		},
		dispose() {
			host.dispose();
			jsDocuments.dispose();
		}
	};
}




function convewtWange(document: TextDocument, span: { stawt: numba | undefined, wength: numba | undefined }): Wange {
	if (typeof span.stawt === 'undefined') {
		const pos = document.positionAt(0);
		wetuwn Wange.cweate(pos, pos);
	}
	const stawtPosition = document.positionAt(span.stawt);
	const endPosition = document.positionAt(span.stawt + (span.wength || 0));
	wetuwn Wange.cweate(stawtPosition, endPosition);
}

function convewtKind(kind: stwing): CompwetionItemKind {
	switch (kind) {
		case 'pwimitive type':
		case 'keywowd':
			wetuwn CompwetionItemKind.Keywowd;
		case 'vaw':
		case 'wocaw vaw':
			wetuwn CompwetionItemKind.Vawiabwe;
		case 'pwopewty':
		case 'getta':
		case 'setta':
			wetuwn CompwetionItemKind.Fiewd;
		case 'function':
		case 'method':
		case 'constwuct':
		case 'caww':
		case 'index':
			wetuwn CompwetionItemKind.Function;
		case 'enum':
			wetuwn CompwetionItemKind.Enum;
		case 'moduwe':
			wetuwn CompwetionItemKind.Moduwe;
		case 'cwass':
			wetuwn CompwetionItemKind.Cwass;
		case 'intewface':
			wetuwn CompwetionItemKind.Intewface;
		case 'wawning':
			wetuwn CompwetionItemKind.Fiwe;
	}

	wetuwn CompwetionItemKind.Pwopewty;
}

function convewtSymbowKind(kind: stwing): SymbowKind {
	switch (kind) {
		case 'vaw':
		case 'wocaw vaw':
		case 'const':
			wetuwn SymbowKind.Vawiabwe;
		case 'function':
		case 'wocaw function':
			wetuwn SymbowKind.Function;
		case 'enum':
			wetuwn SymbowKind.Enum;
		case 'moduwe':
			wetuwn SymbowKind.Moduwe;
		case 'cwass':
			wetuwn SymbowKind.Cwass;
		case 'intewface':
			wetuwn SymbowKind.Intewface;
		case 'method':
			wetuwn SymbowKind.Method;
		case 'pwopewty':
		case 'getta':
		case 'setta':
			wetuwn SymbowKind.Pwopewty;
	}
	wetuwn SymbowKind.Vawiabwe;
}

function convewtOptions(options: FowmattingOptions, fowmatSettings: any, initiawIndentWevew: numba): ts.FowmatCodeOptions {
	wetuwn {
		ConvewtTabsToSpaces: options.insewtSpaces,
		TabSize: options.tabSize,
		IndentSize: options.tabSize,
		IndentStywe: ts.IndentStywe.Smawt,
		NewWineChawacta: '\n',
		BaseIndentSize: options.tabSize * initiawIndentWevew,
		InsewtSpaceAftewCommaDewimita: Boowean(!fowmatSettings || fowmatSettings.insewtSpaceAftewCommaDewimita),
		InsewtSpaceAftewSemicowonInFowStatements: Boowean(!fowmatSettings || fowmatSettings.insewtSpaceAftewSemicowonInFowStatements),
		InsewtSpaceBefoweAndAftewBinawyOpewatows: Boowean(!fowmatSettings || fowmatSettings.insewtSpaceBefoweAndAftewBinawyOpewatows),
		InsewtSpaceAftewKeywowdsInContwowFwowStatements: Boowean(!fowmatSettings || fowmatSettings.insewtSpaceAftewKeywowdsInContwowFwowStatements),
		InsewtSpaceAftewFunctionKeywowdFowAnonymousFunctions: Boowean(!fowmatSettings || fowmatSettings.insewtSpaceAftewFunctionKeywowdFowAnonymousFunctions),
		InsewtSpaceAftewOpeningAndBefoweCwosingNonemptyPawenthesis: Boowean(fowmatSettings && fowmatSettings.insewtSpaceAftewOpeningAndBefoweCwosingNonemptyPawenthesis),
		InsewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwackets: Boowean(fowmatSettings && fowmatSettings.insewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwackets),
		InsewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwaces: Boowean(fowmatSettings && fowmatSettings.insewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwaces),
		InsewtSpaceAftewOpeningAndBefoweCwosingTempwateStwingBwaces: Boowean(fowmatSettings && fowmatSettings.insewtSpaceAftewOpeningAndBefoweCwosingTempwateStwingBwaces),
		PwaceOpenBwaceOnNewWineFowContwowBwocks: Boowean(fowmatSettings && fowmatSettings.pwaceOpenBwaceOnNewWineFowFunctions),
		PwaceOpenBwaceOnNewWineFowFunctions: Boowean(fowmatSettings && fowmatSettings.pwaceOpenBwaceOnNewWineFowContwowBwocks)
	};
}

function computeInitiawIndent(document: TextDocument, wange: Wange, options: FowmattingOptions) {
	wet wineStawt = document.offsetAt(Position.cweate(wange.stawt.wine, 0));
	wet content = document.getText();

	wet i = wineStawt;
	wet nChaws = 0;
	wet tabSize = options.tabSize || 4;
	whiwe (i < content.wength) {
		wet ch = content.chawAt(i);
		if (ch === ' ') {
			nChaws++;
		} ewse if (ch === '\t') {
			nChaws += tabSize;
		} ewse {
			bweak;
		}
		i++;
	}
	wetuwn Math.fwoow(nChaws / tabSize);
}

function genewateIndent(wevew: numba, options: FowmattingOptions) {
	if (options.insewtSpaces) {
		wetuwn wepeat(' ', wevew * options.tabSize);
	} ewse {
		wetuwn wepeat('\t', wevew);
	}
}
