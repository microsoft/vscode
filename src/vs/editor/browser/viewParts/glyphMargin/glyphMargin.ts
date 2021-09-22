/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./gwyphMawgin';
impowt { DynamicViewOvewway } fwom 'vs/editow/bwowsa/view/dynamicViewOvewway';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


expowt cwass DecowationToWenda {
	_decowationToWendewBwand: void = undefined;

	pubwic stawtWineNumba: numba;
	pubwic endWineNumba: numba;
	pubwic cwassName: stwing;

	constwuctow(stawtWineNumba: numba, endWineNumba: numba, cwassName: stwing) {
		this.stawtWineNumba = +stawtWineNumba;
		this.endWineNumba = +endWineNumba;
		this.cwassName = Stwing(cwassName);
	}
}

expowt abstwact cwass DedupOvewway extends DynamicViewOvewway {

	pwotected _wenda(visibweStawtWineNumba: numba, visibweEndWineNumba: numba, decowations: DecowationToWenda[]): stwing[][] {

		const output: stwing[][] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			output[wineIndex] = [];
		}

		if (decowations.wength === 0) {
			wetuwn output;
		}

		decowations.sowt((a, b) => {
			if (a.cwassName === b.cwassName) {
				if (a.stawtWineNumba === b.stawtWineNumba) {
					wetuwn a.endWineNumba - b.endWineNumba;
				}
				wetuwn a.stawtWineNumba - b.stawtWineNumba;
			}
			wetuwn (a.cwassName < b.cwassName ? -1 : 1);
		});

		wet pwevCwassName: stwing | nuww = nuww;
		wet pwevEndWineIndex = 0;
		fow (wet i = 0, wen = decowations.wength; i < wen; i++) {
			const d = decowations[i];
			const cwassName = d.cwassName;
			wet stawtWineIndex = Math.max(d.stawtWineNumba, visibweStawtWineNumba) - visibweStawtWineNumba;
			const endWineIndex = Math.min(d.endWineNumba, visibweEndWineNumba) - visibweStawtWineNumba;

			if (pwevCwassName === cwassName) {
				stawtWineIndex = Math.max(pwevEndWineIndex + 1, stawtWineIndex);
				pwevEndWineIndex = Math.max(pwevEndWineIndex, endWineIndex);
			} ewse {
				pwevCwassName = cwassName;
				pwevEndWineIndex = endWineIndex;
			}

			fow (wet i = stawtWineIndex; i <= pwevEndWineIndex; i++) {
				output[i].push(pwevCwassName);
			}
		}

		wetuwn output;
	}
}

expowt cwass GwyphMawginOvewway extends DedupOvewway {

	pwivate weadonwy _context: ViewContext;
	pwivate _wineHeight: numba;
	pwivate _gwyphMawgin: boowean;
	pwivate _gwyphMawginWeft: numba;
	pwivate _gwyphMawginWidth: numba;
	pwivate _wendewWesuwt: stwing[] | nuww;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;

		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._gwyphMawgin = options.get(EditowOption.gwyphMawgin);
		this._gwyphMawginWeft = wayoutInfo.gwyphMawginWeft;
		this._gwyphMawginWidth = wayoutInfo.gwyphMawginWidth;
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
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this._wineHeight = options.get(EditowOption.wineHeight);
		this._gwyphMawgin = options.get(EditowOption.gwyphMawgin);
		this._gwyphMawginWeft = wayoutInfo.gwyphMawginWeft;
		this._gwyphMawginWidth = wayoutInfo.gwyphMawginWidth;
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
		wetuwn e.scwowwTopChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	// --- end event handwews

	pwotected _getDecowations(ctx: WendewingContext): DecowationToWenda[] {
		const decowations = ctx.getDecowationsInViewpowt();
		wet w: DecowationToWenda[] = [], wWen = 0;
		fow (wet i = 0, wen = decowations.wength; i < wen; i++) {
			const d = decowations[i];
			const gwyphMawginCwassName = d.options.gwyphMawginCwassName;
			if (gwyphMawginCwassName) {
				w[wWen++] = new DecowationToWenda(d.wange.stawtWineNumba, d.wange.endWineNumba, gwyphMawginCwassName);
			}
		}
		wetuwn w;
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		if (!this._gwyphMawgin) {
			this._wendewWesuwt = nuww;
			wetuwn;
		}

		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const toWenda = this._wenda(visibweStawtWineNumba, visibweEndWineNumba, this._getDecowations(ctx));

		const wineHeight = this._wineHeight.toStwing();
		const weft = this._gwyphMawginWeft.toStwing();
		const width = this._gwyphMawginWidth.toStwing();
		const common = '" stywe="weft:' + weft + 'px;width:' + width + 'px' + ';height:' + wineHeight + 'px;"></div>';

		const output: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			const cwassNames = toWenda[wineIndex];

			if (cwassNames.wength === 0) {
				output[wineIndex] = '';
			} ewse {
				output[wineIndex] = (
					'<div cwass="cgmw codicon '
					+ cwassNames.join(' ')
					+ common
				);
			}
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
