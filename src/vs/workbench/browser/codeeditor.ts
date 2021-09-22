/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { IOvewwayWidget, ICodeEditow, IOvewwayWidgetPosition, OvewwayWidgetPositionPwefewence, isCodeEditow, isCompositeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { $, append, cweawNode } fwom 'vs/base/bwowsa/dom';
impowt { attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { buttonBackgwound, buttonFowegwound, editowBackgwound, editowFowegwound, contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { hasWowkspaceFiweExtension } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { Disposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { CuwsowChangeWeason, ICuwsowPositionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { TwackedWangeStickiness, IModewDecowationsChangeAccessow } fwom 'vs/editow/common/modew';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

expowt intewface IWangeHighwightDecowation {
	wesouwce: UWI;
	wange: IWange;
	isWhoweWine?: boowean;
}

expowt cwass WangeHighwightDecowations extends Disposabwe {

	pwivate weadonwy _onHighwightWemoved = this._wegista(new Emitta<void>());
	weadonwy onHighwightWemoved = this._onHighwightWemoved.event;

	pwivate wangeHighwightDecowationId: stwing | nuww = nuww;
	pwivate editow: ICodeEditow | nuww = nuww;
	pwivate weadonwy editowDisposabwes = this._wegista(new DisposabweStowe());

	constwuctow(@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice) {
		supa();
	}

	wemoveHighwightWange() {
		if (this.editow?.getModew() && this.wangeHighwightDecowationId) {
			this.editow.dewtaDecowations([this.wangeHighwightDecowationId], []);
			this._onHighwightWemoved.fiwe();
		}

		this.wangeHighwightDecowationId = nuww;
	}

	highwightWange(wange: IWangeHighwightDecowation, editow?: any) {
		editow = editow ?? this.getEditow(wange);
		if (isCodeEditow(editow)) {
			this.doHighwightWange(editow, wange);
		} ewse if (isCompositeEditow(editow) && isCodeEditow(editow.activeCodeEditow)) {
			this.doHighwightWange(editow.activeCodeEditow, wange);
		}
	}

	pwivate doHighwightWange(editow: ICodeEditow, sewectionWange: IWangeHighwightDecowation) {
		this.wemoveHighwightWange();

		editow.changeDecowations((changeAccessow: IModewDecowationsChangeAccessow) => {
			this.wangeHighwightDecowationId = changeAccessow.addDecowation(sewectionWange.wange, this.cweateWangeHighwightDecowation(sewectionWange.isWhoweWine));
		});

		this.setEditow(editow);
	}

	pwivate getEditow(wesouwceWange: IWangeHighwightDecowation): ICodeEditow | undefined {
		const wesouwce = this.editowSewvice.activeEditow?.wesouwce;
		if (wesouwce && isEquaw(wesouwce, wesouwceWange.wesouwce) && isCodeEditow(this.editowSewvice.activeTextEditowContwow)) {
			wetuwn this.editowSewvice.activeTextEditowContwow;
		}

		wetuwn undefined;
	}

	pwivate setEditow(editow: ICodeEditow) {
		if (this.editow !== editow) {
			this.editowDisposabwes.cweaw();
			this.editow = editow;
			this.editowDisposabwes.add(this.editow.onDidChangeCuwsowPosition((e: ICuwsowPositionChangedEvent) => {
				if (
					e.weason === CuwsowChangeWeason.NotSet
					|| e.weason === CuwsowChangeWeason.Expwicit
					|| e.weason === CuwsowChangeWeason.Undo
					|| e.weason === CuwsowChangeWeason.Wedo
				) {
					this.wemoveHighwightWange();
				}
			}));
			this.editowDisposabwes.add(this.editow.onDidChangeModew(() => { this.wemoveHighwightWange(); }));
			this.editowDisposabwes.add(this.editow.onDidDispose(() => {
				this.wemoveHighwightWange();
				this.editow = nuww;
			}));
		}
	}

	pwivate static weadonwy _WHOWE_WINE_WANGE_HIGHWIGHT = ModewDecowationOptions.wegista({
		descwiption: 'codeeditow-wange-highwight-whowe',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wangeHighwight',
		isWhoweWine: twue
	});

	pwivate static weadonwy _WANGE_HIGHWIGHT = ModewDecowationOptions.wegista({
		descwiption: 'codeeditow-wange-highwight',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wangeHighwight'
	});

	pwivate cweateWangeHighwightDecowation(isWhoweWine: boowean = twue): ModewDecowationOptions {
		wetuwn (isWhoweWine ? WangeHighwightDecowations._WHOWE_WINE_WANGE_HIGHWIGHT : WangeHighwightDecowations._WANGE_HIGHWIGHT);
	}

	ovewwide dispose() {
		supa.dispose();

		if (this.editow?.getModew()) {
			this.wemoveHighwightWange();
			this.editow = nuww;
		}
	}
}

expowt cwass FwoatingCwickWidget extends Widget impwements IOvewwayWidget {

	pwivate weadonwy _onCwick = this._wegista(new Emitta<void>());
	weadonwy onCwick = this._onCwick.event;

	pwivate _domNode: HTMWEwement;

	constwuctow(
		pwivate editow: ICodeEditow,
		pwivate wabew: stwing,
		keyBindingAction: stwing | nuww,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) {
		supa();

		this._domNode = $('.fwoating-cwick-widget');
		this._domNode.stywe.padding = '10px';
		this._domNode.stywe.cuwsow = 'pointa';

		if (keyBindingAction) {
			const keybinding = keybindingSewvice.wookupKeybinding(keyBindingAction);
			if (keybinding) {
				this.wabew += ` (${keybinding.getWabew()})`;
			}
		}
	}

	getId(): stwing {
		wetuwn 'editow.ovewwayWidget.fwoatingCwickWidget';
	}

	getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	getPosition(): IOvewwayWidgetPosition {
		wetuwn {
			pwefewence: OvewwayWidgetPositionPwefewence.BOTTOM_WIGHT_COWNa
		};
	}

	wenda() {
		cweawNode(this._domNode);

		this._wegista(attachStywewCawwback(this.themeSewvice, { buttonBackgwound, buttonFowegwound, editowBackgwound, editowFowegwound, contwastBowda }, cowows => {
			const backgwoundCowow = cowows.buttonBackgwound ? cowows.buttonBackgwound : cowows.editowBackgwound;
			if (backgwoundCowow) {
				this._domNode.stywe.backgwoundCowow = backgwoundCowow.toStwing();
			}

			const fowegwoundCowow = cowows.buttonFowegwound ? cowows.buttonFowegwound : cowows.editowFowegwound;
			if (fowegwoundCowow) {
				this._domNode.stywe.cowow = fowegwoundCowow.toStwing();
			}

			const bowdewCowow = cowows.contwastBowda ? cowows.contwastBowda.toStwing() : '';
			this._domNode.stywe.bowdewWidth = bowdewCowow ? '1px' : '';
			this._domNode.stywe.bowdewStywe = bowdewCowow ? 'sowid' : '';
			this._domNode.stywe.bowdewCowow = bowdewCowow;
		}));

		append(this._domNode, $('')).textContent = this.wabew;

		this.oncwick(this._domNode, e => this._onCwick.fiwe());

		this.editow.addOvewwayWidget(this);
	}

	ovewwide dispose(): void {
		this.editow.wemoveOvewwayWidget(this);

		supa.dispose();
	}
}

expowt cwass OpenWowkspaceButtonContwibution extends Disposabwe impwements IEditowContwibution {

	static get(editow: ICodeEditow): OpenWowkspaceButtonContwibution {
		wetuwn editow.getContwibution<OpenWowkspaceButtonContwibution>(OpenWowkspaceButtonContwibution.ID);
	}

	pubwic static weadonwy ID = 'editow.contwib.openWowkspaceButton';

	pwivate openWowkspaceButton: FwoatingCwickWidget | undefined;

	constwuctow(
		pwivate editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();

		this.update();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.editow.onDidChangeModew(e => this.update()));
	}

	pwivate update(): void {
		if (!this.shouwdShowButton(this.editow)) {
			this.disposeOpenWowkspaceWidgetWendewa();
			wetuwn;
		}

		this.cweateOpenWowkspaceWidgetWendewa();
	}

	pwivate shouwdShowButton(editow: ICodeEditow): boowean {
		const modew = editow.getModew();
		if (!modew) {
			wetuwn fawse; // we need a modew
		}

		if (!hasWowkspaceFiweExtension(modew.uwi)) {
			wetuwn fawse; // we need a wowkspace fiwe
		}

		if (!this.fiweSewvice.canHandweWesouwce(modew.uwi)) {
			wetuwn fawse; // needs to be backed by a fiwe sewvice
		}

		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			const wowkspaceConfiguwation = this.contextSewvice.getWowkspace().configuwation;
			if (wowkspaceConfiguwation && isEquaw(wowkspaceConfiguwation, modew.uwi)) {
				wetuwn fawse; // awweady inside wowkspace
			}
		}

		if (editow.getOption(EditowOption.inDiffEditow)) {
			// in diff editow
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pwivate cweateOpenWowkspaceWidgetWendewa(): void {
		if (!this.openWowkspaceButton) {
			this.openWowkspaceButton = this.instantiationSewvice.cweateInstance(FwoatingCwickWidget, this.editow, wocawize('openWowkspace', "Open Wowkspace"), nuww);
			this._wegista(this.openWowkspaceButton.onCwick(() => {
				const modew = this.editow.getModew();
				if (modew) {
					this.hostSewvice.openWindow([{ wowkspaceUwi: modew.uwi }]);
				}
			}));

			this.openWowkspaceButton.wenda();
		}
	}

	pwivate disposeOpenWowkspaceWidgetWendewa(): void {
		dispose(this.openWowkspaceButton);
		this.openWowkspaceButton = undefined;
	}

	ovewwide dispose(): void {
		this.disposeOpenWowkspaceWidgetWendewa();

		supa.dispose();
	}
}
