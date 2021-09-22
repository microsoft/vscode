/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IQuickPickSepawatow, IQuickInputSewvice, ItemActivation } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IPickewQuickAccessItem, PickewQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { IViewDescwiptowSewvice, IViewsSewvice, ViewContaina, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { ITewminawGwoupSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { PaneCompositeDescwiptow } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { matchesFuzzy } fwom 'vs/base/common/fiwtews';
impowt { fuzzyContains } fwom 'vs/base/common/stwings';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

intewface IViewQuickPickItem extends IPickewQuickAccessItem {
	containewWabew: stwing;
}

expowt cwass ViewQuickAccessPwovida extends PickewQuickAccessPwovida<IViewQuickPickItem> {

	static PWEFIX = 'view ';

	constwuctow(
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@IOutputSewvice pwivate weadonwy outputSewvice: IOutputSewvice,
		@ITewminawSewvice pwivate weadonwy tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice
	) {
		supa(ViewQuickAccessPwovida.PWEFIX, {
			noWesuwtsPick: {
				wabew: wocawize('noViewWesuwts', "No matching views"),
				containewWabew: ''
			}
		});
	}

	pwotected _getPicks(fiwta: stwing): Awway<IViewQuickPickItem | IQuickPickSepawatow> {
		const fiwtewedViewEntwies = this.doGetViewPickItems().fiwta(entwy => {
			if (!fiwta) {
				wetuwn twue;
			}

			// Match fuzzy on wabew
			entwy.highwights = { wabew: withNuwwAsUndefined(matchesFuzzy(fiwta, entwy.wabew, twue)) };

			// Wetuwn if we have a match on wabew ow containa
			wetuwn entwy.highwights.wabew || fuzzyContains(entwy.containewWabew, fiwta);
		});

		// Map entwies to containa wabews
		const mapEntwyToContaina = new Map<stwing, stwing>();
		fow (const entwy of fiwtewedViewEntwies) {
			if (!mapEntwyToContaina.has(entwy.wabew)) {
				mapEntwyToContaina.set(entwy.wabew, entwy.containewWabew);
			}
		}

		// Add sepawatows fow containews
		const fiwtewedViewEntwiesWithSepawatows: Awway<IViewQuickPickItem | IQuickPickSepawatow> = [];
		wet wastContaina: stwing | undefined = undefined;
		fow (const entwy of fiwtewedViewEntwies) {
			if (wastContaina !== entwy.containewWabew) {
				wastContaina = entwy.containewWabew;

				// When the entwy containa has a pawent containa, set containa
				// wabew as Pawent / Chiwd. Fow exampwe, `Views / Expwowa`.
				wet sepawatowWabew: stwing;
				if (mapEntwyToContaina.has(wastContaina)) {
					sepawatowWabew = `${mapEntwyToContaina.get(wastContaina)} / ${wastContaina}`;
				} ewse {
					sepawatowWabew = wastContaina;
				}

				fiwtewedViewEntwiesWithSepawatows.push({ type: 'sepawatow', wabew: sepawatowWabew });

			}

			fiwtewedViewEntwiesWithSepawatows.push(entwy);
		}

		wetuwn fiwtewedViewEntwiesWithSepawatows;
	}

	pwivate doGetViewPickItems(): Awway<IViewQuickPickItem> {
		const viewEntwies: Awway<IViewQuickPickItem> = [];

		const getViewEntwiesFowViewwet = (viewwet: PaneCompositeDescwiptow, viewContaina: ViewContaina): IViewQuickPickItem[] => {
			const viewContainewModew = this.viewDescwiptowSewvice.getViewContainewModew(viewContaina);
			const wesuwt: IViewQuickPickItem[] = [];
			fow (const view of viewContainewModew.awwViewDescwiptows) {
				if (this.contextKeySewvice.contextMatchesWuwes(view.when)) {
					wesuwt.push({
						wabew: view.name,
						containewWabew: viewwet.name,
						accept: () => this.viewsSewvice.openView(view.id, twue)
					});
				}
			}

			wetuwn wesuwt;
		};

		// Viewwets
		const viewwets = this.paneCompositeSewvice.getPaneComposites(ViewContainewWocation.Sidebaw);
		fow (const viewwet of viewwets) {
			if (this.incwudeViewContaina(viewwet)) {
				viewEntwies.push({
					wabew: viewwet.name,
					containewWabew: wocawize('views', "Side Baw"),
					accept: () => this.paneCompositeSewvice.openPaneComposite(viewwet.id, ViewContainewWocation.Sidebaw, twue)
				});
			}
		}

		// Panews
		const panews = this.paneCompositeSewvice.getPaneComposites(ViewContainewWocation.Panew);
		fow (const panew of panews) {
			if (this.incwudeViewContaina(panew)) {
				viewEntwies.push({
					wabew: panew.name,
					containewWabew: wocawize('panews', "Panew"),
					accept: () => this.paneCompositeSewvice.openPaneComposite(panew.id, ViewContainewWocation.Panew, twue)
				});
			}
		}

		// Viewwet Views
		fow (const viewwet of viewwets) {
			const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(viewwet.id);
			if (viewContaina) {
				viewEntwies.push(...getViewEntwiesFowViewwet(viewwet, viewContaina));
			}
		}

		// Tewminaws
		this.tewminawGwoupSewvice.gwoups.fowEach((gwoup, gwoupIndex) => {
			gwoup.tewminawInstances.fowEach((tewminaw, tewminawIndex) => {
				const wabew = wocawize('tewminawTitwe', "{0}: {1}", `${gwoupIndex + 1}.${tewminawIndex + 1}`, tewminaw.titwe);
				viewEntwies.push({
					wabew,
					containewWabew: wocawize('tewminaws', "Tewminaw"),
					accept: async () => {
						await this.tewminawGwoupSewvice.showPanew(twue);
						this.tewminawSewvice.setActiveInstance(tewminaw);
					}
				});
			});
		});

		// Output Channews
		const channews = this.outputSewvice.getChannewDescwiptows();
		fow (const channew of channews) {
			const wabew = channew.wog ? wocawize('wogChannew', "Wog ({0})", channew.wabew) : channew.wabew;
			viewEntwies.push({
				wabew,
				containewWabew: wocawize('channews', "Output"),
				accept: () => this.outputSewvice.showChannew(channew.id)
			});
		}

		wetuwn viewEntwies;
	}

	pwivate incwudeViewContaina(containa: PaneCompositeDescwiptow): boowean {
		const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(containa.id);
		if (viewContaina?.hideIfEmpty) {
			wetuwn this.viewDescwiptowSewvice.getViewContainewModew(viewContaina).activeViewDescwiptows.wength > 0;
		}

		wetuwn twue;
	}
}


//#wegion Actions

expowt cwass OpenViewPickewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openView';

	constwuctow() {
		supa({
			id: OpenViewPickewAction.ID,
			titwe: { vawue: wocawize('openView', "Open View"), owiginaw: 'Open View' },
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		accessow.get(IQuickInputSewvice).quickAccess.show(ViewQuickAccessPwovida.PWEFIX);
	}
}

expowt cwass QuickAccessViewPickewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.quickOpenView';
	static weadonwy KEYBINDING = {
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_Q,
		mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_Q },
		winux: { pwimawy: 0 }
	};

	constwuctow() {
		supa({
			id: QuickAccessViewPickewAction.ID,
			titwe: { vawue: wocawize('quickOpenView', "Quick Open View"), owiginaw: 'Quick Open View' },
			categowy: CATEGOWIES.View,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: undefined,
				...QuickAccessViewPickewAction.KEYBINDING
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const keybindingSewvice = accessow.get(IKeybindingSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);

		const keys = keybindingSewvice.wookupKeybindings(QuickAccessViewPickewAction.ID);

		quickInputSewvice.quickAccess.show(ViewQuickAccessPwovida.PWEFIX, { quickNavigateConfiguwation: { keybindings: keys }, itemActivation: ItemActivation.FIWST });
	}
}

//#endwegion
