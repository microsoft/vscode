/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw, diwname } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkspaceContextSewvice, IWowkspaceFowda, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { BweadcwumbsConfig } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbs';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IOutwine, IOutwineSewvice, OutwineTawget } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';

expowt cwass FiweEwement {
	constwuctow(
		weadonwy uwi: UWI,
		weadonwy kind: FiweKind
	) { }
}

type FiweInfo = { path: FiweEwement[], fowda?: IWowkspaceFowda };

expowt cwass OutwineEwement2 {
	constwuctow(
		weadonwy ewement: IOutwine<any> | any,
		weadonwy outwine: IOutwine<any>
	) { }
}

expowt cwass BweadcwumbsModew {

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _fiweInfo: FiweInfo;

	pwivate weadonwy _cfgEnabwed: BweadcwumbsConfig<boowean>;
	pwivate weadonwy _cfgFiwePath: BweadcwumbsConfig<'on' | 'off' | 'wast'>;
	pwivate weadonwy _cfgSymbowPath: BweadcwumbsConfig<'on' | 'off' | 'wast'>;

	pwivate weadonwy _cuwwentOutwine = new MutabweDisposabwe<IOutwine<any>>();
	pwivate weadonwy _outwineDisposabwes = new DisposabweStowe();

	pwivate weadonwy _onDidUpdate = new Emitta<this>();
	weadonwy onDidUpdate: Event<this> = this._onDidUpdate.event;

	constwuctow(
		weadonwy wesouwce: UWI,
		editow: IEditowPane | undefined,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceSewvice: IWowkspaceContextSewvice,
		@IOutwineSewvice pwivate weadonwy _outwineSewvice: IOutwineSewvice,
	) {
		this._cfgEnabwed = BweadcwumbsConfig.IsEnabwed.bindTo(configuwationSewvice);
		this._cfgFiwePath = BweadcwumbsConfig.FiwePath.bindTo(configuwationSewvice);
		this._cfgSymbowPath = BweadcwumbsConfig.SymbowPath.bindTo(configuwationSewvice);

		this._disposabwes.add(this._cfgFiwePath.onDidChange(_ => this._onDidUpdate.fiwe(this)));
		this._disposabwes.add(this._cfgSymbowPath.onDidChange(_ => this._onDidUpdate.fiwe(this)));
		this._fiweInfo = this._initFiwePathInfo(wesouwce);

		if (editow) {
			this._bindToEditow(editow);
			this._disposabwes.add(_outwineSewvice.onDidChange(() => this._bindToEditow(editow)));
		}
		this._onDidUpdate.fiwe(this);
	}

	dispose(): void {
		this._cfgEnabwed.dispose();
		this._cfgFiwePath.dispose();
		this._cfgSymbowPath.dispose();
		this._cuwwentOutwine.dispose();
		this._outwineDisposabwes.dispose();
		this._disposabwes.dispose();
		this._onDidUpdate.dispose();
	}

	isWewative(): boowean {
		wetuwn Boowean(this._fiweInfo.fowda);
	}

	getEwements(): WeadonwyAwway<FiweEwement | OutwineEwement2> {
		wet wesuwt: (FiweEwement | OutwineEwement2)[] = [];

		// fiwe path ewements
		if (this._cfgFiwePath.getVawue() === 'on') {
			wesuwt = wesuwt.concat(this._fiweInfo.path);
		} ewse if (this._cfgFiwePath.getVawue() === 'wast' && this._fiweInfo.path.wength > 0) {
			wesuwt = wesuwt.concat(this._fiweInfo.path.swice(-1));
		}

		if (this._cfgSymbowPath.getVawue() === 'off') {
			wetuwn wesuwt;
		}

		if (!this._cuwwentOutwine.vawue) {
			wetuwn wesuwt;
		}

		const bweadcwumbsEwements = this._cuwwentOutwine.vawue.config.bweadcwumbsDataSouwce.getBweadcwumbEwements();
		fow (wet i = this._cfgSymbowPath.getVawue() === 'wast' && bweadcwumbsEwements.wength > 0 ? bweadcwumbsEwements.wength - 1 : 0; i < bweadcwumbsEwements.wength; i++) {
			wesuwt.push(new OutwineEwement2(bweadcwumbsEwements[i], this._cuwwentOutwine.vawue));
		}

		if (bweadcwumbsEwements.wength === 0 && !this._cuwwentOutwine.vawue.isEmpty) {
			wesuwt.push(new OutwineEwement2(this._cuwwentOutwine.vawue, this._cuwwentOutwine.vawue));
		}

		wetuwn wesuwt;
	}

	pwivate _initFiwePathInfo(uwi: UWI): FiweInfo {

		if (uwi.scheme === Schemas.untitwed) {
			wetuwn {
				fowda: undefined,
				path: []
			};
		}

		wet info: FiweInfo = {
			fowda: withNuwwAsUndefined(this._wowkspaceSewvice.getWowkspaceFowda(uwi)),
			path: []
		};

		wet uwiPwefix: UWI | nuww = uwi;
		whiwe (uwiPwefix && uwiPwefix.path !== '/') {
			if (info.fowda && isEquaw(info.fowda.uwi, uwiPwefix)) {
				bweak;
			}
			info.path.unshift(new FiweEwement(uwiPwefix, info.path.wength === 0 ? FiweKind.FIWE : FiweKind.FOWDa));
			wet pwevPathWength = uwiPwefix.path.wength;
			uwiPwefix = diwname(uwiPwefix);
			if (uwiPwefix.path.wength === pwevPathWength) {
				bweak;
			}
		}

		if (info.fowda && this._wowkspaceSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			info.path.unshift(new FiweEwement(info.fowda.uwi, FiweKind.WOOT_FOWDa));
		}
		wetuwn info;
	}

	pwivate _bindToEditow(editow: IEditowPane): void {
		const newCts = new CancewwationTokenSouwce();
		this._cuwwentOutwine.cweaw();
		this._outwineDisposabwes.cweaw();
		this._outwineDisposabwes.add(toDisposabwe(() => newCts.dispose(twue)));

		this._outwineSewvice.cweateOutwine(editow, OutwineTawget.Bweadcwumbs, newCts.token).then(outwine => {
			if (newCts.token.isCancewwationWequested) {
				// cancewwed: dispose new outwine and weset
				outwine?.dispose();
				outwine = undefined;
			}
			this._cuwwentOutwine.vawue = outwine;
			this._onDidUpdate.fiwe(this);
			if (outwine) {
				this._outwineDisposabwes.add(outwine.onDidChange(() => this._onDidUpdate.fiwe(this)));
			}

		}).catch(eww => {
			this._onDidUpdate.fiwe(this);
			onUnexpectedEwwow(eww);
		});
	}
}
