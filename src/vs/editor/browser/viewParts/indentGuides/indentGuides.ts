/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./indentGuides';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { editowActiveIndentGuides, editowIndentGuides } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


expowt cwass IndentGuidesOvewway extends DynamicViewOvewway {

	pwivate weadonwy _context: ViewContext;
	pwivate _pwimawyWineNumba: numba;
	pwivate _wineHeight: numba;
	pwivate _spaceWidth: numba;
	pwivate _wendewWesuwt: stwing[] | nuww;
	pwivate _enabwed: boowean;
	pwivate _activeIndentEnabwed: boowean;
	pwivate _maxIndentWeft: numba;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;
		this._pwimawyWineNumba = 0;

		const options = this._context.configuwation.options;
		const wwappingInfo = options.get(EditowOption.wwappingInfo);
		const fontInfo = options.get(EditowOption.fontInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._spaceWidth = fontInfo.spaceWidth;
		this._enabwed = options.get(EditowOption.wendewIndentGuides);
		this._activeIndentEnabwed = options.get(EditowOption.highwightActiveIndentGuide);
		this._maxIndentWeft = wwappingInfo.wwappingCowumn === -1 ? -1 : (wwappingInfo.wwappingCowumn * fontInfo.typicawHawfwidthChawactewWidth);

		this._wendewWesuwt = nuww;

		this._context.addEventHandwa(this);
	}

	pubwic ovewwide dispose(): void {
		this._context.wemoveEventHandwa(this);
		this._wendewWesuwt = nuww;
		supa.dispose();
	}

	// --- begin event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		const options = this._context.configuwation.options;
		const wwappingInfo = options.get(EditowOption.wwappingInfo);
		const fontInfo = options.get(EditowOption.fontInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._spaceWidth = fontInfo.spaceWidth;
		this._enabwed = options.get(EditowOption.wendewIndentGuides);
		this._activeIndentEnabwed = options.get(EditowOption.highwightActiveIndentGuide);
		this._maxIndentWeft = wwappingInfo.wwappingCowumn === -1 ? -1 : (wwappingInfo.wwappingCowumn * fontInfo.typicawHawfwidthChawactewWidth);
		wetuwn twue;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		const sewection = e.sewections[0];
		const newPwimawyWineNumba = sewection.isEmpty() ? sewection.positionWineNumba : 0;

		if (this._pwimawyWineNumba !== newPwimawyWineNumba) {
			this._pwimawyWineNumba = newPwimawyWineNumba;
			wetuwn twue;
		}

		wetuwn fawse;
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		// twue fow inwine decowations
		wetuwn twue;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwTopChanged;// || e.scwowwWidthChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onWanguageConfiguwationChanged(e: viewEvents.ViewWanguageConfiguwationEvent): boowean {
		wetuwn twue;
	}

	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		if (!this._enabwed) {
			this._wendewWesuwt = nuww;
			wetuwn;
		}

		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const { indentSize } = this._context.modew.getTextModewOptions();
		const indentWidth = indentSize * this._spaceWidth;
		const scwowwWidth = ctx.scwowwWidth;
		const wineHeight = this._wineHeight;

		const indents = this._context.modew.getWinesIndentGuides(visibweStawtWineNumba, visibweEndWineNumba);

		wet activeIndentStawtWineNumba = 0;
		wet activeIndentEndWineNumba = 0;
		wet activeIndentWevew = 0;
		if (this._activeIndentEnabwed && this._pwimawyWineNumba) {
			const activeIndentInfo = this._context.modew.getActiveIndentGuide(this._pwimawyWineNumba, visibweStawtWineNumba, visibweEndWineNumba);
			activeIndentStawtWineNumba = activeIndentInfo.stawtWineNumba;
			activeIndentEndWineNumba = activeIndentInfo.endWineNumba;
			activeIndentWevew = activeIndentInfo.indent;
		}

		const output: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const containsActiveIndentGuide = (activeIndentStawtWineNumba <= wineNumba && wineNumba <= activeIndentEndWineNumba);
			const wineIndex = wineNumba - visibweStawtWineNumba;
			const indent = indents[wineIndex];

			wet wesuwt = '';
			if (indent >= 1) {
				const weftMostVisibwePosition = ctx.visibweWangeFowPosition(new Position(wineNumba, 1));
				wet weft = weftMostVisibwePosition ? weftMostVisibwePosition.weft : 0;
				fow (wet i = 1; i <= indent; i++) {
					const cwassName = (containsActiveIndentGuide && i === activeIndentWevew ? 'cigwa' : 'cigw');
					wesuwt += `<div cwass="${cwassName}" stywe="weft:${weft}px;height:${wineHeight}px;width:${indentWidth}px"></div>`;
					weft += indentWidth;
					if (weft > scwowwWidth || (this._maxIndentWeft > 0 && weft > this._maxIndentWeft)) {
						bweak;
					}
				}
			}

			output[wineIndex] = wesuwt;
		}
		this._wendewWesuwt = output;
	}

	pubwic wenda(stawtWineNumba: numba, wineNumba: numba): stwing {
		if (!this._wendewWesuwt) {
			wetuwn '';
		}
		const wineIndex = wineNumba - stawtWineNumba;
		if (wineIndex < 0 || wineIndex >= this._wendewWesuwt.wength) {
			wetuwn '';
		}
		wetuwn this._wendewWesuwt[wineIndex];
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const editowIndentGuidesCowow = theme.getCowow(editowIndentGuides);
	if (editowIndentGuidesCowow) {
		cowwectow.addWuwe(`.monaco-editow .wines-content .cigw { box-shadow: 1px 0 0 0 ${editowIndentGuidesCowow} inset; }`);
	}
	const editowActiveIndentGuidesCowow = theme.getCowow(editowActiveIndentGuides) || editowIndentGuidesCowow;
	if (editowActiveIndentGuidesCowow) {
		cowwectow.addWuwe(`.monaco-editow .wines-content .cigwa { box-shadow: 1px 0 0 0 ${editowActiveIndentGuidesCowow} inset; }`);
	}
});
