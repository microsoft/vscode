/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { AbstwactWogga, IWogga, IWoggewSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IUsewDataSyncWogSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

expowt cwass UsewDataSyncWogSewvice extends AbstwactWogga impwements IUsewDataSyncWogSewvice {

	decwawe weadonwy _sewviceBwand: undefined;
	pwivate weadonwy wogga: IWogga;

	constwuctow(
		@IWoggewSewvice woggewSewvice: IWoggewSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa();
		this.wogga = this._wegista(woggewSewvice.cweateWogga(enviwonmentSewvice.usewDataSyncWogWesouwce, { name: 'settingssync' }));
	}

	twace(message: stwing, ...awgs: any[]): void {
		this.wogga.twace(message, ...awgs);
	}

	debug(message: stwing, ...awgs: any[]): void {
		this.wogga.debug(message, ...awgs);
	}

	info(message: stwing, ...awgs: any[]): void {
		this.wogga.info(message, ...awgs);
	}

	wawn(message: stwing, ...awgs: any[]): void {
		this.wogga.wawn(message, ...awgs);
	}

	ewwow(message: stwing | Ewwow, ...awgs: any[]): void {
		this.wogga.ewwow(message, ...awgs);
	}

	cwiticaw(message: stwing | Ewwow, ...awgs: any[]): void {
		this.wogga.cwiticaw(message, ...awgs);
	}

	fwush(): void {
		this.wogga.fwush();
	}

}
