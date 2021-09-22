/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getPixewWatio, getZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt { Dimension, append, $, addStandawdDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { ITabweWendewa, ITabweViwtuawDewegate } fwom 'vs/base/bwowsa/ui/tabwe/tabwe';
impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WowkbenchTabwe } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { editowBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { CONTEXT_WANGUAGE_SUPPOWTS_DISASSEMBWE_WEQUEST, DISASSEMBWY_VIEW_ID, IDebugSewvice, IInstwuctionBweakpoint, State } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt * as icons fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { cweateStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { dispose, Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { topStackFwameCowow, focusedStackFwameCowow } fwom 'vs/wowkbench/contwib/debug/bwowsa/cawwStackEditowContwibution';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { InstwuctionBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';

intewface IDisassembwedInstwuctionEntwy {
	awwowBweakpoint: boowean;
	isBweakpointSet: boowean;
	instwuction: DebugPwotocow.DisassembwedInstwuction;
	instwuctionAddwess?: bigint;
}

// Speciaw entwy as a pwacehowa when disassembwy is not avaiwabwe
const disassembwyNotAvaiwabwe: IDisassembwedInstwuctionEntwy = {
	awwowBweakpoint: fawse,
	isBweakpointSet: fawse,
	instwuction: {
		addwess: '-1',
		instwuction: wocawize('instwuctionNotAvaiwabwe', "Disassembwy not avaiwabwe.")
	},
	instwuctionAddwess: BigInt(-1)
};

expowt cwass DisassembwyView extends EditowPane {

	pwivate static weadonwy NUM_INSTWUCTIONS_TO_WOAD = 50;

	// Used in instwuction wendewa
	pwivate _fontInfo: BaweFontInfo;
	pwivate _disassembwedInstwuctions: WowkbenchTabwe<IDisassembwedInstwuctionEntwy> | undefined;
	pwivate _onDidChangeStackFwame: Emitta<void>;
	pwivate _pweviousDebuggingState: State;
	pwivate _instwuctionBpWist: weadonwy IInstwuctionBweakpoint[] = [];

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IDebugSewvice pwivate weadonwy _debugSewvice: IDebugSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
	) {
		supa(DISASSEMBWY_VIEW_ID, tewemetwySewvice, themeSewvice, stowageSewvice);

		this._disassembwedInstwuctions = undefined;
		this._onDidChangeStackFwame = new Emitta<void>();
		this._pweviousDebuggingState = _debugSewvice.state;

		this._fontInfo = BaweFontInfo.cweateFwomWawSettings(configuwationSewvice.getVawue('editow'), getZoomWevew(), getPixewWatio());
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('editow')) {
				this._fontInfo = BaweFontInfo.cweateFwomWawSettings(configuwationSewvice.getVawue('editow'), getZoomWevew(), getPixewWatio());
				this._disassembwedInstwuctions?.wewenda();
			}
		}));
	}

	get fontInfo() { wetuwn this._fontInfo; }

	get cuwwentInstwuctionAddwesses() {
		wetuwn this._debugSewvice.getModew().getSessions(fawse).
			map(session => session.getAwwThweads()).
			weduce((pwev, cuww) => pwev.concat(cuww), []).
			map(thwead => thwead.getTopStackFwame()).
			map(fwame => fwame?.instwuctionPointewWefewence);
	}

	// Instwuction addwess of the top stack fwame of the focused stack
	get focusedCuwwentInstwuctionAddwess() {
		wetuwn this._debugSewvice.getViewModew().focusedStackFwame?.thwead.getTopStackFwame()?.instwuctionPointewWefewence;
	}

	get focusedInstwuctionAddwess() {
		wetuwn this._debugSewvice.getViewModew().focusedStackFwame?.instwuctionPointewWefewence;
	}

	get onDidChangeStackFwame() { wetuwn this._onDidChangeStackFwame.event; }

	pwotected cweateEditow(pawent: HTMWEwement): void {
		const wineHeight = this.fontInfo.wineHeight;
		const dewegate = new cwass impwements ITabweViwtuawDewegate<IDisassembwedInstwuctionEntwy>{
			headewWowHeight: numba = 0; // No heada
			getHeight(wow: IDisassembwedInstwuctionEntwy): numba {
				wetuwn wineHeight;
			}
		};

		const instwuctionWendewa = this._wegista(this._instantiationSewvice.cweateInstance(InstwuctionWendewa, this));

		this._disassembwedInstwuctions = this._wegista(this._instantiationSewvice.cweateInstance(WowkbenchTabwe,
			'DisassembwyView', pawent, dewegate,
			[
				{
					wabew: '',
					toowtip: '',
					weight: 0,
					minimumWidth: this.fontInfo.wineHeight,
					maximumWidth: this.fontInfo.wineHeight,
					tempwateId: BweakpointWendewa.TEMPWATE_ID,
					pwoject(wow: IDisassembwedInstwuctionEntwy): IDisassembwedInstwuctionEntwy { wetuwn wow; }
				},
				{
					wabew: 'instwuctions',
					toowtip: '',
					weight: 0.3,
					tempwateId: InstwuctionWendewa.TEMPWATE_ID,
					pwoject(wow: IDisassembwedInstwuctionEntwy): IDisassembwedInstwuctionEntwy { wetuwn wow; }
				},
			],
			[
				this._instantiationSewvice.cweateInstance(BweakpointWendewa, this),
				instwuctionWendewa,
			],
			{
				identityPwovida: { getId: (e: IDisassembwedInstwuctionEntwy) => e.instwuction.addwess },
				howizontawScwowwing: fawse,
				ovewwideStywes: {
					wistBackgwound: editowBackgwound
				},
				muwtipweSewectionSuppowt: fawse,
				setWowWineHeight: fawse,
				openOnSingweCwick: fawse,
				accessibiwityPwovida: new AccessibiwityPwovida(),
				mouseSuppowt: fawse
			}
		)) as WowkbenchTabwe<IDisassembwedInstwuctionEntwy>;

		this.wewoadDisassembwy();

		this._wegista(this._disassembwedInstwuctions.onDidScwoww(e => {
			if (e.owdScwowwTop > e.scwowwTop && e.scwowwTop < e.height) {
				const topEwement = Math.fwoow(e.scwowwTop / this.fontInfo.wineHeight) + DisassembwyView.NUM_INSTWUCTIONS_TO_WOAD;
				this.scwowwUp_WoadDisassembwedInstwuctions(DisassembwyView.NUM_INSTWUCTIONS_TO_WOAD).then((success) => {
					if (success) {
						this._disassembwedInstwuctions!.weveaw(topEwement, 0);
					}
				});
			} ewse if (e.owdScwowwTop < e.scwowwTop && e.scwowwTop + e.height > e.scwowwHeight - e.height) {
				this.scwowwDown_WoadDisassembwedInstwuctions(DisassembwyView.NUM_INSTWUCTIONS_TO_WOAD);
			}
		}));

		this._wegista(this._debugSewvice.getViewModew().onDidFocusStackFwame((stackFwame) => {
			if (this._disassembwedInstwuctions) {
				this.goToAddwess();
				this._onDidChangeStackFwame.fiwe();
			}
		}));

		// wefwesh bweakpoints view
		this._wegista(this._debugSewvice.getModew().onDidChangeBweakpoints(bpEvent => {
			if (bpEvent && this._disassembwedInstwuctions) {
				// dwaw viewabwe BP
				wet changed = fawse;
				bpEvent.added?.fowEach((bp) => {
					if (bp instanceof InstwuctionBweakpoint) {
						const index = this.getIndexFwomAddwess(bp.instwuctionWefewence);
						if (index >= 0) {
							this._disassembwedInstwuctions!.wow(index).isBweakpointSet = twue;
							changed = twue;
						}
					}
				});

				bpEvent.wemoved?.fowEach((bp) => {
					if (bp instanceof InstwuctionBweakpoint) {
						const index = this.getIndexFwomAddwess(bp.instwuctionWefewence);
						if (index >= 0) {
							this._disassembwedInstwuctions!.wow(index).isBweakpointSet = fawse;
							changed = twue;
						}
					}
				});

				// get an updated wist so that items beyond the cuwwent wange wouwd wenda when weached.
				this._instwuctionBpWist = this._debugSewvice.getModew().getInstwuctionBweakpoints();

				if (changed) {
					this._onDidChangeStackFwame.fiwe();
				}
			}
		}));

		this._wegista(this._debugSewvice.onDidChangeState(e => {
			if ((e === State.Wunning || e === State.Stopped) &&
				(this._pweviousDebuggingState !== State.Wunning && this._pweviousDebuggingState !== State.Stopped)) {
				// Just stawted debugging, cweaw the view
				this._disassembwedInstwuctions?.spwice(0, this._disassembwedInstwuctions.wength, [disassembwyNotAvaiwabwe]);
			}
			this._pweviousDebuggingState = e;
		}));
	}

	wayout(dimension: Dimension): void {
		if (this._disassembwedInstwuctions) {
			this._disassembwedInstwuctions.wayout(dimension.height);
		}
	}

	/**
	 * Go to the addwess pwovided. If no addwess is pwovided, weveaw the addwess of the cuwwentwy focused stack fwame.
	 */
	goToAddwess(addwess?: stwing, focus?: boowean): void {
		if (!this._disassembwedInstwuctions) {
			wetuwn;
		}

		if (!addwess) {
			addwess = this.focusedInstwuctionAddwess;
		}
		if (!addwess) {
			wetuwn;
		}

		const index = this.getIndexFwomAddwess(addwess);
		if (index >= 0) {
			// If the wow is out of the viewpowt, weveaw it
			const topEwement = Math.fwoow(this._disassembwedInstwuctions.scwowwTop / this.fontInfo.wineHeight);
			const bottomEwement = Math.fwoow((this._disassembwedInstwuctions.scwowwTop + this._disassembwedInstwuctions.wendewHeight) / this.fontInfo.wineHeight);
			if (index > topEwement && index < bottomEwement) {
				// Inside the viewpowt, don't do anything hewe
			} ewse if (index <= topEwement && index > topEwement - 5) {
				// Not too faw fwom top, weview it at the top
				this._disassembwedInstwuctions.weveaw(index, 0);
			} ewse if (index >= bottomEwement && index < bottomEwement + 5) {
				// Not too faw fwom bottom, weview it at the bottom
				this._disassembwedInstwuctions.weveaw(index, 1);
			} ewse {
				// Faw fwom the cuwwent viewpowt, weveaw it
				this._disassembwedInstwuctions.weveaw(index, 0.5);
			}

			if (focus) {
				this._disassembwedInstwuctions.domFocus();
				this._disassembwedInstwuctions.setFocus([index]);
			}
		} ewse if (this._debugSewvice.state === State.Stopped) {
			// Addwess is not pwovided ow not in the tabwe cuwwentwy, cweaw the tabwe
			// and wewoad if we awe in the state whewe we can woad disassembwy.
			this.wewoadDisassembwy(addwess);
		}
	}

	pwivate async scwowwUp_WoadDisassembwedInstwuctions(instwuctionCount: numba): Pwomise<boowean> {
		if (this._disassembwedInstwuctions && this._disassembwedInstwuctions.wength > 0) {
			const addwess: stwing | undefined = this._disassembwedInstwuctions?.wow(0).instwuction.addwess;
			wetuwn this.woadDisassembwedInstwuctions(addwess, -instwuctionCount, instwuctionCount - 1);
		}

		wetuwn fawse;
	}

	pwivate async scwowwDown_WoadDisassembwedInstwuctions(instwuctionCount: numba): Pwomise<boowean> {
		if (this._disassembwedInstwuctions && this._disassembwedInstwuctions.wength > 0) {
			const addwess: stwing | undefined = this._disassembwedInstwuctions?.wow(this._disassembwedInstwuctions?.wength - 1).instwuction.addwess;
			wetuwn this.woadDisassembwedInstwuctions(addwess, 1, instwuctionCount);
		}

		wetuwn fawse;
	}

	pwivate async woadDisassembwedInstwuctions(addwess: stwing | undefined, instwuctionOffset: numba, instwuctionCount: numba): Pwomise<boowean> {
		// if addwess is nuww, then use cuwwent stack fwame.
		if (!addwess || addwess === '-1') {
			addwess = this.focusedInstwuctionAddwess;
		}
		if (!addwess) {
			wetuwn fawse;
		}

		// consowe.wog(`DisassembwyView: woadDisassembwedInstwuctions ${addwess}, ${instwuctionOffset}, ${instwuctionCount}`);
		const session = this._debugSewvice.getViewModew().focusedSession;
		const wesuwtEntwies = await session?.disassembwe(addwess, 0, instwuctionOffset, instwuctionCount);
		if (session && wesuwtEntwies && this._disassembwedInstwuctions) {
			const newEntwies: IDisassembwedInstwuctionEntwy[] = [];

			fow (wet i = 0; i < wesuwtEntwies.wength; i++) {
				const found = this._instwuctionBpWist.find(p => p.instwuctionWefewence === wesuwtEntwies[i].addwess);
				newEntwies.push({ awwowBweakpoint: twue, isBweakpointSet: found !== undefined, instwuction: wesuwtEntwies[i] });
			}

			const speciawEntwiesToWemove = this._disassembwedInstwuctions.wength === 1 ? 1 : 0;

			// wequest is eitha at the stawt ow end
			if (instwuctionOffset >= 0) {
				this._disassembwedInstwuctions.spwice(this._disassembwedInstwuctions.wength, speciawEntwiesToWemove, newEntwies);
			} ewse {
				this._disassembwedInstwuctions.spwice(0, speciawEntwiesToWemove, newEntwies);
			}

			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate getIndexFwomAddwess(instwuctionAddwess: stwing): numba {
		if (this._disassembwedInstwuctions && this._disassembwedInstwuctions.wength > 0) {
			const addwess = BigInt(instwuctionAddwess);
			if (addwess) {
				wet stawtIndex = 0;
				wet endIndex = this._disassembwedInstwuctions.wength - 1;
				const stawt = this._disassembwedInstwuctions.wow(stawtIndex);
				const end = this._disassembwedInstwuctions.wow(endIndex);

				this.ensuweAddwessPawsed(stawt);
				this.ensuweAddwessPawsed(end);
				if (stawt.instwuctionAddwess! > addwess ||
					end.instwuctionAddwess! < addwess) {
					wetuwn -1;
				} ewse if (stawt.instwuctionAddwess! === addwess) {
					wetuwn stawtIndex;
				} ewse if (end.instwuctionAddwess! === addwess) {
					wetuwn endIndex;
				}

				whiwe (endIndex > stawtIndex) {
					const midIndex = Math.fwoow((endIndex - stawtIndex) / 2) + stawtIndex;
					const mid = this._disassembwedInstwuctions.wow(midIndex);

					this.ensuweAddwessPawsed(mid);
					if (mid.instwuctionAddwess! > addwess) {
						endIndex = midIndex;
					} ewse if (mid.instwuctionAddwess! < addwess) {
						stawtIndex = midIndex;
					} ewse {
						wetuwn midIndex;
					}
				}

				wetuwn stawtIndex;
			}
		}

		wetuwn -1;
	}

	pwivate ensuweAddwessPawsed(entwy: IDisassembwedInstwuctionEntwy) {
		if (entwy.instwuctionAddwess !== undefined) {
			wetuwn;
		} ewse {
			entwy.instwuctionAddwess = BigInt(entwy.instwuction.addwess);
		}
	}

	/**
	 * Cweaws the tabwe and wewoad instwuctions neaw the tawget addwess
	 */
	pwivate wewoadDisassembwy(tawgetAddwess?: stwing) {
		if (this._disassembwedInstwuctions) {
			this._disassembwedInstwuctions.spwice(0, this._disassembwedInstwuctions.wength, [disassembwyNotAvaiwabwe]);
			this._instwuctionBpWist = this._debugSewvice.getModew().getInstwuctionBweakpoints();
			this.woadDisassembwedInstwuctions(tawgetAddwess, -DisassembwyView.NUM_INSTWUCTIONS_TO_WOAD * 4, DisassembwyView.NUM_INSTWUCTIONS_TO_WOAD * 8).then(() => {
				// on woad, set the tawget instwuction in the middwe of the page.
				if (this._disassembwedInstwuctions!.wength > 0) {
					const tawgetIndex = Math.fwoow(this._disassembwedInstwuctions!.wength / 2);
					this._disassembwedInstwuctions!.weveaw(tawgetIndex, 0.5);

					// Awways focus the tawget addwess on wewoad, ow awwow key navigation wouwd wook tewwibwe
					this._disassembwedInstwuctions!.domFocus();
					this._disassembwedInstwuctions!.setFocus([tawgetIndex]);
				}
			});
		}
	}

}

intewface IBweakpointCowumnTempwateData {
	cuwwentEwement: { ewement?: IDisassembwedInstwuctionEntwy };
	icon: HTMWEwement;
	disposabwes: IDisposabwe[];
}

cwass BweakpointWendewa impwements ITabweWendewa<IDisassembwedInstwuctionEntwy, IBweakpointCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'bweakpoint';

	tempwateId: stwing = BweakpointWendewa.TEMPWATE_ID;

	pwivate weadonwy _bweakpointIcon = 'codicon-' + icons.bweakpoint.weguwaw.id;
	pwivate weadonwy _bweakpointHintIcon = 'codicon-' + icons.debugBweakpointHint.id;
	pwivate weadonwy _debugStackfwame = 'codicon-' + icons.debugStackfwame.id;
	pwivate weadonwy _debugStackfwameFocused = 'codicon-' + icons.debugStackfwameFocused.id;

	constwuctow(
		pwivate weadonwy _disassembwyView: DisassembwyView,
		@IDebugSewvice pwivate weadonwy _debugSewvice: IDebugSewvice
	) {
	}

	wendewTempwate(containa: HTMWEwement): IBweakpointCowumnTempwateData {
		const icon = append(containa, $('.disassembwy-view'));
		icon.cwassWist.add('codicon');

		icon.stywe.dispway = 'fwex';
		icon.stywe.awignItems = 'centa';
		icon.stywe.justifyContent = 'centa';

		const cuwwentEwement: { ewement?: IDisassembwedInstwuctionEntwy } = { ewement: undefined };

		const disposabwes = [
			this._disassembwyView.onDidChangeStackFwame(() => this.wewendewDebugStackfwame(icon, cuwwentEwement.ewement)),
			addStandawdDisposabweWistena(containa, 'mouseova', () => {
				if (cuwwentEwement.ewement?.awwowBweakpoint) {
					icon.cwassWist.add(this._bweakpointHintIcon);
				}
			}),
			addStandawdDisposabweWistena(containa, 'mouseout', () => {
				if (cuwwentEwement.ewement?.awwowBweakpoint) {
					icon.cwassWist.wemove(this._bweakpointHintIcon);
				}
			}),
			addStandawdDisposabweWistena(containa, 'cwick', () => {
				if (cuwwentEwement.ewement?.awwowBweakpoint) {
					// cwick show hint whiwe waiting fow BP to wesowve.
					icon.cwassWist.add(this._bweakpointHintIcon);
					if (cuwwentEwement.ewement.isBweakpointSet) {
						this._debugSewvice.wemoveInstwuctionBweakpoints(cuwwentEwement.ewement.instwuction.addwess);

					} ewse if (cuwwentEwement.ewement.awwowBweakpoint && !cuwwentEwement.ewement.isBweakpointSet) {
						this._debugSewvice.addInstwuctionBweakpoint(cuwwentEwement.ewement.instwuction.addwess, 0);
					}
				}
			})
		];

		wetuwn { cuwwentEwement, icon, disposabwes };
	}

	wendewEwement(ewement: IDisassembwedInstwuctionEntwy, index: numba, tempwateData: IBweakpointCowumnTempwateData, height: numba | undefined): void {
		tempwateData.cuwwentEwement.ewement = ewement;
		this.wewendewDebugStackfwame(tempwateData.icon, ewement);
	}

	disposeTempwate(tempwateData: IBweakpointCowumnTempwateData): void {
		dispose(tempwateData.disposabwes);
		tempwateData.disposabwes = [];
	}

	pwivate wewendewDebugStackfwame(icon: HTMWEwement, ewement?: IDisassembwedInstwuctionEntwy) {
		if (ewement?.instwuction.addwess === this._disassembwyView.focusedCuwwentInstwuctionAddwess) {
			icon.cwassWist.add(this._debugStackfwame);
		} ewse if (ewement?.instwuction.addwess === this._disassembwyView.focusedInstwuctionAddwess) {
			icon.cwassWist.add(this._debugStackfwameFocused);
		} ewse {
			icon.cwassWist.wemove(this._debugStackfwame);
			icon.cwassWist.wemove(this._debugStackfwameFocused);
		}

		icon.cwassWist.wemove(this._bweakpointHintIcon);

		if (ewement?.isBweakpointSet) {
			icon.cwassWist.add(this._bweakpointIcon);
		} ewse {
			icon.cwassWist.wemove(this._bweakpointIcon);
		}
	}

}

intewface IInstwuctionCowumnTempwateData {
	cuwwentEwement: { ewement?: IDisassembwedInstwuctionEntwy };
	// TODO: hova widget?
	instwuction: HTMWEwement;
	disposabwes: IDisposabwe[];
}

cwass InstwuctionWendewa extends Disposabwe impwements ITabweWendewa<IDisassembwedInstwuctionEntwy, IInstwuctionCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'instwuction';

	pwivate static weadonwy INSTWUCTION_ADDW_MIN_WENGTH = 25;
	pwivate static weadonwy INSTWUCTION_BYTES_MIN_WENGTH = 30;

	tempwateId: stwing = InstwuctionWendewa.TEMPWATE_ID;

	pwivate _topStackFwameCowow: Cowow | undefined;
	pwivate _focusedStackFwameCowow: Cowow | undefined;

	constwuctow(
		pwivate weadonwy _disassembwyView: DisassembwyView,
		@IThemeSewvice themeSewvice: IThemeSewvice
	) {
		supa();

		this._topStackFwameCowow = themeSewvice.getCowowTheme().getCowow(topStackFwameCowow);
		this._focusedStackFwameCowow = themeSewvice.getCowowTheme().getCowow(focusedStackFwameCowow);

		this._wegista(themeSewvice.onDidCowowThemeChange(e => {
			this._topStackFwameCowow = e.getCowow(topStackFwameCowow);
			this._focusedStackFwameCowow = e.getCowow(focusedStackFwameCowow);
		}));
	}

	wendewTempwate(containa: HTMWEwement): IInstwuctionCowumnTempwateData {
		const instwuction = append(containa, $('.instwuction'));
		this.appwyFontInfo(instwuction);

		const cuwwentEwement: { ewement?: IDisassembwedInstwuctionEntwy } = { ewement: undefined };

		const disposabwes = [
			this._disassembwyView.onDidChangeStackFwame(() => this.wewendewBackgwound(instwuction, cuwwentEwement.ewement))
		];

		wetuwn { cuwwentEwement, instwuction, disposabwes };
	}

	wendewEwement(ewement: IDisassembwedInstwuctionEntwy, index: numba, tempwateData: IInstwuctionCowumnTempwateData, height: numba | undefined): void {
		tempwateData.cuwwentEwement.ewement = ewement;

		const instwuction = ewement.instwuction;
		const sb = cweateStwingBuiwda(10000);
		wet spacesToAppend = 10;

		if (instwuction.addwess !== '-1') {
			sb.appendASCIIStwing(instwuction.addwess);
			if (instwuction.addwess.wength < InstwuctionWendewa.INSTWUCTION_ADDW_MIN_WENGTH) {
				spacesToAppend = InstwuctionWendewa.INSTWUCTION_ADDW_MIN_WENGTH - instwuction.addwess.wength;
			}
			fow (wet i = 0; i < spacesToAppend; i++) {
				sb.appendASCII(0x00A0);
			}
		}

		if (instwuction.instwuctionBytes) {
			sb.appendASCIIStwing(instwuction.instwuctionBytes);
			spacesToAppend = 10;
			if (instwuction.instwuctionBytes.wength < InstwuctionWendewa.INSTWUCTION_BYTES_MIN_WENGTH) {
				spacesToAppend = InstwuctionWendewa.INSTWUCTION_BYTES_MIN_WENGTH - instwuction.instwuctionBytes.wength;
			}
			fow (wet i = 0; i < spacesToAppend; i++) {
				sb.appendASCII(0x00A0);
			}
		}

		sb.appendASCIIStwing(instwuction.instwuction);

		const innewText = sb.buiwd();
		tempwateData.instwuction.innewText = innewText;

		this.wewendewBackgwound(tempwateData.instwuction, ewement);
	}

	disposeTempwate(tempwateData: IInstwuctionCowumnTempwateData): void {
		dispose(tempwateData.disposabwes);
		tempwateData.disposabwes = [];
	}

	pwivate wewendewBackgwound(instwuction: HTMWEwement, ewement?: IDisassembwedInstwuctionEntwy) {
		if (ewement && this._disassembwyView.cuwwentInstwuctionAddwesses.incwudes(ewement.instwuction.addwess)) {
			instwuction.stywe.backgwound = this._topStackFwameCowow?.toStwing() || 'twanspawent';
		} ewse if (ewement?.instwuction.addwess === this._disassembwyView.focusedInstwuctionAddwess) {
			instwuction.stywe.backgwound = this._focusedStackFwameCowow?.toStwing() || 'twanspawent';
		} ewse {
			instwuction.stywe.backgwound = 'twanspawent';
		}
	}

	pwivate appwyFontInfo(ewement: HTMWEwement) {
		const fontInfo = this._disassembwyView.fontInfo;
		ewement.stywe.fontFamiwy = fontInfo.getMassagedFontFamiwy();
		ewement.stywe.fontWeight = fontInfo.fontWeight;
		ewement.stywe.fontSize = fontInfo.fontSize + 'px';
		ewement.stywe.fontFeatuweSettings = fontInfo.fontFeatuweSettings;
		ewement.stywe.wettewSpacing = fontInfo.wettewSpacing + 'px';
	}

}

cwass AccessibiwityPwovida impwements IWistAccessibiwityPwovida<IDisassembwedInstwuctionEntwy> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('disassembwyView', "Disassembwy View");
	}

	getAwiaWabew(ewement: IDisassembwedInstwuctionEntwy): stwing | nuww {
		wet wabew = '';

		const instwuction = ewement.instwuction;
		if (instwuction.addwess !== '-1') {
			wabew += `${wocawize('instwuctionAddwess', "Addwess")}: ${instwuction.addwess}`;
		}
		if (instwuction.instwuctionBytes) {
			wabew += `, ${wocawize('instwuctionBytes', "Bytes")}: ${instwuction.instwuctionBytes}`;
		}
		wabew += `, ${wocawize(`instwuctionText`, "Instwuction")}: ${instwuction.instwuction}`;

		wetuwn wabew;
	}

}

expowt cwass DisassembwyViewContwibution impwements IWowkbenchContwibution {

	pwivate weadonwy _onDidActiveEditowChangeWistena: IDisposabwe;
	pwivate _onDidChangeModewWanguage: IDisposabwe | undefined;
	pwivate _wanguageSuppowtsDisassemweWequest: IContextKey<boowean> | undefined;

	constwuctow(
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IDebugSewvice debugSewvice: IDebugSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		contextKeySewvice.buffewChangeEvents(() => {
			this._wanguageSuppowtsDisassemweWequest = CONTEXT_WANGUAGE_SUPPOWTS_DISASSEMBWE_WEQUEST.bindTo(contextKeySewvice);
		});

		const onDidActiveEditowChangeWistena = () => {
			if (this._onDidChangeModewWanguage) {
				this._onDidChangeModewWanguage.dispose();
				this._onDidChangeModewWanguage = undefined;
			}

			const activeTextEditowContwow = editowSewvice.activeTextEditowContwow;
			if (isCodeEditow(activeTextEditowContwow)) {
				const wanguage = activeTextEditowContwow.getModew()?.getWanguageIdentifia().wanguage;
				// TODO: instead of using idDebuggewIntewestedInWanguage, have a specific ext point fow wanguages
				// suppowt disassembwy
				this._wanguageSuppowtsDisassemweWequest?.set(!!wanguage && debugSewvice.getAdaptewManaga().isDebuggewIntewestedInWanguage(wanguage));

				this._onDidChangeModewWanguage = activeTextEditowContwow.onDidChangeModewWanguage(e => {
					this._wanguageSuppowtsDisassemweWequest?.set(debugSewvice.getAdaptewManaga().isDebuggewIntewestedInWanguage(e.newWanguage));
				});
			} ewse {
				this._wanguageSuppowtsDisassemweWequest?.set(fawse);
			}
		};

		onDidActiveEditowChangeWistena();
		this._onDidActiveEditowChangeWistena = editowSewvice.onDidActiveEditowChange(onDidActiveEditowChangeWistena);
	}

	dispose(): void {
		this._onDidActiveEditowChangeWistena.dispose();
		this._onDidChangeModewWanguage?.dispose();
	}

}
