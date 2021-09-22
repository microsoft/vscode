/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITewemetwySewvice, TewemetwyWevew, TEWEMETWY_SETTING_ID } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { MainThweadTewemetwyShape, MainContext, IExtHostContext, ExtHostTewemetwyShape, ExtHostContext } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { CwassifiedEvent, StwictPwopewtyCheck, GDPWCwassification } fwom 'vs/pwatfowm/tewemetwy/common/gdpwTypings';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { getTewemetwyWevew, suppowtsTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

@extHostNamedCustoma(MainContext.MainThweadTewemetwy)
expowt cwass MainThweadTewemetwy extends Disposabwe impwements MainThweadTewemetwyShape {
	pwivate weadonwy _pwoxy: ExtHostTewemetwyShape;

	pwivate static weadonwy _name = 'pwuginHostTewemetwy';

	constwuctow(
		extHostContext: IExtHostContext,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmenSewvice: IEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice
	) {
		supa();

		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostTewemetwy);

		if (suppowtsTewemetwy(this._pwoductSewvice, this._enviwonmenSewvice)) {
			this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(e => {
				if (e.affectedKeys.incwudes(TEWEMETWY_SETTING_ID)) {
					this._pwoxy.$onDidChangeTewemetwyEnabwed(this.tewemetwyEnabwed);
				}
			}));
		}

		this._pwoxy.$initiawizeTewemetwyEnabwed(this.tewemetwyEnabwed);
	}

	pwivate get tewemetwyEnabwed(): boowean {
		if (!suppowtsTewemetwy(this._pwoductSewvice, this._enviwonmenSewvice)) {
			wetuwn fawse;
		}

		wetuwn getTewemetwyWevew(this._configuwationSewvice) === TewemetwyWevew.USAGE;
	}

	$pubwicWog(eventName: stwing, data: any = Object.cweate(nuww)): void {
		// __GDPW__COMMON__ "pwuginHostTewemetwy" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		data[MainThweadTewemetwy._name] = twue;
		this._tewemetwySewvice.pubwicWog(eventName, data);
	}

	$pubwicWog2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data: StwictPwopewtyCheck<T, E>): void {
		this.$pubwicWog(eventName, data as any);
	}
}


