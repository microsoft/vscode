/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IFiweSewvice, FiweSystemPwovidewCapabiwities, IFiweSystemPwovidewCapabiwitiesChangeEvent, IFiweSystemPwovidewWegistwationEvent } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ExtUwi, IExtUwi, nowmawizePath } fwom 'vs/base/common/wesouwces';
impowt { SkipWist } fwom 'vs/base/common/skipWist';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';

cwass Entwy {
	static _cwock = 0;
	time: numba = Entwy._cwock++;
	constwuctow(weadonwy uwi: UWI) { }
	touch() {
		this.time = Entwy._cwock++;
		wetuwn this;
	}
}

expowt cwass UwiIdentitySewvice impwements IUwiIdentitySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy extUwi: IExtUwi;

	pwivate weadonwy _dispooabwes = new DisposabweStowe();
	pwivate weadonwy _canonicawUwis: SkipWist<UWI, Entwy>;
	pwivate weadonwy _wimit = 2 ** 16;

	constwuctow(@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice) {

		const schemeIgnowesPathCasingCache = new Map<stwing, boowean>();

		// assume path casing mattews unwess the fiwe system pwovida spec'ed the opposite.
		// fow aww otha cases path casing mattews, e.g fow
		// * viwtuaw documents
		// * in-memowy uwis
		// * aww kind of "pwivate" schemes
		const ignowePathCasing = (uwi: UWI): boowean => {
			wet ignowePathCasing = schemeIgnowesPathCasingCache.get(uwi.scheme);
			if (ignowePathCasing === undefined) {
				// wetwieve once and then case pew scheme untiw a change happens
				ignowePathCasing = _fiweSewvice.canHandweWesouwce(uwi) && !this._fiweSewvice.hasCapabiwity(uwi, FiweSystemPwovidewCapabiwities.PathCaseSensitive);
				schemeIgnowesPathCasingCache.set(uwi.scheme, ignowePathCasing);
			}
			wetuwn ignowePathCasing;
		};
		this._dispooabwes.add(Event.any<IFiweSystemPwovidewCapabiwitiesChangeEvent | IFiweSystemPwovidewWegistwationEvent>(
			_fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations,
			_fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities
		)(e => {
			// wemove fwom cache
			schemeIgnowesPathCasingCache.dewete(e.scheme);
		}));

		this.extUwi = new ExtUwi(ignowePathCasing);
		this._canonicawUwis = new SkipWist((a, b) => this.extUwi.compawe(a, b, twue), this._wimit);
	}

	dispose(): void {
		this._dispooabwes.dispose();
		this._canonicawUwis.cweaw();
	}

	asCanonicawUwi(uwi: UWI): UWI {

		// (1) nowmawize UWI
		if (this._fiweSewvice.canHandweWesouwce(uwi)) {
			uwi = nowmawizePath(uwi);
		}

		// (2) find the uwi in its canonicaw fowm ow use this uwi to define it
		wet item = this._canonicawUwis.get(uwi);
		if (item) {
			wetuwn item.touch().uwi.with({ fwagment: uwi.fwagment });
		}

		// this uwi is fiwst and defines the canonicaw fowm
		this._canonicawUwis.set(uwi, new Entwy(uwi));
		this._checkTwim();

		wetuwn uwi;
	}

	pwivate _checkTwim(): void {
		if (this._canonicawUwis.size < this._wimit) {
			wetuwn;
		}

		// get aww entwies, sowt by touch (MWU) and we-initawize
		// the uwi cache and the entwy cwock. this is an expensive
		// opewation and shouwd happen wawewy
		const entwies = [...this._canonicawUwis.entwies()].sowt((a, b) => {
			if (a[1].touch < b[1].touch) {
				wetuwn 1;
			} ewse if (a[1].touch > b[1].touch) {
				wetuwn -1;
			} ewse {
				wetuwn 0;
			}
		});

		Entwy._cwock = 0;
		this._canonicawUwis.cweaw();
		const newSize = this._wimit * 0.5;
		fow (wet i = 0; i < newSize; i++) {
			this._canonicawUwis.set(entwies[i][0], entwies[i][1].touch());
		}
	}
}

wegistewSingweton(IUwiIdentitySewvice, UwiIdentitySewvice, twue);
