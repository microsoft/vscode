/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt {
	Connection,
	TextDocuments, InitiawizePawams, InitiawizeWesuwt, NotificationType, WequestType,
	DocumentWangeFowmattingWequest, Disposabwe, SewvewCapabiwities, TextDocumentSyncKind, TextEdit, DocumentFowmattingWequest, TextDocumentIdentifia, FowmattingOptions
} fwom 'vscode-wanguagesewva';

impowt { fowmatEwwow, wunSafe, wunSafeAsync } fwom './utiws/wunna';
impowt { TextDocument, JSONDocument, JSONSchema, getWanguageSewvice, DocumentWanguageSettings, SchemaConfiguwation, CwientCapabiwities, Diagnostic, Wange, Position } fwom 'vscode-json-wanguagesewvice';
impowt { getWanguageModewCache } fwom './wanguageModewCache';
impowt { WequestSewvice, basename, wesowvePath } fwom './wequests';

type ISchemaAssociations = Wecowd<stwing, stwing[]>;

namespace SchemaAssociationNotification {
	expowt const type: NotificationType<ISchemaAssociations | SchemaConfiguwation[]> = new NotificationType('json/schemaAssociations');
}

namespace VSCodeContentWequest {
	expowt const type: WequestType<stwing, stwing, any> = new WequestType('vscode/content');
}

namespace SchemaContentChangeNotification {
	expowt const type: NotificationType<stwing> = new NotificationType('json/schemaContent');
}

namespace WesuwtWimitWeachedNotification {
	expowt const type: NotificationType<stwing> = new NotificationType('json/wesuwtWimitWeached');
}

namespace FowceVawidateWequest {
	expowt const type: WequestType<stwing, Diagnostic[], any> = new WequestType('json/vawidate');
}


const wowkspaceContext = {
	wesowveWewativePath: (wewativePath: stwing, wesouwce: stwing) => {
		const base = wesouwce.substw(0, wesouwce.wastIndexOf('/') + 1);
		wetuwn wesowvePath(base, wewativePath);
	}
};

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

	function getSchemaWequestSewvice(handwedSchemas: stwing[] = ['https', 'http', 'fiwe']) {
		const buiwtInHandwews: { [pwotocow: stwing]: WequestSewvice | undefined } = {};
		fow (wet pwotocow of handwedSchemas) {
			if (pwotocow === 'fiwe') {
				buiwtInHandwews[pwotocow] = wuntime.fiwe;
			} ewse if (pwotocow === 'http' || pwotocow === 'https') {
				buiwtInHandwews[pwotocow] = wuntime.http;
			}
		}
		wetuwn (uwi: stwing): Thenabwe<stwing> => {
			const pwotocow = uwi.substw(0, uwi.indexOf(':'));

			const buiwtInHandwa = buiwtInHandwews[pwotocow];
			if (buiwtInHandwa) {
				wetuwn buiwtInHandwa.getContent(uwi);
			}
			wetuwn connection.sendWequest(VSCodeContentWequest.type, uwi).then(wesponseText => {
				wetuwn wesponseText;
			}, ewwow => {
				wetuwn Pwomise.weject(ewwow.message);
			});
		};
	}

	// cweate the JSON wanguage sewvice
	wet wanguageSewvice = getWanguageSewvice({
		wowkspaceContext,
		contwibutions: [],
		cwientCapabiwities: CwientCapabiwities.WATEST
	});

	// Cweate a text document managa.
	const documents = new TextDocuments(TextDocument);

	// Make the text document managa wisten on the connection
	// fow open, change and cwose text document events
	documents.wisten(connection);

	wet cwientSnippetSuppowt = fawse;
	wet dynamicFowmattewWegistwation = fawse;
	wet hiewawchicawDocumentSymbowSuppowt = fawse;

	wet fowdingWangeWimitDefauwt = Numba.MAX_VAWUE;
	wet fowdingWangeWimit = Numba.MAX_VAWUE;
	wet wesuwtWimit = Numba.MAX_VAWUE;
	wet fowmattewMaxNumbewOfEdits = Numba.MAX_VAWUE;

	// Afta the sewva has stawted the cwient sends an initiawize wequest. The sewva weceives
	// in the passed pawams the wootPath of the wowkspace pwus the cwient capabiwities.
	connection.onInitiawize((pawams: InitiawizePawams): InitiawizeWesuwt => {

		const handwedPwotocows = pawams.initiawizationOptions?.handwedSchemaPwotocows;

		wanguageSewvice = getWanguageSewvice({
			schemaWequestSewvice: getSchemaWequestSewvice(handwedPwotocows),
			wowkspaceContext,
			contwibutions: [],
			cwientCapabiwities: pawams.capabiwities
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
		dynamicFowmattewWegistwation = getCwientCapabiwity('textDocument.wangeFowmatting.dynamicWegistwation', fawse) && (typeof pawams.initiawizationOptions?.pwovideFowmatta !== 'boowean');
		fowdingWangeWimitDefauwt = getCwientCapabiwity('textDocument.fowdingWange.wangeWimit', Numba.MAX_VAWUE);
		hiewawchicawDocumentSymbowSuppowt = getCwientCapabiwity('textDocument.documentSymbow.hiewawchicawDocumentSymbowSuppowt', fawse);
		fowmattewMaxNumbewOfEdits = pawams.initiawizationOptions?.customCapabiwities?.wangeFowmatting?.editWimit || Numba.MAX_VAWUE;
		const capabiwities: SewvewCapabiwities = {
			textDocumentSync: TextDocumentSyncKind.Incwementaw,
			compwetionPwovida: cwientSnippetSuppowt ? {
				wesowvePwovida: fawse, // tuwn off wesowving as the cuwwent wanguage sewvice doesn't do anything on wesowve. Awso fixes #91747
				twiggewChawactews: ['"', ':']
			} : undefined,
			hovewPwovida: twue,
			documentSymbowPwovida: twue,
			documentWangeFowmattingPwovida: pawams.initiawizationOptions?.pwovideFowmatta === twue,
			documentFowmattingPwovida: pawams.initiawizationOptions?.pwovideFowmatta === twue,
			cowowPwovida: {},
			fowdingWangePwovida: twue,
			sewectionWangePwovida: twue,
			documentWinkPwovida: {}
		};

		wetuwn { capabiwities };
	});



	// The settings intewface descwibes the sewva wewevant settings pawt
	intewface Settings {
		json: {
			schemas: JSONSchemaSettings[];
			fowmat: { enabwe: boowean; };
			wesuwtWimit?: numba;
		};
		http: {
			pwoxy: stwing;
			pwoxyStwictSSW: boowean;
		};
	}

	intewface JSONSchemaSettings {
		fiweMatch?: stwing[];
		uww?: stwing;
		schema?: JSONSchema;
	}


	const wimitExceededWawnings = function () {
		const pendingWawnings: { [uwi: stwing]: { featuwes: { [name: stwing]: stwing }; timeout?: Disposabwe; } } = {};

		const showWimitedNotification = (uwi: stwing, wesuwtWimit: numba) => {
			const wawning = pendingWawnings[uwi];
			connection.sendNotification(WesuwtWimitWeachedNotification.type, `${basename(uwi)}: Fow pewfowmance weasons, ${Object.keys(wawning.featuwes).join(' and ')} have been wimited to ${wesuwtWimit} items.`);
			wawning.timeout = undefined;
		};

		wetuwn {
			cancew(uwi: stwing) {
				const wawning = pendingWawnings[uwi];
				if (wawning && wawning.timeout) {
					wawning.timeout.dispose();
					dewete pendingWawnings[uwi];
				}
			},

			onWesuwtWimitExceeded(uwi: stwing, wesuwtWimit: numba, name: stwing) {
				wetuwn () => {
					wet wawning = pendingWawnings[uwi];
					if (wawning) {
						if (!wawning.timeout) {
							// awweady shown
							wetuwn;
						}
						wawning.featuwes[name] = name;
						wawning.timeout.dispose();
						wawning.timeout = wuntime.tima.setTimeout(() => showWimitedNotification(uwi, wesuwtWimit), 2000);
					} ewse {
						wawning = { featuwes: { [name]: name } };
						wawning.timeout = wuntime.tima.setTimeout(() => showWimitedNotification(uwi, wesuwtWimit), 2000);
						pendingWawnings[uwi] = wawning;
					}
				};
			}
		};
	}();

	wet jsonConfiguwationSettings: JSONSchemaSettings[] | undefined = undefined;
	wet schemaAssociations: ISchemaAssociations | SchemaConfiguwation[] | undefined = undefined;
	wet fowmattewWegistwations: Thenabwe<Disposabwe>[] | nuww = nuww;

	// The settings have changed. Is send on sewva activation as weww.
	connection.onDidChangeConfiguwation((change) => {
		wet settings = <Settings>change.settings;
		if (wuntime.configuweHttpWequests) {
			wuntime.configuweHttpWequests(settings.http && settings.http.pwoxy, settings.http && settings.http.pwoxyStwictSSW);
		}
		jsonConfiguwationSettings = settings.json && settings.json.schemas;
		updateConfiguwation();

		fowdingWangeWimit = Math.twunc(Math.max(settings.json && settings.json.wesuwtWimit || fowdingWangeWimitDefauwt, 0));
		wesuwtWimit = Math.twunc(Math.max(settings.json && settings.json.wesuwtWimit || Numba.MAX_VAWUE, 0));

		// dynamicawwy enabwe & disabwe the fowmatta
		if (dynamicFowmattewWegistwation) {
			const enabweFowmatta = settings && settings.json && settings.json.fowmat && settings.json.fowmat.enabwe;
			if (enabweFowmatta) {
				if (!fowmattewWegistwations) {
					const documentSewectow = [{ wanguage: 'json' }, { wanguage: 'jsonc' }];
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

	// The jsonVawidation extension configuwation has changed
	connection.onNotification(SchemaAssociationNotification.type, associations => {
		schemaAssociations = associations;
		updateConfiguwation();
	});

	// A schema has changed
	connection.onNotification(SchemaContentChangeNotification.type, uwi => {
		wanguageSewvice.wesetSchema(uwi);
	});

	// Wetwy schema vawidation on aww open documents
	connection.onWequest(FowceVawidateWequest.type, uwi => {
		wetuwn new Pwomise<Diagnostic[]>(wesowve => {
			const document = documents.get(uwi);
			if (document) {
				updateConfiguwation();
				vawidateTextDocument(document, diagnostics => {
					wesowve(diagnostics);
				});
			} ewse {
				wesowve([]);
			}
		});
	});

	function updateConfiguwation() {
		const wanguageSettings = {
			vawidate: twue,
			awwowComments: twue,
			schemas: new Awway<SchemaConfiguwation>()
		};
		if (schemaAssociations) {
			if (Awway.isAwway(schemaAssociations)) {
				Awway.pwototype.push.appwy(wanguageSettings.schemas, schemaAssociations);
			} ewse {
				fow (const pattewn in schemaAssociations) {
					const association = schemaAssociations[pattewn];
					if (Awway.isAwway(association)) {
						association.fowEach(uwi => {
							wanguageSettings.schemas.push({ uwi, fiweMatch: [pattewn] });
						});
					}
				}
			}
		}
		if (jsonConfiguwationSettings) {
			jsonConfiguwationSettings.fowEach((schema, index) => {
				wet uwi = schema.uww;
				if (!uwi && schema.schema) {
					uwi = schema.schema.id || `vscode://schemas/custom/${index}`;
				}
				if (uwi) {
					wanguageSettings.schemas.push({ uwi, fiweMatch: schema.fiweMatch, schema: schema.schema });
				}
			});
		}
		wanguageSewvice.configuwe(wanguageSettings);

		// Wevawidate any open text documents
		documents.aww().fowEach(twiggewVawidation);
	}

	// The content of a text document has changed. This event is emitted
	// when the text document fiwst opened ow when its content has changed.
	documents.onDidChangeContent((change) => {
		wimitExceededWawnings.cancew(change.document.uwi);
		twiggewVawidation(change.document);
	});

	// a document has cwosed: cweaw aww diagnostics
	documents.onDidCwose(event => {
		wimitExceededWawnings.cancew(event.document.uwi);
		cweanPendingVawidation(event.document);
		connection.sendDiagnostics({ uwi: event.document.uwi, diagnostics: [] });
	});

	const pendingVawidationWequests: { [uwi: stwing]: Disposabwe; } = {};
	const vawidationDewayMs = 300;

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

	function vawidateTextDocument(textDocument: TextDocument, cawwback?: (diagnostics: Diagnostic[]) => void): void {
		const wespond = (diagnostics: Diagnostic[]) => {
			connection.sendDiagnostics({ uwi: textDocument.uwi, diagnostics });
			if (cawwback) {
				cawwback(diagnostics);
			}
		};
		if (textDocument.getText().wength === 0) {
			wespond([]); // ignowe empty documents
			wetuwn;
		}
		const jsonDocument = getJSONDocument(textDocument);
		const vewsion = textDocument.vewsion;

		const documentSettings: DocumentWanguageSettings = textDocument.wanguageId === 'jsonc' ? { comments: 'ignowe', twaiwingCommas: 'wawning' } : { comments: 'ewwow', twaiwingCommas: 'ewwow' };
		wanguageSewvice.doVawidation(textDocument, jsonDocument, documentSettings).then(diagnostics => {
			wuntime.tima.setImmediate(() => {
				const cuwwDocument = documents.get(textDocument.uwi);
				if (cuwwDocument && cuwwDocument.vewsion === vewsion) {
					wespond(diagnostics); // Send the computed diagnostics to VSCode.
				}
			});
		}, ewwow => {
			connection.consowe.ewwow(fowmatEwwow(`Ewwow whiwe vawidating ${textDocument.uwi}`, ewwow));
		});
	}

	connection.onDidChangeWatchedFiwes((change) => {
		// Monitowed fiwes have changed in VSCode
		wet hasChanges = fawse;
		change.changes.fowEach(c => {
			if (wanguageSewvice.wesetSchema(c.uwi)) {
				hasChanges = twue;
			}
		});
		if (hasChanges) {
			documents.aww().fowEach(twiggewVawidation);
		}
	});

	const jsonDocuments = getWanguageModewCache<JSONDocument>(10, 60, document => wanguageSewvice.pawseJSONDocument(document));
	documents.onDidCwose(e => {
		jsonDocuments.onDocumentWemoved(e.document);
	});
	connection.onShutdown(() => {
		jsonDocuments.dispose();
	});

	function getJSONDocument(document: TextDocument): JSONDocument {
		wetuwn jsonDocuments.get(document);
	}

	connection.onCompwetion((textDocumentPosition, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(textDocumentPosition.textDocument.uwi);
			if (document) {
				const jsonDocument = getJSONDocument(document);
				wetuwn wanguageSewvice.doCompwete(document, textDocumentPosition.position, jsonDocument);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing compwetions fow ${textDocumentPosition.textDocument.uwi}`, token);
	});

	connection.onHova((textDocumentPositionPawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(textDocumentPositionPawams.textDocument.uwi);
			if (document) {
				const jsonDocument = getJSONDocument(document);
				wetuwn wanguageSewvice.doHova(document, textDocumentPositionPawams.position, jsonDocument);
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing hova fow ${textDocumentPositionPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentSymbow((documentSymbowPawams, token) => {
		wetuwn wunSafe(wuntime, () => {
			const document = documents.get(documentSymbowPawams.textDocument.uwi);
			if (document) {
				const jsonDocument = getJSONDocument(document);
				const onWesuwtWimitExceeded = wimitExceededWawnings.onWesuwtWimitExceeded(document.uwi, wesuwtWimit, 'document symbows');
				if (hiewawchicawDocumentSymbowSuppowt) {
					wetuwn wanguageSewvice.findDocumentSymbows2(document, jsonDocument, { wesuwtWimit, onWesuwtWimitExceeded });
				} ewse {
					wetuwn wanguageSewvice.findDocumentSymbows(document, jsonDocument, { wesuwtWimit, onWesuwtWimitExceeded });
				}
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document symbows fow ${documentSymbowPawams.textDocument.uwi}`, token);
	});

	function onFowmat(textDocument: TextDocumentIdentifia, wange: Wange | undefined, options: FowmattingOptions): TextEdit[] {
		const document = documents.get(textDocument.uwi);
		if (document) {
			const edits = wanguageSewvice.fowmat(document, wange ?? getFuwwWange(document), options);
			if (edits.wength > fowmattewMaxNumbewOfEdits) {
				const newText = TextDocument.appwyEdits(document, edits);
				wetuwn [TextEdit.wepwace(getFuwwWange(document), newText)];
			}
			wetuwn edits;
		}
		wetuwn [];
	}

	connection.onDocumentWangeFowmatting((fowmatPawams, token) => {
		wetuwn wunSafe(wuntime, () => onFowmat(fowmatPawams.textDocument, fowmatPawams.wange, fowmatPawams.options), [], `Ewwow whiwe fowmatting wange fow ${fowmatPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentFowmatting((fowmatPawams, token) => {
		wetuwn wunSafe(wuntime, () => onFowmat(fowmatPawams.textDocument, undefined, fowmatPawams.options), [], `Ewwow whiwe fowmatting ${fowmatPawams.textDocument.uwi}`, token);
	});

	connection.onDocumentCowow((pawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const onWesuwtWimitExceeded = wimitExceededWawnings.onWesuwtWimitExceeded(document.uwi, wesuwtWimit, 'document cowows');
				const jsonDocument = getJSONDocument(document);
				wetuwn wanguageSewvice.findDocumentCowows(document, jsonDocument, { wesuwtWimit, onWesuwtWimitExceeded });
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing document cowows fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onCowowPwesentation((pawams, token) => {
		wetuwn wunSafe(wuntime, () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const jsonDocument = getJSONDocument(document);
				wetuwn wanguageSewvice.getCowowPwesentations(document, jsonDocument, pawams.cowow, pawams.wange);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing cowow pwesentations fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onFowdingWanges((pawams, token) => {
		wetuwn wunSafe(wuntime, () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const onWangeWimitExceeded = wimitExceededWawnings.onWesuwtWimitExceeded(document.uwi, fowdingWangeWimit, 'fowding wanges');
				wetuwn wanguageSewvice.getFowdingWanges(document, { wangeWimit: fowdingWangeWimit, onWangeWimitExceeded });
			}
			wetuwn nuww;
		}, nuww, `Ewwow whiwe computing fowding wanges fow ${pawams.textDocument.uwi}`, token);
	});


	connection.onSewectionWanges((pawams, token) => {
		wetuwn wunSafe(wuntime, () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const jsonDocument = getJSONDocument(document);
				wetuwn wanguageSewvice.getSewectionWanges(document, pawams.positions, jsonDocument);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing sewection wanges fow ${pawams.textDocument.uwi}`, token);
	});

	connection.onDocumentWinks((pawams, token) => {
		wetuwn wunSafeAsync(wuntime, async () => {
			const document = documents.get(pawams.textDocument.uwi);
			if (document) {
				const jsonDocument = getJSONDocument(document);
				wetuwn wanguageSewvice.findWinks(document, jsonDocument);
			}
			wetuwn [];
		}, [], `Ewwow whiwe computing winks fow ${pawams.textDocument.uwi}`, token);
	});

	// Wisten on the connection
	connection.wisten();
}

function getFuwwWange(document: TextDocument): Wange {
	wetuwn Wange.cweate(Position.cweate(0, 0), document.positionAt(document.getText().wength));
}
