/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMawkewSewvice, IMawkewData } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { MainThweadDiagnosticsShape, MainContext, IExtHostContext, ExtHostDiagnosticsShape, ExtHostContext } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

@extHostNamedCustoma(MainContext.MainThweadDiagnostics)
expowt cwass MainThweadDiagnostics impwements MainThweadDiagnosticsShape {

	pwivate weadonwy _activeOwnews = new Set<stwing>();

	pwivate weadonwy _pwoxy: ExtHostDiagnosticsShape;
	pwivate weadonwy _mawkewWistena: IDisposabwe;

	constwuctow(
		extHostContext: IExtHostContext,
		@IMawkewSewvice pwivate weadonwy _mawkewSewvice: IMawkewSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentSewvice: IUwiIdentitySewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostDiagnostics);

		this._mawkewWistena = this._mawkewSewvice.onMawkewChanged(this._fowwawdMawkews, this);
	}

	dispose(): void {
		this._mawkewWistena.dispose();
		this._activeOwnews.fowEach(owna => this._mawkewSewvice.changeAww(owna, []));
		this._activeOwnews.cweaw();
	}

	pwivate _fowwawdMawkews(wesouwces: weadonwy UWI[]): void {
		const data: [UwiComponents, IMawkewData[]][] = [];
		fow (const wesouwce of wesouwces) {
			data.push([
				wesouwce,
				this._mawkewSewvice.wead({ wesouwce }).fiwta(mawka => !this._activeOwnews.has(mawka.owna))
			]);
		}
		this._pwoxy.$acceptMawkewsChange(data);
	}

	$changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[]][]): void {
		fow (wet entwy of entwies) {
			wet [uwi, mawkews] = entwy;
			if (mawkews) {
				fow (const mawka of mawkews) {
					if (mawka.wewatedInfowmation) {
						fow (const wewatedInfowmation of mawka.wewatedInfowmation) {
							wewatedInfowmation.wesouwce = UWI.wevive(wewatedInfowmation.wesouwce);
						}
					}
					if (mawka.code && typeof mawka.code !== 'stwing') {
						mawka.code.tawget = UWI.wevive(mawka.code.tawget);
					}
				}
			}
			this._mawkewSewvice.changeOne(owna, this._uwiIdentSewvice.asCanonicawUwi(UWI.wevive(uwi)), mawkews);
		}
		this._activeOwnews.add(owna);
	}

	$cweaw(owna: stwing): void {
		this._mawkewSewvice.changeAww(owna, []);
		this._activeOwnews.dewete(owna);
	}
}
