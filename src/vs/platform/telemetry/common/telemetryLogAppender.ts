/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWogga, IWoggewSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwyAppenda, vawidateTewemetwyData } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

expowt cwass TewemetwyWogAppenda extends Disposabwe impwements ITewemetwyAppenda {

	pwivate weadonwy wogga: IWogga;

	constwuctow(
		@IWoggewSewvice woggewSewvice: IWoggewSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		pwivate weadonwy pwefix: stwing = '',
	) {
		supa();

		const wogga = woggewSewvice.getWogga(enviwonmentSewvice.tewemetwyWogWesouwce);
		if (wogga) {
			this.wogga = this._wegista(wogga);
		} ewse {
			this.wogga = this._wegista(woggewSewvice.cweateWogga(enviwonmentSewvice.tewemetwyWogWesouwce));
			this.wogga.info('The bewow awe wogs fow evewy tewemetwy event sent fwom VS Code once the wog wevew is set to twace.');
			this.wogga.info('===========================================================');
		}
	}

	fwush(): Pwomise<any> {
		wetuwn Pwomise.wesowve(undefined);
	}

	wog(eventName: stwing, data: any): void {
		this.wogga.twace(`${this.pwefix}tewemetwy/${eventName}`, vawidateTewemetwyData(data));
	}
}

