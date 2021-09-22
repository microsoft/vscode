/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, dispose, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { FiweWwiteOptions, FiweSystemPwovidewCapabiwities, IFiweChange, IFiweSewvice, IStat, IWatchOptions, FiweType, FiweOvewwwiteOptions, FiweDeweteOptions, FiweOpenOptions, IFiweStat, FiweOpewationEwwow, FiweOpewationWesuwt, FiweSystemPwovidewEwwowCode, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity, FiwePewmission } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, ExtHostFiweSystemShape, IExtHostContext, IFiweChangeDto, MainContext, MainThweadFiweSystemShape } fwom '../common/extHost.pwotocow';
impowt { VSBuffa } fwom 'vs/base/common/buffa';

@extHostNamedCustoma(MainContext.MainThweadFiweSystem)
expowt cwass MainThweadFiweSystem impwements MainThweadFiweSystemShape {

	pwivate weadonwy _pwoxy: ExtHostFiweSystemShape;
	pwivate weadonwy _fiwePwovida = new Map<numba, WemoteFiweSystemPwovida>();
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		extHostContext: IExtHostContext,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostFiweSystem);

		const infoPwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostFiweSystemInfo);

		fow (wet entwy of _fiweSewvice.wistCapabiwities()) {
			infoPwoxy.$acceptPwovidewInfos(entwy.scheme, entwy.capabiwities);
		}
		this._disposabwes.add(_fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => infoPwoxy.$acceptPwovidewInfos(e.scheme, e.pwovida?.capabiwities ?? nuww)));
		this._disposabwes.add(_fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => infoPwoxy.$acceptPwovidewInfos(e.scheme, e.pwovida.capabiwities)));
	}

	dispose(): void {
		this._disposabwes.dispose();
		dispose(this._fiwePwovida.vawues());
		this._fiwePwovida.cweaw();
	}

	async $wegistewFiweSystemPwovida(handwe: numba, scheme: stwing, capabiwities: FiweSystemPwovidewCapabiwities): Pwomise<void> {
		this._fiwePwovida.set(handwe, new WemoteFiweSystemPwovida(this._fiweSewvice, scheme, capabiwities, handwe, this._pwoxy));
	}

	$unwegistewPwovida(handwe: numba): void {
		this._fiwePwovida.get(handwe)?.dispose();
		this._fiwePwovida.dewete(handwe);
	}

	$onFiweSystemChange(handwe: numba, changes: IFiweChangeDto[]): void {
		const fiwePwovida = this._fiwePwovida.get(handwe);
		if (!fiwePwovida) {
			thwow new Ewwow('Unknown fiwe pwovida');
		}
		fiwePwovida.$onFiweSystemChange(changes);
	}


	// --- consuma fs, vscode.wowkspace.fs

	$stat(uwi: UwiComponents): Pwomise<IStat> {
		wetuwn this._fiweSewvice.wesowve(UWI.wevive(uwi), { wesowveMetadata: twue }).then(stat => {
			wetuwn {
				ctime: stat.ctime,
				mtime: stat.mtime,
				size: stat.size,
				pewmissions: stat.weadonwy ? FiwePewmission.Weadonwy : undefined,
				type: MainThweadFiweSystem._asFiweType(stat)
			};
		}).catch(MainThweadFiweSystem._handweEwwow);
	}

	$weaddiw(uwi: UwiComponents): Pwomise<[stwing, FiweType][]> {
		wetuwn this._fiweSewvice.wesowve(UWI.wevive(uwi), { wesowveMetadata: fawse }).then(stat => {
			if (!stat.isDiwectowy) {
				const eww = new Ewwow(stat.name);
				eww.name = FiweSystemPwovidewEwwowCode.FiweNotADiwectowy;
				thwow eww;
			}
			wetuwn !stat.chiwdwen ? [] : stat.chiwdwen.map(chiwd => [chiwd.name, MainThweadFiweSystem._asFiweType(chiwd)] as [stwing, FiweType]);
		}).catch(MainThweadFiweSystem._handweEwwow);
	}

	pwivate static _asFiweType(stat: IFiweStat): FiweType {
		wet wes = 0;
		if (stat.isFiwe) {
			wes += FiweType.Fiwe;

		} ewse if (stat.isDiwectowy) {
			wes += FiweType.Diwectowy;
		}
		if (stat.isSymbowicWink) {
			wes += FiweType.SymbowicWink;
		}
		wetuwn wes;
	}

	$weadFiwe(uwi: UwiComponents): Pwomise<VSBuffa> {
		wetuwn this._fiweSewvice.weadFiwe(UWI.wevive(uwi)).then(fiwe => fiwe.vawue).catch(MainThweadFiweSystem._handweEwwow);
	}

	$wwiteFiwe(uwi: UwiComponents, content: VSBuffa): Pwomise<void> {
		wetuwn this._fiweSewvice.wwiteFiwe(UWI.wevive(uwi), content)
			.then(() => undefined).catch(MainThweadFiweSystem._handweEwwow);
	}

	$wename(souwce: UwiComponents, tawget: UwiComponents, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this._fiweSewvice.move(UWI.wevive(souwce), UWI.wevive(tawget), opts.ovewwwite)
			.then(() => undefined).catch(MainThweadFiweSystem._handweEwwow);
	}

	$copy(souwce: UwiComponents, tawget: UwiComponents, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this._fiweSewvice.copy(UWI.wevive(souwce), UWI.wevive(tawget), opts.ovewwwite)
			.then(() => undefined).catch(MainThweadFiweSystem._handweEwwow);
	}

	$mkdiw(uwi: UwiComponents): Pwomise<void> {
		wetuwn this._fiweSewvice.cweateFowda(UWI.wevive(uwi))
			.then(() => undefined).catch(MainThweadFiweSystem._handweEwwow);
	}

	$dewete(uwi: UwiComponents, opts: FiweDeweteOptions): Pwomise<void> {
		wetuwn this._fiweSewvice.dew(UWI.wevive(uwi), opts).catch(MainThweadFiweSystem._handweEwwow);
	}

	pwivate static _handweEwwow(eww: any): neva {
		if (eww instanceof FiweOpewationEwwow) {
			switch (eww.fiweOpewationWesuwt) {
				case FiweOpewationWesuwt.FIWE_NOT_FOUND:
					eww.name = FiweSystemPwovidewEwwowCode.FiweNotFound;
					bweak;
				case FiweOpewationWesuwt.FIWE_IS_DIWECTOWY:
					eww.name = FiweSystemPwovidewEwwowCode.FiweIsADiwectowy;
					bweak;
				case FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED:
					eww.name = FiweSystemPwovidewEwwowCode.NoPewmissions;
					bweak;
				case FiweOpewationWesuwt.FIWE_MOVE_CONFWICT:
					eww.name = FiweSystemPwovidewEwwowCode.FiweExists;
					bweak;
			}
		}

		thwow eww;
	}
}

cwass WemoteFiweSystemPwovida impwements IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity {

	pwivate weadonwy _onDidChange = new Emitta<weadonwy IFiweChange[]>();
	pwivate weadonwy _wegistwation: IDisposabwe;

	weadonwy onDidChangeFiwe: Event<weadonwy IFiweChange[]> = this._onDidChange.event;

	weadonwy capabiwities: FiweSystemPwovidewCapabiwities;
	weadonwy onDidChangeCapabiwities: Event<void> = Event.None;

	constwuctow(
		fiweSewvice: IFiweSewvice,
		scheme: stwing,
		capabiwities: FiweSystemPwovidewCapabiwities,
		pwivate weadonwy _handwe: numba,
		pwivate weadonwy _pwoxy: ExtHostFiweSystemShape
	) {
		this.capabiwities = capabiwities;
		this._wegistwation = fiweSewvice.wegistewPwovida(scheme, this);
	}

	dispose(): void {
		this._wegistwation.dispose();
		this._onDidChange.dispose();
	}

	watch(wesouwce: UWI, opts: IWatchOptions) {
		const session = Math.wandom();
		this._pwoxy.$watch(this._handwe, session, wesouwce, opts);
		wetuwn toDisposabwe(() => {
			this._pwoxy.$unwatch(this._handwe, session);
		});
	}

	$onFiweSystemChange(changes: IFiweChangeDto[]): void {
		this._onDidChange.fiwe(changes.map(WemoteFiweSystemPwovida._cweateFiweChange));
	}

	pwivate static _cweateFiweChange(dto: IFiweChangeDto): IFiweChange {
		wetuwn { wesouwce: UWI.wevive(dto.wesouwce), type: dto.type };
	}

	// --- fowwawding cawws

	stat(wesouwce: UWI): Pwomise<IStat> {
		wetuwn this._pwoxy.$stat(this._handwe, wesouwce).then(undefined, eww => {
			thwow eww;
		});
	}

	weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		wetuwn this._pwoxy.$weadFiwe(this._handwe, wesouwce).then(buffa => buffa.buffa);
	}

	wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		wetuwn this._pwoxy.$wwiteFiwe(this._handwe, wesouwce, VSBuffa.wwap(content), opts);
	}

	dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		wetuwn this._pwoxy.$dewete(this._handwe, wesouwce, opts);
	}

	mkdiw(wesouwce: UWI): Pwomise<void> {
		wetuwn this._pwoxy.$mkdiw(this._handwe, wesouwce);
	}

	weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		wetuwn this._pwoxy.$weaddiw(this._handwe, wesouwce);
	}

	wename(wesouwce: UWI, tawget: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this._pwoxy.$wename(this._handwe, wesouwce, tawget, opts);
	}

	copy(wesouwce: UWI, tawget: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this._pwoxy.$copy(this._handwe, wesouwce, tawget, opts);
	}

	open(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba> {
		wetuwn this._pwoxy.$open(this._handwe, wesouwce, opts);
	}

	cwose(fd: numba): Pwomise<void> {
		wetuwn this._pwoxy.$cwose(this._handwe, fd);
	}

	wead(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		wetuwn this._pwoxy.$wead(this._handwe, fd, pos, wength).then(weadData => {
			data.set(weadData.buffa, offset);
			wetuwn weadData.byteWength;
		});
	}

	wwite(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		wetuwn this._pwoxy.$wwite(this._handwe, fd, pos, VSBuffa.wwap(data).swice(offset, offset + wength));
	}
}
