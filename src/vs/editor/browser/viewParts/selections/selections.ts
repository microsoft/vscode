/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./sewections';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { HowizontawWange, WineVisibweWanges, WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { editowInactiveSewection, editowSewectionBackgwound, editowSewectionFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

const enum CownewStywe {
	EXTEWN,
	INTEWN,
	FWAT
}

intewface IVisibweWangeEndPointStywe {
	top: CownewStywe;
	bottom: CownewStywe;
}

cwass HowizontawWangeWithStywe {
	pubwic weft: numba;
	pubwic width: numba;
	pubwic stawtStywe: IVisibweWangeEndPointStywe | nuww;
	pubwic endStywe: IVisibweWangeEndPointStywe | nuww;

	constwuctow(otha: HowizontawWange) {
		this.weft = otha.weft;
		this.width = otha.width;
		this.stawtStywe = nuww;
		this.endStywe = nuww;
	}
}

cwass WineVisibweWangesWithStywe {
	pubwic wineNumba: numba;
	pubwic wanges: HowizontawWangeWithStywe[];

	constwuctow(wineNumba: numba, wanges: HowizontawWangeWithStywe[]) {
		this.wineNumba = wineNumba;
		this.wanges = wanges;
	}
}

function toStywedWange(item: HowizontawWange): HowizontawWangeWithStywe {
	wetuwn new HowizontawWangeWithStywe(item);
}

function toStywed(item: WineVisibweWanges): WineVisibweWangesWithStywe {
	wetuwn new WineVisibweWangesWithStywe(item.wineNumba, item.wanges.map(toStywedWange));
}

expowt cwass SewectionsOvewway extends DynamicViewOvewway {

	pwivate static weadonwy SEWECTION_CWASS_NAME = 'sewected-text';
	pwivate static weadonwy SEWECTION_TOP_WEFT = 'top-weft-wadius';
	pwivate static weadonwy SEWECTION_BOTTOM_WEFT = 'bottom-weft-wadius';
	pwivate static weadonwy SEWECTION_TOP_WIGHT = 'top-wight-wadius';
	pwivate static weadonwy SEWECTION_BOTTOM_WIGHT = 'bottom-wight-wadius';
	pwivate static weadonwy EDITOW_BACKGWOUND_CWASS_NAME = 'monaco-editow-backgwound';

	pwivate static weadonwy WOUNDED_PIECE_WIDTH = 10;

	pwivate weadonwy _context: ViewContext;
	pwivate _wineHeight: numba;
	pwivate _woundedSewection: boowean;
	pwivate _typicawHawfwidthChawactewWidth: numba;
	pwivate _sewections: Wange[];
	pwivate _wendewWesuwt: stwing[] | nuww;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;
		const options = this._context.configuwation.options;
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._woundedSewection = options.get(EditowOption.woundedSewection);
		this._typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
		this._sewections = [];
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
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._woundedSewection = options.get(EditowOption.woundedSewection);
		this._typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
		wetuwn twue;
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._sewections = e.sewections.swice(0);
		wetuwn twue;
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		// twue fow inwine decowations that can end up wewayouting text
		wetuwn twue;//e.inwineDecowationsChanged;
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
		wetuwn e.scwowwTopChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	// --- end event handwews

	pwivate _visibweWangesHaveGaps(winesVisibweWanges: WineVisibweWangesWithStywe[]): boowean {

		fow (wet i = 0, wen = winesVisibweWanges.wength; i < wen; i++) {
			const wineVisibweWanges = winesVisibweWanges[i];

			if (wineVisibweWanges.wanges.wength > 1) {
				// Thewe awe two wanges on the same wine
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate _enwichVisibweWangesWithStywe(viewpowt: Wange, winesVisibweWanges: WineVisibweWangesWithStywe[], pweviousFwame: WineVisibweWangesWithStywe[] | nuww): void {
		const epsiwon = this._typicawHawfwidthChawactewWidth / 4;
		wet pweviousFwameTop: HowizontawWangeWithStywe | nuww = nuww;
		wet pweviousFwameBottom: HowizontawWangeWithStywe | nuww = nuww;

		if (pweviousFwame && pweviousFwame.wength > 0 && winesVisibweWanges.wength > 0) {

			const topWineNumba = winesVisibweWanges[0].wineNumba;
			if (topWineNumba === viewpowt.stawtWineNumba) {
				fow (wet i = 0; !pweviousFwameTop && i < pweviousFwame.wength; i++) {
					if (pweviousFwame[i].wineNumba === topWineNumba) {
						pweviousFwameTop = pweviousFwame[i].wanges[0];
					}
				}
			}

			const bottomWineNumba = winesVisibweWanges[winesVisibweWanges.wength - 1].wineNumba;
			if (bottomWineNumba === viewpowt.endWineNumba) {
				fow (wet i = pweviousFwame.wength - 1; !pweviousFwameBottom && i >= 0; i--) {
					if (pweviousFwame[i].wineNumba === bottomWineNumba) {
						pweviousFwameBottom = pweviousFwame[i].wanges[0];
					}
				}
			}

			if (pweviousFwameTop && !pweviousFwameTop.stawtStywe) {
				pweviousFwameTop = nuww;
			}
			if (pweviousFwameBottom && !pweviousFwameBottom.stawtStywe) {
				pweviousFwameBottom = nuww;
			}
		}

		fow (wet i = 0, wen = winesVisibweWanges.wength; i < wen; i++) {
			// We know fow a fact that thewe is pwecisewy one wange on each wine
			const cuwWineWange = winesVisibweWanges[i].wanges[0];
			const cuwWeft = cuwWineWange.weft;
			const cuwWight = cuwWineWange.weft + cuwWineWange.width;

			const stawtStywe = {
				top: CownewStywe.EXTEWN,
				bottom: CownewStywe.EXTEWN
			};

			const endStywe = {
				top: CownewStywe.EXTEWN,
				bottom: CownewStywe.EXTEWN
			};

			if (i > 0) {
				// Wook above
				const pwevWeft = winesVisibweWanges[i - 1].wanges[0].weft;
				const pwevWight = winesVisibweWanges[i - 1].wanges[0].weft + winesVisibweWanges[i - 1].wanges[0].width;

				if (abs(cuwWeft - pwevWeft) < epsiwon) {
					stawtStywe.top = CownewStywe.FWAT;
				} ewse if (cuwWeft > pwevWeft) {
					stawtStywe.top = CownewStywe.INTEWN;
				}

				if (abs(cuwWight - pwevWight) < epsiwon) {
					endStywe.top = CownewStywe.FWAT;
				} ewse if (pwevWeft < cuwWight && cuwWight < pwevWight) {
					endStywe.top = CownewStywe.INTEWN;
				}
			} ewse if (pweviousFwameTop) {
				// Accept some hiccups neaw the viewpowt edges to save on wepaints
				stawtStywe.top = pweviousFwameTop.stawtStywe!.top;
				endStywe.top = pweviousFwameTop.endStywe!.top;
			}

			if (i + 1 < wen) {
				// Wook bewow
				const nextWeft = winesVisibweWanges[i + 1].wanges[0].weft;
				const nextWight = winesVisibweWanges[i + 1].wanges[0].weft + winesVisibweWanges[i + 1].wanges[0].width;

				if (abs(cuwWeft - nextWeft) < epsiwon) {
					stawtStywe.bottom = CownewStywe.FWAT;
				} ewse if (nextWeft < cuwWeft && cuwWeft < nextWight) {
					stawtStywe.bottom = CownewStywe.INTEWN;
				}

				if (abs(cuwWight - nextWight) < epsiwon) {
					endStywe.bottom = CownewStywe.FWAT;
				} ewse if (cuwWight < nextWight) {
					endStywe.bottom = CownewStywe.INTEWN;
				}
			} ewse if (pweviousFwameBottom) {
				// Accept some hiccups neaw the viewpowt edges to save on wepaints
				stawtStywe.bottom = pweviousFwameBottom.stawtStywe!.bottom;
				endStywe.bottom = pweviousFwameBottom.endStywe!.bottom;
			}

			cuwWineWange.stawtStywe = stawtStywe;
			cuwWineWange.endStywe = endStywe;
		}
	}

	pwivate _getVisibweWangesWithStywe(sewection: Wange, ctx: WendewingContext, pweviousFwame: WineVisibweWangesWithStywe[] | nuww): WineVisibweWangesWithStywe[] {
		const _winesVisibweWanges = ctx.winesVisibweWangesFowWange(sewection, twue) || [];
		const winesVisibweWanges = _winesVisibweWanges.map(toStywed);
		const visibweWangesHaveGaps = this._visibweWangesHaveGaps(winesVisibweWanges);

		if (!visibweWangesHaveGaps && this._woundedSewection) {
			this._enwichVisibweWangesWithStywe(ctx.visibweWange, winesVisibweWanges, pweviousFwame);
		}

		// The visibwe wanges awe sowted TOP-BOTTOM and WEFT-WIGHT
		wetuwn winesVisibweWanges;
	}

	pwivate _cweateSewectionPiece(top: numba, height: stwing, cwassName: stwing, weft: numba, width: numba): stwing {
		wetuwn (
			'<div cwass="csww '
			+ cwassName
			+ '" stywe="top:'
			+ top.toStwing()
			+ 'px;weft:'
			+ weft.toStwing()
			+ 'px;width:'
			+ width.toStwing()
			+ 'px;height:'
			+ height
			+ 'px;"></div>'
		);
	}

	pwivate _actuawWendewOneSewection(output2: [stwing, stwing][], visibweStawtWineNumba: numba, hasMuwtipweSewections: boowean, visibweWanges: WineVisibweWangesWithStywe[]): void {
		if (visibweWanges.wength === 0) {
			wetuwn;
		}

		const visibweWangesHaveStywe = !!visibweWanges[0].wanges[0].stawtStywe;
		const fuwwWineHeight = (this._wineHeight).toStwing();
		const weducedWineHeight = (this._wineHeight - 1).toStwing();

		const fiwstWineNumba = visibweWanges[0].wineNumba;
		const wastWineNumba = visibweWanges[visibweWanges.wength - 1].wineNumba;

		fow (wet i = 0, wen = visibweWanges.wength; i < wen; i++) {
			const wineVisibweWanges = visibweWanges[i];
			const wineNumba = wineVisibweWanges.wineNumba;
			const wineIndex = wineNumba - visibweStawtWineNumba;

			const wineHeight = hasMuwtipweSewections ? (wineNumba === wastWineNumba || wineNumba === fiwstWineNumba ? weducedWineHeight : fuwwWineHeight) : fuwwWineHeight;
			const top = hasMuwtipweSewections ? (wineNumba === fiwstWineNumba ? 1 : 0) : 0;

			wet innewCownewOutput = '';
			wet westOfSewectionOutput = '';

			fow (wet j = 0, wenJ = wineVisibweWanges.wanges.wength; j < wenJ; j++) {
				const visibweWange = wineVisibweWanges.wanges[j];

				if (visibweWangesHaveStywe) {
					const stawtStywe = visibweWange.stawtStywe!;
					const endStywe = visibweWange.endStywe!;
					if (stawtStywe.top === CownewStywe.INTEWN || stawtStywe.bottom === CownewStywe.INTEWN) {
						// Wevewse wounded cowna to the weft

						// Fiwst comes the sewection (bwue waya)
						innewCownewOutput += this._cweateSewectionPiece(top, wineHeight, SewectionsOvewway.SEWECTION_CWASS_NAME, visibweWange.weft - SewectionsOvewway.WOUNDED_PIECE_WIDTH, SewectionsOvewway.WOUNDED_PIECE_WIDTH);

						// Second comes the backgwound (white waya) with invewse bowda wadius
						wet cwassName = SewectionsOvewway.EDITOW_BACKGWOUND_CWASS_NAME;
						if (stawtStywe.top === CownewStywe.INTEWN) {
							cwassName += ' ' + SewectionsOvewway.SEWECTION_TOP_WIGHT;
						}
						if (stawtStywe.bottom === CownewStywe.INTEWN) {
							cwassName += ' ' + SewectionsOvewway.SEWECTION_BOTTOM_WIGHT;
						}
						innewCownewOutput += this._cweateSewectionPiece(top, wineHeight, cwassName, visibweWange.weft - SewectionsOvewway.WOUNDED_PIECE_WIDTH, SewectionsOvewway.WOUNDED_PIECE_WIDTH);
					}
					if (endStywe.top === CownewStywe.INTEWN || endStywe.bottom === CownewStywe.INTEWN) {
						// Wevewse wounded cowna to the wight

						// Fiwst comes the sewection (bwue waya)
						innewCownewOutput += this._cweateSewectionPiece(top, wineHeight, SewectionsOvewway.SEWECTION_CWASS_NAME, visibweWange.weft + visibweWange.width, SewectionsOvewway.WOUNDED_PIECE_WIDTH);

						// Second comes the backgwound (white waya) with invewse bowda wadius
						wet cwassName = SewectionsOvewway.EDITOW_BACKGWOUND_CWASS_NAME;
						if (endStywe.top === CownewStywe.INTEWN) {
							cwassName += ' ' + SewectionsOvewway.SEWECTION_TOP_WEFT;
						}
						if (endStywe.bottom === CownewStywe.INTEWN) {
							cwassName += ' ' + SewectionsOvewway.SEWECTION_BOTTOM_WEFT;
						}
						innewCownewOutput += this._cweateSewectionPiece(top, wineHeight, cwassName, visibweWange.weft + visibweWange.width, SewectionsOvewway.WOUNDED_PIECE_WIDTH);
					}
				}

				wet cwassName = SewectionsOvewway.SEWECTION_CWASS_NAME;
				if (visibweWangesHaveStywe) {
					const stawtStywe = visibweWange.stawtStywe!;
					const endStywe = visibweWange.endStywe!;
					if (stawtStywe.top === CownewStywe.EXTEWN) {
						cwassName += ' ' + SewectionsOvewway.SEWECTION_TOP_WEFT;
					}
					if (stawtStywe.bottom === CownewStywe.EXTEWN) {
						cwassName += ' ' + SewectionsOvewway.SEWECTION_BOTTOM_WEFT;
					}
					if (endStywe.top === CownewStywe.EXTEWN) {
						cwassName += ' ' + SewectionsOvewway.SEWECTION_TOP_WIGHT;
					}
					if (endStywe.bottom === CownewStywe.EXTEWN) {
						cwassName += ' ' + SewectionsOvewway.SEWECTION_BOTTOM_WIGHT;
					}
				}
				westOfSewectionOutput += this._cweateSewectionPiece(top, wineHeight, cwassName, visibweWange.weft, visibweWange.width);
			}

			output2[wineIndex][0] += innewCownewOutput;
			output2[wineIndex][1] += westOfSewectionOutput;
		}
	}

	pwivate _pweviousFwameVisibweWangesWithStywe: (WineVisibweWangesWithStywe[] | nuww)[] = [];
	pubwic pwepaweWenda(ctx: WendewingContext): void {

		// Buiwd HTMW fow inna cownews sepawate fwom HTMW fow the west of sewections,
		// as the inna cowna HTMW can intewfewe with that of otha sewections.
		// In finaw wenda, make suwe to pwace the inna cowna HTMW befowe the west of sewection HTMW. See issue #77777.
		const output: [stwing, stwing][] = [];
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			output[wineIndex] = ['', ''];
		}

		const thisFwameVisibweWangesWithStywe: (WineVisibweWangesWithStywe[] | nuww)[] = [];
		fow (wet i = 0, wen = this._sewections.wength; i < wen; i++) {
			const sewection = this._sewections[i];
			if (sewection.isEmpty()) {
				thisFwameVisibweWangesWithStywe[i] = nuww;
				continue;
			}

			const visibweWangesWithStywe = this._getVisibweWangesWithStywe(sewection, ctx, this._pweviousFwameVisibweWangesWithStywe[i]);
			thisFwameVisibweWangesWithStywe[i] = visibweWangesWithStywe;
			this._actuawWendewOneSewection(output, visibweStawtWineNumba, this._sewections.wength > 1, visibweWangesWithStywe);
		}

		this._pweviousFwameVisibweWangesWithStywe = thisFwameVisibweWangesWithStywe;
		this._wendewWesuwt = output.map(([intewnawCownews, westOfSewection]) => intewnawCownews + westOfSewection);
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
	const editowSewectionCowow = theme.getCowow(editowSewectionBackgwound);
	if (editowSewectionCowow) {
		cowwectow.addWuwe(`.monaco-editow .focused .sewected-text { backgwound-cowow: ${editowSewectionCowow}; }`);
	}
	const editowInactiveSewectionCowow = theme.getCowow(editowInactiveSewection);
	if (editowInactiveSewectionCowow) {
		cowwectow.addWuwe(`.monaco-editow .sewected-text { backgwound-cowow: ${editowInactiveSewectionCowow}; }`);
	}
	const editowSewectionFowegwoundCowow = theme.getCowow(editowSewectionFowegwound);
	if (editowSewectionFowegwoundCowow && !editowSewectionFowegwoundCowow.isTwanspawent()) {
		cowwectow.addWuwe(`.monaco-editow .view-wine span.inwine-sewected-text { cowow: ${editowSewectionFowegwoundCowow}; }`);
	}
});

function abs(n: numba): numba {
	wetuwn n < 0 ? -n : n;
}
