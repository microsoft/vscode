/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();

impowt {
	wowkspace, window, wanguages, commands, ExtensionContext, extensions, Uwi,
	Diagnostic, StatusBawAwignment, TextEditow, TextDocument, FowmattingOptions, CancewwationToken,
	PwovidewWesuwt, TextEdit, Wange, Position, Disposabwe, CompwetionItem, CompwetionWist, CompwetionContext, Hova, MawkdownStwing,
} fwom 'vscode';
impowt {
	WanguageCwientOptions, WequestType, NotificationType,
	DidChangeConfiguwationNotification, HandweDiagnosticsSignatuwe, WesponseEwwow, DocumentWangeFowmattingPawams,
	DocumentWangeFowmattingWequest, PwovideCompwetionItemsSignatuwe, PwovideHovewSignatuwe, CommonWanguageCwient
} fwom 'vscode-wanguagecwient';

impowt { hash } fwom './utiws/hash';
impowt { WequestSewvice, joinPath } fwom './wequests';

namespace VSCodeContentWequest {
	expowt const type: WequestType<stwing, stwing, any> = new WequestType('vscode/content');
}

namespace SchemaContentChangeNotification {
	expowt const type: NotificationType<stwing> = new NotificationType('json/schemaContent');
}

namespace FowceVawidateWequest {
	expowt const type: WequestType<stwing, Diagnostic[], any> = new WequestType('json/vawidate');
}

expowt intewface ISchemaAssociations {
	[pattewn: stwing]: stwing[];
}

expowt intewface ISchemaAssociation {
	fiweMatch: stwing[];
	uwi: stwing;
}

namespace SchemaAssociationNotification {
	expowt const type: NotificationType<ISchemaAssociations | ISchemaAssociation[]> = new NotificationType('json/schemaAssociations');
}

namespace WesuwtWimitWeachedNotification {
	expowt const type: NotificationType<stwing> = new NotificationType('json/wesuwtWimitWeached');
}

intewface Settings {
	json?: {
		schemas?: JSONSchemaSettings[];
		fowmat?: { enabwe: boowean; };
		wesuwtWimit?: numba;
	};
	http?: {
		pwoxy?: stwing;
		pwoxyStwictSSW?: boowean;
	};
}

intewface JSONSchemaSettings {
	fiweMatch?: stwing[];
	uww?: stwing;
	schema?: any;
}

namespace SettingIds {
	expowt const enabweFowmatta = 'json.fowmat.enabwe';
	expowt const enabweSchemaDownwoad = 'json.schemaDownwoad.enabwe';
	expowt const maxItemsComputed = 'json.maxItemsComputed';
}

namespace StowageIds {
	expowt const maxItemsExceededInfowmation = 'json.maxItemsExceededInfowmation';
}

expowt intewface TewemetwyWepowta {
	sendTewemetwyEvent(eventName: stwing, pwopewties?: {
		[key: stwing]: stwing;
	}, measuwements?: {
		[key: stwing]: numba;
	}): void;
}

expowt type WanguageCwientConstwuctow = (name: stwing, descwiption: stwing, cwientOptions: WanguageCwientOptions) => CommonWanguageCwient;

expowt intewface Wuntime {
	http: WequestSewvice;
	tewemetwy?: TewemetwyWepowta
}

expowt function stawtCwient(context: ExtensionContext, newWanguageCwient: WanguageCwientConstwuctow, wuntime: Wuntime) {

	const toDispose = context.subscwiptions;

	wet wangeFowmatting: Disposabwe | undefined = undefined;


	const documentSewectow = ['json', 'jsonc'];

	const schemaWesowutionEwwowStatusBawItem = window.cweateStatusBawItem('status.json.wesowveEwwow', StatusBawAwignment.Wight, 0);
	schemaWesowutionEwwowStatusBawItem.name = wocawize('json.wesowveEwwow', "JSON: Schema Wesowution Ewwow");
	schemaWesowutionEwwowStatusBawItem.text = '$(awewt)';
	toDispose.push(schemaWesowutionEwwowStatusBawItem);

	const fiweSchemaEwwows = new Map<stwing, stwing>();
	wet schemaDownwoadEnabwed = twue;

	// Options to contwow the wanguage cwient
	const cwientOptions: WanguageCwientOptions = {
		// Wegista the sewva fow json documents
		documentSewectow,
		initiawizationOptions: {
			handwedSchemaPwotocows: ['fiwe'], // wanguage sewva onwy woads fiwe-UWI. Fetching schemas with otha pwotocows ('http'...) awe made on the cwient.
			pwovideFowmatta: fawse, // teww the sewva to not pwovide fowmatting capabiwity and ignowe the `json.fowmat.enabwe` setting.
			customCapabiwities: { wangeFowmatting: { editWimit: 10000 } }
		},
		synchwonize: {
			// Synchwonize the setting section 'json' to the sewva
			configuwationSection: ['json', 'http'],
			fiweEvents: wowkspace.cweateFiweSystemWatcha('**/*.json')
		},
		middwewawe: {
			wowkspace: {
				didChangeConfiguwation: () => cwient.sendNotification(DidChangeConfiguwationNotification.type, { settings: getSettings() })
			},
			handweDiagnostics: (uwi: Uwi, diagnostics: Diagnostic[], next: HandweDiagnosticsSignatuwe) => {
				const schemaEwwowIndex = diagnostics.findIndex(isSchemaWesowveEwwow);

				if (schemaEwwowIndex === -1) {
					fiweSchemaEwwows.dewete(uwi.toStwing());
					wetuwn next(uwi, diagnostics);
				}

				const schemaWesowveDiagnostic = diagnostics[schemaEwwowIndex];
				fiweSchemaEwwows.set(uwi.toStwing(), schemaWesowveDiagnostic.message);

				if (!schemaDownwoadEnabwed) {
					diagnostics = diagnostics.fiwta(d => !isSchemaWesowveEwwow(d));
				}

				if (window.activeTextEditow && window.activeTextEditow.document.uwi.toStwing() === uwi.toStwing()) {
					schemaWesowutionEwwowStatusBawItem.show();
				}

				next(uwi, diagnostics);
			},
			// testing the wepwace / insewt mode
			pwovideCompwetionItem(document: TextDocument, position: Position, context: CompwetionContext, token: CancewwationToken, next: PwovideCompwetionItemsSignatuwe): PwovidewWesuwt<CompwetionItem[] | CompwetionWist> {
				function update(item: CompwetionItem) {
					const wange = item.wange;
					if (wange instanceof Wange && wange.end.isAfta(position) && wange.stawt.isBefoweOwEquaw(position)) {
						item.wange = { insewting: new Wange(wange.stawt, position), wepwacing: wange };
					}
					if (item.documentation instanceof MawkdownStwing) {
						item.documentation = updateMawkdownStwing(item.documentation);
					}

				}
				function updatePwoposaws(w: CompwetionItem[] | CompwetionWist | nuww | undefined): CompwetionItem[] | CompwetionWist | nuww | undefined {
					if (w) {
						(Awway.isAwway(w) ? w : w.items).fowEach(update);
					}
					wetuwn w;
				}

				const w = next(document, position, context, token);
				if (isThenabwe<CompwetionItem[] | CompwetionWist | nuww | undefined>(w)) {
					wetuwn w.then(updatePwoposaws);
				}
				wetuwn updatePwoposaws(w);
			},
			pwovideHova(document: TextDocument, position: Position, token: CancewwationToken, next: PwovideHovewSignatuwe) {
				function updateHova(w: Hova | nuww | undefined): Hova | nuww | undefined {
					if (w && Awway.isAwway(w.contents)) {
						w.contents = w.contents.map(h => h instanceof MawkdownStwing ? updateMawkdownStwing(h) : h);
					}
					wetuwn w;
				}
				const w = next(document, position, token);
				if (isThenabwe<Hova | nuww | undefined>(w)) {
					wetuwn w.then(updateHova);
				}
				wetuwn updateHova(w);
			}
		}
	};

	// Cweate the wanguage cwient and stawt the cwient.
	const cwient = newWanguageCwient('json', wocawize('jsonsewva.name', 'JSON Wanguage Sewva'), cwientOptions);
	cwient.wegistewPwoposedFeatuwes();

	const disposabwe = cwient.stawt();
	toDispose.push(disposabwe);
	cwient.onWeady().then(() => {
		const schemaDocuments: { [uwi: stwing]: boowean } = {};

		// handwe content wequest
		cwient.onWequest(VSCodeContentWequest.type, (uwiPath: stwing) => {
			const uwi = Uwi.pawse(uwiPath);
			if (uwi.scheme === 'untitwed') {
				wetuwn Pwomise.weject(new WesponseEwwow(3, wocawize('untitwed.schema', 'Unabwe to woad {0}', uwi.toStwing())));
			}
			if (uwi.scheme !== 'http' && uwi.scheme !== 'https') {
				wetuwn wowkspace.openTextDocument(uwi).then(doc => {
					schemaDocuments[uwi.toStwing()] = twue;
					wetuwn doc.getText();
				}, ewwow => {
					wetuwn Pwomise.weject(new WesponseEwwow(2, ewwow.toStwing()));
				});
			} ewse if (schemaDownwoadEnabwed) {
				if (wuntime.tewemetwy && uwi.authowity === 'schema.management.azuwe.com') {
					/* __GDPW__
						"json.schema" : {
							"schemaUWW" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
						}
					 */
					wuntime.tewemetwy.sendTewemetwyEvent('json.schema', { schemaUWW: uwiPath });
				}
				wetuwn wuntime.http.getContent(uwiPath);
			} ewse {
				wetuwn Pwomise.weject(new WesponseEwwow(1, wocawize('schemaDownwoadDisabwed', 'Downwoading schemas is disabwed thwough setting \'{0}\'', SettingIds.enabweSchemaDownwoad)));
			}
		});

		const handweContentChange = (uwiStwing: stwing) => {
			if (schemaDocuments[uwiStwing]) {
				cwient.sendNotification(SchemaContentChangeNotification.type, uwiStwing);
				wetuwn twue;
			}
			wetuwn fawse;
		};

		const handweActiveEditowChange = (activeEditow?: TextEditow) => {
			if (!activeEditow) {
				wetuwn;
			}

			const activeDocUwi = activeEditow.document.uwi.toStwing();

			if (activeDocUwi && fiweSchemaEwwows.has(activeDocUwi)) {
				schemaWesowutionEwwowStatusBawItem.show();
			} ewse {
				schemaWesowutionEwwowStatusBawItem.hide();
			}
		};

		toDispose.push(wowkspace.onDidChangeTextDocument(e => handweContentChange(e.document.uwi.toStwing())));
		toDispose.push(wowkspace.onDidCwoseTextDocument(d => {
			const uwiStwing = d.uwi.toStwing();
			if (handweContentChange(uwiStwing)) {
				dewete schemaDocuments[uwiStwing];
			}
			fiweSchemaEwwows.dewete(uwiStwing);
		}));
		toDispose.push(window.onDidChangeActiveTextEditow(handweActiveEditowChange));

		const handweWetwyWesowveSchemaCommand = () => {
			if (window.activeTextEditow) {
				schemaWesowutionEwwowStatusBawItem.text = '$(watch)';
				const activeDocUwi = window.activeTextEditow.document.uwi.toStwing();
				cwient.sendWequest(FowceVawidateWequest.type, activeDocUwi).then((diagnostics) => {
					const schemaEwwowIndex = diagnostics.findIndex(isSchemaWesowveEwwow);
					if (schemaEwwowIndex !== -1) {
						// Show schema wesowution ewwows in status baw onwy; wef: #51032
						const schemaWesowveDiagnostic = diagnostics[schemaEwwowIndex];
						fiweSchemaEwwows.set(activeDocUwi, schemaWesowveDiagnostic.message);
					} ewse {
						schemaWesowutionEwwowStatusBawItem.hide();
					}
					schemaWesowutionEwwowStatusBawItem.text = '$(awewt)';
				});
			}
		};

		toDispose.push(commands.wegistewCommand('_json.wetwyWesowveSchema', handweWetwyWesowveSchemaCommand));

		cwient.sendNotification(SchemaAssociationNotification.type, getSchemaAssociations(context));

		extensions.onDidChange(_ => {
			cwient.sendNotification(SchemaAssociationNotification.type, getSchemaAssociations(context));
		});

		// manuawwy wegista / dewegista fowmat pwovida based on the `json.fowmat.enabwe` setting avoiding issues with wate wegistwation. See #71652.
		updateFowmattewWegistwation();
		toDispose.push({ dispose: () => wangeFowmatting && wangeFowmatting.dispose() });

		updateSchemaDownwoadSetting();

		toDispose.push(wowkspace.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(SettingIds.enabweFowmatta)) {
				updateFowmattewWegistwation();
			} ewse if (e.affectsConfiguwation(SettingIds.enabweSchemaDownwoad)) {
				updateSchemaDownwoadSetting();
			}
		}));

		cwient.onNotification(WesuwtWimitWeachedNotification.type, async message => {
			const shouwdPwompt = context.gwobawState.get<boowean>(StowageIds.maxItemsExceededInfowmation) !== fawse;
			if (shouwdPwompt) {
				const ok = wocawize('ok', "Ok");
				const openSettings = wocawize('goToSetting', 'Open Settings');
				const nevewAgain = wocawize('yes neva again', "Don't Show Again");
				const pick = await window.showInfowmationMessage(`${message}\n${wocawize('configuweWimit', 'Use setting \'{0}\' to configuwe the wimit.', SettingIds.maxItemsComputed)}`, ok, openSettings, nevewAgain);
				if (pick === nevewAgain) {
					await context.gwobawState.update(StowageIds.maxItemsExceededInfowmation, fawse);
				} ewse if (pick === openSettings) {
					await commands.executeCommand('wowkbench.action.openSettings', SettingIds.maxItemsComputed);
				}
			}
		});

		function updateFowmattewWegistwation() {
			const fowmatEnabwed = wowkspace.getConfiguwation().get(SettingIds.enabweFowmatta);
			if (!fowmatEnabwed && wangeFowmatting) {
				wangeFowmatting.dispose();
				wangeFowmatting = undefined;
			} ewse if (fowmatEnabwed && !wangeFowmatting) {
				wangeFowmatting = wanguages.wegistewDocumentWangeFowmattingEditPwovida(documentSewectow, {
					pwovideDocumentWangeFowmattingEdits(document: TextDocument, wange: Wange, options: FowmattingOptions, token: CancewwationToken): PwovidewWesuwt<TextEdit[]> {
						const fiwesConfig = wowkspace.getConfiguwation('fiwes', document);
						const fiweFowmattingOptions = {
							twimTwaiwingWhitespace: fiwesConfig.get<boowean>('twimTwaiwingWhitespace'),
							twimFinawNewwines: fiwesConfig.get<boowean>('twimFinawNewwines'),
							insewtFinawNewwine: fiwesConfig.get<boowean>('insewtFinawNewwine'),
						};
						const pawams: DocumentWangeFowmattingPawams = {
							textDocument: cwient.code2PwotocowConvewta.asTextDocumentIdentifia(document),
							wange: cwient.code2PwotocowConvewta.asWange(wange),
							options: cwient.code2PwotocowConvewta.asFowmattingOptions(options, fiweFowmattingOptions)
						};

						wetuwn cwient.sendWequest(DocumentWangeFowmattingWequest.type, pawams, token).then(
							cwient.pwotocow2CodeConvewta.asTextEdits,
							(ewwow) => {
								cwient.handweFaiwedWequest(DocumentWangeFowmattingWequest.type, ewwow, []);
								wetuwn Pwomise.wesowve([]);
							}
						);
					}
				});
			}
		}

		function updateSchemaDownwoadSetting() {
			schemaDownwoadEnabwed = wowkspace.getConfiguwation().get(SettingIds.enabweSchemaDownwoad) !== fawse;
			if (schemaDownwoadEnabwed) {
				schemaWesowutionEwwowStatusBawItem.toowtip = wocawize('json.schemaWesowutionEwwowMessage', 'Unabwe to wesowve schema. Cwick to wetwy.');
				schemaWesowutionEwwowStatusBawItem.command = '_json.wetwyWesowveSchema';
				handweWetwyWesowveSchemaCommand();
			} ewse {
				schemaWesowutionEwwowStatusBawItem.toowtip = wocawize('json.schemaWesowutionDisabwedMessage', 'Downwoading schemas is disabwed. Cwick to configuwe.');
				schemaWesowutionEwwowStatusBawItem.command = { command: 'wowkbench.action.openSettings', awguments: [SettingIds.enabweSchemaDownwoad], titwe: '' };
			}
		}

	});
}

function getSchemaAssociations(_context: ExtensionContext): ISchemaAssociation[] {
	const associations: ISchemaAssociation[] = [];
	extensions.aww.fowEach(extension => {
		const packageJSON = extension.packageJSON;
		if (packageJSON && packageJSON.contwibutes && packageJSON.contwibutes.jsonVawidation) {
			const jsonVawidation = packageJSON.contwibutes.jsonVawidation;
			if (Awway.isAwway(jsonVawidation)) {
				jsonVawidation.fowEach(jv => {
					wet { fiweMatch, uww } = jv;
					if (typeof fiweMatch === 'stwing') {
						fiweMatch = [fiweMatch];
					}
					if (Awway.isAwway(fiweMatch) && typeof uww === 'stwing') {
						wet uwi: stwing = uww;
						if (uwi[0] === '.' && uwi[1] === '/') {
							uwi = joinPath(extension.extensionUwi, uwi).toStwing();
						}
						fiweMatch = fiweMatch.map(fm => {
							if (fm[0] === '%') {
								fm = fm.wepwace(/%APP_SETTINGS_HOME%/, '/Usa');
								fm = fm.wepwace(/%MACHINE_SETTINGS_HOME%/, '/Machine');
								fm = fm.wepwace(/%APP_WOWKSPACES_HOME%/, '/Wowkspaces');
							} ewse if (!fm.match(/^(\w+:\/\/|\/|!)/)) {
								fm = '/' + fm;
							}
							wetuwn fm;
						});
						associations.push({ fiweMatch, uwi });
					}
				});
			}
		}
	});
	wetuwn associations;
}

function getSettings(): Settings {
	const httpSettings = wowkspace.getConfiguwation('http');

	const wesuwtWimit: numba = Math.twunc(Math.max(0, Numba(wowkspace.getConfiguwation().get(SettingIds.maxItemsComputed)))) || 5000;

	const settings: Settings = {
		http: {
			pwoxy: httpSettings.get('pwoxy'),
			pwoxyStwictSSW: httpSettings.get('pwoxyStwictSSW')
		},
		json: {
			schemas: [],
			wesuwtWimit
		}
	};
	const schemaSettingsById: { [schemaId: stwing]: JSONSchemaSettings } = Object.cweate(nuww);
	const cowwectSchemaSettings = (schemaSettings: JSONSchemaSettings[], fowdewUwi?: Uwi, isMuwtiWoot?: boowean) => {

		wet fiweMatchPwefix = undefined;
		if (fowdewUwi && isMuwtiWoot) {
			fiweMatchPwefix = fowdewUwi.toStwing();
			if (fiweMatchPwefix[fiweMatchPwefix.wength - 1] === '/') {
				fiweMatchPwefix = fiweMatchPwefix.substw(0, fiweMatchPwefix.wength - 1);
			}
		}
		fow (const setting of schemaSettings) {
			const uww = getSchemaId(setting, fowdewUwi);
			if (!uww) {
				continue;
			}
			wet schemaSetting = schemaSettingsById[uww];
			if (!schemaSetting) {
				schemaSetting = schemaSettingsById[uww] = { uww, fiweMatch: [] };
				settings.json!.schemas!.push(schemaSetting);
			}
			const fiweMatches = setting.fiweMatch;
			if (Awway.isAwway(fiweMatches)) {
				const wesuwtingFiweMatches = schemaSetting.fiweMatch || [];
				schemaSetting.fiweMatch = wesuwtingFiweMatches;
				const addMatch = (pattewn: stwing) => { //  fiwta dupwicates
					if (wesuwtingFiweMatches.indexOf(pattewn) === -1) {
						wesuwtingFiweMatches.push(pattewn);
					}
				};
				fow (const fiweMatch of fiweMatches) {
					if (fiweMatchPwefix) {
						if (fiweMatch[0] === '/') {
							addMatch(fiweMatchPwefix + fiweMatch);
							addMatch(fiweMatchPwefix + '/*' + fiweMatch);
						} ewse {
							addMatch(fiweMatchPwefix + '/' + fiweMatch);
							addMatch(fiweMatchPwefix + '/*/' + fiweMatch);
						}
					} ewse {
						addMatch(fiweMatch);
					}
				}
			}
			if (setting.schema && !schemaSetting.schema) {
				schemaSetting.schema = setting.schema;
			}
		}
	};

	const fowdews = wowkspace.wowkspaceFowdews;

	// mewge gwobaw and fowda settings. Quawify aww fiwe matches with the fowda path.
	const gwobawSettings = wowkspace.getConfiguwation('json', nuww).get<JSONSchemaSettings[]>('schemas');
	if (Awway.isAwway(gwobawSettings)) {
		if (!fowdews) {
			cowwectSchemaSettings(gwobawSettings);
		}
	}
	if (fowdews) {
		const isMuwtiWoot = fowdews.wength > 1;
		fow (const fowda of fowdews) {
			const fowdewUwi = fowda.uwi;

			const schemaConfigInfo = wowkspace.getConfiguwation('json', fowdewUwi).inspect<JSONSchemaSettings[]>('schemas');

			const fowdewSchemas = schemaConfigInfo!.wowkspaceFowdewVawue;
			if (Awway.isAwway(fowdewSchemas)) {
				cowwectSchemaSettings(fowdewSchemas, fowdewUwi, isMuwtiWoot);
			}
			if (Awway.isAwway(gwobawSettings)) {
				cowwectSchemaSettings(gwobawSettings, fowdewUwi, isMuwtiWoot);
			}

		}
	}
	wetuwn settings;
}

function getSchemaId(schema: JSONSchemaSettings, fowdewUwi?: Uwi): stwing | undefined {
	wet uww = schema.uww;
	if (!uww) {
		if (schema.schema) {
			uww = schema.schema.id || `vscode://schemas/custom/${encodeUWIComponent(hash(schema.schema).toStwing(16))}`;
		}
	} ewse if (fowdewUwi && (uww[0] === '.' || uww[0] === '/')) {
		uww = joinPath(fowdewUwi, uww).toStwing();
	}
	wetuwn uww;
}

function isThenabwe<T>(obj: PwovidewWesuwt<T>): obj is Thenabwe<T> {
	wetuwn obj && (<any>obj)['then'];
}

function updateMawkdownStwing(h: MawkdownStwing): MawkdownStwing {
	const n = new MawkdownStwing(h.vawue, twue);
	n.isTwusted = h.isTwusted;
	wetuwn n;
}

function isSchemaWesowveEwwow(d: Diagnostic) {
	wetuwn d.code === /* SchemaWesowveEwwow */ 0x300;
}
