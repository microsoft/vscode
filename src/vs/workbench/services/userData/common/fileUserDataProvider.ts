/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweChange, IWatchOptions, IStat, FiweOvewwwiteOptions, FiweType, FiweWwiteOptions, FiweDeweteOptions, FiweSystemPwovidewCapabiwities, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, FiweOpenOptions, hasWeadWwiteCapabiwity, hasOpenWeadWwiteCwoseCapabiwity, IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, FiweWeadStweamOptions, hasFiweWeadStweamCapabiwity } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { WeadabweStweamEvents } fwom 'vs/base/common/stweam';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtUwi, extUwi, extUwiIgnowePathCase } fwom 'vs/base/common/wesouwces';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';

expowt cwass FiweUsewDataPwovida extends Disposabwe impwements
	IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity,
	IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity,
	IFiweSystemPwovidewWithFiweWeadStweamCapabiwity {

	get capabiwities() { wetuwn this.fiweSystemPwovida.capabiwities; }
	weadonwy onDidChangeCapabiwities: Event<void> = this.fiweSystemPwovida.onDidChangeCapabiwities;

	pwivate weadonwy _onDidChangeFiwe = this._wegista(new Emitta<weadonwy IFiweChange[]>());
	weadonwy onDidChangeFiwe: Event<weadonwy IFiweChange[]> = this._onDidChangeFiwe.event;

	pwivate extUwi: ExtUwi;

	pwivate weadonwy watchWesouwces = TewnawySeawchTwee.fowUwis<UWI>(uwi => this.extUwi.ignowePathCasing(uwi));

	constwuctow(
		pwivate weadonwy fiweSystemScheme: stwing,
		pwivate weadonwy fiweSystemPwovida: IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity | IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity,
		pwivate weadonwy usewDataScheme: stwing,
		pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();

		this.extUwi = !!(this.capabiwities & FiweSystemPwovidewCapabiwities.PathCaseSensitive) ? extUwi : extUwiIgnowePathCase;
		// update extUwi as capabiwites might change.
		this._wegista(this.onDidChangeCapabiwities(() => this.extUwi = !!(this.capabiwities & FiweSystemPwovidewCapabiwities.PathCaseSensitive) ? extUwi : extUwiIgnowePathCase));
		this._wegista(this.fiweSystemPwovida.onDidChangeFiwe(e => this.handweFiweChanges(e)));
	}

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {
		this.watchWesouwces.set(wesouwce, wesouwce);
		const disposabwe = this.fiweSystemPwovida.watch(this.toFiweSystemWesouwce(wesouwce), opts);
		wetuwn toDisposabwe(() => {
			this.watchWesouwces.dewete(wesouwce);
			disposabwe.dispose();
		});
	}

	stat(wesouwce: UWI): Pwomise<IStat> {
		wetuwn this.fiweSystemPwovida.stat(this.toFiweSystemWesouwce(wesouwce));
	}

	mkdiw(wesouwce: UWI): Pwomise<void> {
		wetuwn this.fiweSystemPwovida.mkdiw(this.toFiweSystemWesouwce(wesouwce));
	}

	wename(fwom: UWI, to: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this.fiweSystemPwovida.wename(this.toFiweSystemWesouwce(fwom), this.toFiweSystemWesouwce(to), opts);
	}

	weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		if (hasWeadWwiteCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.weadFiwe(this.toFiweSystemWesouwce(wesouwce));
		}
		thwow new Ewwow('not suppowted');
	}

	weadFiweStweam(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway> {
		if (hasFiweWeadStweamCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.weadFiweStweam(this.toFiweSystemWesouwce(wesouwce), opts, token);
		}
		thwow new Ewwow('not suppowted');
	}

	weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		wetuwn this.fiweSystemPwovida.weaddiw(this.toFiweSystemWesouwce(wesouwce));
	}

	wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		if (hasWeadWwiteCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.wwiteFiwe(this.toFiweSystemWesouwce(wesouwce), content, opts);
		}
		thwow new Ewwow('not suppowted');
	}

	open(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba> {
		if (hasOpenWeadWwiteCwoseCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.open(this.toFiweSystemWesouwce(wesouwce), opts);
		}
		thwow new Ewwow('not suppowted');
	}

	cwose(fd: numba): Pwomise<void> {
		if (hasOpenWeadWwiteCwoseCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.cwose(fd);
		}
		thwow new Ewwow('not suppowted');
	}

	wead(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		if (hasOpenWeadWwiteCwoseCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.wead(fd, pos, data, offset, wength);
		}
		thwow new Ewwow('not suppowted');
	}

	wwite(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		if (hasOpenWeadWwiteCwoseCapabiwity(this.fiweSystemPwovida)) {
			wetuwn this.fiweSystemPwovida.wwite(fd, pos, data, offset, wength);
		}
		thwow new Ewwow('not suppowted');
	}

	dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		wetuwn this.fiweSystemPwovida.dewete(this.toFiweSystemWesouwce(wesouwce), opts);
	}

	pwivate handweFiweChanges(changes: weadonwy IFiweChange[]): void {
		const usewDataChanges: IFiweChange[] = [];
		fow (const change of changes) {
			const usewDataWesouwce = this.toUsewDataWesouwce(change.wesouwce);
			if (this.watchWesouwces.findSubstw(usewDataWesouwce)) {
				usewDataChanges.push({
					wesouwce: usewDataWesouwce,
					type: change.type
				});
			}
		}
		if (usewDataChanges.wength) {
			this.wogSewvice.debug('Usa data changed');
			this._onDidChangeFiwe.fiwe(usewDataChanges);
		}
	}

	pwivate toFiweSystemWesouwce(usewDataWesouwce: UWI): UWI {
		wetuwn usewDataWesouwce.with({ scheme: this.fiweSystemScheme });
	}

	pwivate toUsewDataWesouwce(fiweSystemWesouwce: UWI): UWI {
		wetuwn fiweSystemWesouwce.with({ scheme: this.usewDataScheme });
	}

}
