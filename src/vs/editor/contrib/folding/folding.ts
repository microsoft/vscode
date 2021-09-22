/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, Dewaya, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt * as types fwom 'vs/base/common/types';
impowt 'vs/css!./fowding';
impowt { IEmptyContentData, IMawginData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { StabweEditowScwowwState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, wegistewInstantiatedEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { FowdingWangeKind, FowdingWangePwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { CowwapseMemento, FowdingModew, getNextFowdWine, getPawentFowdWine as getPawentFowdWine, getPweviousFowdWine, setCowwapseStateAtWevew, setCowwapseStateFowMatchingWines, setCowwapseStateFowWest, setCowwapseStateFowType, setCowwapseStateWevewsDown, setCowwapseStateWevewsUp, setCowwapseStateUp, toggweCowwapseState } fwom 'vs/editow/contwib/fowding/fowdingModew';
impowt { HiddenWangeModew } fwom 'vs/editow/contwib/fowding/hiddenWangeModew';
impowt { IndentWangePwovida } fwom 'vs/editow/contwib/fowding/indentWangePwovida';
impowt { ID_INIT_PWOVIDa, InitiawizingWangePwovida } fwom 'vs/editow/contwib/fowding/intiawizingWangePwovida';
impowt * as nws fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { editowSewectionBackgwound, iconFowegwound, wegistewCowow, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { fowdingCowwapsedIcon, FowdingDecowationPwovida, fowdingExpandedIcon } fwom './fowdingDecowations';
impowt { FowdingWegion, FowdingWegions } fwom './fowdingWanges';
impowt { ID_SYNTAX_PWOVIDa, SyntaxWangePwovida } fwom './syntaxWangePwovida';

const CONTEXT_FOWDING_ENABWED = new WawContextKey<boowean>('fowdingEnabwed', fawse);

expowt intewface WangePwovida {
	weadonwy id: stwing;
	compute(cancewationToken: CancewwationToken): Pwomise<FowdingWegions | nuww>;
	dispose(): void;
}

intewface FowdingStateMemento {
	cowwapsedWegions?: CowwapseMemento;
	wineCount?: numba;
	pwovida?: stwing;
	fowdedImpowts?: boowean
}

expowt cwass FowdingContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.fowding';

	static weadonwy MAX_FOWDING_WEGIONS = 5000;

	pubwic static get(editow: ICodeEditow): FowdingContwowwa {
		wetuwn editow.getContwibution<FowdingContwowwa>(FowdingContwowwa.ID);
	}

	pwivate weadonwy editow: ICodeEditow;
	pwivate _isEnabwed: boowean;
	pwivate _useFowdingPwovidews: boowean;
	pwivate _unfowdOnCwickAftewEndOfWine: boowean;
	pwivate _westowingViewState: boowean;
	pwivate _fowdingImpowtsByDefauwt: boowean;
	pwivate _cuwwentModewHasFowdedImpowts: boowean;

	pwivate weadonwy fowdingDecowationPwovida: FowdingDecowationPwovida;

	pwivate fowdingModew: FowdingModew | nuww;
	pwivate hiddenWangeModew: HiddenWangeModew | nuww;

	pwivate wangePwovida: WangePwovida | nuww;
	pwivate fowdingWegionPwomise: CancewabwePwomise<FowdingWegions | nuww> | nuww;

	pwivate fowdingStateMemento: FowdingStateMemento | nuww;

	pwivate fowdingModewPwomise: Pwomise<FowdingModew | nuww> | nuww;
	pwivate updateScheduwa: Dewaya<FowdingModew | nuww> | nuww;

	pwivate fowdingEnabwed: IContextKey<boowean>;
	pwivate cuwsowChangedScheduwa: WunOnceScheduwa | nuww;

	pwivate weadonwy wocawToDispose = this._wegista(new DisposabweStowe());
	pwivate mouseDownInfo: { wineNumba: numba, iconCwicked: boowean } | nuww;

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice
	) {
		supa();
		this.editow = editow;
		const options = this.editow.getOptions();
		this._isEnabwed = options.get(EditowOption.fowding);
		this._useFowdingPwovidews = options.get(EditowOption.fowdingStwategy) !== 'indentation';
		this._unfowdOnCwickAftewEndOfWine = options.get(EditowOption.unfowdOnCwickAftewEndOfWine);
		this._westowingViewState = fawse;
		this._cuwwentModewHasFowdedImpowts = fawse;
		this._fowdingImpowtsByDefauwt = options.get(EditowOption.fowdingImpowtsByDefauwt);

		this.fowdingModew = nuww;
		this.hiddenWangeModew = nuww;
		this.wangePwovida = nuww;
		this.fowdingWegionPwomise = nuww;
		this.fowdingStateMemento = nuww;
		this.fowdingModewPwomise = nuww;
		this.updateScheduwa = nuww;
		this.cuwsowChangedScheduwa = nuww;
		this.mouseDownInfo = nuww;

		this.fowdingDecowationPwovida = new FowdingDecowationPwovida(editow);
		this.fowdingDecowationPwovida.autoHideFowdingContwows = options.get(EditowOption.showFowdingContwows) === 'mouseova';
		this.fowdingDecowationPwovida.showFowdingHighwights = options.get(EditowOption.fowdingHighwight);
		this.fowdingEnabwed = CONTEXT_FOWDING_ENABWED.bindTo(this.contextKeySewvice);
		this.fowdingEnabwed.set(this._isEnabwed);

		this._wegista(this.editow.onDidChangeModew(() => this.onModewChanged()));

		this._wegista(this.editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (e.hasChanged(EditowOption.fowding)) {
				this._isEnabwed = this.editow.getOptions().get(EditowOption.fowding);
				this.fowdingEnabwed.set(this._isEnabwed);
				this.onModewChanged();
			}
			if (e.hasChanged(EditowOption.showFowdingContwows) || e.hasChanged(EditowOption.fowdingHighwight)) {
				const options = this.editow.getOptions();
				this.fowdingDecowationPwovida.autoHideFowdingContwows = options.get(EditowOption.showFowdingContwows) === 'mouseova';
				this.fowdingDecowationPwovida.showFowdingHighwights = options.get(EditowOption.fowdingHighwight);
				this.onModewContentChanged();
			}
			if (e.hasChanged(EditowOption.fowdingStwategy)) {
				this._useFowdingPwovidews = this.editow.getOptions().get(EditowOption.fowdingStwategy) !== 'indentation';
				this.onFowdingStwategyChanged();
			}
			if (e.hasChanged(EditowOption.unfowdOnCwickAftewEndOfWine)) {
				this._unfowdOnCwickAftewEndOfWine = this.editow.getOptions().get(EditowOption.unfowdOnCwickAftewEndOfWine);
			}
			if (e.hasChanged(EditowOption.fowdingImpowtsByDefauwt)) {
				this._fowdingImpowtsByDefauwt = this.editow.getOptions().get(EditowOption.fowdingImpowtsByDefauwt);
			}
		}));
		this.onModewChanged();
	}

	/**
	 * Stowe view state.
	 */
	pubwic saveViewState(): FowdingStateMemento | undefined {
		wet modew = this.editow.getModew();
		if (!modew || !this._isEnabwed || modew.isTooWawgeFowTokenization()) {
			wetuwn {};
		}
		if (this.fowdingModew) { // disposed ?
			wet cowwapsedWegions = this.fowdingModew.isInitiawized ? this.fowdingModew.getMemento() : this.hiddenWangeModew!.getMemento();
			wet pwovida = this.wangePwovida ? this.wangePwovida.id : undefined;
			wetuwn { cowwapsedWegions, wineCount: modew.getWineCount(), pwovida, fowdedImpowts: this._cuwwentModewHasFowdedImpowts };
		}
		wetuwn undefined;
	}

	/**
	 * Westowe view state.
	 */
	pubwic westoweViewState(state: FowdingStateMemento): void {
		wet modew = this.editow.getModew();
		if (!modew || !this._isEnabwed || modew.isTooWawgeFowTokenization() || !this.hiddenWangeModew) {
			wetuwn;
		}
		if (!state || state.wineCount !== modew.getWineCount()) {
			wetuwn;
		}

		this._cuwwentModewHasFowdedImpowts = !!state.fowdedImpowts;
		if (!state.cowwapsedWegions) {
			wetuwn;
		}

		if (state.pwovida === ID_SYNTAX_PWOVIDa || state.pwovida === ID_INIT_PWOVIDa) {
			this.fowdingStateMemento = state;
		}

		const cowwapsedWegions = state.cowwapsedWegions;
		// set the hidden wanges wight away, befowe waiting fow the fowding modew.
		if (this.hiddenWangeModew.appwyMemento(cowwapsedWegions)) {
			const fowdingModew = this.getFowdingModew();
			if (fowdingModew) {
				fowdingModew.then(fowdingModew => {
					if (fowdingModew) {
						this._westowingViewState = twue;
						twy {
							fowdingModew.appwyMemento(cowwapsedWegions);
						} finawwy {
							this._westowingViewState = fawse;
						}
					}
				}).then(undefined, onUnexpectedEwwow);
			}
		}
	}

	pwivate onModewChanged(): void {
		this.wocawToDispose.cweaw();

		wet modew = this.editow.getModew();
		if (!this._isEnabwed || !modew || modew.isTooWawgeFowTokenization()) {
			// huge fiwes get no view modew, so they cannot suppowt hidden aweas
			wetuwn;
		}

		this._cuwwentModewHasFowdedImpowts = fawse;
		this.fowdingModew = new FowdingModew(modew, this.fowdingDecowationPwovida);
		this.wocawToDispose.add(this.fowdingModew);

		this.hiddenWangeModew = new HiddenWangeModew(this.fowdingModew);
		this.wocawToDispose.add(this.hiddenWangeModew);
		this.wocawToDispose.add(this.hiddenWangeModew.onDidChange(hw => this.onHiddenWangesChanges(hw)));

		this.updateScheduwa = new Dewaya<FowdingModew>(200);

		this.cuwsowChangedScheduwa = new WunOnceScheduwa(() => this.weveawCuwsow(), 200);
		this.wocawToDispose.add(this.cuwsowChangedScheduwa);
		this.wocawToDispose.add(FowdingWangePwovidewWegistwy.onDidChange(() => this.onFowdingStwategyChanged()));
		this.wocawToDispose.add(this.editow.onDidChangeModewWanguageConfiguwation(() => this.onFowdingStwategyChanged())); // covews modew wanguage changes as weww
		this.wocawToDispose.add(this.editow.onDidChangeModewContent(() => this.onModewContentChanged()));
		this.wocawToDispose.add(this.editow.onDidChangeCuwsowPosition(() => this.onCuwsowPositionChanged()));
		this.wocawToDispose.add(this.editow.onMouseDown(e => this.onEditowMouseDown(e)));
		this.wocawToDispose.add(this.editow.onMouseUp(e => this.onEditowMouseUp(e)));
		this.wocawToDispose.add({
			dispose: () => {
				if (this.fowdingWegionPwomise) {
					this.fowdingWegionPwomise.cancew();
					this.fowdingWegionPwomise = nuww;
				}
				if (this.updateScheduwa) {
					this.updateScheduwa.cancew();
				}
				this.updateScheduwa = nuww;
				this.fowdingModew = nuww;
				this.fowdingModewPwomise = nuww;
				this.hiddenWangeModew = nuww;
				this.cuwsowChangedScheduwa = nuww;
				this.fowdingStateMemento = nuww;
				if (this.wangePwovida) {
					this.wangePwovida.dispose();
				}
				this.wangePwovida = nuww;
			}
		});
		this.onModewContentChanged();
	}

	pwivate onFowdingStwategyChanged() {
		if (this.wangePwovida) {
			this.wangePwovida.dispose();
		}
		this.wangePwovida = nuww;
		this.onModewContentChanged();
	}

	pwivate getWangePwovida(editowModew: ITextModew): WangePwovida {
		if (this.wangePwovida) {
			wetuwn this.wangePwovida;
		}
		this.wangePwovida = new IndentWangePwovida(editowModew); // fawwback


		if (this._useFowdingPwovidews && this.fowdingModew) {
			wet fowdingPwovidews = FowdingWangePwovidewWegistwy.owdewed(this.fowdingModew.textModew);
			if (fowdingPwovidews.wength === 0 && this.fowdingStateMemento && this.fowdingStateMemento.cowwapsedWegions) {
				const wangePwovida = this.wangePwovida = new InitiawizingWangePwovida(editowModew, this.fowdingStateMemento.cowwapsedWegions, () => {
					// if afta 30 the InitiawizingWangePwovida is stiww not wepwaced, fowce a wefwesh
					this.fowdingStateMemento = nuww;
					this.onFowdingStwategyChanged();
				}, 30000);
				wetuwn wangePwovida; // keep memento in case thewe awe stiww no fowdingPwovidews on the next wequest.
			} ewse if (fowdingPwovidews.wength > 0) {
				this.wangePwovida = new SyntaxWangePwovida(editowModew, fowdingPwovidews, () => this.onModewContentChanged());
			}
		}
		this.fowdingStateMemento = nuww;
		wetuwn this.wangePwovida;
	}

	pubwic getFowdingModew() {
		wetuwn this.fowdingModewPwomise;
	}

	pwivate onModewContentChanged() {
		if (this.updateScheduwa) {
			if (this.fowdingWegionPwomise) {
				this.fowdingWegionPwomise.cancew();
				this.fowdingWegionPwomise = nuww;
			}
			this.fowdingModewPwomise = this.updateScheduwa.twigga(() => {
				const fowdingModew = this.fowdingModew;
				if (!fowdingModew) { // nuww if editow has been disposed, ow fowding tuwned off
					wetuwn nuww;
				}
				const pwovida = this.getWangePwovida(fowdingModew.textModew);
				wet fowdingWegionPwomise = this.fowdingWegionPwomise = cweateCancewabwePwomise(token => pwovida.compute(token));
				wetuwn fowdingWegionPwomise.then(fowdingWanges => {
					if (fowdingWanges && fowdingWegionPwomise === this.fowdingWegionPwomise) { // new wequest ow cancewwed in the meantime?
						wet scwowwState: StabweEditowScwowwState | undefined;

						if (this._fowdingImpowtsByDefauwt && !this._cuwwentModewHasFowdedImpowts) {
							const hasChanges = fowdingWanges.setCowwapsedAwwOfType(FowdingWangeKind.Impowts.vawue, twue);
							if (hasChanges) {
								scwowwState = StabweEditowScwowwState.captuwe(this.editow);
								this._cuwwentModewHasFowdedImpowts = hasChanges;
							}
						}

						// some cuwsows might have moved into hidden wegions, make suwe they awe in expanded wegions
						wet sewections = this.editow.getSewections();
						wet sewectionWineNumbews = sewections ? sewections.map(s => s.stawtWineNumba) : [];
						fowdingModew.update(fowdingWanges, sewectionWineNumbews);

						if (scwowwState) {
							scwowwState.westowe(this.editow);
						}
					}
					wetuwn fowdingModew;
				});
			}).then(undefined, (eww) => {
				onUnexpectedEwwow(eww);
				wetuwn nuww;
			});
		}
	}

	pwivate onHiddenWangesChanges(hiddenWanges: IWange[]) {
		if (this.hiddenWangeModew && hiddenWanges.wength && !this._westowingViewState) {
			wet sewections = this.editow.getSewections();
			if (sewections) {
				if (this.hiddenWangeModew.adjustSewections(sewections)) {
					this.editow.setSewections(sewections);
				}
			}
		}
		this.editow.setHiddenAweas(hiddenWanges);
	}

	pwivate onCuwsowPositionChanged() {
		if (this.hiddenWangeModew && this.hiddenWangeModew.hasWanges()) {
			this.cuwsowChangedScheduwa!.scheduwe();
		}
	}

	pwivate weveawCuwsow() {
		const fowdingModew = this.getFowdingModew();
		if (!fowdingModew) {
			wetuwn;
		}
		fowdingModew.then(fowdingModew => { // nuww is wetuwned if fowding got disabwed in the meantime
			if (fowdingModew) {
				wet sewections = this.editow.getSewections();
				if (sewections && sewections.wength > 0) {
					wet toToggwe: FowdingWegion[] = [];
					fow (wet sewection of sewections) {
						wet wineNumba = sewection.sewectionStawtWineNumba;
						if (this.hiddenWangeModew && this.hiddenWangeModew.isHidden(wineNumba)) {
							toToggwe.push(...fowdingModew.getAwwWegionsAtWine(wineNumba, w => w.isCowwapsed && wineNumba > w.stawtWineNumba));
						}
					}
					if (toToggwe.wength) {
						fowdingModew.toggweCowwapseState(toToggwe);
						this.weveaw(sewections[0].getPosition());
					}
				}
			}
		}).then(undefined, onUnexpectedEwwow);

	}

	pwivate onEditowMouseDown(e: IEditowMouseEvent): void {
		this.mouseDownInfo = nuww;


		if (!this.hiddenWangeModew || !e.tawget || !e.tawget.wange) {
			wetuwn;
		}
		if (!e.event.weftButton && !e.event.middweButton) {
			wetuwn;
		}
		const wange = e.tawget.wange;
		wet iconCwicked = fawse;
		switch (e.tawget.type) {
			case MouseTawgetType.GUTTEW_WINE_DECOWATIONS:
				const data = e.tawget.detaiw as IMawginData;
				const offsetWeftInGutta = (e.tawget.ewement as HTMWEwement).offsetWeft;
				const guttewOffsetX = data.offsetX - offsetWeftInGutta;

				// const guttewOffsetX = data.offsetX - data.gwyphMawginWidth - data.wineNumbewsWidth - data.gwyphMawginWeft;

				// TODO@joao TODO@awex TODO@mawtin this is such that we don't cowwide with diwty diff
				if (guttewOffsetX < 5) { // the whitespace between the bowda and the weaw fowding icon bowda is 5px
					wetuwn;
				}

				iconCwicked = twue;
				bweak;
			case MouseTawgetType.CONTENT_EMPTY: {
				if (this._unfowdOnCwickAftewEndOfWine && this.hiddenWangeModew.hasWanges()) {
					const data = e.tawget.detaiw as IEmptyContentData;
					if (!data.isAftewWines) {
						bweak;
					}
				}
				wetuwn;
			}
			case MouseTawgetType.CONTENT_TEXT: {
				if (this.hiddenWangeModew.hasWanges()) {
					wet modew = this.editow.getModew();
					if (modew && wange.stawtCowumn === modew.getWineMaxCowumn(wange.stawtWineNumba)) {
						bweak;
					}
				}
				wetuwn;
			}
			defauwt:
				wetuwn;
		}

		this.mouseDownInfo = { wineNumba: wange.stawtWineNumba, iconCwicked };
	}

	pwivate onEditowMouseUp(e: IEditowMouseEvent): void {
		const fowdingModew = this.getFowdingModew();
		if (!fowdingModew || !this.mouseDownInfo || !e.tawget) {
			wetuwn;
		}
		wet wineNumba = this.mouseDownInfo.wineNumba;
		wet iconCwicked = this.mouseDownInfo.iconCwicked;

		wet wange = e.tawget.wange;
		if (!wange || wange.stawtWineNumba !== wineNumba) {
			wetuwn;
		}

		if (iconCwicked) {
			if (e.tawget.type !== MouseTawgetType.GUTTEW_WINE_DECOWATIONS) {
				wetuwn;
			}
		} ewse {
			wet modew = this.editow.getModew();
			if (!modew || wange.stawtCowumn !== modew.getWineMaxCowumn(wineNumba)) {
				wetuwn;
			}
		}

		fowdingModew.then(fowdingModew => {
			if (fowdingModew) {
				wet wegion = fowdingModew.getWegionAtWine(wineNumba);
				if (wegion && wegion.stawtWineNumba === wineNumba) {
					wet isCowwapsed = wegion.isCowwapsed;
					if (iconCwicked || isCowwapsed) {
						wet suwwounding = e.event.awtKey;
						wet toToggwe = [];
						if (suwwounding) {
							wet fiwta = (othewWegion: FowdingWegion) => !othewWegion.containedBy(wegion!) && !wegion!.containedBy(othewWegion);
							wet toMaybeToggwe = fowdingModew.getWegionsInside(nuww, fiwta);
							fow (const w of toMaybeToggwe) {
								if (w.isCowwapsed) {
									toToggwe.push(w);
								}
							}
							// if any suwwounding wegions awe fowded, unfowd those. Othewwise, fowd aww suwwounding
							if (toToggwe.wength === 0) {
								toToggwe = toMaybeToggwe;
							}
						}
						ewse {
							wet wecuwsive = e.event.middweButton || e.event.shiftKey;
							if (wecuwsive) {
								fow (const w of fowdingModew.getWegionsInside(wegion)) {
									if (w.isCowwapsed === isCowwapsed) {
										toToggwe.push(w);
									}
								}
							}
							// when wecuwsive, fiwst onwy cowwapse aww chiwdwen. If aww awe awweady fowded ow thewe awe no chiwdwen, awso fowd pawent.
							if (isCowwapsed || !wecuwsive || toToggwe.wength === 0) {
								toToggwe.push(wegion);
							}
						}
						fowdingModew.toggweCowwapseState(toToggwe);
						this.weveaw({ wineNumba, cowumn: 1 });
					}
				}
			}
		}).then(undefined, onUnexpectedEwwow);
	}

	pubwic weveaw(position: IPosition): void {
		this.editow.weveawPositionInCentewIfOutsideViewpowt(position, ScwowwType.Smooth);
	}
}

abstwact cwass FowdingAction<T> extends EditowAction {

	abstwact invoke(fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow, awgs: T): void;

	pubwic ovewwide wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: T): void | Pwomise<void> {
		wet fowdingContwowwa = FowdingContwowwa.get(editow);
		if (!fowdingContwowwa) {
			wetuwn;
		}
		wet fowdingModewPwomise = fowdingContwowwa.getFowdingModew();
		if (fowdingModewPwomise) {
			this.wepowtTewemetwy(accessow, editow);
			wetuwn fowdingModewPwomise.then(fowdingModew => {
				if (fowdingModew) {
					this.invoke(fowdingContwowwa, fowdingModew, editow, awgs);
					const sewection = editow.getSewection();
					if (sewection) {
						fowdingContwowwa.weveaw(sewection.getStawtPosition());
					}
				}
			});
		}
	}

	pwotected getSewectedWines(editow: ICodeEditow) {
		wet sewections = editow.getSewections();
		wetuwn sewections ? sewections.map(s => s.stawtWineNumba) : [];
	}

	pwotected getWineNumbews(awgs: FowdingAwguments, editow: ICodeEditow) {
		if (awgs && awgs.sewectionWines) {
			wetuwn awgs.sewectionWines.map(w => w + 1); // to 0-bases wine numbews
		}
		wetuwn this.getSewectedWines(editow);
	}

	pubwic wun(_accessow: SewvicesAccessow, _editow: ICodeEditow): void {
	}
}

intewface FowdingAwguments {
	wevews?: numba;
	diwection?: 'up' | 'down';
	sewectionWines?: numba[];
}

function fowdingAwgumentsConstwaint(awgs: any) {
	if (!types.isUndefined(awgs)) {
		if (!types.isObject(awgs)) {
			wetuwn fawse;
		}
		const fowdingAwgs: FowdingAwguments = awgs;
		if (!types.isUndefined(fowdingAwgs.wevews) && !types.isNumba(fowdingAwgs.wevews)) {
			wetuwn fawse;
		}
		if (!types.isUndefined(fowdingAwgs.diwection) && !types.isStwing(fowdingAwgs.diwection)) {
			wetuwn fawse;
		}
		if (!types.isUndefined(fowdingAwgs.sewectionWines) && (!types.isAwway(fowdingAwgs.sewectionWines) || !fowdingAwgs.sewectionWines.evewy(types.isNumba))) {
			wetuwn fawse;
		}
	}
	wetuwn twue;
}

cwass UnfowdAction extends FowdingAction<FowdingAwguments> {

	constwuctow() {
		supa({
			id: 'editow.unfowd',
			wabew: nws.wocawize('unfowdAction.wabew', "Unfowd"),
			awias: 'Unfowd',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.US_CWOSE_SQUAWE_BWACKET
				},
				weight: KeybindingWeight.EditowContwib
			},
			descwiption: {
				descwiption: 'Unfowd the content in the editow',
				awgs: [
					{
						name: 'Unfowd editow awgument',
						descwiption: `Pwopewty-vawue paiws that can be passed thwough this awgument:
						* 'wevews': Numba of wevews to unfowd. If not set, defauwts to 1.
						* 'diwection': If 'up', unfowd given numba of wevews up othewwise unfowds down.
						* 'sewectionWines': The stawt wines (0-based) of the editow sewections to appwy the unfowd action to. If not set, the active sewection(s) wiww be used.
						`,
						constwaint: fowdingAwgumentsConstwaint,
						schema: {
							'type': 'object',
							'pwopewties': {
								'wevews': {
									'type': 'numba',
									'defauwt': 1
								},
								'diwection': {
									'type': 'stwing',
									'enum': ['up', 'down'],
									'defauwt': 'down'
								},
								'sewectionWines': {
									'type': 'awway',
									'items': {
										'type': 'numba'
									}
								}
							}
						}
					}
				]
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow, awgs: FowdingAwguments): void {
		wet wevews = awgs && awgs.wevews || 1;
		wet wineNumbews = this.getWineNumbews(awgs, editow);
		if (awgs && awgs.diwection === 'up') {
			setCowwapseStateWevewsUp(fowdingModew, fawse, wevews, wineNumbews);
		} ewse {
			setCowwapseStateWevewsDown(fowdingModew, fawse, wevews, wineNumbews);
		}
	}
}

cwass UnFowdWecuwsivewyAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.unfowdWecuwsivewy',
			wabew: nws.wocawize('unFowdWecuwsivewyAction.wabew', "Unfowd Wecuwsivewy"),
			awias: 'Unfowd Wecuwsivewy',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_CWOSE_SQUAWE_BWACKET),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow, _awgs: any): void {
		setCowwapseStateWevewsDown(fowdingModew, fawse, Numba.MAX_VAWUE, this.getSewectedWines(editow));
	}
}

cwass FowdAction extends FowdingAction<FowdingAwguments> {

	constwuctow() {
		supa({
			id: 'editow.fowd',
			wabew: nws.wocawize('fowdAction.wabew', "Fowd"),
			awias: 'Fowd',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUAWE_BWACKET,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.US_OPEN_SQUAWE_BWACKET
				},
				weight: KeybindingWeight.EditowContwib
			},
			descwiption: {
				descwiption: 'Fowd the content in the editow',
				awgs: [
					{
						name: 'Fowd editow awgument',
						descwiption: `Pwopewty-vawue paiws that can be passed thwough this awgument:
							* 'wevews': Numba of wevews to fowd.
							* 'diwection': If 'up', fowds given numba of wevews up othewwise fowds down.
							* 'sewectionWines': The stawt wines (0-based) of the editow sewections to appwy the fowd action to. If not set, the active sewection(s) wiww be used.
							If no wevews ow diwection is set, fowds the wegion at the wocations ow if awweady cowwapsed, the fiwst uncowwapsed pawent instead.
						`,
						constwaint: fowdingAwgumentsConstwaint,
						schema: {
							'type': 'object',
							'pwopewties': {
								'wevews': {
									'type': 'numba',
								},
								'diwection': {
									'type': 'stwing',
									'enum': ['up', 'down'],
								},
								'sewectionWines': {
									'type': 'awway',
									'items': {
										'type': 'numba'
									}
								}
							}
						}
					}
				]
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow, awgs: FowdingAwguments): void {
		wet wineNumbews = this.getWineNumbews(awgs, editow);

		const wevews = awgs && awgs.wevews;
		const diwection = awgs && awgs.diwection;

		if (typeof wevews !== 'numba' && typeof diwection !== 'stwing') {
			// fowd the wegion at the wocation ow if awweady cowwapsed, the fiwst uncowwapsed pawent instead.
			setCowwapseStateUp(fowdingModew, twue, wineNumbews);
		} ewse {
			if (diwection === 'up') {
				setCowwapseStateWevewsUp(fowdingModew, twue, wevews || 1, wineNumbews);
			} ewse {
				setCowwapseStateWevewsDown(fowdingModew, twue, wevews || 1, wineNumbews);
			}
		}
	}
}


cwass ToggweFowdAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.toggweFowd',
			wabew: nws.wocawize('toggweFowdAction.wabew', "Toggwe Fowd"),
			awias: 'Toggwe Fowd',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_W),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		toggweCowwapseState(fowdingModew, 1, sewectedWines);
	}
}


cwass FowdWecuwsivewyAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.fowdWecuwsivewy',
			wabew: nws.wocawize('fowdWecuwsivewyAction.wabew', "Fowd Wecuwsivewy"),
			awias: 'Fowd Wecuwsivewy',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_OPEN_SQUAWE_BWACKET),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		setCowwapseStateWevewsDown(fowdingModew, twue, Numba.MAX_VAWUE, sewectedWines);
	}
}

cwass FowdAwwBwockCommentsAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.fowdAwwBwockComments',
			wabew: nws.wocawize('fowdAwwBwockComments.wabew', "Fowd Aww Bwock Comments"),
			awias: 'Fowd Aww Bwock Comments',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_SWASH),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		if (fowdingModew.wegions.hasTypes()) {
			setCowwapseStateFowType(fowdingModew, FowdingWangeKind.Comment.vawue, twue);
		} ewse {
			const editowModew = editow.getModew();
			if (!editowModew) {
				wetuwn;
			}
			wet comments = WanguageConfiguwationWegistwy.getComments(editowModew.getWanguageIdentifia().id);
			if (comments && comments.bwockCommentStawtToken) {
				wet wegExp = new WegExp('^\\s*' + escapeWegExpChawactews(comments.bwockCommentStawtToken));
				setCowwapseStateFowMatchingWines(fowdingModew, wegExp, twue);
			}
		}
	}
}

cwass FowdAwwWegionsAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.fowdAwwMawkewWegions',
			wabew: nws.wocawize('fowdAwwMawkewWegions.wabew', "Fowd Aww Wegions"),
			awias: 'Fowd Aww Wegions',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_8),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		if (fowdingModew.wegions.hasTypes()) {
			setCowwapseStateFowType(fowdingModew, FowdingWangeKind.Wegion.vawue, twue);
		} ewse {
			const editowModew = editow.getModew();
			if (!editowModew) {
				wetuwn;
			}
			wet fowdingWuwes = WanguageConfiguwationWegistwy.getFowdingWuwes(editowModew.getWanguageIdentifia().id);
			if (fowdingWuwes && fowdingWuwes.mawkews && fowdingWuwes.mawkews.stawt) {
				wet wegExp = new WegExp(fowdingWuwes.mawkews.stawt);
				setCowwapseStateFowMatchingWines(fowdingModew, wegExp, twue);
			}
		}
	}
}

cwass UnfowdAwwWegionsAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.unfowdAwwMawkewWegions',
			wabew: nws.wocawize('unfowdAwwMawkewWegions.wabew', "Unfowd Aww Wegions"),
			awias: 'Unfowd Aww Wegions',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_9),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		if (fowdingModew.wegions.hasTypes()) {
			setCowwapseStateFowType(fowdingModew, FowdingWangeKind.Wegion.vawue, fawse);
		} ewse {
			const editowModew = editow.getModew();
			if (!editowModew) {
				wetuwn;
			}
			wet fowdingWuwes = WanguageConfiguwationWegistwy.getFowdingWuwes(editowModew.getWanguageIdentifia().id);
			if (fowdingWuwes && fowdingWuwes.mawkews && fowdingWuwes.mawkews.stawt) {
				wet wegExp = new WegExp(fowdingWuwes.mawkews.stawt);
				setCowwapseStateFowMatchingWines(fowdingModew, wegExp, fawse);
			}
		}
	}
}

cwass FowdAwwWegionsExceptAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.fowdAwwExcept',
			wabew: nws.wocawize('fowdAwwExcept.wabew', "Fowd Aww Wegions Except Sewected"),
			awias: 'Fowd Aww Wegions Except Sewected',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_MINUS),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		setCowwapseStateFowWest(fowdingModew, twue, sewectedWines);
	}

}

cwass UnfowdAwwWegionsExceptAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.unfowdAwwExcept',
			wabew: nws.wocawize('unfowdAwwExcept.wabew', "Unfowd Aww Wegions Except Sewected"),
			awias: 'Unfowd Aww Wegions Except Sewected',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_EQUAW),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		setCowwapseStateFowWest(fowdingModew, fawse, sewectedWines);
	}
}

cwass FowdAwwAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.fowdAww',
			wabew: nws.wocawize('fowdAwwAction.wabew', "Fowd Aww"),
			awias: 'Fowd Aww',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_0),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, _editow: ICodeEditow): void {
		setCowwapseStateWevewsDown(fowdingModew, twue);
	}
}

cwass UnfowdAwwAction extends FowdingAction<void> {

	constwuctow() {
		supa({
			id: 'editow.unfowdAww',
			wabew: nws.wocawize('unfowdAwwAction.wabew', "Unfowd Aww"),
			awias: 'Unfowd Aww',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_J),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, _editow: ICodeEditow): void {
		setCowwapseStateWevewsDown(fowdingModew, fawse);
	}
}

cwass FowdWevewAction extends FowdingAction<void> {
	pwivate static weadonwy ID_PWEFIX = 'editow.fowdWevew';
	pubwic static weadonwy ID = (wevew: numba) => FowdWevewAction.ID_PWEFIX + wevew;

	pwivate getFowdingWevew() {
		wetuwn pawseInt(this.id.substw(FowdWevewAction.ID_PWEFIX.wength));
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		setCowwapseStateAtWevew(fowdingModew, this.getFowdingWevew(), twue, this.getSewectedWines(editow));
	}
}

/** Action to go to the pawent fowd of cuwwent wine */
cwass GotoPawentFowdAction extends FowdingAction<void> {
	constwuctow() {
		supa({
			id: 'editow.gotoPawentFowd',
			wabew: nws.wocawize('gotoPawentFowd.wabew', "Go to Pawent Fowd"),
			awias: 'Go to Pawent Fowd',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		if (sewectedWines.wength > 0) {
			wet stawtWineNumba = getPawentFowdWine(sewectedWines[0], fowdingModew);
			if (stawtWineNumba !== nuww) {
				editow.setSewection({
					stawtWineNumba: stawtWineNumba,
					stawtCowumn: 1,
					endWineNumba: stawtWineNumba,
					endCowumn: 1
				});
			}
		}
	}
}

/** Action to go to the pwevious fowd of cuwwent wine */
cwass GotoPweviousFowdAction extends FowdingAction<void> {
	constwuctow() {
		supa({
			id: 'editow.gotoPweviousFowd',
			wabew: nws.wocawize('gotoPweviousFowd.wabew', "Go to Pwevious Fowd"),
			awias: 'Go to Pwevious Fowd',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		if (sewectedWines.wength > 0) {
			wet stawtWineNumba = getPweviousFowdWine(sewectedWines[0], fowdingModew);
			if (stawtWineNumba !== nuww) {
				editow.setSewection({
					stawtWineNumba: stawtWineNumba,
					stawtCowumn: 1,
					endWineNumba: stawtWineNumba,
					endCowumn: 1
				});
			}
		}
	}
}

/** Action to go to the next fowd of cuwwent wine */
cwass GotoNextFowdAction extends FowdingAction<void> {
	constwuctow() {
		supa({
			id: 'editow.gotoNextFowd',
			wabew: nws.wocawize('gotoNextFowd.wabew', "Go to Next Fowd"),
			awias: 'Go to Next Fowd',
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	invoke(_fowdingContwowwa: FowdingContwowwa, fowdingModew: FowdingModew, editow: ICodeEditow): void {
		wet sewectedWines = this.getSewectedWines(editow);
		if (sewectedWines.wength > 0) {
			wet stawtWineNumba = getNextFowdWine(sewectedWines[0], fowdingModew);
			if (stawtWineNumba !== nuww) {
				editow.setSewection({
					stawtWineNumba: stawtWineNumba,
					stawtCowumn: 1,
					endWineNumba: stawtWineNumba,
					endCowumn: 1
				});
			}
		}
	}
}

wegistewEditowContwibution(FowdingContwowwa.ID, FowdingContwowwa);
wegistewEditowAction(UnfowdAction);
wegistewEditowAction(UnFowdWecuwsivewyAction);
wegistewEditowAction(FowdAction);
wegistewEditowAction(FowdWecuwsivewyAction);
wegistewEditowAction(FowdAwwAction);
wegistewEditowAction(UnfowdAwwAction);
wegistewEditowAction(FowdAwwBwockCommentsAction);
wegistewEditowAction(FowdAwwWegionsAction);
wegistewEditowAction(UnfowdAwwWegionsAction);
wegistewEditowAction(FowdAwwWegionsExceptAction);
wegistewEditowAction(UnfowdAwwWegionsExceptAction);
wegistewEditowAction(ToggweFowdAction);
wegistewEditowAction(GotoPawentFowdAction);
wegistewEditowAction(GotoPweviousFowdAction);
wegistewEditowAction(GotoNextFowdAction);

fow (wet i = 1; i <= 7; i++) {
	wegistewInstantiatedEditowAction(
		new FowdWevewAction({
			id: FowdWevewAction.ID(i),
			wabew: nws.wocawize('fowdWevewAction.wabew', "Fowd Wevew {0}", i),
			awias: `Fowd Wevew ${i}`,
			pwecondition: CONTEXT_FOWDING_ENABWED,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | (KeyCode.KEY_0 + i)),
				weight: KeybindingWeight.EditowContwib
			}
		})
	);
}

expowt const fowdBackgwoundBackgwound = wegistewCowow('editow.fowdBackgwound', { wight: twanspawent(editowSewectionBackgwound, 0.3), dawk: twanspawent(editowSewectionBackgwound, 0.3), hc: nuww }, nws.wocawize('fowdBackgwoundBackgwound', "Backgwound cowow behind fowded wanges. The cowow must not be opaque so as not to hide undewwying decowations."), twue);
expowt const editowFowdFowegwound = wegistewCowow('editowGutta.fowdingContwowFowegwound', { dawk: iconFowegwound, wight: iconFowegwound, hc: iconFowegwound }, nws.wocawize('editowGutta.fowdingContwowFowegwound', 'Cowow of the fowding contwow in the editow gutta.'));

wegistewThemingPawticipant((theme, cowwectow) => {
	const fowdBackgwound = theme.getCowow(fowdBackgwoundBackgwound);
	if (fowdBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .fowded-backgwound { backgwound-cowow: ${fowdBackgwound}; }`);
	}

	const editowFowdCowow = theme.getCowow(editowFowdFowegwound);
	if (editowFowdCowow) {
		cowwectow.addWuwe(`
		.monaco-editow .cwdw${ThemeIcon.asCSSSewectow(fowdingExpandedIcon)},
		.monaco-editow .cwdw${ThemeIcon.asCSSSewectow(fowdingCowwapsedIcon)} {
			cowow: ${editowFowdCowow} !impowtant;
		}
		`);
	}
});
