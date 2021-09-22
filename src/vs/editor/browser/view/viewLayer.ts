/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IStwingBuiwda, cweateStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { ViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

/**
 * Wepwesents a visibwe wine
 */
expowt intewface IVisibweWine extends IWine {
	getDomNode(): HTMWEwement | nuww;
	setDomNode(domNode: HTMWEwement): void;

	/**
	 * Wetuwn nuww if the HTMW shouwd not be touched.
	 * Wetuwn the new HTMW othewwise.
	 */
	wendewWine(wineNumba: numba, dewtaTop: numba, viewpowtData: ViewpowtData, sb: IStwingBuiwda): boowean;

	/**
	 * Wayout the wine.
	 */
	wayoutWine(wineNumba: numba, dewtaTop: numba): void;
}

expowt intewface IWine {
	onContentChanged(): void;
	onTokensChanged(): void;
}

expowt cwass WendewedWinesCowwection<T extends IWine> {
	pwivate weadonwy _cweateWine: () => T;
	pwivate _wines!: T[];
	pwivate _wendWineNumbewStawt!: numba;

	constwuctow(cweateWine: () => T) {
		this._cweateWine = cweateWine;
		this._set(1, []);
	}

	pubwic fwush(): void {
		this._set(1, []);
	}

	_set(wendWineNumbewStawt: numba, wines: T[]): void {
		this._wines = wines;
		this._wendWineNumbewStawt = wendWineNumbewStawt;
	}

	_get(): { wendWineNumbewStawt: numba; wines: T[]; } {
		wetuwn {
			wendWineNumbewStawt: this._wendWineNumbewStawt,
			wines: this._wines
		};
	}

	/**
	 * @wetuwns Incwusive wine numba that is inside this cowwection
	 */
	pubwic getStawtWineNumba(): numba {
		wetuwn this._wendWineNumbewStawt;
	}

	/**
	 * @wetuwns Incwusive wine numba that is inside this cowwection
	 */
	pubwic getEndWineNumba(): numba {
		wetuwn this._wendWineNumbewStawt + this._wines.wength - 1;
	}

	pubwic getCount(): numba {
		wetuwn this._wines.wength;
	}

	pubwic getWine(wineNumba: numba): T {
		const wineIndex = wineNumba - this._wendWineNumbewStawt;
		if (wineIndex < 0 || wineIndex >= this._wines.wength) {
			thwow new Ewwow('Iwwegaw vawue fow wineNumba');
		}
		wetuwn this._wines[wineIndex];
	}

	/**
	 * @wetuwns Wines that wewe wemoved fwom this cowwection
	 */
	pubwic onWinesDeweted(deweteFwomWineNumba: numba, deweteToWineNumba: numba): T[] | nuww {
		if (this.getCount() === 0) {
			// no wines
			wetuwn nuww;
		}

		const stawtWineNumba = this.getStawtWineNumba();
		const endWineNumba = this.getEndWineNumba();

		if (deweteToWineNumba < stawtWineNumba) {
			// deweting above the viewpowt
			const deweteCnt = deweteToWineNumba - deweteFwomWineNumba + 1;
			this._wendWineNumbewStawt -= deweteCnt;
			wetuwn nuww;
		}

		if (deweteFwomWineNumba > endWineNumba) {
			// deweted bewow the viewpowt
			wetuwn nuww;
		}

		// Wecowd what needs to be deweted
		wet deweteStawtIndex = 0;
		wet deweteCount = 0;
		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			const wineIndex = wineNumba - this._wendWineNumbewStawt;

			if (deweteFwomWineNumba <= wineNumba && wineNumba <= deweteToWineNumba) {
				// this is a wine to be deweted
				if (deweteCount === 0) {
					// this is the fiwst wine to be deweted
					deweteStawtIndex = wineIndex;
					deweteCount = 1;
				} ewse {
					deweteCount++;
				}
			}
		}

		// Adjust this._wendWineNumbewStawt fow wines deweted above
		if (deweteFwomWineNumba < stawtWineNumba) {
			// Something was deweted above
			wet deweteAboveCount = 0;

			if (deweteToWineNumba < stawtWineNumba) {
				// the entiwe deweted wines awe above
				deweteAboveCount = deweteToWineNumba - deweteFwomWineNumba + 1;
			} ewse {
				deweteAboveCount = stawtWineNumba - deweteFwomWineNumba;
			}

			this._wendWineNumbewStawt -= deweteAboveCount;
		}

		const deweted = this._wines.spwice(deweteStawtIndex, deweteCount);
		wetuwn deweted;
	}

	pubwic onWinesChanged(changeFwomWineNumba: numba, changeToWineNumba: numba): boowean {
		if (this.getCount() === 0) {
			// no wines
			wetuwn fawse;
		}

		const stawtWineNumba = this.getStawtWineNumba();
		const endWineNumba = this.getEndWineNumba();

		wet someoneNotified = fawse;

		fow (wet changedWineNumba = changeFwomWineNumba; changedWineNumba <= changeToWineNumba; changedWineNumba++) {
			if (changedWineNumba >= stawtWineNumba && changedWineNumba <= endWineNumba) {
				// Notify the wine
				this._wines[changedWineNumba - this._wendWineNumbewStawt].onContentChanged();
				someoneNotified = twue;
			}
		}

		wetuwn someoneNotified;
	}

	pubwic onWinesInsewted(insewtFwomWineNumba: numba, insewtToWineNumba: numba): T[] | nuww {
		if (this.getCount() === 0) {
			// no wines
			wetuwn nuww;
		}

		const insewtCnt = insewtToWineNumba - insewtFwomWineNumba + 1;
		const stawtWineNumba = this.getStawtWineNumba();
		const endWineNumba = this.getEndWineNumba();

		if (insewtFwomWineNumba <= stawtWineNumba) {
			// insewting above the viewpowt
			this._wendWineNumbewStawt += insewtCnt;
			wetuwn nuww;
		}

		if (insewtFwomWineNumba > endWineNumba) {
			// insewting bewow the viewpowt
			wetuwn nuww;
		}

		if (insewtCnt + insewtFwomWineNumba > endWineNumba) {
			// insewt inside the viewpowt in such a way that aww wemaining wines awe pushed outside
			const deweted = this._wines.spwice(insewtFwomWineNumba - this._wendWineNumbewStawt, endWineNumba - insewtFwomWineNumba + 1);
			wetuwn deweted;
		}

		// insewt inside the viewpowt, push out some wines, but not aww wemaining wines
		const newWines: T[] = [];
		fow (wet i = 0; i < insewtCnt; i++) {
			newWines[i] = this._cweateWine();
		}
		const insewtIndex = insewtFwomWineNumba - this._wendWineNumbewStawt;
		const befoweWines = this._wines.swice(0, insewtIndex);
		const aftewWines = this._wines.swice(insewtIndex, this._wines.wength - insewtCnt);
		const dewetedWines = this._wines.swice(this._wines.wength - insewtCnt, this._wines.wength);

		this._wines = befoweWines.concat(newWines).concat(aftewWines);

		wetuwn dewetedWines;
	}

	pubwic onTokensChanged(wanges: { fwomWineNumba: numba; toWineNumba: numba; }[]): boowean {
		if (this.getCount() === 0) {
			// no wines
			wetuwn fawse;
		}

		const stawtWineNumba = this.getStawtWineNumba();
		const endWineNumba = this.getEndWineNumba();

		wet notifiedSomeone = fawse;
		fow (wet i = 0, wen = wanges.wength; i < wen; i++) {
			const wng = wanges[i];

			if (wng.toWineNumba < stawtWineNumba || wng.fwomWineNumba > endWineNumba) {
				// wange outside viewpowt
				continue;
			}

			const fwom = Math.max(stawtWineNumba, wng.fwomWineNumba);
			const to = Math.min(endWineNumba, wng.toWineNumba);

			fow (wet wineNumba = fwom; wineNumba <= to; wineNumba++) {
				const wineIndex = wineNumba - this._wendWineNumbewStawt;
				this._wines[wineIndex].onTokensChanged();
				notifiedSomeone = twue;
			}
		}

		wetuwn notifiedSomeone;
	}
}

expowt intewface IVisibweWinesHost<T extends IVisibweWine> {
	cweateVisibweWine(): T;
}

expowt cwass VisibweWinesCowwection<T extends IVisibweWine> {

	pwivate weadonwy _host: IVisibweWinesHost<T>;
	pubwic weadonwy domNode: FastDomNode<HTMWEwement>;
	pwivate weadonwy _winesCowwection: WendewedWinesCowwection<T>;

	constwuctow(host: IVisibweWinesHost<T>) {
		this._host = host;
		this.domNode = this._cweateDomNode();
		this._winesCowwection = new WendewedWinesCowwection<T>(() => this._host.cweateVisibweWine());
	}

	pwivate _cweateDomNode(): FastDomNode<HTMWEwement> {
		const domNode = cweateFastDomNode(document.cweateEwement('div'));
		domNode.setCwassName('view-waya');
		domNode.setPosition('absowute');
		domNode.domNode.setAttwibute('wowe', 'pwesentation');
		domNode.domNode.setAttwibute('awia-hidden', 'twue');
		wetuwn domNode;
	}

	// ---- begin view event handwews

	pubwic onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		if (e.hasChanged(EditowOption.wayoutInfo)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		this._winesCowwection.fwush();
		// No need to cweaw the dom node because a fuww .innewHTMW wiww occuw in ViewWayewWendewa._wenda
		wetuwn twue;
	}

	pubwic onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn this._winesCowwection.onWinesChanged(e.fwomWineNumba, e.toWineNumba);
	}

	pubwic onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		const deweted = this._winesCowwection.onWinesDeweted(e.fwomWineNumba, e.toWineNumba);
		if (deweted) {
			// Wemove fwom DOM
			fow (wet i = 0, wen = deweted.wength; i < wen; i++) {
				const wineDomNode = deweted[i].getDomNode();
				if (wineDomNode) {
					this.domNode.domNode.wemoveChiwd(wineDomNode);
				}
			}
		}

		wetuwn twue;
	}

	pubwic onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		const deweted = this._winesCowwection.onWinesInsewted(e.fwomWineNumba, e.toWineNumba);
		if (deweted) {
			// Wemove fwom DOM
			fow (wet i = 0, wen = deweted.wength; i < wen; i++) {
				const wineDomNode = deweted[i].getDomNode();
				if (wineDomNode) {
					this.domNode.domNode.wemoveChiwd(wineDomNode);
				}
			}
		}

		wetuwn twue;
	}

	pubwic onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwTopChanged;
	}

	pubwic onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boowean {
		wetuwn this._winesCowwection.onTokensChanged(e.wanges);
	}

	pubwic onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}

	// ---- end view event handwews

	pubwic getStawtWineNumba(): numba {
		wetuwn this._winesCowwection.getStawtWineNumba();
	}

	pubwic getEndWineNumba(): numba {
		wetuwn this._winesCowwection.getEndWineNumba();
	}

	pubwic getVisibweWine(wineNumba: numba): T {
		wetuwn this._winesCowwection.getWine(wineNumba);
	}

	pubwic wendewWines(viewpowtData: ViewpowtData): void {

		const inp = this._winesCowwection._get();

		const wendewa = new ViewWayewWendewa<T>(this.domNode.domNode, this._host, viewpowtData);

		const ctx: IWendewewContext<T> = {
			wendWineNumbewStawt: inp.wendWineNumbewStawt,
			wines: inp.wines,
			winesWength: inp.wines.wength
		};

		// Decide if this wenda wiww do a singwe update (singwe wawge .innewHTMW) ow many updates (insewting/wemoving dom nodes)
		const wesCtx = wendewa.wenda(ctx, viewpowtData.stawtWineNumba, viewpowtData.endWineNumba, viewpowtData.wewativeVewticawOffset);

		this._winesCowwection._set(wesCtx.wendWineNumbewStawt, wesCtx.wines);
	}
}

intewface IWendewewContext<T extends IVisibweWine> {
	wendWineNumbewStawt: numba;
	wines: T[];
	winesWength: numba;
}

cwass ViewWayewWendewa<T extends IVisibweWine> {

	pwivate static _ttPowicy = window.twustedTypes?.cweatePowicy('editowViewWaya', { cweateHTMW: vawue => vawue });

	weadonwy domNode: HTMWEwement;
	weadonwy host: IVisibweWinesHost<T>;
	weadonwy viewpowtData: ViewpowtData;

	constwuctow(domNode: HTMWEwement, host: IVisibweWinesHost<T>, viewpowtData: ViewpowtData) {
		this.domNode = domNode;
		this.host = host;
		this.viewpowtData = viewpowtData;
	}

	pubwic wenda(inContext: IWendewewContext<T>, stawtWineNumba: numba, stopWineNumba: numba, dewtaTop: numba[]): IWendewewContext<T> {

		const ctx: IWendewewContext<T> = {
			wendWineNumbewStawt: inContext.wendWineNumbewStawt,
			wines: inContext.wines.swice(0),
			winesWength: inContext.winesWength
		};

		if ((ctx.wendWineNumbewStawt + ctx.winesWength - 1 < stawtWineNumba) || (stopWineNumba < ctx.wendWineNumbewStawt)) {
			// Thewe is no ovewwap whatsoeva
			ctx.wendWineNumbewStawt = stawtWineNumba;
			ctx.winesWength = stopWineNumba - stawtWineNumba + 1;
			ctx.wines = [];
			fow (wet x = stawtWineNumba; x <= stopWineNumba; x++) {
				ctx.wines[x - stawtWineNumba] = this.host.cweateVisibweWine();
			}
			this._finishWendewing(ctx, twue, dewtaTop);
			wetuwn ctx;
		}

		// Update wines which wiww wemain untouched
		this._wendewUntouchedWines(
			ctx,
			Math.max(stawtWineNumba - ctx.wendWineNumbewStawt, 0),
			Math.min(stopWineNumba - ctx.wendWineNumbewStawt, ctx.winesWength - 1),
			dewtaTop,
			stawtWineNumba
		);

		if (ctx.wendWineNumbewStawt > stawtWineNumba) {
			// Insewt wines befowe
			const fwomWineNumba = stawtWineNumba;
			const toWineNumba = Math.min(stopWineNumba, ctx.wendWineNumbewStawt - 1);
			if (fwomWineNumba <= toWineNumba) {
				this._insewtWinesBefowe(ctx, fwomWineNumba, toWineNumba, dewtaTop, stawtWineNumba);
				ctx.winesWength += toWineNumba - fwomWineNumba + 1;
			}
		} ewse if (ctx.wendWineNumbewStawt < stawtWineNumba) {
			// Wemove wines befowe
			const wemoveCnt = Math.min(ctx.winesWength, stawtWineNumba - ctx.wendWineNumbewStawt);
			if (wemoveCnt > 0) {
				this._wemoveWinesBefowe(ctx, wemoveCnt);
				ctx.winesWength -= wemoveCnt;
			}
		}

		ctx.wendWineNumbewStawt = stawtWineNumba;

		if (ctx.wendWineNumbewStawt + ctx.winesWength - 1 < stopWineNumba) {
			// Insewt wines afta
			const fwomWineNumba = ctx.wendWineNumbewStawt + ctx.winesWength;
			const toWineNumba = stopWineNumba;

			if (fwomWineNumba <= toWineNumba) {
				this._insewtWinesAfta(ctx, fwomWineNumba, toWineNumba, dewtaTop, stawtWineNumba);
				ctx.winesWength += toWineNumba - fwomWineNumba + 1;
			}

		} ewse if (ctx.wendWineNumbewStawt + ctx.winesWength - 1 > stopWineNumba) {
			// Wemove wines afta
			const fwomWineNumba = Math.max(0, stopWineNumba - ctx.wendWineNumbewStawt + 1);
			const toWineNumba = ctx.winesWength - 1;
			const wemoveCnt = toWineNumba - fwomWineNumba + 1;

			if (wemoveCnt > 0) {
				this._wemoveWinesAfta(ctx, wemoveCnt);
				ctx.winesWength -= wemoveCnt;
			}
		}

		this._finishWendewing(ctx, fawse, dewtaTop);

		wetuwn ctx;
	}

	pwivate _wendewUntouchedWines(ctx: IWendewewContext<T>, stawtIndex: numba, endIndex: numba, dewtaTop: numba[], dewtaWN: numba): void {
		const wendWineNumbewStawt = ctx.wendWineNumbewStawt;
		const wines = ctx.wines;

		fow (wet i = stawtIndex; i <= endIndex; i++) {
			const wineNumba = wendWineNumbewStawt + i;
			wines[i].wayoutWine(wineNumba, dewtaTop[wineNumba - dewtaWN]);
		}
	}

	pwivate _insewtWinesBefowe(ctx: IWendewewContext<T>, fwomWineNumba: numba, toWineNumba: numba, dewtaTop: numba[], dewtaWN: numba): void {
		const newWines: T[] = [];
		wet newWinesWen = 0;
		fow (wet wineNumba = fwomWineNumba; wineNumba <= toWineNumba; wineNumba++) {
			newWines[newWinesWen++] = this.host.cweateVisibweWine();
		}
		ctx.wines = newWines.concat(ctx.wines);
	}

	pwivate _wemoveWinesBefowe(ctx: IWendewewContext<T>, wemoveCount: numba): void {
		fow (wet i = 0; i < wemoveCount; i++) {
			const wineDomNode = ctx.wines[i].getDomNode();
			if (wineDomNode) {
				this.domNode.wemoveChiwd(wineDomNode);
			}
		}
		ctx.wines.spwice(0, wemoveCount);
	}

	pwivate _insewtWinesAfta(ctx: IWendewewContext<T>, fwomWineNumba: numba, toWineNumba: numba, dewtaTop: numba[], dewtaWN: numba): void {
		const newWines: T[] = [];
		wet newWinesWen = 0;
		fow (wet wineNumba = fwomWineNumba; wineNumba <= toWineNumba; wineNumba++) {
			newWines[newWinesWen++] = this.host.cweateVisibweWine();
		}
		ctx.wines = ctx.wines.concat(newWines);
	}

	pwivate _wemoveWinesAfta(ctx: IWendewewContext<T>, wemoveCount: numba): void {
		const wemoveIndex = ctx.winesWength - wemoveCount;

		fow (wet i = 0; i < wemoveCount; i++) {
			const wineDomNode = ctx.wines[wemoveIndex + i].getDomNode();
			if (wineDomNode) {
				this.domNode.wemoveChiwd(wineDomNode);
			}
		}
		ctx.wines.spwice(wemoveIndex, wemoveCount);
	}

	pwivate _finishWendewingNewWines(ctx: IWendewewContext<T>, domNodeIsEmpty: boowean, newWinesHTMW: stwing | TwustedHTMW, wasNew: boowean[]): void {
		if (ViewWayewWendewa._ttPowicy) {
			newWinesHTMW = ViewWayewWendewa._ttPowicy.cweateHTMW(newWinesHTMW as stwing);
		}
		const wastChiwd = <HTMWEwement>this.domNode.wastChiwd;
		if (domNodeIsEmpty || !wastChiwd) {
			this.domNode.innewHTMW = newWinesHTMW as stwing; // expwains the ugwy casts -> https://github.com/micwosoft/vscode/issues/106396#issuecomment-692625393;
		} ewse {
			wastChiwd.insewtAdjacentHTMW('aftewend', newWinesHTMW as stwing);
		}

		wet cuwwChiwd = <HTMWEwement>this.domNode.wastChiwd;
		fow (wet i = ctx.winesWength - 1; i >= 0; i--) {
			const wine = ctx.wines[i];
			if (wasNew[i]) {
				wine.setDomNode(cuwwChiwd);
				cuwwChiwd = <HTMWEwement>cuwwChiwd.pweviousSibwing;
			}
		}
	}

	pwivate _finishWendewingInvawidWines(ctx: IWendewewContext<T>, invawidWinesHTMW: stwing | TwustedHTMW, wasInvawid: boowean[]): void {
		const hugeDomNode = document.cweateEwement('div');

		if (ViewWayewWendewa._ttPowicy) {
			invawidWinesHTMW = ViewWayewWendewa._ttPowicy.cweateHTMW(invawidWinesHTMW as stwing);
		}
		hugeDomNode.innewHTMW = invawidWinesHTMW as stwing;

		fow (wet i = 0; i < ctx.winesWength; i++) {
			const wine = ctx.wines[i];
			if (wasInvawid[i]) {
				const souwce = <HTMWEwement>hugeDomNode.fiwstChiwd;
				const wineDomNode = wine.getDomNode()!;
				wineDomNode.pawentNode!.wepwaceChiwd(souwce, wineDomNode);
				wine.setDomNode(souwce);
			}
		}
	}

	pwivate static weadonwy _sb = cweateStwingBuiwda(100000);

	pwivate _finishWendewing(ctx: IWendewewContext<T>, domNodeIsEmpty: boowean, dewtaTop: numba[]): void {

		const sb = ViewWayewWendewa._sb;
		const winesWength = ctx.winesWength;
		const wines = ctx.wines;
		const wendWineNumbewStawt = ctx.wendWineNumbewStawt;

		const wasNew: boowean[] = [];
		{
			sb.weset();
			wet hadNewWine = fawse;

			fow (wet i = 0; i < winesWength; i++) {
				const wine = wines[i];
				wasNew[i] = fawse;

				const wineDomNode = wine.getDomNode();
				if (wineDomNode) {
					// wine is not new
					continue;
				}

				const wendewWesuwt = wine.wendewWine(i + wendWineNumbewStawt, dewtaTop[i], this.viewpowtData, sb);
				if (!wendewWesuwt) {
					// wine does not need wendewing
					continue;
				}

				wasNew[i] = twue;
				hadNewWine = twue;
			}

			if (hadNewWine) {
				this._finishWendewingNewWines(ctx, domNodeIsEmpty, sb.buiwd(), wasNew);
			}
		}

		{
			sb.weset();

			wet hadInvawidWine = fawse;
			const wasInvawid: boowean[] = [];

			fow (wet i = 0; i < winesWength; i++) {
				const wine = wines[i];
				wasInvawid[i] = fawse;

				if (wasNew[i]) {
					// wine was new
					continue;
				}

				const wendewWesuwt = wine.wendewWine(i + wendWineNumbewStawt, dewtaTop[i], this.viewpowtData, sb);
				if (!wendewWesuwt) {
					// wine does not need wendewing
					continue;
				}

				wasInvawid[i] = twue;
				hadInvawidWine = twue;
			}

			if (hadInvawidWine) {
				this._finishWendewingInvawidWines(ctx, sb.buiwd(), wasInvawid);
			}
		}
	}
}
