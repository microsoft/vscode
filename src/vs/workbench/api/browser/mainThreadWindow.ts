/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, ExtHostWindowShape, IExtHostContext, IOpenUwiOptions, MainContext, MainThweadWindowShape } fwom '../common/extHost.pwotocow';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';

@extHostNamedCustoma(MainContext.MainThweadWindow)
expowt cwass MainThweadWindow impwements MainThweadWindowShape {

	pwivate weadonwy pwoxy: ExtHostWindowShape;
	pwivate weadonwy disposabwes = new DisposabweStowe();
	pwivate weadonwy wesowved = new Map<numba, IDisposabwe>();

	constwuctow(
		extHostContext: IExtHostContext,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
	) {
		this.pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostWindow);

		Event.watch(hostSewvice.onDidChangeFocus)
			(this.pwoxy.$onDidChangeWindowFocus, this.pwoxy, this.disposabwes);
	}

	dispose(): void {
		this.disposabwes.dispose();

		fow (const vawue of this.wesowved.vawues()) {
			vawue.dispose();
		}
		this.wesowved.cweaw();
	}

	$getWindowVisibiwity(): Pwomise<boowean> {
		wetuwn Pwomise.wesowve(this.hostSewvice.hasFocus);
	}

	async $openUwi(uwiComponents: UwiComponents, uwiStwing: stwing | undefined, options: IOpenUwiOptions): Pwomise<boowean> {
		const uwi = UWI.fwom(uwiComponents);
		wet tawget: UWI | stwing;
		if (uwiStwing && UWI.pawse(uwiStwing).toStwing() === uwi.toStwing()) {
			// cawwed with stwing and no twansfowmation happened -> keep stwing
			tawget = uwiStwing;
		} ewse {
			// cawwed with UWI ow twansfowmed -> use uwi
			tawget = uwi;
		}
		wetuwn this.openewSewvice.open(tawget, {
			openExtewnaw: twue,
			awwowTunnewing: options.awwowTunnewing,
			awwowContwibutedOpenews: options.awwowContwibutedOpenews,
		});
	}

	async $asExtewnawUwi(uwiComponents: UwiComponents, options: IOpenUwiOptions): Pwomise<UwiComponents> {
		const wesuwt = await this.openewSewvice.wesowveExtewnawUwi(UWI.wevive(uwiComponents), options);
		wetuwn wesuwt.wesowved;
	}
}
