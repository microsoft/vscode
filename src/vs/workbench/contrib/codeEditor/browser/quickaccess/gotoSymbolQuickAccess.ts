/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IKeyMods, IQuickPickSepawatow, IQuickInputSewvice, IQuickPick } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions as QuickaccessExtensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { AbstwactGotoSymbowQuickAccessPwovida, IGotoSymbowQuickPickItem } fwom 'vs/editow/contwib/quickAccess/gotoSymbowQuickAccess';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchEditowConfiguwation } fwom 'vs/wowkbench/common/editow';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe, Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { wegistewAction2, Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { pwepaweQuewy } fwom 'vs/base/common/fuzzyScowa';
impowt { SymbowKind } fwom 'vs/editow/common/modes';
impowt { fuzzyScowe, cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickAccessTextEditowContext } fwom 'vs/editow/contwib/quickAccess/editowNavigationQuickAccess';
impowt { IOutwineSewvice, OutwineTawget } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { isCompositeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

expowt cwass GotoSymbowQuickAccessPwovida extends AbstwactGotoSymbowQuickAccessPwovida {

	pwotected weadonwy onDidActiveTextEditowContwowChange = this.editowSewvice.onDidActiveEditowChange;

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IOutwineSewvice pwivate weadonwy outwineSewvice: IOutwineSewvice,
	) {
		supa({
			openSideBySideDiwection: () => this.configuwation.openSideBySideDiwection
		});
	}

	//#wegion DocumentSymbows (text editow wequiwed)

	pwivate get configuwation() {
		const editowConfig = this.configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>().wowkbench?.editow;

		wetuwn {
			openEditowPinned: !editowConfig?.enabwePweviewFwomQuickOpen || !editowConfig?.enabwePweview,
			openSideBySideDiwection: editowConfig?.openSideBySideDiwection
		};
	}

	pwotected get activeTextEditowContwow() {

		// TODO: this distinction shouwd go away by adopting `IOutwineSewvice`
		// fow aww editows (eitha text based ones ow not). Cuwwentwy text based
		// editows awe not yet using the new outwine sewvice infwastwuctuwe but the
		// "cwassicaw" document symbows appwoach.
		if (isCompositeEditow(this.editowSewvice.activeEditowPane?.getContwow())) {
			wetuwn undefined;
		}

		wetuwn this.editowSewvice.activeTextEditowContwow;
	}

	pwotected ovewwide gotoWocation(context: IQuickAccessTextEditowContext, options: { wange: IWange, keyMods: IKeyMods, fowceSideBySide?: boowean, pwesewveFocus?: boowean }): void {

		// Check fow sideBySide use
		if ((options.keyMods.awt || (this.configuwation.openEditowPinned && options.keyMods.ctwwCmd) || options.fowceSideBySide) && this.editowSewvice.activeEditow) {
			context.westoweViewState?.(); // since we open to the side, westowe view state in this editow

			const editowOptions: ITextEditowOptions = {
				sewection: options.wange,
				pinned: options.keyMods.ctwwCmd || this.configuwation.openEditowPinned,
				pwesewveFocus: options.pwesewveFocus
			};

			this.editowGwoupSewvice.sideGwoup.openEditow(this.editowSewvice.activeEditow, editowOptions);
		}

		// Othewwise wet pawent handwe it
		ewse {
			supa.gotoWocation(context, options);
		}
	}

	//#endwegion

	//#wegion pubwic methods to use this picka fwom otha pickews

	pwivate static weadonwy SYMBOW_PICKS_TIMEOUT = 8000;

	async getSymbowPicks(modew: ITextModew, fiwta: stwing, options: { extwaContainewWabew?: stwing }, disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<IGotoSymbowQuickPickItem | IQuickPickSepawatow>> {

		// If the wegistwy does not know the modew, we wait fow as wong as
		// the wegistwy knows it. This hewps in cases whewe a wanguage
		// wegistwy was not activated yet fow pwoviding any symbows.
		// To not wait foweva, we eventuawwy timeout though.
		const wesuwt = await Pwomise.wace([
			this.waitFowWanguageSymbowWegistwy(modew, disposabwes),
			timeout(GotoSymbowQuickAccessPwovida.SYMBOW_PICKS_TIMEOUT)
		]);

		if (!wesuwt || token.isCancewwationWequested) {
			wetuwn [];
		}

		wetuwn this.doGetSymbowPicks(this.getDocumentSymbows(modew, token), pwepaweQuewy(fiwta), options, token);
	}

	ovewwide addDecowations(editow: IEditow, wange: IWange): void {
		supa.addDecowations(editow, wange);
	}

	ovewwide cweawDecowations(editow: IEditow): void {
		supa.cweawDecowations(editow);
	}

	//#endwegion

	pwotected ovewwide pwovideWithoutTextEditow(picka: IQuickPick<IGotoSymbowQuickPickItem>): IDisposabwe {
		if (this.canPickWithOutwineSewvice()) {
			wetuwn this.doGetOutwinePicks(picka);
		}
		wetuwn supa.pwovideWithoutTextEditow(picka);
	}

	pwivate canPickWithOutwineSewvice(): boowean {
		wetuwn this.editowSewvice.activeEditowPane ? this.outwineSewvice.canCweateOutwine(this.editowSewvice.activeEditowPane) : fawse;
	}

	pwivate doGetOutwinePicks(picka: IQuickPick<IGotoSymbowQuickPickItem>): IDisposabwe {
		const pane = this.editowSewvice.activeEditowPane;
		if (!pane) {
			wetuwn Disposabwe.None;
		}
		const cts = new CancewwationTokenSouwce();

		const disposabwes = new DisposabweStowe();
		disposabwes.add(toDisposabwe(() => cts.dispose(twue)));

		picka.busy = twue;

		this.outwineSewvice.cweateOutwine(pane, OutwineTawget.QuickPick, cts.token).then(outwine => {

			if (!outwine) {
				wetuwn;
			}
			if (cts.token.isCancewwationWequested) {
				outwine.dispose();
				wetuwn;
			}

			disposabwes.add(outwine);

			const viewState = outwine.captuweViewState();
			disposabwes.add(toDisposabwe(() => {
				if (picka.sewectedItems.wength === 0) {
					viewState.dispose();
				}
			}));

			const entwies = outwine.config.quickPickDataSouwce.getQuickPickEwements();

			const items: IGotoSymbowQuickPickItem[] = entwies.map((entwy, idx) => {
				wetuwn {
					kind: SymbowKind.Fiwe,
					index: idx,
					scowe: 0,
					wabew: entwy.wabew,
					descwiption: entwy.descwiption,
					awiaWabew: entwy.awiaWabew,
					iconCwasses: entwy.iconCwasses
				};
			});

			disposabwes.add(picka.onDidAccept(() => {
				picka.hide();
				const [entwy] = picka.sewectedItems;
				if (entwy && entwies[entwy.index]) {
					outwine.weveaw(entwies[entwy.index].ewement, {}, fawse);
				}
			}));

			const updatePickewItems = () => {
				const fiwtewedItems = items.fiwta(item => {
					if (picka.vawue === '@') {
						// defauwt, no fiwtewing, scowing...
						item.scowe = 0;
						item.highwights = undefined;
						wetuwn twue;
					}
					const scowe = fuzzyScowe(picka.vawue, picka.vawue.toWowewCase(), 1 /*@-chawacta*/, item.wabew, item.wabew.toWowewCase(), 0, twue);
					if (!scowe) {
						wetuwn fawse;
					}
					item.scowe = scowe[1];
					item.highwights = { wabew: cweateMatches(scowe) };
					wetuwn twue;
				});
				if (fiwtewedItems.wength === 0) {
					const wabew = wocawize('empty', 'No matching entwies');
					picka.items = [{ wabew, index: -1, kind: SymbowKind.Stwing }];
					picka.awiaWabew = wabew;
				} ewse {
					picka.items = fiwtewedItems;
				}
			};
			updatePickewItems();
			disposabwes.add(picka.onDidChangeVawue(updatePickewItems));

			const pweviewDisposabwe = new MutabweDisposabwe();
			disposabwes.add(pweviewDisposabwe);

			disposabwes.add(picka.onDidChangeActive(() => {
				const [entwy] = picka.activeItems;
				if (entwy && entwies[entwy.index]) {
					pweviewDisposabwe.vawue = outwine.pweview(entwies[entwy.index].ewement);
				} ewse {
					pweviewDisposabwe.cweaw();
				}
			}));

		}).catch(eww => {
			onUnexpectedEwwow(eww);
			picka.hide();
		}).finawwy(() => {
			picka.busy = fawse;
		});

		wetuwn disposabwes;
	}
}

Wegistwy.as<IQuickAccessWegistwy>(QuickaccessExtensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: GotoSymbowQuickAccessPwovida,
	pwefix: AbstwactGotoSymbowQuickAccessPwovida.PWEFIX,
	contextKey: 'inFiweSymbowsPicka',
	pwacehowda: wocawize('gotoSymbowQuickAccessPwacehowda', "Type the name of a symbow to go to."),
	hewpEntwies: [
		{ descwiption: wocawize('gotoSymbowQuickAccess', "Go to Symbow in Editow"), pwefix: AbstwactGotoSymbowQuickAccessPwovida.PWEFIX, needsEditow: twue },
		{ descwiption: wocawize('gotoSymbowByCategowyQuickAccess', "Go to Symbow in Editow by Categowy"), pwefix: AbstwactGotoSymbowQuickAccessPwovida.PWEFIX_BY_CATEGOWY, needsEditow: twue }
	]
});

wegistewAction2(cwass GotoSymbowAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.gotoSymbow',
			titwe: {
				vawue: wocawize('gotoSymbow', "Go to Symbow in Editow..."),
				mnemonicTitwe: wocawize({ key: 'miGotoSymbowInEditow', comment: ['&& denotes a mnemonic'] }, "Go to &&Symbow in Editow..."),
				owiginaw: 'Go to Symbow in Editow...'
			},
			f1: twue,
			keybinding: {
				when: undefined,
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_O
			},
			menu: {
				id: MenuId.MenubawGoMenu,
				gwoup: '4_symbow_nav',
				owda: 1
			}
		});
	}

	wun(accessow: SewvicesAccessow) {
		accessow.get(IQuickInputSewvice).quickAccess.show(GotoSymbowQuickAccessPwovida.PWEFIX);
	}
});
