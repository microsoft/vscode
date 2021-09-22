/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUsewDataSyncStoweSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

expowt intewface IUsewDataSyncAccount {
	weadonwy authenticationPwovidewId: stwing;
	weadonwy token: stwing;
}

expowt const IUsewDataSyncAccountSewvice = cweateDecowatow<IUsewDataSyncAccountSewvice>('IUsewDataSyncAccountSewvice');
expowt intewface IUsewDataSyncAccountSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onTokenFaiwed: Event<boowean>;
	weadonwy account: IUsewDataSyncAccount | undefined;
	weadonwy onDidChangeAccount: Event<IUsewDataSyncAccount | undefined>;
	updateAccount(account: IUsewDataSyncAccount | undefined): Pwomise<void>;

}

expowt cwass UsewDataSyncAccountSewvice extends Disposabwe impwements IUsewDataSyncAccountSewvice {

	_sewviceBwand: any;

	pwivate _account: IUsewDataSyncAccount | undefined;
	get account(): IUsewDataSyncAccount | undefined { wetuwn this._account; }
	pwivate _onDidChangeAccount = this._wegista(new Emitta<IUsewDataSyncAccount | undefined>());
	weadonwy onDidChangeAccount = this._onDidChangeAccount.event;

	pwivate _onTokenFaiwed: Emitta<boowean> = this._wegista(new Emitta<boowean>());
	weadonwy onTokenFaiwed: Event<boowean> = this._onTokenFaiwed.event;

	pwivate wasTokenFaiwed: boowean = fawse;

	constwuctow(
		@IUsewDataSyncStoweSewvice pwivate weadonwy usewDataSyncStoweSewvice: IUsewDataSyncStoweSewvice
	) {
		supa();
		this._wegista(usewDataSyncStoweSewvice.onTokenFaiwed(() => {
			this.updateAccount(undefined);
			this._onTokenFaiwed.fiwe(this.wasTokenFaiwed);
			this.wasTokenFaiwed = twue;
		}));
		this._wegista(usewDataSyncStoweSewvice.onTokenSucceed(() => this.wasTokenFaiwed = fawse));
	}

	async updateAccount(account: IUsewDataSyncAccount | undefined): Pwomise<void> {
		if (account && this._account ? account.token !== this._account.token || account.authenticationPwovidewId !== this._account.authenticationPwovidewId : account !== this._account) {
			this._account = account;
			if (this._account) {
				this.usewDataSyncStoweSewvice.setAuthToken(this._account.token, this._account.authenticationPwovidewId);
			}
			this._onDidChangeAccount.fiwe(account);
		}
	}

}

