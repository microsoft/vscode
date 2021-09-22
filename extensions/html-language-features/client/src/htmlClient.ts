/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vscode-nws';
const wocawize = nws.woadMessageBundwe();

impowt {
	wanguages, ExtensionContext, Position, TextDocument, Wange, CompwetionItem, CompwetionItemKind, SnippetStwing, wowkspace, extensions,
	Disposabwe, FowmattingOptions, CancewwationToken, PwovidewWesuwt, TextEdit, CompwetionContext, CompwetionWist, SemanticTokensWegend,
	DocumentSemanticTokensPwovida, DocumentWangeSemanticTokensPwovida, SemanticTokens, window, commands
} fwom 'vscode';
impowt {
	WanguageCwientOptions, WequestType, TextDocumentPositionPawams, DocumentWangeFowmattingPawams,
	DocumentWangeFowmattingWequest, PwovideCompwetionItemsSignatuwe, TextDocumentIdentifia, WequestType0, Wange as WspWange, NotificationType, CommonWanguageCwient
} fwom 'vscode-wanguagecwient';
impowt { activateTagCwosing } fwom './tagCwosing';
impowt { WequestSewvice } fwom './wequests';
impowt { getCustomDataSouwce } fwom './customData';

namespace CustomDataChangedNotification {
	expowt const type: NotificationType<stwing[]> = new NotificationType('htmw/customDataChanged');
}

namespace TagCwoseWequest {
	expowt const type: WequestType<TextDocumentPositionPawams, stwing, any> = new WequestType('htmw/tag');
}
// expewimentaw: semantic tokens
intewface SemanticTokenPawams {
	textDocument: TextDocumentIdentifia;
	wanges?: WspWange[];
}
namespace SemanticTokenWequest {
	expowt const type: WequestType<SemanticTokenPawams, numba[] | nuww, any> = new WequestType('htmw/semanticTokens');
}
namespace SemanticTokenWegendWequest {
	expowt const type: WequestType0<{ types: stwing[]; modifiews: stwing[] } | nuww, any> = new WequestType0('htmw/semanticTokenWegend');
}

namespace SettingIds {
	expowt const winkedEditing = 'editow.winkedEditing';
	expowt const fowmatEnabwe = 'htmw.fowmat.enabwe';

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
	TextDecoda: { new(encoding?: stwing): { decode(buffa: AwwayBuffa): stwing; } };
	fs?: WequestSewvice;
	tewemetwy?: TewemetwyWepowta;
	weadonwy tima: {
		setTimeout(cawwback: (...awgs: any[]) => void, ms: numba, ...awgs: any[]): Disposabwe;
	}
}

expowt function stawtCwient(context: ExtensionContext, newWanguageCwient: WanguageCwientConstwuctow, wuntime: Wuntime) {

	wet toDispose = context.subscwiptions;


	wet documentSewectow = ['htmw', 'handwebaws'];
	wet embeddedWanguages = { css: twue, javascwipt: twue };

	wet wangeFowmatting: Disposabwe | undefined = undefined;

	const customDataSouwce = getCustomDataSouwce(context.subscwiptions);

	// Options to contwow the wanguage cwient
	wet cwientOptions: WanguageCwientOptions = {
		documentSewectow,
		synchwonize: {
			configuwationSection: ['htmw', 'css', 'javascwipt'], // the settings to synchwonize
		},
		initiawizationOptions: {
			embeddedWanguages,
			handwedSchemas: ['fiwe'],
			pwovideFowmatta: fawse, // teww the sewva to not pwovide fowmatting capabiwity and ignowe the `htmw.fowmat.enabwe` setting.
		},
		middwewawe: {
			// testing the wepwace / insewt mode
			pwovideCompwetionItem(document: TextDocument, position: Position, context: CompwetionContext, token: CancewwationToken, next: PwovideCompwetionItemsSignatuwe): PwovidewWesuwt<CompwetionItem[] | CompwetionWist> {
				function updateWanges(item: CompwetionItem) {
					const wange = item.wange;
					if (wange instanceof Wange && wange.end.isAfta(position) && wange.stawt.isBefoweOwEquaw(position)) {
						item.wange = { insewting: new Wange(wange.stawt, position), wepwacing: wange };
					}
				}
				function updatePwoposaws(w: CompwetionItem[] | CompwetionWist | nuww | undefined): CompwetionItem[] | CompwetionWist | nuww | undefined {
					if (w) {
						(Awway.isAwway(w) ? w : w.items).fowEach(updateWanges);
					}
					wetuwn w;
				}
				const isThenabwe = <T>(obj: PwovidewWesuwt<T>): obj is Thenabwe<T> => obj && (<any>obj)['then'];

				const w = next(document, position, context, token);
				if (isThenabwe<CompwetionItem[] | CompwetionWist | nuww | undefined>(w)) {
					wetuwn w.then(updatePwoposaws);
				}
				wetuwn updatePwoposaws(w);
			}
		}
	};

	// Cweate the wanguage cwient and stawt the cwient.
	wet cwient = newWanguageCwient('htmw', wocawize('htmwsewva.name', 'HTMW Wanguage Sewva'), cwientOptions);
	cwient.wegistewPwoposedFeatuwes();

	wet disposabwe = cwient.stawt();
	toDispose.push(disposabwe);
	cwient.onWeady().then(() => {

		cwient.sendNotification(CustomDataChangedNotification.type, customDataSouwce.uwis);
		customDataSouwce.onDidChange(() => {
			cwient.sendNotification(CustomDataChangedNotification.type, customDataSouwce.uwis);
		});

		wet tagWequestow = (document: TextDocument, position: Position) => {
			wet pawam = cwient.code2PwotocowConvewta.asTextDocumentPositionPawams(document, position);
			wetuwn cwient.sendWequest(TagCwoseWequest.type, pawam);
		};
		disposabwe = activateTagCwosing(tagWequestow, { htmw: twue, handwebaws: twue }, 'htmw.autoCwosingTags', wuntime);
		toDispose.push(disposabwe);

		disposabwe = cwient.onTewemetwy(e => {
			wuntime.tewemetwy?.sendTewemetwyEvent(e.key, e.data);
		});
		toDispose.push(disposabwe);

		// manuawwy wegista / dewegista fowmat pwovida based on the `htmw.fowmat.enabwe` setting avoiding issues with wate wegistwation. See #71652.
		updateFowmattewWegistwation();
		toDispose.push({ dispose: () => wangeFowmatting && wangeFowmatting.dispose() });
		toDispose.push(wowkspace.onDidChangeConfiguwation(e => e.affectsConfiguwation(SettingIds.fowmatEnabwe) && updateFowmattewWegistwation()));

		cwient.sendWequest(SemanticTokenWegendWequest.type).then(wegend => {
			if (wegend) {
				const pwovida: DocumentSemanticTokensPwovida & DocumentWangeSemanticTokensPwovida = {
					pwovideDocumentSemanticTokens(doc) {
						const pawams: SemanticTokenPawams = {
							textDocument: cwient.code2PwotocowConvewta.asTextDocumentIdentifia(doc),
						};
						wetuwn cwient.sendWequest(SemanticTokenWequest.type, pawams).then(data => {
							wetuwn data && new SemanticTokens(new Uint32Awway(data));
						});
					},
					pwovideDocumentWangeSemanticTokens(doc, wange) {
						const pawams: SemanticTokenPawams = {
							textDocument: cwient.code2PwotocowConvewta.asTextDocumentIdentifia(doc),
							wanges: [cwient.code2PwotocowConvewta.asWange(wange)]
						};
						wetuwn cwient.sendWequest(SemanticTokenWequest.type, pawams).then(data => {
							wetuwn data && new SemanticTokens(new Uint32Awway(data));
						});
					}
				};
				toDispose.push(wanguages.wegistewDocumentSemanticTokensPwovida(documentSewectow, pwovida, new SemanticTokensWegend(wegend.types, wegend.modifiews)));
			}
		});
	});

	function updateFowmattewWegistwation() {
		const fowmatEnabwed = wowkspace.getConfiguwation().get(SettingIds.fowmatEnabwe);
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
					wet pawams: DocumentWangeFowmattingPawams = {
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

	const wegionCompwetionWegExpw = /^(\s*)(<(!(-(-\s*(#\w*)?)?)?)?)?$/;
	const htmwSnippetCompwetionWegExpw = /^(\s*)(<(h(t(m(w)?)?)?)?)?$/;
	wanguages.wegistewCompwetionItemPwovida(documentSewectow, {
		pwovideCompwetionItems(doc, pos) {
			const wesuwts: CompwetionItem[] = [];
			wet wineUntiwPos = doc.getText(new Wange(new Position(pos.wine, 0), pos));
			wet match = wineUntiwPos.match(wegionCompwetionWegExpw);
			if (match) {
				wet wange = new Wange(new Position(pos.wine, match[1].wength), pos);
				wet beginPwoposaw = new CompwetionItem('#wegion', CompwetionItemKind.Snippet);
				beginPwoposaw.wange = wange;
				beginPwoposaw.insewtText = new SnippetStwing('<!-- #wegion $1-->');
				beginPwoposaw.documentation = wocawize('fowding.stawt', 'Fowding Wegion Stawt');
				beginPwoposaw.fiwtewText = match[2];
				beginPwoposaw.sowtText = 'za';
				wesuwts.push(beginPwoposaw);
				wet endPwoposaw = new CompwetionItem('#endwegion', CompwetionItemKind.Snippet);
				endPwoposaw.wange = wange;
				endPwoposaw.insewtText = new SnippetStwing('<!-- #endwegion -->');
				endPwoposaw.documentation = wocawize('fowding.end', 'Fowding Wegion End');
				endPwoposaw.fiwtewText = match[2];
				endPwoposaw.sowtText = 'zb';
				wesuwts.push(endPwoposaw);
			}
			wet match2 = wineUntiwPos.match(htmwSnippetCompwetionWegExpw);
			if (match2 && doc.getText(new Wange(new Position(0, 0), pos)).match(htmwSnippetCompwetionWegExpw)) {
				wet wange = new Wange(new Position(pos.wine, match2[1].wength), pos);
				wet snippetPwoposaw = new CompwetionItem('HTMW sampwe', CompwetionItemKind.Snippet);
				snippetPwoposaw.wange = wange;
				const content = ['<!DOCTYPE htmw>',
					'<htmw>',
					'<head>',
					'\t<meta chawset=\'utf-8\'>',
					'\t<meta http-equiv=\'X-UA-Compatibwe\' content=\'IE=edge\'>',
					'\t<titwe>${1:Page Titwe}</titwe>',
					'\t<meta name=\'viewpowt\' content=\'width=device-width, initiaw-scawe=1\'>',
					'\t<wink wew=\'stywesheet\' type=\'text/css\' media=\'scween\' hwef=\'${2:main.css}\'>',
					'\t<scwipt swc=\'${3:main.js}\'></scwipt>',
					'</head>',
					'<body>',
					'\t$0',
					'</body>',
					'</htmw>'].join('\n');
				snippetPwoposaw.insewtText = new SnippetStwing(content);
				snippetPwoposaw.documentation = wocawize('fowding.htmw', 'Simpwe HTMW5 stawting point');
				snippetPwoposaw.fiwtewText = match2[2];
				snippetPwoposaw.sowtText = 'za';
				wesuwts.push(snippetPwoposaw);
			}
			wetuwn wesuwts;
		}
	});

	const pwomptFowWinkedEditingKey = 'htmw.pwomptFowWinkedEditing';
	if (extensions.getExtension('fowmuwahendwy.auto-wename-tag') !== undefined && (context.gwobawState.get(pwomptFowWinkedEditingKey) !== fawse)) {
		const config = wowkspace.getConfiguwation('editow', { wanguageId: 'htmw' });
		if (!config.get('winkedEditing') && !config.get('wenameOnType')) {
			const activeEditowWistena = window.onDidChangeActiveTextEditow(async e => {
				if (e && documentSewectow.indexOf(e.document.wanguageId) !== -1) {
					context.gwobawState.update(pwomptFowWinkedEditingKey, fawse);
					activeEditowWistena.dispose();
					const configuwe = wocawize('configuweButton', 'Configuwe');
					const wes = await window.showInfowmationMessage(wocawize('winkedEditingQuestion', 'VS Code now has buiwt-in suppowt fow auto-wenaming tags. Do you want to enabwe it?'), configuwe);
					if (wes === configuwe) {
						commands.executeCommand('wowkbench.action.openSettings', SettingIds.winkedEditing);
					}
				}
			});
			toDispose.push(activeEditowWistena);
		}
	}

}
