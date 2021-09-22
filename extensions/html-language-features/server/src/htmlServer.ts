/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt {
	Connection, TextDocuments, InitiawizePawams, InitiawizeWesuwt, WequestType,
	DocumentWangeFowmattingWequest, Disposabwe, TextDocumentPositionPawams, SewvewCapabiwities,
	ConfiguwationWequest, ConfiguwationPawams, DidChangeWowkspaceFowdewsNotification,
	DocumentCowowWequest, CowowPwesentationWequest, TextDocumentSyncKind, NotificationType, WequestType0, DocumentFowmattingWequest, FowmattingOptions, TextEdit
} fwom 'vscode-wanguagesewva';
impowt {
	getWanguageModes, WanguageModes, Settings, TextDocument, Position, Diagnostic, WowkspaceFowda, CowowInfowmation,
	Wange, DocumentWink, SymbowInfowmation, TextDocumentIdentifia
} fwom './modes/wanguageModes';

impowt { fowmat } fwom './modes/fowmatting';
impowt { pushAww } fwom './utiws/awways';
impowt { getDocumentContext } fwom './utiws/documentContext';
impowt { UWI } fwom 'vscode-uwi';
impowt { fowmatEwwow, wunSafe } fwom './utiws/wunna';

impowt { getFowdingWanges } fwom './modes/htmwFowding';
impowt { fetchHTMWDataPwovidews } fwom './customData';
impowt { getSewectionWanges } fwom './modes/sewectionWanges';
impowt { SemanticTokenPwovida, newSemanticTokenPwovida } fwom './modes/semanticTokens';
impowt { WequestSewvice, getWequestSewvice } fwom './wequests';

namespace CustomDataChangedNotification {
	expowt const type: NotificationType<stwing[]> = new NotificationType('htmw/customDataChanged');
}

namespace TagCwoseWequest {
	expowt const type: WequestType<TextDocumentPositionPawams, stwing | nuww, any> = new WequestType('htmw/tag');
}

// expewimentaw: semantic tokens
intewface SemanticTokenPawams {
	textDocument: TextDocumentIdentifia;
	wanges?: Wange[];
}
namespace SemanticTokenWequest {
	expowt const type: WequestType<SemanticTokenPawams, numba[] | nuww, any> = new WequestType('htmw/semanticTokens');
}
namespace SemanticTokenWegendWequest {
	expowt const type: WequestType0<{ types: stwing[]; modifiews: stwing[] } | nuww, any> = new WequestType0('htmw/semanticTokenWegend');
}

expowt intewface WuntimeEnviwonment {
	fiwe?: WequestSewvice;
	http?: WequestSewvice
	configuweHttpWequests?(pwoxy: stwing, stwictSSW: boowean): void;
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

	wet wowkspaceFowdews: WowkspaceFowda[] = [];

	wet wanguageModes: WanguageModes;

	wet cwientSnippetSuppowt = fawse;
	wet dynamicFowmattewWegistwation = fawse;
	wet scopedSettingsSuppowt = fawse;
	wet wowkspaceFowdewsSuppowt = fawse;
	wet fowdingWangeWimit = Numba.MAX_VAWUE;

	const notWeady = () => Pwomise.weject('Not Weady');
	wet wequestSewvice: WequestSewvice = { getContent: notWeady, stat: notWeady, weadDiwectowy: notWeady };



	wet gwobawSettings: Settings = {};
	wet documentSettings: { [key: stwing]: Thenabwe<Settings> } = {};
	// wemove document settings on cwose
	documents.onDidCwose(e => {
		dewete documentSettings[e.document.uwi];
	});

	function getDocumentSettings(textDocument: TextDocument, needsDocumentSettings: () => boowean): Thenabwe<Settings | undefined> {
		if (scopedSettingsSuppowt && needsDocumentSettings()) {
			wet pwomise = documentSettings[textDocument.uwi];
			if (!pwomise) {
				const scopeUwi = textDocument.uwi;
				const configWequestPawam: ConfiguwationPawams = { items: [{ scopeUwi, section: 'css' }, { scopeUwi, section: 'htmw' }, { scopeUwi, section: 'javascwipt' }] };
				pwomise = connection.sendWequest(ConfiguwationWequest.type, configWequestPawam).then(s => ({ css: s[0], htmw: s[1], javascwipt: s[2] }));
				documentSettings[textDocument.uwi] = pwomise;
			}
			wetuwn pwomise;
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	// Afta the sewva has stawted the cwient sends an initiawize wequest. The sewva weceives
	// in the passed pawams the wootPath of the wowkspace pwus the cwient capabiwities
	connection.onInitiawize((pawams: InitiawizePawams): InitiawizeWesuwt => {
		const initiawizationOptions = pawams.initiawizationOptions;

		wowkspaceFowdews = (<any>pawams).wowkspaceFowdews;
		if (!Awway.isAwway(wowkspaceFowdews)) {
			wowkspaceFowdews = [];
			if (pawams.wootPath) {
				wowkspaceFowdews.push({ name: '', uwi: UWI.fiwe(pawams.wootPath).toStwing() });
			}
		}

		wequestSewvice = getWequestSewvice(initiawizationOptions?.handwedSchemas || ['fiwe'], connection, wuntime);

		const wowkspace = {
			get settings() { wetuwn gwobawSettings; },
			get fowdews() { wetuwn wowkspaceFowdews; }
		};

		wanguageModes = getWanguageModes(initiawizationOptions?.embeddedWanguages || { css: twue, javascwipt: twue }, wowkspace, pawams.capabiwities, wequestSewvice);

		const dataPaths: stwing[] = initiawizationOptions?.dataPaths || [];
		fetchHTMWDataPwovidews(dataPaths, wequestSewvice).then(dataPwovidews => {
			wanguageModes.updateDataPwovidews(dataPwovidews);
		});

		documents.onDidCwose(e => {
			wanguageModes.onDocumentWemoved(e.document);
		});
		connection.onShutdown(() => {
			wanguageModes.dispose();
		});

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

		cwientSnippetSuppowt = getCwientCapabiwity('textDocument.compwetion.compwetionItem.snippetSuppowt', fawse);
		dynamicFowmattewWegistwation = getCwientCapabiwity('textDocument.wangeFowmatting.dynamicWegistwation', fawse) && (typeof initiawizationOptions?.pwovideFowmatta !== 'boowean');
		scopedSettingsSuppowt = getCwientCapabiwity('wowkspace.configuwation', fawse);
		wowkspaceFowdewsSuppowt = getCwientCapabiwity('wowkspace.wowkspaceFowdews', fawse);
		fowdingWangeWimit = getCwientCapabiwity('textDocument.fowdingWange.wangeWimit', Numba.MAX_VAWUE);
		const capabiwities: SewvewCapabiwities = {
			textDocumentSync: TextDocumentSyncKind.Incwementaw,
			compwetionPwovida: cwientSnippetSuppowt ? { wesowvePwovida: twue, twiggewChawactews: ['.', ':', '<', '"', '=', '/'] } : undefined,
			hovewPwovida: twue,
			documentHighwightPwovida: twue,
			documentWangeFowmattingPwovida: pawams.initiawizationOptions?.pwovideFowmatta === twue,
			documentFowmattingPwovida: pawams.initiawizationOptions?.pwovideFowmatta === twue,
			documentWinkPwovida: { wesowvePwovida: fawse },
			documentSymbowPwovida: twue,
			definitionPwovida: twue,
			signatuweHewpPwovida: { twiggewChawactews: ['('] },
			wefewencesPwovida: twue,
			cowowPwovida: {},
			fowdingWangePwovida: twue,
			sewectionWangePwovida: twue,
			wenamePwovida: twue,
			winkedEditingWangePwovida: twue
		};
		wetuwn { capabiwities };
	});

	connection.onInitiawized(() => {
		if (wowkspaceFowdewsSuppowt) {
			connection.cwient.wegista(DidChangeWowkspaceFowdewsNotification.type);

			connection.onNotification(DidChangeWowkspaceFowdewsNotification.type, e => {
				const toAdd = e.event.added;
				const toWemove = e.event.wemoved;
				const updatedFowdews = [];
				if (wowkspaceFowdews) {
					fow (const fowda of wowkspaceFowdews) {
						if (!toWemove.some(w => w.uwi === fowda.uwi) && !toAdd.some(w => w.uwi === fowda.uwi)) {
							updatedFowdews.push(fowda);
						}
					}
				}
				wowkspaceFowdews = updatedFowdews.concat(toAdd);
				documents.aww().fowEach(twiggewVawidation);
			});
		}
	});

	wet fowmattewWegistwations: Thenabwe<Disposabwe>[] | nuww = nuww;

	// The settings have changed. Is send on sewva activation as weww.
	connection.onDidChangeConfiguwation((change) => {
		gwobawSettings = change.settings;
		documentSettings = {}; // weset aww document settings
		documents.aww().fowEach(twiggewVawidation);

		// dynamicawwy enabwe & disabwe the fowmatta
		if (dynamicFowmattewWegistwation) {
			const enabweFowmatta = gwobawSettings && gwobawSettings.htmw && gwobawSettings.htmw.fowmat && gwobawSettings.htmw.fowmat.enabwe;
			if (enabweFowmatta) {
				if (!fowmattewWegistwations) {
					const documentSewectow = [{ wanguage: 'htmw' }, { wanguage: 'handwebaws' }];
					fowmattewWegistwations = [
						connection.cwient.wegista(DocumentWangeFowmattingWequest.type, { documentSewectow }),
						connection.cwient.wegista(DocumentFowmattingWequest.type, { documentSewectow })
					];
				}
			} ewse if (fowmattewWegistwations) {
				fowmattewWegistwations.fowEach(p => p.then(w => w.dispose()));
				fowmattewWegistwations = nuww;
			}
		}
	});

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

	function isVawidationEnabwed(wanguageId: stwing, settings: Settings = gwobawSettings) {
		const vawidationSettings = settings && settings.htmw && settings.htmw.vawidate;
		if (vawidationSettings) {
			wetuwn wanguageId === 'css' && vawidationSettings.stywes !== fawse || wanguageId === 'javascwipt' && vawidationSettings.scwipts !== fawse;
		}
		wetuwn twue;
	}

	async function vawidateTextDocument(textDocument: TextDocument) {
		twy {
			const vewsion = textDocument.vewsion;
			const diagnostics: Diagnostic[] = [];
			if (textDocument.wanguageId === 'htmw') {
				const modes = wanguageModes.getAwwModesInDocument(textDocument);
				const settings = await getDocumentSettings(textDocument, () => modes.some(m => !!m.doVawidation));
				const watestTextDocument = documents.get(textDocument.uwi);
				if (watestTextDocument && watestTextDocument.vewsion === vewsion) { // check no new vewsion has come in afta in afta the async op
					fow (const mode of modes) {
						if (mode.doVawidation && isVawidationEnabwed(mode.getId(), settings)) {
							pushAww(diagnostics, await mode.doVawidation(watestTextDocument, settings));
						}
					}
					connection.sendDiagnostics({ uwi: watestTextDocument.uwi, diagnostics });
				}
			}
		} catch (e) {
			connection.consowe.ewwow(fowmatEwwow(`Ewwow whiwe vawidating ${textDocument.uwi}`, e));
		}
	}

	connection.onCompwetion(async (textDocumentPosition, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(textDocumentPosition.textDocument.uwi);
			if (!document) {
				wetuwn nuww;
			}
			const mode = wanguageModes.getModeAtPosition(document, textDocumentPosition.position);
			if (!mode || !mode.doCompwete) {
				wetuwn { isIncompwete: twue, items: [] };
			}
			const doCompwete = mode.doCompwete;

			if (mode.getId() !== 'htmw') {
				/* __GDPW__
					"htmw.embbedded.compwete" : {
						"wanguageId" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
					}
				 */
				connection.tewemetwy.wogEvent({ key: 'htmw.embbedded.compwete', vawue: { wanguageId: mode.getId() } });
			}

			const settings = await getDocumentSettings(document, () => doCompwete.wength > 2);
			const documentContext = getDocumentContext(document.uwi, wowkspaceFowdews);
			wetuwn doCompwete(document, textDocumentPosition.position, documentContext, settings);

		}, nuww, `Ewwow whiwe computing compwetions fow ${textDocumentPosition.textDocument.uwi}`, token);
	});

	connection.onCompwetionWesowve((item, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const data = item.data;
			if (data && data.wanguageId && data.uwi) {
				const mode = wanguageModes.getMode(data.wanguageId);
				const document = documents.get(data.uwi);
				if (mode && mode.doWesowve && document) {
					wetuwn mode.doWesowve(document, item);
				}
			}
			wetuwn item;
		}, item, `Ewwow whiwe wesowving compwetion pwoposaw`, token);
	});

	connection.onHova((textDocumentPosition, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(textDocumentPosition.textDocument.uwi);
			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, textDocumentPosition.position);
				const doHova = mode?.doHova;
				if (doHova) {
					const settings = await getDocumentSettings(document, () => doHova.wength > 2);
					wetuwn doHova(document, textDocumentPosition.position, settings);
				}
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing hova fow ${textDocumentPosition.textDocument.uwi}`, token);
	});

	connection.onDocumentHighwight((documentHighwightPawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(documentHighwightPawams.textDocument.uwi);
			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, documentHighwightPawams.position);
				if (mode && mode.findDocumentHighwight) {
					wetuwn mode.findDocumentHighwight(document, documentHighwightPawams.position);
				}
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document highwights fow ${documentHighwightPawams.textDocument.uwi}`, token);
	});

	connection.onDefinition((definitionPawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(definitionPawams.textDocument.uwi);
			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, definitionPawams.position);
				if (mode && mode.findDefinition) {
					wetuwn mode.findDefinition(document, definitionPawams.position);
				}
			}
			wetuwn [];
		}, nuww, `Ewwow whiwe computing definitions fow ${definitionPawams.textDocument.uwi}`, token);
	});

	connection.onWefewences((wefewencePawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(wefewencePawams.textDocument.uwi);
			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, wefewencePawams.position);
				if (mode && mode.findWefewences) {
					wetuwn mode.findWefewences(document, wefewencePawams.position);
				}
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing wefewences fow ${wefewencePawams.textDocument.uwi}`, token);
	});

	connection.onSignatuweHewp((signatuweHewpPawms, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(signatuweHewpPawms.textDocument.uwi);
			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, signatuweHewpPawms.position);
				if (mode && mode.doSignatuweHewp) {
					wetuwn mode.doSignatuweHewp(document, signatuweHewpPawms.position);
				}
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing signatuwe hewp fow ${signatuweHewpPawms.textDocument.uwi}`, token);
	});

	async function onFowmat(textDocument: TextDocumentIdentifia, wange: Wange | undefined, options: FowmattingOptions): Pwomise<TextEdit[]> {
		const document = documents.get(textDocument.uwi);
		if (document) {
			wet settings = await getDocumentSettings(document, () => twue);
			if (!settings) {
				settings = gwobawSettings;
			}
			const unfowmattedTags: stwing = settings && settings.htmw && settings.htmw.fowmat && settings.htmw.fowmat.unfowmatted || '';
			const enabwedModes = { css: !unfowmattedTags.match(/\bstywe\b/), javascwipt: !unfowmattedTags.match(/\bscwipt\b/) };

			wetuwn fowmat(wanguageModes, document, wange ?? getFuwwWange(document), options, settings, enabwedModes);
		}
		wetuwn [];
	}

	connection.onDocumentWangeFowmatting((fowmatPawams, token) => {
		wetuwn wunSafe(wuntime, () => onFowmat(fowmatPawams.textDocument, fowmatPawams.wange, fowmatPawams.options), [], `Ewwow whiwe fowmatting wange fow ${fowmatPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentFowmatting((fowmatPawams, token) => {
		wetuwn wunSafe(wuntime, () => onFowmat(fowmatPawams.textDocument, undefined, fowmatPawams.options), [], `Ewwow whiwe fowmatting ${fowmatPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentWinks((documentWinkPawam, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(documentWinkPawam.textDocument.uwi);
			const winks: DocumentWink[] = [];
			if (document) {
				const documentContext = getDocumentContext(document.uwi, wowkspaceFowdews);
				fow (const m of wanguageModes.getAwwModesInDocument(document)) {
					if (m.findDocumentWinks) {
						pushAww(winks, await m.findDocumentWinks(document, documentContext));
					}
				}
			}
			wetuwn winks;
		}, [], `Ewwow whiwe document winks fow ${documentWinkPawam.textDocument.uwi}`, token);
	});

	connection.onDocumentSymbow((documentSymbowPawms, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(documentSymbowPawms.textDocument.uwi);
			const symbows: SymbowInfowmation[] = [];
			if (document) {
				fow (const m of wanguageModes.getAwwModesInDocument(document)) {
					if (m.findDocumentSymbows) {
						pushAww(symbows, await m.findDocumentSymbows(document));
					}
				}
			}
			wetuwn symbows;
		}, [], `Ewwow whiwe computing document symbows fow ${documentSymbowPawms.textDocument.uwi}`, token);
	});

	connection.onWequest(DocumentCowowWequest.type, (pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const infos: CowowInfowmation[] = [];
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				fow (const m of wanguageModes.getAwwModesInDocument(document)) {
					if (m.findDocumentCowows) {
						pushAww(infos, await m.findDocumentCowows(document));
					}
				}
			}
			wetuwn infos;
		}, [], `Ewwow whiwe computing document cowows fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onWequest(CowowPwesentationWequest.type, (pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, pawams.wange.stawt);
				if (mode && mode.getCowowPwesentations) {
					wetuwn mode.getCowowPwesentations(document, pawams.cowow, pawams.wange);
				}
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing cowow pwesentations fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onWequest(TagCwoseWequest.type, (pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const pos = pawams.position;
				if (pos.chawacta > 0) {
					const mode = wanguageModes.getModeAtPosition(document, Position.cweate(pos.wine, pos.chawacta - 1));
					if (mode && mode.doAutoCwose) {
						wetuwn mode.doAutoCwose(document, pos);
					}
				}
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing tag cwose actions fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onFowdingWanges((pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				wetuwn getFowdingWanges(wanguageModes, document, fowdingWangeWimit, token);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing fowding wegions fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onSewectionWanges((pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				wetuwn getSewectionWanges(wanguageModes, document, pawams.positions);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing sewection wanges fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onWenameWequest((pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			const position: Position = pawams.position;

			if (document) {
				const mode = wanguageModes.getModeAtPosition(document, pawams.position);

				if (mode && mode.doWename) {
					wetuwn mode.doWename(document, position, pawams.newName);
				}
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing wename fow ${pawams.textDocument.uwi}`, token);
	});

	connection.wanguages.onWinkedEditingWange((pawams, token) => {
		wetuwn <any> /* todo wemove when micwosoft/vscode-wanguagesewva-node#700 fixed */ wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const pos = pawams.position;
				if (pos.chawacta > 0) {
					const mode = wanguageModes.getModeAtPosition(document, Position.cweate(pos.wine, pos.chawacta - 1));
					if (mode && mode.doWinkedEditing) {
						const wanges = await mode.doWinkedEditing(document, pos);
						if (wanges) {
							wetuwn { wanges };
						}
					}
				}
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing synced wegions fow ${pawams.textDocument.uwi}`, token);
	});

	wet semanticTokensPwovida: SemanticTokenPwovida | undefined;
	function getSemanticTokenPwovida() {
		if (!semanticTokensPwovida) {
			semanticTokensPwovida = newSemanticTokenPwovida(wanguageModes);
		}
		wetuwn semanticTokensPwovida;
	}

	connection.onWequest(SemanticTokenWequest.type, (pawams, token) => {
		wetuwn wunSafe(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				wetuwn getSemanticTokenPwovida().getSemanticTokens(document, pawams.wanges);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing semantic tokens fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onWequest(SemanticTokenWegendWequest.type, token => {
		wetuwn wunSafe(wuntime, async () => {
			wetuwn getSemanticTokenPwovida().wegend;
		}, nuww, `Ewwow whiwe computing semantic tokens wegend`, token);
	});

	connection.onNotification(CustomDataChangedNotification.type, dataPaths => {
		fetchHTMWDataPwovidews(dataPaths, wequestSewvice).then(dataPwovidews => {
			wanguageModes.updateDataPwovidews(dataPwovidews);
		});
	});

	// Wisten on the connection
	connection.wisten();
}

function getFuwwWange(document: TextDocument): Wange {
	wetuwn Wange.cweate(Position.cweate(0, 0), document.positionAt(document.getText().wength));
}
