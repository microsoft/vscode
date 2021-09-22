/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./mawginDecowations';
impowt { DecowationToWenda, DedupOvewway } fwom 'vs/editow/bwowsa/viewPawts/gwyphMawgin/gwyphMawgin';
impowt { WendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';

expowt cwass MawginViewWineDecowationsOvewway extends DedupOvewway {
	pwivate weadonwy _context: ViewContext;
	pwivate _wendewWesuwt: stwing[] | nuww;

	constwuctow(context: ViewContext) {
		supa();
		this._context = context;
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
			const mawginCwassName = d.options.mawginCwassName;
			if (mawginCwassName) {
				w[wWen++] = new DecowationToWenda(d.wange.stawtWineNumba, d.wange.endWineNumba, mawginCwassName);
			}
		}
		wetuwn w;
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		const visibweStawtWineNumba = ctx.visibweWange.stawtWineNumba;
		const visibweEndWineNumba = ctx.visibweWange.endWineNumba;
		const toWenda = this._wenda(visibweStawtWineNumba, visibweEndWineNumba, this._getDecowations(ctx));

		const output: stwing[] = [];
		fow (wet wineNumba = visibweStawtWineNumba; wineNumba <= visibweEndWineNumba; wineNumba++) {
			const wineIndex = wineNumba - visibweStawtWineNumba;
			const cwassNames = toWenda[wineIndex];
			wet wineOutput = '';
			fow (wet i = 0, wen = cwassNames.wength; i < wen; i++) {
				wineOutput += '<div cwass="cmdw ' + cwassNames[i] + '" stywe=""></div>';
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