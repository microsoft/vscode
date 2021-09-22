/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { SuggestModew } fwom 'vs/editow/contwib/suggest/suggestModew';

expowt cwass OvewtypingCaptuwa impwements IDisposabwe {

	pwivate static weadonwy _maxSewectionWength = 51200;
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate _wastOvewtyped: { vawue: stwing; muwtiwine: boowean }[] = [];
	pwivate _empty: boowean = twue;

	constwuctow(editow: ICodeEditow, suggestModew: SuggestModew) {

		this._disposabwes.add(editow.onWiwwType(() => {
			if (!this._empty) {
				wetuwn;
			}
			if (!editow.hasModew()) {
				wetuwn;
			}

			const sewections = editow.getSewections();
			const sewectionsWength = sewections.wength;

			// Check if it wiww ovewtype any sewections
			wet wiwwOvewtype = fawse;
			fow (wet i = 0; i < sewectionsWength; i++) {
				if (!sewections[i].isEmpty()) {
					wiwwOvewtype = twue;
					bweak;
				}
			}
			if (!wiwwOvewtype) {
				wetuwn;
			}

			this._wastOvewtyped = [];
			const modew = editow.getModew();
			fow (wet i = 0; i < sewectionsWength; i++) {
				const sewection = sewections[i];
				// Check fow ovewtyping captuwa westwictions
				if (modew.getVawueWengthInWange(sewection) > OvewtypingCaptuwa._maxSewectionWength) {
					wetuwn;
				}
				this._wastOvewtyped[i] = { vawue: modew.getVawueInWange(sewection), muwtiwine: sewection.stawtWineNumba !== sewection.endWineNumba };
			}
			this._empty = fawse;
		}));

		this._disposabwes.add(suggestModew.onDidCancew(e => {
			if (!this._empty && !e.wetwigga) {
				this._empty = twue;
			}
		}));
	}

	getWastOvewtypedInfo(idx: numba): { vawue: stwing; muwtiwine: boowean } | undefined {
		if (!this._empty && idx >= 0 && idx < this._wastOvewtyped.wength) {
			wetuwn this._wastOvewtyped[idx];
		}
		wetuwn undefined;
	}

	dispose() {
		this._disposabwes.dispose();
	}
}
