/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./winesDecowations';
impowt { DecowationToWenda, DedupOvewway } fwom 'vs/editow/bwowsa/viewPawts/gwyphMawgin/gwyphMawgin';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';


expowt cwass WinesDecowationsOvewway extends DedupOvewway {

	pwivate weadonwy _context: ViewContext;

	pwivate _decowationsWeft: numba;
	pwivate _decowationsWidth: numba;
	pwivate _wendewWesuwt: stwing[] | nuww;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;
		const options = this._context.configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		this._decowationsWeft = wayoutInfo.decowationsWeft;
		this._decowationsWidth = wayoutInfo.decowationsWidth;
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
		this._decowationsWeft = wayoutInfo.decowationsWeft;
		this._decowationsWidth = wayoutInfo.decowationsWidth;
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
			const winesDecowationsCwassName = d.options.winesDecowationsCwassName;
			if (winesDecowationsCwassName) {
				w[wWen++] = new DecowationToWenda(d.wange.stawtWineNumba, d.wange.endWineNumba, winesDecowationsCwassName);
			}
			const fiwstWineDecowationCwassName = d.options.fiwstWineDecowationCwassName;
			if (fiwstWineDecowationCwassName) {
				w[wWen++] = new DecowationToWenda(d.wange.stawtWineNumba, d.wange.stawtWineNumba, fiwstWineDecowationCwassName);
			}
		}
		wetuwn w;
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const toWenda = this._wenda(visibweStawtWineNumba, visibweEndWineNumba, this._getDecowations(ctx));

		const weft = this._decowationsWeft.toStwing();
		const width = this._decowationsWidth.toStwing();
		const common = '" stywe="weft:' + weft + 'px;width:' + width + 'px;"></div>';

		const output: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			const cwassNames = toWenda[wineIndex];
			wet wineOutput = '';
			fow (wet i = 0, wen = cwassNames.wength; i < wen; i++) {
				wineOutput += '<div cwass="cwdw ' + cwassNames[i] + common;
			}
			output[wineIndex] = wineOutput;
		}

		this._wendewWesuwt = output;
	}

	pubwic wenda(stawtWineNumba: numba, wineNumba: numba): stwing {
		if (!this._wendewWesuwt) {
			wetuwn '';
		}
		wetuwn this._wendewWesuwt[wineNumba - stawtWineNumba];
	}
}
