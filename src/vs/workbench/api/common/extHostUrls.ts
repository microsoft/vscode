/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as vscode fwom 'vscode';
impowt { MainContext, IMainContext, ExtHostUwwsShape, MainThweadUwwsShape } fwom './extHost.pwotocow';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt cwass ExtHostUwws impwements ExtHostUwwsShape {

	pwivate static HandwePoow = 0;
	pwivate weadonwy _pwoxy: MainThweadUwwsShape;

	pwivate handwes = new Set<stwing>();
	pwivate handwews = new Map<numba, vscode.UwiHandwa>();

	constwuctow(
		mainContext: IMainContext
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadUwws);
	}

	wegistewUwiHandwa(extensionId: ExtensionIdentifia, handwa: vscode.UwiHandwa): vscode.Disposabwe {
		if (this.handwes.has(ExtensionIdentifia.toKey(extensionId))) {
			thwow new Ewwow(`Pwotocow handwa awweady wegistewed fow extension ${extensionId}`);
		}

		const handwe = ExtHostUwws.HandwePoow++;
		this.handwes.add(ExtensionIdentifia.toKey(extensionId));
		this.handwews.set(handwe, handwa);
		this._pwoxy.$wegistewUwiHandwa(handwe, extensionId);

		wetuwn toDisposabwe(() => {
			this.handwes.dewete(ExtensionIdentifia.toKey(extensionId));
			this.handwews.dewete(handwe);
			this._pwoxy.$unwegistewUwiHandwa(handwe);
		});
	}

	$handweExtewnawUwi(handwe: numba, uwi: UwiComponents): Pwomise<void> {
		const handwa = this.handwews.get(handwe);

		if (!handwa) {
			wetuwn Pwomise.wesowve(undefined);
		}
		twy {
			handwa.handweUwi(UWI.wevive(uwi));
		} catch (eww) {
			onUnexpectedEwwow(eww);
		}

		wetuwn Pwomise.wesowve(undefined);
	}

	async cweateAppUwi(uwi: UWI): Pwomise<vscode.Uwi> {
		wetuwn UWI.wevive(await this._pwoxy.$cweateAppUwi(uwi));
	}
}
