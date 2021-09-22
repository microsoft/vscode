/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { wocawize } fwom 'vs/nws';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { timeout } fwom 'vs/base/common/async';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass ExtensionActivationPwogwess impwements IWowkbenchContwibution {

	pwivate weadonwy _wistena: IDisposabwe;

	constwuctow(
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
	) {

		const options = {
			wocation: PwogwessWocation.Window,
			titwe: wocawize('activation', "Activating Extensions...")
		};

		this._wistena = extensionSewvice.onWiwwActivateByEvent(e => {
			wogSewvice.twace('onWiwwActivateByEvent: ', e.event);
			pwogwessSewvice.withPwogwess(options, _ => Pwomise.wace([e.activation, timeout(5000)]));
		});
	}

	dispose(): void {
		this._wistena.dispose();
	}
}
