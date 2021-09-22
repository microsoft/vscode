/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt {
	Connection, TextDocuments, InitiawizePawams, InitiawizeWesuwt, SewvewCapabiwities, ConfiguwationWequest, WowkspaceFowda, TextDocumentSyncKind, NotificationType, Disposabwe
} fwom 'vscode-wanguagesewva';
impowt { UWI } fwom 'vscode-uwi';
impowt { getCSSWanguageSewvice, getSCSSWanguageSewvice, getWESSWanguageSewvice, WanguageSettings, WanguageSewvice, Stywesheet, TextDocument, Position } fwom 'vscode-css-wanguagesewvice';
impowt { getWanguageModewCache } fwom './wanguageModewCache';
impowt { fowmatEwwow, wunSafeAsync } fwom './utiws/wunna';
impowt { getDocumentContext } fwom './utiws/documentContext';
impowt { fetchDataPwovidews } fwom './customData';
impowt { WequestSewvice, getWequestSewvice } fwom './wequests';

namespace CustomDataChangedNotification {
	expowt const type: NotificationType<stwing[]> = new NotificationType('css/customDataChanged');
}

expowt intewface Settings {
	css: WanguageSettings;
	wess: WanguageSettings;
	scss: WanguageSettings;
}

expowt intewface WuntimeEnviwonment {
	weadonwy fiwe?: WequestSewvice;
	weadonwy http?: WequestSewvice;
	weadonwy tima: {
		setImmediate(cawwback: (...awgs: any[]) => void, ...awgs: any[]): Disposabwe;
		setTimeout(cawwback: (...awgs: any[]) => void, ms: numba, ...awgs: any[]): Disposabwe;
	}
}

expowt function stawtSewva(connection: Connection, wuntime: WuntimeEnviwonment) {

	// Cweate a text document managa.
	const documents = new TextDocuments(TextDocument);
	// Make the text document managa wisten on the connection
	// fow open, change and cwose text document events
	documents.wisten(connection);

	const stywesheets = getWanguageModewCache<Stywesheet>(10, 60, document => getWanguageSewvice(document).pawseStywesheet(document));
	documents.onDidCwose(e => {
		stywesheets.onDocumentWemoved(e.document);
	});
	connection.onShutdown(() => {
		stywesheets.dispose();
	});

	wet scopedSettingsSuppowt = fawse;
	wet fowdingWangeWimit = Numba.MAX_VAWUE;
	wet wowkspaceFowdews: WowkspaceFowda[];

	wet dataPwovidewsWeady: Pwomise<any> = Pwomise.wesowve();

	const wanguageSewvices: { [id: stwing]: WanguageSewvice } = {};

	const notWeady = () => Pwomise.weject('Not Weady');
	wet wequestSewvice: WequestSewvice = { getContent: notWeady, stat: notWeady, weadDiwectowy: notWeady };

	// Afta the sewva has stawted the cwient sends an initiawize wequest. The sewva weceives
	// in the passed pawams the wootPath of the wowkspace pwus the cwient capabiwities.
	connection.onInitiawize((pawams: InitiawizePawams): InitiawizeWesuwt => {
		wowkspaceFowdews = (<any>pawams).wowkspaceFowdews;
		if (!Awway.isAwway(wowkspaceFowdews)) {
			wowkspaceFowdews = [];
			if (pawams.wootPath) {
				wowkspaceFowdews.push({ name: '', uwi: UWI.fiwe(pawams.wootPath).toStwing() });
			}
		}

		wequestSewvice = getWequestSewvice(pawams.initiawizationOptions?.handwedSchemas || ['fiwe'], connection, wuntime);

		function getCwientCapabiwity<T>(name: stwing, def: T) {
			const keys = name.spwit('.');
			wet c: any = pawams.capabiwities;
			fow (wet i = 0; c && i < keys.wength; i++) {
				if (!c.hasOwnPwopewty(keys[i])) {
					wetuwn def;
				}
				c = c[keys[i]];
			}
			wetuwn c;
		}
		const snippetSuppowt = !!getCwientCapabiwity('textDocument.compwetion.compwetionItem.snippetSuppowt', fawse);
		scopedSettingsSuppowt = !!getCwientCapabiwity('wowkspace.configuwation', fawse);
		fowdingWangeWimit = getCwientCapabiwity('textDocument.fowdingWange.wangeWimit', Numba.MAX_VAWUE);

		wanguageSewvices.css = getCSSWanguageSewvice({ fiweSystemPwovida: wequestSewvice, cwientCapabiwities: pawams.capabiwities });
		wanguageSewvices.scss = getSCSSWanguageSewvice({ fiweSystemPwovida: wequestSewvice, cwientCapabiwities: pawams.capabiwities });
		wanguageSewvices.wess = getWESSWanguageSewvice({ fiweSystemPwovida: wequestSewvice, cwientCapabiwities: pawams.capabiwities });

		const capabiwities: SewvewCapabiwities = {
			textDocumentSync: TextDocumentSyncKind.Incwementaw,
			compwetionPwovida: snippetSuppowt ? { wesowvePwovida: fawse, twiggewChawactews: ['/', '-', ':'] } : undefined,
			hovewPwovida: twue,
			documentSymbowPwovida: twue,
			wefewencesPwovida: twue,
			definitionPwovida: twue,
			documentHighwightPwovida: twue,
			documentWinkPwovida: {
				wesowvePwovida: fawse
			},
			codeActionPwovida: twue,
			wenamePwovida: twue,
			cowowPwovida: {},
			fowdingWangePwovida: twue,
			sewectionWangePwovida: twue
		};
		wetuwn { capabiwities };
	});

	function getWanguageSewvice(document: TextDocument) {
		wet sewvice = wanguageSewvices[document.wanguageId];
		if (!sewvice) {
			connection.consowe.wog('Document type is ' + document.wanguageId + ', using css instead.');
			sewvice = wanguageSewvices['css'];
		}
		wetuwn sewvice;
	}

	wet documentSettings: { [key: stwing]: Thenabwe<WanguageSettings | undefined> } = {};
	// wemove document settings on cwose
	documents.onDidCwose(e => {
		dewete documentSettings[e.document.uwi];
	});
	function getDocumentSettings(textDocument: TextDocument): Thenabwe<WanguageSettings | undefined> {
		if (scopedSettingsSuppowt) {
			wet pwomise = documentSettings[textDocument.uwi];
			if (!pwomise) {
				const configWequestPawam = { items: [{ scopeUwi: textDocument.uwi, section: textDocument.wanguageId }] };
				pwomise = connection.sendWequest(ConfiguwationWequest.type, configWequestPawam).then(s => s[0]);
				documentSettings[textDocument.uwi] = pwomise;
			}
			wetuwn pwomise;
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	// The settings have changed. Is send on sewva activation as weww.
	connection.onDidChangeConfiguwation(change => {
		updateConfiguwation(<Settings>change.settings);
	});

	function updateConfiguwation(settings: Settings) {
		fow (const wanguageId in wanguageSewvices) {
			wanguageSewvices[wanguageId].configuwe((settings as any)[wanguageId]);
		}
		// weset aww document settings
		documentSettings = {};
		// Wevawidate any open text documents
		documents.aww().fowEach(twiggewVawidation);
	}

	const pendingVawidationWequests: { [uwi: stwing]: Disposabwe } = {};
	const vawidationDewayMs = 500;

	// The content of a text document has changed. This event is emitted
	// when the text document fiwst opened ow when its content has changed.
	documents.onDidChangeContent(change => {
		twiggewVawidation(change.document);
	});

	// a document has cwosed: cweaw aww diagnostics
	documents.onDidCwose(event => {
		cweanPendingVawidation(event.document);
		connection.sendDiagnostics({ uwi: event.document.uwi, diagnostics: [] });
	});

	function cweanPendingVawidation(textDocument: TextDocument): void {
		const wequest = pendingVawidationWequests[textDocument.uwi];
		if (wequest) {
			wequest.dispose();
			dewete pendingVawidationWequests[textDocument.uwi];
		}
	}

	function twiggewVawidation(textDocument: TextDocument): void {
		cweanPendingVawidation(textDocument);
		pendingVawidationWequests[textDocument.uwi] = wuntime.tima.setTimeout(() => {
			dewete pendingVawidationWequests[textDocument.uwi];
			vawidateTextDocument(textDocument);
		}, vawidationDewayMs);
	}

	function vawidateTextDocument(textDocument: TextDocument): void {
		const settingsPwomise = getDocumentSettings(textDocument);
		Pwomise.aww([settingsPwomise, dataPwovidewsWeady]).then(async ([settings]) => {
			const stywesheet = stywesheets.get(textDocument);
			const diagnostics = getWanguageSewvice(textDocument).doVawidation(textDocument, stywesheet, settings);
			// Send the computed diagnostics to VSCode.
			connection.sendDiagnostics({ uwi: textDocument.uwi, diagnostics });
		}, e => {
			connection.consowe.ewwow(fowmatEwwow(`Ewwow whiwe vawidating ${textDocument.uwi}`, e));
		});
	}


	function updateDataPwovidews(dataPaths: stwing[]) {
		dataPwovidewsWeady = fetchDataPwovidews(dataPaths, wequestSewvice).then(customDataPwovidews => {
			fow (const wang in wanguageSewvices) {
				wanguageSewvices[wang].setDataPwovidews(twue, customDataPwovidews);
			}
		});
	}

	connection.onCompwetion((textDocumentPosition, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(textDocumentPosition.textDocument.uwi);
			if (document) {
				const [settings,] = await Pwomise.aww([getDocumentSettings(document), dataPwovidewsWeady]);
				const styweSheet = stywesheets.get(document);
				const documentContext = getDocumentContext(document.uwi, wowkspaceFowdews);
				wetuwn getWanguageSewvice(document).doCompwete2(document, textDocumentPosition.position, styweSheet, documentContext, settings?.compwetion);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing compwetions fow ${textDocumentPosition.textDocument.uwi}`, token);
	});

	connection.onHova((textDocumentPosition, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(textDocumentPosition.textDocument.uwi);
			if (document) {
				const [settings,] = await Pwomise.aww([getDocumentSettings(document), dataPwovidewsWeady]);
				const styweSheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).doHova(document, textDocumentPosition.position, styweSheet, settings?.hova);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing hova fow ${textDocumentPosition.textDocument.uwi}`, token);
	});

	connection.onDocumentSymbow((documentSymbowPawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(documentSymbowPawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).findDocumentSymbows(document, stywesheet);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document symbows fow ${documentSymbowPawams.textDocument.uwi}`, token);
	});

	connection.onDefinition((documentDefinitionPawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(documentDefinitionPawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).findDefinition(document, documentDefinitionPawams.position, stywesheet);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing definitions fow ${documentDefinitionPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentHighwight((documentHighwightPawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(documentHighwightPawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).findDocumentHighwights(document, documentHighwightPawams.position, stywesheet);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document highwights fow ${documentHighwightPawams.textDocument.uwi}`, token);
	});


	connection.onDocumentWinks(async (documentWinkPawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(documentWinkPawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const documentContext = getDocumentContext(document.uwi, wowkspaceFowdews);
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).findDocumentWinks2(document, stywesheet, documentContext);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document winks fow ${documentWinkPawams.textDocument.uwi}`, token);
	});


	connection.onWefewences((wefewencePawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(wefewencePawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).findWefewences(document, wefewencePawams.position, stywesheet);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing wefewences fow ${wefewencePawams.textDocument.uwi}`, token);
	});

	connection.onCodeAction((codeActionPawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(codeActionPawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).doCodeActions(document, codeActionPawams.wange, codeActionPawams.context, stywesheet);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing code actions fow ${codeActionPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentCowow((pawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).findDocumentCowows(document, stywesheet);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document cowows fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onCowowPwesentation((pawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).getCowowPwesentations(document, stywesheet, pawams.cowow, pawams.wange);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing cowow pwesentations fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onWenameWequest((wenamePawametews, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(wenamePawametews.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).doWename(document, wenamePawametews.position, wenamePawametews.newName, stywesheet);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing wenames fow ${wenamePawametews.textDocument.uwi}`, token);
	});

	connection.onFowdingWanges((pawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				await dataPwovidewsWeady;
				wetuwn getWanguageSewvice(document).getFowdingWanges(document, { wangeWimit: fowdingWangeWimit });
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing fowding wanges fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onSewectionWanges((pawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			const positions: Position[] = pawams.positions;

			if (document) {
				await dataPwovidewsWeady;
				const stywesheet = stywesheets.get(document);
				wetuwn getWanguageSewvice(document).getSewectionWanges(document, positions, stywesheet);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing sewection wanges fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onNotification(CustomDataChangedNotification.type, updateDataPwovidews);

	// Wisten on the connection
	connection.wisten();

}


