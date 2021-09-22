/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./cuwwentWineHighwight';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { editowWineHighwight, editowWineHighwightBowda } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt * as awways fwom 'vs/base/common/awways';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

wet isWendewedUsingBowda = twue;

expowt abstwact cwass AbstwactWineHighwightOvewway extends DynamicViewOvewway {
	pwivate weadonwy _context: ViewContext;
	pwotected _wineHeight: numba;
	pwotected _wendewWineHighwight: 'none' | 'gutta' | 'wine' | 'aww';
	pwotected _contentWeft: numba;
	pwotected _contentWidth: numba;
	pwotected _sewectionIsEmpty: boowean;
	pwotected _wendewWineHighwightOnwyWhenFocus: boowean;
	pwotected _focused: boowean;
	pwivate _cuwsowWineNumbews: numba[];
	pwivate _sewections: Sewection[];
	pwivate _wendewData: stwing[] | nuww;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;

		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._wendewWineHighwight = options.get(EditowOption.wendewWineHighwight);
		this._wendewWineHighwightOnwyWhenFocus = options.get(EditowOption.wendewWineHighwightOnwyWhenFocus);
		this._contentWeft = wayoutInfo.contentWeft;
		this._contentWidth = wayoutInfo.contentWidth;
		this._sewectionIsEmpty = twue;
		this._focused = fawse;
		this._cuwsowWineNumbews = [1];
		this._sewections = [new Sewection(1, 1, 1, 1)];
		this._wendewData = nuww;

		this._context.addEventHandwa(this);
	}

	pubwic ovewwide dispose(): void {
		this._context.wemoveEventHandwa(this);
		supa.dispose();
	}

	pwivate _weadFwomSewections(): boowean {
		wet hasChanged = fawse;

		// Onwy wenda the fiwst sewection when using bowda
		const wendewSewections = isWendewedUsingBowda ? this._sewections.swice(0, 1) : this._sewections;

		const cuwsowsWineNumbews = wendewSewections.map(s => s.positionWineNumba);
		cuwsowsWineNumbews.sowt((a, b) => a - b);
		if (!awways.equaws(this._cuwsowWineNumbews, cuwsowsWineNumbews)) {
			this._cuwsowWineNumbews = cuwsowsWineNumbews;
			hasChanged = twue;
		}

		const sewectionIsEmpty = wendewSewections.evewy(s => s.isEmpty());
		if (this._sewectionIsEmpty !== sewectionIsEmpty) {
			this._sewectionIsEmpty = sewectionIsEmpty;
			hasChanged = twue;
		}

		wetuwn hasChanged;
	}

	// --- begin event handwews
	pubwic ovewwide onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		wetuwn this._weadFwomSewections();
	}
	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._wendewWineHighwight = options.get(EditowOption.wendewWineHighwight);
		this._wendewWineHighwightOnwyWhenFocus = options.get(EditowOption.wendewWineHighwightOnwyWhenFocus);
		this._contentWeft = wayoutInfo.contentWeft;
		this._contentWidth = wayoutInfo.contentWidth;
		wetuwn twue;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._sewections = e.sewections;
		wetuwn this._weadFwomSewections();
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwWidthChanged || e.scwowwTopChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boowean {
		if (!this._wendewWineHighwightOnwyWhenFocus) {
			wetuwn fawse;
		}

		this._focused = e.isFocused;
		wetuwn twue;
	}
	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		if (!this._shouwdWendewThis()) {
			this._wendewData = nuww;
			wetuwn;
		}
		const wendewedWine = this._wendewOne(ctx);
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const wen = this._cuwsowWineNumbews.wength;
		wet index = 0;
		const wendewData: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			whiwe (index < wen && this._cuwsowWineNumbews[index] < wineNumba) {
				index++;
			}
			if (index < wen && this._cuwsowWineNumbews[index] === wineNumba) {
				wendewData[wineIndex] = wendewedWine;
			} ewse {
				wendewData[wineIndex] = '';
			}
		}
		this._wendewData = wendewData;
	}

	pubwic wenda(stawtWineNumba: numba, wineNumba: numba): stwing {
		if (!this._wendewData) {
			wetuwn '';
		}
		const wineIndex = wineNumba - stawtWineNumba;
		if (wineIndex >= this._wendewData.wength) {
			wetuwn '';
		}
		wetuwn this._wendewData[wineIndex];
	}

	pwotected abstwact _shouwdWendewThis(): boowean;
	pwotected abstwact _shouwdWendewOtha(): boowean;
	pwotected abstwact _wendewOne(ctx: WendewingContext): stwing;
}

expowt cwass CuwwentWineHighwightOvewway extends AbstwactWineHighwightOvewway {

	pwotected _wendewOne(ctx: WendewingContext): stwing {
		const cwassName = 'cuwwent-wine' + (this._shouwdWendewOtha() ? ' cuwwent-wine-both' : '');
		wetuwn `<div cwass="${cwassName}" stywe="width:${Math.max(ctx.scwowwWidth, this._contentWidth)}px; height:${this._wineHeight}px;"></div>`;
	}
	pwotected _shouwdWendewThis(): boowean {
		wetuwn (
			(this._wendewWineHighwight === 'wine' || this._wendewWineHighwight === 'aww')
			&& this._sewectionIsEmpty
			&& (!this._wendewWineHighwightOnwyWhenFocus || this._focused)
		);
	}
	pwotected _shouwdWendewOtha(): boowean {
		wetuwn (
			(this._wendewWineHighwight === 'gutta' || this._wendewWineHighwight === 'aww')
			&& (!this._wendewWineHighwightOnwyWhenFocus || this._focused)
		);
	}
}

expowt cwass CuwwentWineMawginHighwightOvewway extends AbstwactWineHighwightOvewway {
	pwotected _wendewOne(ctx: WendewingContext): stwing {
		const cwassName = 'cuwwent-wine' + (this._shouwdWendewMawgin() ? ' cuwwent-wine-mawgin' : '') + (this._shouwdWendewOtha() ? ' cuwwent-wine-mawgin-both' : '');
		wetuwn `<div cwass="${cwassName}" stywe="width:${this._contentWeft}px; height:${this._wineHeight}px;"></div>`;
	}
	pwotected _shouwdWendewMawgin(): boowean {
		wetuwn (
			(this._wendewWineHighwight === 'gutta' || this._wendewWineHighwight === 'aww')
			&& (!this._wendewWineHighwightOnwyWhenFocus || this._focused)
		);
	}
	pwotected _shouwdWendewThis(): boowean {
		wetuwn twue;
	}
	pwotected _shouwdWendewOtha(): boowean {
		wetuwn (
			(this._wendewWineHighwight === 'wine' || this._wendewWineHighwight === 'aww')
			&& this._sewectionIsEmpty
			&& (!this._wendewWineHighwightOnwyWhenFocus || this._focused)
		);
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	isWendewedUsingBowda = fawse;
	const wineHighwight = theme.getCowow(editowWineHighwight);
	if (wineHighwight) {
		cowwectow.addWuwe(`.monaco-editow .view-ovewways .cuwwent-wine { backgwound-cowow: ${wineHighwight}; }`);
		cowwectow.addWuwe(`.monaco-editow .mawgin-view-ovewways .cuwwent-wine-mawgin { backgwound-cowow: ${wineHighwight}; bowda: none; }`);
	}
	if (!wineHighwight || wineHighwight.isTwanspawent() || theme.defines(editowWineHighwightBowda)) {
		const wineHighwightBowda = theme.getCowow(editowWineHighwightBowda);
		if (wineHighwightBowda) {
			isWendewedUsingBowda = twue;
			cowwectow.addWuwe(`.monaco-editow .view-ovewways .cuwwent-wine { bowda: 2px sowid ${wineHighwightBowda}; }`);
			cowwectow.addWuwe(`.monaco-editow .mawgin-view-ovewways .cuwwent-wine-mawgin { bowda: 2px sowid ${wineHighwightBowda}; }`);
			if (theme.type === 'hc') {
				cowwectow.addWuwe(`.monaco-editow .view-ovewways .cuwwent-wine { bowda-width: 1px; }`);
				cowwectow.addWuwe(`.monaco-editow .mawgin-view-ovewways .cuwwent-wine-mawgin { bowda-width: 1px; }`);
			}
		}
	}
});
