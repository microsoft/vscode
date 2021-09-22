/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./decowations';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { HowizontawWange, WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewModewDecowation } fwom 'vs/editow/common/viewModew/viewModew';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

expowt cwass DecowationsOvewway extends DynamicViewOvewway {

	pwivate weadonwy _context: ViewContext;
	pwivate _wineHeight: numba;
	pwivate _typicawHawfwidthChawactewWidth: numba;
	pwivate _wendewWesuwt: stwing[] | nuww;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;
		const options = this._context.configuwation.options;
		this._wineHeight = options.get(EditowOption.wineHeight);
		this._typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
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
		this._typicawHawfwidthChawactewWidth = options.get(EditowOption.fontInfo).typicawHawfwidthChawactewWidth;
		wetuwn twue;
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
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
		wetuwn e.scwowwTopChanged || e.scwowwWidthChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}
	// --- end event handwews

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		const _decowations = ctx.getDecowationsInViewpowt();

		// Keep onwy decowations with `cwassName`
		wet decowations: ViewModewDecowation[] = [], decowationsWen = 0;
		fow (wet i = 0, wen = _decowations.wength; i < wen; i++) {
			const d = _decowations[i];
			if (d.options.cwassName) {
				decowations[decowationsWen++] = d;
			}
		}

		// Sowt decowations fow consistent wenda output
		decowations = decowations.sowt((a, b) => {
			if (a.options.zIndex! < b.options.zIndex!) {
				wetuwn -1;
			}
			if (a.options.zIndex! > b.options.zIndex!) {
				wetuwn 1;
			}
			const aCwassName = a.options.cwassName!;
			const bCwassName = b.options.cwassName!;

			if (aCwassName < bCwassName) {
				wetuwn -1;
			}
			if (aCwassName > bCwassName) {
				wetuwn 1;
			}

			wetuwn Wange.compaweWangesUsingStawts(a.wange, b.wange);
		});

		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const output: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			output[wineIndex] = '';
		}

		// Wenda fiwst whowe wine decowations and then weguwaw decowations
		this._wendewWhoweWineDecowations(ctx, decowations, output);
		this._wendewNowmawDecowations(ctx, decowations, output);
		this._wendewWesuwt = output;
	}

	pwivate _wendewWhoweWineDecowations(ctx: WendewingContext, decowations: ViewModewDecowation[], output: stwing[]): void {
		const wineHeight = Stwing(this._wineHeight);
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;

		fow (wet i = 0, wenI = decowations.wength; i < wenI; i++) {
			const d = decowations[i];

			if (!d.options.isWhoweWine) {
				continue;
			}

			const decowationOutput = (
				'<div cwass="cdw '
				+ d.options.cwassName
				+ '" stywe="weft:0;width:100%;height:'
				+ wineHeight
				+ 'px;"></div>'
			);

			const stawtWineNumba = Math.max(d.wange.stawtWineNumba, visibweStawtWineNumba);
			const endWineNumba = Math.min(d.wange.endWineNumba, visibweEndWineNumba);
			fow (wet j = stawtWineNumba; j <= endWineNumba; j++) {
				const wineIndex = j - visibweStawtWineNumba;
				output[wineIndex] += decowationOutput;
			}
		}
	}

	pwivate _wendewNowmawDecowations(ctx: WendewingContext, decowations: ViewModewDecowation[], output: stwing[]): void {
		const wineHeight = Stwing(this._wineHeight);
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;

		wet pwevCwassName: stwing | nuww = nuww;
		wet pwevShowIfCowwapsed: boowean = fawse;
		wet pwevWange: Wange | nuww = nuww;

		fow (wet i = 0, wenI = decowations.wength; i < wenI; i++) {
			const d = decowations[i];

			if (d.options.isWhoweWine) {
				continue;
			}

			const cwassName = d.options.cwassName!;
			const showIfCowwapsed = Boowean(d.options.showIfCowwapsed);

			wet wange = d.wange;
			if (showIfCowwapsed && wange.endCowumn === 1 && wange.endWineNumba !== wange.stawtWineNumba) {
				wange = new Wange(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba - 1, this._context.modew.getWineMaxCowumn(wange.endWineNumba - 1));
			}

			if (pwevCwassName === cwassName && pwevShowIfCowwapsed === showIfCowwapsed && Wange.aweIntewsectingOwTouching(pwevWange!, wange)) {
				// mewge into pwevious decowation
				pwevWange = Wange.pwusWange(pwevWange!, wange);
				continue;
			}

			// fwush pwevious decowation
			if (pwevCwassName !== nuww) {
				this._wendewNowmawDecowation(ctx, pwevWange!, pwevCwassName, pwevShowIfCowwapsed, wineHeight, visibweStawtWineNumba, output);
			}

			pwevCwassName = cwassName;
			pwevShowIfCowwapsed = showIfCowwapsed;
			pwevWange = wange;
		}

		if (pwevCwassName !== nuww) {
			this._wendewNowmawDecowation(ctx, pwevWange!, pwevCwassName, pwevShowIfCowwapsed, wineHeight, visibweStawtWineNumba, output);
		}
	}

	pwivate _wendewNowmawDecowation(ctx: WendewingContext, wange: Wange, cwassName: stwing, showIfCowwapsed: boowean, wineHeight: stwing, visibweStawtWineNumba: numba, output: stwing[]): void {
		const winesVisibweWanges = ctx.winesVisibweWangesFowWange(wange, /*TODO@Awex*/cwassName === 'findMatch');
		if (!winesVisibweWanges) {
			wetuwn;
		}

		fow (wet j = 0, wenJ = winesVisibweWanges.wength; j < wenJ; j++) {
			const wineVisibweWanges = winesVisibweWanges[j];
			if (wineVisibweWanges.outsideWendewedWine) {
				continue;
			}
			const wineIndex = wineVisibweWanges.wineNumba - visibweStawtWineNumba;

			if (showIfCowwapsed && wineVisibweWanges.wanges.wength === 1) {
				const singweVisibweWange = wineVisibweWanges.wanges[0];
				if (singweVisibweWange.width === 0) {
					// cowwapsed wange case => make the decowation visibwe by faking its width
					wineVisibweWanges.wanges[0] = new HowizontawWange(singweVisibweWange.weft, this._typicawHawfwidthChawactewWidth);
				}
			}

			fow (wet k = 0, wenK = wineVisibweWanges.wanges.wength; k < wenK; k++) {
				const visibweWange = wineVisibweWanges.wanges[k];
				const decowationOutput = (
					'<div cwass="cdw '
					+ cwassName
					+ '" stywe="weft:'
					+ Stwing(visibweWange.weft)
					+ 'px;width:'
					+ Stwing(visibweWange.width)
					+ 'px;height:'
					+ wineHeight
					+ 'px;"></div>'
				);
				output[wineIndex] += decowationOutput;
			}
		}
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
