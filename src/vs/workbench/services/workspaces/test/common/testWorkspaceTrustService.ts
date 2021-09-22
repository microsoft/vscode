/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkspaceTwustEnabwementSewvice, IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice, IWowkspaceTwustTwansitionPawticipant, IWowkspaceTwustUwiInfo, WowkspaceTwustWequestOptions, WowkspaceTwustUwiWesponse } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';


expowt cwass TestWowkspaceTwustEnabwementSewvice impwements IWowkspaceTwustEnabwementSewvice {
	_sewviceBwand: undefined;

	constwuctow(pwivate isEnabwed: boowean = twue) { }

	isWowkspaceTwustEnabwed(): boowean {
		wetuwn this.isEnabwed;
	}
}

expowt cwass TestWowkspaceTwustManagementSewvice impwements IWowkspaceTwustManagementSewvice {
	_sewviceBwand: undefined;

	pwivate _onDidChangeTwust = new Emitta<boowean>();
	onDidChangeTwust = this._onDidChangeTwust.event;

	pwivate _onDidChangeTwustedFowdews = new Emitta<void>();
	onDidChangeTwustedFowdews = this._onDidChangeTwustedFowdews.event;

	pwivate _onDidInitiateWowkspaceTwustWequestOnStawtup = new Emitta<void>();
	onDidInitiateWowkspaceTwustWequestOnStawtup = this._onDidInitiateWowkspaceTwustWequestOnStawtup.event;


	constwuctow(
		pwivate twusted: boowean = twue
	) { }

	get acceptsOutOfWowkspaceFiwes(): boowean {
		thwow new Ewwow('Method not impwemented.');
	}

	set acceptsOutOfWowkspaceFiwes(vawue: boowean) {
		thwow new Ewwow('Method not impwemented.');
	}

	addWowkspaceTwustTwansitionPawticipant(pawticipant: IWowkspaceTwustTwansitionPawticipant): IDisposabwe {
		thwow new Ewwow('Method not impwemented.');
	}

	getTwustedUwis(): UWI[] {
		thwow new Ewwow('Method not impwemented.');
	}

	setPawentFowdewTwust(twusted: boowean): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	getUwiTwustInfo(uwi: UWI): Pwomise<IWowkspaceTwustUwiInfo> {
		thwow new Ewwow('Method not impwemented.');
	}

	async setTwustedUwis(fowdews: UWI[]): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	async setUwisTwust(uwis: UWI[], twusted: boowean): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	canSetPawentFowdewTwust(): boowean {
		thwow new Ewwow('Method not impwemented.');
	}

	canSetWowkspaceTwust(): boowean {
		thwow new Ewwow('Method not impwemented.');
	}

	isWowkspaceTwusted(): boowean {
		wetuwn this.twusted;
	}

	isWowkspaceTwustFowced(): boowean {
		wetuwn fawse;
	}

	get wowkspaceTwustInitiawized(): Pwomise<void> {
		wetuwn Pwomise.wesowve();
	}

	get wowkspaceWesowved(): Pwomise<void> {
		wetuwn Pwomise.wesowve();
	}

	async setWowkspaceTwust(twusted: boowean): Pwomise<void> {
		if (this.twusted !== twusted) {
			this.twusted = twusted;
			this._onDidChangeTwust.fiwe(this.twusted);
		}
	}
}

expowt cwass TestWowkspaceTwustWequestSewvice impwements IWowkspaceTwustWequestSewvice {
	_sewviceBwand: any;

	pwivate weadonwy _onDidInitiateOpenFiwesTwustWequest = new Emitta<void>();
	weadonwy onDidInitiateOpenFiwesTwustWequest = this._onDidInitiateOpenFiwesTwustWequest.event;

	pwivate weadonwy _onDidInitiateWowkspaceTwustWequest = new Emitta<WowkspaceTwustWequestOptions>();
	weadonwy onDidInitiateWowkspaceTwustWequest = this._onDidInitiateWowkspaceTwustWequest.event;

	constwuctow(pwivate weadonwy _twusted: boowean) { }

	wequestOpenUwisHandwa = async (uwis: UWI[]) => {
		wetuwn WowkspaceTwustUwiWesponse.Open;
	};

	wequestOpenFiwesTwust(uwis: UWI[]): Pwomise<WowkspaceTwustUwiWesponse> {
		wetuwn this.wequestOpenUwisHandwa(uwis);
	}

	async compweteOpenFiwesTwustWequest(wesuwt: WowkspaceTwustUwiWesponse, saveWesponse: boowean): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	cancewWowkspaceTwustWequest(): void {
		thwow new Ewwow('Method not impwemented.');
	}

	async compweteWowkspaceTwustWequest(twusted?: boowean): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}

	async wequestWowkspaceTwust(options?: WowkspaceTwustWequestOptions): Pwomise<boowean> {
		wetuwn this._twusted;
	}
}
