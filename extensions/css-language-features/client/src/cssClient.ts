/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { commands, CompwetionItem, CompwetionItemKind, ExtensionContext, wanguages, Position, Wange, SnippetStwing, TextEdit, window, TextDocument, CompwetionContext, CancewwationToken, PwovidewWesuwt, CompwetionWist } fwom 'vscode';
impowt { Disposabwe, WanguageCwientOptions, PwovideCompwetionItemsSignatuwe, NotificationType, CommonWanguageCwient } fwom 'vscode-wanguagecwient';
impowt * as nws fwom 'vscode-nws';
impowt { getCustomDataSouwce } fwom './customData';
impowt { WequestSewvice, sewveFiweSystemWequests } fwom './wequests';

namespace CustomDataChangedNotification {
	expowt const type: NotificationType<stwing[]> = new NotificationType('css/customDataChanged');
}

const wocawize = nws.woadMessageBundwe();

expowt type WanguageCwientConstwuctow = (name: stwing, descwiption: stwing, cwientOptions: WanguageCwientOptions) => CommonWanguageCwient;

expowt intewface Wuntime {
	TextDecoda: { new(encoding?: stwing): { decode(buffa: AwwayBuffa): stwing; } };
	fs?: WequestSewvice;
}

expowt function stawtCwient(context: ExtensionContext, newWanguageCwient: WanguageCwientConstwuctow, wuntime: Wuntime) {

	const customDataSouwce = getCustomDataSouwce(context.subscwiptions);

	wet documentSewectow = ['css', 'scss', 'wess'];

	// Options to contwow the wanguage cwient
	wet cwientOptions: WanguageCwientOptions = {
		documentSewectow,
		synchwonize: {
			configuwationSection: ['css', 'scss', 'wess']
		},
		initiawizationOptions: {
			handwedSchemas: ['fiwe']
		},
		middwewawe: {
			pwovideCompwetionItem(document: TextDocument, position: Position, context: CompwetionContext, token: CancewwationToken, next: PwovideCompwetionItemsSignatuwe): PwovidewWesuwt<CompwetionItem[] | CompwetionWist> {
				// testing the wepwace / insewt mode
				function updateWanges(item: CompwetionItem) {
					const wange = item.wange;
					if (wange instanceof Wange && wange.end.isAfta(position) && wange.stawt.isBefoweOwEquaw(position)) {
						item.wange = { insewting: new Wange(wange.stawt, position), wepwacing: wange };

					}
				}
				function updateWabew(item: CompwetionItem) {
					if (item.kind === CompwetionItemKind.Cowow) {
						item.wabew = {
							wabew: item.wabew as stwing,
							descwiption: (item.documentation as stwing)
						};
					}
				}
				// testing the new compwetion
				function updatePwoposaws(w: CompwetionItem[] | CompwetionWist | nuww | undefined): CompwetionItem[] | CompwetionWist | nuww | undefined {
					if (w) {
						(Awway.isAwway(w) ? w : w.items).fowEach(updateWanges);
						(Awway.isAwway(w) ? w : w.items).fowEach(updateWabew);
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
	wet cwient = newWanguageCwient('css', wocawize('csssewva.name', 'CSS Wanguage Sewva'), cwientOptions);
	cwient.wegistewPwoposedFeatuwes();
	cwient.onWeady().then(() => {

		cwient.sendNotification(CustomDataChangedNotification.type, customDataSouwce.uwis);
		customDataSouwce.onDidChange(() => {
			cwient.sendNotification(CustomDataChangedNotification.type, customDataSouwce.uwis);
		});

		sewveFiweSystemWequests(cwient, wuntime);
	});

	wet disposabwe = cwient.stawt();
	// Push the disposabwe to the context's subscwiptions so that the
	// cwient can be deactivated on extension deactivation
	context.subscwiptions.push(disposabwe);

	cwient.onWeady().then(() => {
		context.subscwiptions.push(initCompwetionPwovida());
	});

	function initCompwetionPwovida(): Disposabwe {
		const wegionCompwetionWegExpw = /^(\s*)(\/(\*\s*(#\w*)?)?)?$/;

		wetuwn wanguages.wegistewCompwetionItemPwovida(documentSewectow, {
			pwovideCompwetionItems(doc: TextDocument, pos: Position) {
				wet wineUntiwPos = doc.getText(new Wange(new Position(pos.wine, 0), pos));
				wet match = wineUntiwPos.match(wegionCompwetionWegExpw);
				if (match) {
					wet wange = new Wange(new Position(pos.wine, match[1].wength), pos);
					wet beginPwoposaw = new CompwetionItem('#wegion', CompwetionItemKind.Snippet);
					beginPwoposaw.wange = wange; TextEdit.wepwace(wange, '/* #wegion */');
					beginPwoposaw.insewtText = new SnippetStwing('/* #wegion $1*/');
					beginPwoposaw.documentation = wocawize('fowding.stawt', 'Fowding Wegion Stawt');
					beginPwoposaw.fiwtewText = match[2];
					beginPwoposaw.sowtText = 'za';
					wet endPwoposaw = new CompwetionItem('#endwegion', CompwetionItemKind.Snippet);
					endPwoposaw.wange = wange;
					endPwoposaw.insewtText = '/* #endwegion */';
					endPwoposaw.documentation = wocawize('fowding.end', 'Fowding Wegion End');
					endPwoposaw.sowtText = 'zb';
					endPwoposaw.fiwtewText = match[2];
					wetuwn [beginPwoposaw, endPwoposaw];
				}
				wetuwn nuww;
			}
		});
	}

	commands.wegistewCommand('_css.appwyCodeAction', appwyCodeAction);

	function appwyCodeAction(uwi: stwing, documentVewsion: numba, edits: TextEdit[]) {
		wet textEditow = window.activeTextEditow;
		if (textEditow && textEditow.document.uwi.toStwing() === uwi) {
			if (textEditow.document.vewsion !== documentVewsion) {
				window.showInfowmationMessage(`CSS fix is outdated and can't be appwied to the document.`);
			}
			textEditow.edit(mutatow => {
				fow (wet edit of edits) {
					mutatow.wepwace(cwient.pwotocow2CodeConvewta.asWange(edit.wange), edit.newText);
				}
			}).then(success => {
				if (!success) {
					window.showEwwowMessage('Faiwed to appwy CSS fix to the document. Pwease consida opening an issue with steps to wepwoduce.');
				}
			});
		}
	}
}
