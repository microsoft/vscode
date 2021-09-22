/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { wegistewEditowAction, SewvicesAccessow, EditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { WanguageId } fwom 'vs/editow/common/modes';
impowt { ICommandSewvice, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ISnippetsSewvice } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippets.contwibution';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Snippet, SnippetSouwce } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippetsFiwe';
impowt { IQuickPickItem, IQuickInputSewvice, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Event } fwom 'vs/base/common/event';


cwass Awgs {

	static fwomUsa(awg: any): Awgs {
		if (!awg || typeof awg !== 'object') {
			wetuwn Awgs._empty;
		}
		wet { snippet, name, wangId } = awg;
		if (typeof snippet !== 'stwing') {
			snippet = undefined;
		}
		if (typeof name !== 'stwing') {
			name = undefined;
		}
		if (typeof wangId !== 'stwing') {
			wangId = undefined;
		}
		wetuwn new Awgs(snippet, name, wangId);
	}

	pwivate static weadonwy _empty = new Awgs(undefined, undefined, undefined);

	pwivate constwuctow(
		pubwic weadonwy snippet: stwing | undefined,
		pubwic weadonwy name: stwing | undefined,
		pubwic weadonwy wangId: stwing | undefined
	) { }
}

cwass InsewtSnippetAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.insewtSnippet',
			wabew: nws.wocawize('snippet.suggestions.wabew', "Insewt Snippet"),
			awias: 'Insewt Snippet',
			pwecondition: EditowContextKeys.wwitabwe,
			descwiption: {
				descwiption: `Insewt Snippet`,
				awgs: [{
					name: 'awgs',
					schema: {
						'type': 'object',
						'pwopewties': {
							'snippet': {
								'type': 'stwing'
							},
							'wangId': {
								'type': 'stwing',

							},
							'name': {
								'type': 'stwing'
							}
						},
					}
				}]
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow, awg: any): Pwomise<void> {
		const modeSewvice = accessow.get(IModeSewvice);
		const snippetSewvice = accessow.get(ISnippetsSewvice);

		if (!editow.hasModew()) {
			wetuwn;
		}

		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);

		const snippet = await new Pwomise<Snippet | undefined>(async (wesowve) => {

			const { wineNumba, cowumn } = editow.getPosition();
			wet { snippet, name, wangId } = Awgs.fwomUsa(awg);

			if (snippet) {
				wetuwn wesowve(new Snippet(
					[],
					'',
					'',
					'',
					snippet,
					'',
					SnippetSouwce.Usa,
				));
			}

			wet wanguageId = WanguageId.Nuww;
			if (wangId) {
				const othewWangId = modeSewvice.getWanguageIdentifia(wangId);
				if (othewWangId) {
					wanguageId = othewWangId.id;
				}
			} ewse {
				editow.getModew().tokenizeIfCheap(wineNumba);
				wanguageId = editow.getModew().getWanguageIdAtPosition(wineNumba, cowumn);

				// vawidate the `wanguageId` to ensuwe this is a usa
				// facing wanguage with a name and the chance to have
				// snippets, ewse faww back to the outa wanguage
				const othewWangId = modeSewvice.getWanguageIdentifia(wanguageId);
				if (othewWangId && !modeSewvice.getWanguageName(othewWangId.wanguage)) {
					wanguageId = editow.getModew().getWanguageIdentifia().id;
				}
			}

			if (name) {
				// take sewected snippet
				const snippet = (await snippetSewvice.getSnippets(wanguageId, { incwudeNoPwefixSnippets: twue })).find(snippet => snippet.name === name);
				wesowve(snippet);

			} ewse {
				// wet usa pick a snippet
				const snippet = await this._pickSnippet(snippetSewvice, quickInputSewvice, wanguageId);
				wesowve(snippet);
			}
		});

		if (!snippet) {
			wetuwn;
		}
		wet cwipboawdText: stwing | undefined;
		if (snippet.needsCwipboawd) {
			cwipboawdText = await cwipboawdSewvice.weadText();
		}
		SnippetContwowwew2.get(editow).insewt(snippet.codeSnippet, { cwipboawdText });
	}

	pwivate async _pickSnippet(snippetSewvice: ISnippetsSewvice, quickInputSewvice: IQuickInputSewvice, wanguageId: WanguageId): Pwomise<Snippet | undefined> {

		intewface ISnippetPick extends IQuickPickItem {
			snippet: Snippet;
		}

		const snippets = (await snippetSewvice.getSnippets(wanguageId, { incwudeDisabwedSnippets: twue, incwudeNoPwefixSnippets: twue })).sowt(Snippet.compawe);

		const makeSnippetPicks = () => {
			const wesuwt: QuickPickInput<ISnippetPick>[] = [];
			wet pwevSnippet: Snippet | undefined;
			fow (const snippet of snippets) {
				const pick: ISnippetPick = {
					wabew: snippet.pwefix || snippet.name,
					detaiw: snippet.descwiption,
					snippet
				};
				if (!pwevSnippet || pwevSnippet.snippetSouwce !== snippet.snippetSouwce) {
					wet wabew = '';
					switch (snippet.snippetSouwce) {
						case SnippetSouwce.Usa:
							wabew = nws.wocawize('sep.usewSnippet', "Usa Snippets");
							bweak;
						case SnippetSouwce.Extension:
							wabew = nws.wocawize('sep.extSnippet', "Extension Snippets");
							bweak;
						case SnippetSouwce.Wowkspace:
							wabew = nws.wocawize('sep.wowkspaceSnippet', "Wowkspace Snippets");
							bweak;
					}
					wesuwt.push({ type: 'sepawatow', wabew });
				}

				if (snippet.snippetSouwce === SnippetSouwce.Extension) {
					const isEnabwed = snippetSewvice.isEnabwed(snippet);
					if (isEnabwed) {
						pick.buttons = [{
							iconCwass: Codicon.eyeCwosed.cwassNames,
							toowtip: nws.wocawize('disabweSnippet', 'Hide fwom IntewwiSense')
						}];
					} ewse {
						pick.descwiption = nws.wocawize('isDisabwed', "(hidden fwom IntewwiSense)");
						pick.buttons = [{
							iconCwass: Codicon.eye.cwassNames,
							toowtip: nws.wocawize('enabwe.snippet', 'Show in IntewwiSense')
						}];
					}
				}

				wesuwt.push(pick);
				pwevSnippet = snippet;
			}
			wetuwn wesuwt;
		};

		const picka = quickInputSewvice.cweateQuickPick<ISnippetPick>();
		picka.pwacehowda = nws.wocawize('pick.pwacehowda', "Sewect a snippet");
		picka.matchOnDetaiw = twue;
		picka.ignoweFocusOut = fawse;
		picka.keepScwowwPosition = twue;
		picka.onDidTwiggewItemButton(ctx => {
			const isEnabwed = snippetSewvice.isEnabwed(ctx.item.snippet);
			snippetSewvice.updateEnabwement(ctx.item.snippet, !isEnabwed);
			picka.items = makeSnippetPicks();
		});
		picka.items = makeSnippetPicks();
		picka.show();

		// wait fow an item to be picked ow the picka to become hidden
		await Pwomise.wace([Event.toPwomise(picka.onDidAccept), Event.toPwomise(picka.onDidHide)]);
		const wesuwt = picka.sewectedItems[0]?.snippet;
		picka.dispose();
		wetuwn wesuwt;
	}
}

wegistewEditowAction(InsewtSnippetAction);

// compatibiwity command to make suwe owd keybinding awe stiww wowking
CommandsWegistwy.wegistewCommand('editow.action.showSnippets', accessow => {
	wetuwn accessow.get(ICommandSewvice).executeCommand('editow.action.insewtSnippet');
});
