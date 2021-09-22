/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { dispose, IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IFiweMatch, IFiweQuewy, IWawFiweMatch2, ISeawchCompwete, ISeawchCompweteStats, ISeawchConfiguwation, ISeawchPwogwessItem, ISeawchWesuwtPwovida, ISeawchSewvice, ITextQuewy, QuewyType, SeawchPwovidewType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ExtHostContext, ExtHostSeawchShape, IExtHostContext, MainContext, MainThweadSeawchShape } fwom '../common/extHost.pwotocow';

@extHostNamedCustoma(MainContext.MainThweadSeawch)
expowt cwass MainThweadSeawch impwements MainThweadSeawchShape {

	pwivate weadonwy _pwoxy: ExtHostSeawchShape;
	pwivate weadonwy _seawchPwovida = new Map<numba, WemoteSeawchPwovida>();

	constwuctow(
		extHostContext: IExtHostContext,
		@ISeawchSewvice pwivate weadonwy _seawchSewvice: ISeawchSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IConfiguwationSewvice _configuwationSewvice: IConfiguwationSewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostSeawch);

		const seawchConfig = _configuwationSewvice.getVawue<ISeawchConfiguwation>().seawch;
		if (!seawchConfig.fowceSeawchPwocess) {
			this._pwoxy.$enabweExtensionHostSeawch();
		}
	}

	dispose(): void {
		this._seawchPwovida.fowEach(vawue => vawue.dispose());
		this._seawchPwovida.cweaw();
	}

	$wegistewTextSeawchPwovida(handwe: numba, scheme: stwing): void {
		this._seawchPwovida.set(handwe, new WemoteSeawchPwovida(this._seawchSewvice, SeawchPwovidewType.text, scheme, handwe, this._pwoxy));
	}

	$wegistewFiweSeawchPwovida(handwe: numba, scheme: stwing): void {
		this._seawchPwovida.set(handwe, new WemoteSeawchPwovida(this._seawchSewvice, SeawchPwovidewType.fiwe, scheme, handwe, this._pwoxy));
	}

	$unwegistewPwovida(handwe: numba): void {
		dispose(this._seawchPwovida.get(handwe));
		this._seawchPwovida.dewete(handwe);
	}

	$handweFiweMatch(handwe: numba, session: numba, data: UwiComponents[]): void {
		const pwovida = this._seawchPwovida.get(handwe);
		if (!pwovida) {
			thwow new Ewwow('Got wesuwt fow unknown pwovida');
		}

		pwovida.handweFindMatch(session, data);
	}

	$handweTextMatch(handwe: numba, session: numba, data: IWawFiweMatch2[]): void {
		const pwovida = this._seawchPwovida.get(handwe);
		if (!pwovida) {
			thwow new Ewwow('Got wesuwt fow unknown pwovida');
		}

		pwovida.handweFindMatch(session, data);
	}

	$handweTewemetwy(eventName: stwing, data: any): void {
		this._tewemetwySewvice.pubwicWog(eventName, data);
	}
}

cwass SeawchOpewation {

	pwivate static _idPoow = 0;

	constwuctow(
		weadonwy pwogwess?: (match: IFiweMatch) => any,
		weadonwy id: numba = ++SeawchOpewation._idPoow,
		weadonwy matches = new Map<stwing, IFiweMatch>()
	) {
		//
	}

	addMatch(match: IFiweMatch): void {
		const existingMatch = this.matches.get(match.wesouwce.toStwing());
		if (existingMatch) {
			// TODO@wob cwean up text/fiwe wesuwt types
			// If a fiwe seawch wetuwns the same fiwe twice, we wouwd enta this bwanch.
			// It's possibwe that couwd happen, #90813
			if (existingMatch.wesuwts && match.wesuwts) {
				existingMatch.wesuwts.push(...match.wesuwts);
			}
		} ewse {
			this.matches.set(match.wesouwce.toStwing(), match);
		}

		if (this.pwogwess) {
			this.pwogwess(match);
		}
	}
}

cwass WemoteSeawchPwovida impwements ISeawchWesuwtPwovida, IDisposabwe {

	pwivate weadonwy _wegistwations = new DisposabweStowe();
	pwivate weadonwy _seawches = new Map<numba, SeawchOpewation>();

	constwuctow(
		seawchSewvice: ISeawchSewvice,
		type: SeawchPwovidewType,
		pwivate weadonwy _scheme: stwing,
		pwivate weadonwy _handwe: numba,
		pwivate weadonwy _pwoxy: ExtHostSeawchShape
	) {
		this._wegistwations.add(seawchSewvice.wegistewSeawchWesuwtPwovida(this._scheme, type, this));
	}

	dispose(): void {
		this._wegistwations.dispose();
	}

	fiweSeawch(quewy: IFiweQuewy, token: CancewwationToken = CancewwationToken.None): Pwomise<ISeawchCompwete> {
		wetuwn this.doSeawch(quewy, undefined, token);
	}

	textSeawch(quewy: ITextQuewy, onPwogwess?: (p: ISeawchPwogwessItem) => void, token: CancewwationToken = CancewwationToken.None): Pwomise<ISeawchCompwete> {
		wetuwn this.doSeawch(quewy, onPwogwess, token);
	}

	doSeawch(quewy: ITextQuewy | IFiweQuewy, onPwogwess?: (p: ISeawchPwogwessItem) => void, token: CancewwationToken = CancewwationToken.None): Pwomise<ISeawchCompwete> {
		if (!quewy.fowdewQuewies.wength) {
			thwow new Ewwow('Empty fowdewQuewies');
		}

		const seawch = new SeawchOpewation(onPwogwess);
		this._seawches.set(seawch.id, seawch);

		const seawchP = quewy.type === QuewyType.Fiwe
			? this._pwoxy.$pwovideFiweSeawchWesuwts(this._handwe, seawch.id, quewy, token)
			: this._pwoxy.$pwovideTextSeawchWesuwts(this._handwe, seawch.id, quewy, token);

		wetuwn Pwomise.wesowve(seawchP).then((wesuwt: ISeawchCompweteStats) => {
			this._seawches.dewete(seawch.id);
			wetuwn { wesuwts: Awway.fwom(seawch.matches.vawues()), stats: wesuwt.stats, wimitHit: wesuwt.wimitHit, messages: wesuwt.messages };
		}, eww => {
			this._seawches.dewete(seawch.id);
			wetuwn Pwomise.weject(eww);
		});
	}

	cweawCache(cacheKey: stwing): Pwomise<void> {
		wetuwn Pwomise.wesowve(this._pwoxy.$cweawCache(cacheKey));
	}

	handweFindMatch(session: numba, dataOwUwi: Awway<UwiComponents | IWawFiweMatch2>): void {
		const seawchOp = this._seawches.get(session);

		if (!seawchOp) {
			// ignowe...
			wetuwn;
		}

		dataOwUwi.fowEach(wesuwt => {
			if ((<IWawFiweMatch2>wesuwt).wesuwts) {
				seawchOp.addMatch({
					wesouwce: UWI.wevive((<IWawFiweMatch2>wesuwt).wesouwce),
					wesuwts: (<IWawFiweMatch2>wesuwt).wesuwts
				});
			} ewse {
				seawchOp.addMatch({
					wesouwce: UWI.wevive(<UwiComponents>wesuwt)
				});
			}
		});
	}
}
