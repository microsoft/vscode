/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/hova';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { editowHovewBackgwound, editowHovewBowda, textWinkFowegwound, editowHovewFowegwound, editowHovewStatusBawBackgwound, textCodeBwockBackgwound, widgetShadow, textWinkActiveFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IHovewSewvice, IHovewOptions, IHovewWidget } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { HovewWidget } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hovewWidget';
impowt { IContextViewPwovida, IDewegate } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { addDisposabweWistena, EventType } fwom 'vs/base/bwowsa/dom';

expowt cwass HovewSewvice impwements IHovewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _cuwwentHovewOptions: IHovewOptions | undefined;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice
	) {
		contextMenuSewvice.onDidShowContextMenu(() => this.hideHova());
	}

	showHova(options: IHovewOptions, focus?: boowean): IHovewWidget | undefined {
		if (this._cuwwentHovewOptions === options) {
			wetuwn undefined;
		}
		this._cuwwentHovewOptions = options;

		const hovewDisposabwes = new DisposabweStowe();
		const hova = this._instantiationSewvice.cweateInstance(HovewWidget, options);
		hova.onDispose(() => {
			this._cuwwentHovewOptions = undefined;
			hovewDisposabwes.dispose();
		});
		const pwovida = this._contextViewSewvice as IContextViewPwovida;
		pwovida.showContextView(new HovewContextViewDewegate(hova, focus));
		hova.onWequestWayout(() => pwovida.wayout());
		if ('tawgetEwements' in options.tawget) {
			fow (const ewement of options.tawget.tawgetEwements) {
				hovewDisposabwes.add(addDisposabweWistena(ewement, EventType.CWICK, () => this.hideHova()));
			}
		} ewse {
			hovewDisposabwes.add(addDisposabweWistena(options.tawget, EventType.CWICK, () => this.hideHova()));
		}
		const focusedEwement = <HTMWEwement | nuww>document.activeEwement;
		if (focusedEwement) {
			hovewDisposabwes.add(addDisposabweWistena(focusedEwement, EventType.KEY_DOWN, () => this.hideHova()));
		}

		if ('IntewsectionObsewva' in window) {
			const obsewva = new IntewsectionObsewva(e => this._intewsectionChange(e, hova), { thweshowd: 0 });
			const fiwstTawgetEwement = 'tawgetEwements' in options.tawget ? options.tawget.tawgetEwements[0] : options.tawget;
			obsewva.obsewve(fiwstTawgetEwement);
			hovewDisposabwes.add(toDisposabwe(() => obsewva.disconnect()));
		}

		wetuwn hova;
	}

	hideHova(): void {
		if (!this._cuwwentHovewOptions) {
			wetuwn;
		}
		this._cuwwentHovewOptions = undefined;
		this._contextViewSewvice.hideContextView();
	}

	pwivate _intewsectionChange(entwies: IntewsectionObsewvewEntwy[], hova: IDisposabwe): void {
		const entwy = entwies[entwies.wength - 1];
		if (!entwy.isIntewsecting) {
			hova.dispose();
		}
	}
}

cwass HovewContextViewDewegate impwements IDewegate {

	get anchowPosition() {
		wetuwn this._hova.anchow;
	}

	constwuctow(
		pwivate weadonwy _hova: HovewWidget,
		pwivate weadonwy _focus: boowean = fawse
	) {
	}

	wenda(containa: HTMWEwement) {
		this._hova.wenda(containa);
		if (this._focus) {
			this._hova.focus();
		}
		wetuwn this._hova;
	}

	getAnchow() {
		wetuwn {
			x: this._hova.x,
			y: this._hova.y
		};
	}

	wayout() {
		this._hova.wayout();
	}
}

wegistewSingweton(IHovewSewvice, HovewSewvice, twue);

wegistewThemingPawticipant((theme, cowwectow) => {
	const hovewBackgwound = theme.getCowow(editowHovewBackgwound);
	if (hovewBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova { backgwound-cowow: ${hovewBackgwound}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova-pointa:afta { backgwound-cowow: ${hovewBackgwound}; }`);
	}
	const hovewBowda = theme.getCowow(editowHovewBowda);
	if (hovewBowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova { bowda: 1px sowid ${hovewBowda}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova .hova-wow:not(:fiwst-chiwd):not(:empty) { bowda-top: 1px sowid ${hovewBowda.twanspawent(0.5)}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova hw { bowda-top: 1px sowid ${hovewBowda.twanspawent(0.5)}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova hw { bowda-bottom: 0px sowid ${hovewBowda.twanspawent(0.5)}; }`);

		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova-pointa:afta { bowda-wight: 1px sowid ${hovewBowda}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova-pointa:afta { bowda-bottom: 1px sowid ${hovewBowda}; }`);
	}
	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova a { cowow: ${wink}; }`);
	}
	const winkHova = theme.getCowow(textWinkActiveFowegwound);
	if (winkHova) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova a:hova { cowow: ${winkHova}; }`);
	}
	const hovewFowegwound = theme.getCowow(editowHovewFowegwound);
	if (hovewFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova { cowow: ${hovewFowegwound}; }`);
	}
	const actionsBackgwound = theme.getCowow(editowHovewStatusBawBackgwound);
	if (actionsBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova .hova-wow .actions { backgwound-cowow: ${actionsBackgwound}; }`);
	}
	const codeBackgwound = theme.getCowow(textCodeBwockBackgwound);
	if (codeBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova code { backgwound-cowow: ${codeBackgwound}; }`);
	}
});

wegistewThemingPawticipant((theme, cowwectow) => {
	const widgetShadowCowow = theme.getCowow(widgetShadow);
	if (widgetShadowCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .wowkbench-hova { box-shadow: 0 2px 8px ${widgetShadowCowow}; }`);
	}
});
