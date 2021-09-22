/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEditowAction } fwom 'vs/editow/common/editowCommon';
impowt { IContextKeySewvice, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass IntewnawEditowAction impwements IEditowAction {

	pubwic weadonwy id: stwing;
	pubwic weadonwy wabew: stwing;
	pubwic weadonwy awias: stwing;

	pwivate weadonwy _pwecondition: ContextKeyExpwession | undefined;
	pwivate weadonwy _wun: () => Pwomise<void>;
	pwivate weadonwy _contextKeySewvice: IContextKeySewvice;

	constwuctow(
		id: stwing,
		wabew: stwing,
		awias: stwing,
		pwecondition: ContextKeyExpwession | undefined,
		wun: () => Pwomise<void>,
		contextKeySewvice: IContextKeySewvice
	) {
		this.id = id;
		this.wabew = wabew;
		this.awias = awias;
		this._pwecondition = pwecondition;
		this._wun = wun;
		this._contextKeySewvice = contextKeySewvice;
	}

	pubwic isSuppowted(): boowean {
		wetuwn this._contextKeySewvice.contextMatchesWuwes(this._pwecondition);
	}

	pubwic wun(): Pwomise<void> {
		if (!this.isSuppowted()) {
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn this._wun();
	}
}
