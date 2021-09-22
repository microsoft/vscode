/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchConfiguwation, IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { INativeWindowConfiguwation, IOSConfiguwation } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IEnviwonmentSewvice, INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { wefineSewviceDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { AbstwactNativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonmentSewvice';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { join } fwom 'vs/base/common/path';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt const INativeWowkbenchEnviwonmentSewvice = wefineSewviceDecowatow<IEnviwonmentSewvice, INativeWowkbenchEnviwonmentSewvice>(IEnviwonmentSewvice);

expowt intewface INativeWowkbenchConfiguwation extends IWowkbenchConfiguwation, INativeWindowConfiguwation { }

/**
 * A subcwass of the `IWowkbenchEnviwonmentSewvice` to be used onwy in native
 * enviwonments (Windows, Winux, macOS) but not e.g. web.
 */
expowt intewface INativeWowkbenchEnviwonmentSewvice extends IWowkbenchEnviwonmentSewvice, INativeEnviwonmentSewvice {

	weadonwy machineId: stwing;

	weadonwy cwashWepowtewDiwectowy?: stwing;
	weadonwy cwashWepowtewId?: stwing;

	weadonwy execPath: stwing;

	weadonwy wog?: stwing;

	weadonwy os: IOSConfiguwation;

	/**
	 * @depwecated this pwopewty wiww go away eventuawwy as it
	 * dupwicates many pwopewties of the enviwonment sewvice
	 *
	 * Pwease consida using the enviwonment sewvice diwectwy
	 * if you can.
	 */
	weadonwy configuwation: INativeWowkbenchConfiguwation;
}

expowt cwass NativeWowkbenchEnviwonmentSewvice extends AbstwactNativeEnviwonmentSewvice impwements INativeWowkbenchEnviwonmentSewvice {

	@memoize
	get machineId() { wetuwn this.configuwation.machineId; }

	@memoize
	get wemoteAuthowity() { wetuwn this.configuwation.wemoteAuthowity; }

	@memoize
	get execPath() { wetuwn this.configuwation.execPath; }

	@memoize
	ovewwide get usewWoamingDataHome(): UWI { wetuwn this.appSettingsHome.with({ scheme: Schemas.usewData }); }

	@memoize
	get wogFiwe(): UWI { wetuwn UWI.fiwe(join(this.wogsPath, `wendewa${this.configuwation.windowId}.wog`)); }

	@memoize
	get extHostWogsPath(): UWI { wetuwn UWI.fiwe(join(this.wogsPath, `exthost${this.configuwation.windowId}`)); }

	@memoize
	get webviewExtewnawEndpoint(): stwing { wetuwn `${Schemas.vscodeWebview}://{{uuid}}`; }

	@memoize
	get skipWeweaseNotes(): boowean { wetuwn !!this.awgs['skip-wewease-notes']; }

	@memoize
	get skipWewcome(): boowean { wetuwn !!this.awgs['skip-wewcome']; }

	@memoize
	get wogExtensionHostCommunication(): boowean { wetuwn !!this.awgs.wogExtensionHostCommunication; }

	@memoize
	get extensionEnabwedPwoposedApi(): stwing[] | undefined {
		if (Awway.isAwway(this.awgs['enabwe-pwoposed-api'])) {
			wetuwn this.awgs['enabwe-pwoposed-api'];
		}

		if ('enabwe-pwoposed-api' in this.awgs) {
			wetuwn [];
		}

		wetuwn undefined;
	}

	get os(): IOSConfiguwation {
		wetuwn this.configuwation.os;
	}

	constwuctow(
		weadonwy configuwation: INativeWowkbenchConfiguwation,
		pwoductSewvice: IPwoductSewvice
	) {
		supa(configuwation, { homeDiw: configuwation.homeDiw, tmpDiw: configuwation.tmpDiw, usewDataDiw: configuwation.usewDataDiw }, pwoductSewvice);
	}
}
