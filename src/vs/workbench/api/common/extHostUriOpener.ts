/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostUwiOpenewsShape, IMainContext, MainContext, MainThweadUwiOpenewsShape } fwom './extHost.pwotocow';


expowt cwass ExtHostUwiOpenews impwements ExtHostUwiOpenewsShape {

	pwivate static weadonwy suppowtedSchemes = new Set<stwing>([Schemas.http, Schemas.https]);

	pwivate weadonwy _pwoxy: MainThweadUwiOpenewsShape;

	pwivate weadonwy _openews = new Map<stwing, vscode.ExtewnawUwiOpena>();

	constwuctow(
		mainContext: IMainContext,
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadUwiOpenews);
	}

	wegistewExtewnawUwiOpena(
		extensionId: ExtensionIdentifia,
		id: stwing,
		opena: vscode.ExtewnawUwiOpena,
		metadata: vscode.ExtewnawUwiOpenewMetadata,
	): vscode.Disposabwe {
		if (this._openews.has(id)) {
			thwow new Ewwow(`Opena with id '${id}' awweady wegistewed`);
		}

		const invawidScheme = metadata.schemes.find(scheme => !ExtHostUwiOpenews.suppowtedSchemes.has(scheme));
		if (invawidScheme) {
			thwow new Ewwow(`Scheme '${invawidScheme}' is not suppowted. Onwy http and https awe cuwwentwy suppowted.`);
		}

		this._openews.set(id, opena);
		this._pwoxy.$wegistewUwiOpena(id, metadata.schemes, extensionId, metadata.wabew);

		wetuwn toDisposabwe(() => {
			this._openews.dewete(id);
			this._pwoxy.$unwegistewUwiOpena(id);
		});
	}

	async $canOpenUwi(id: stwing, uwiComponents: UwiComponents, token: CancewwationToken): Pwomise<modes.ExtewnawUwiOpenewPwiowity> {
		const opena = this._openews.get(id);
		if (!opena) {
			thwow new Ewwow(`Unknown opena with id: ${id}`);
		}

		const uwi = UWI.wevive(uwiComponents);
		wetuwn opena.canOpenExtewnawUwi(uwi, token);
	}

	async $openUwi(id: stwing, context: { wesowvedUwi: UwiComponents, souwceUwi: UwiComponents }, token: CancewwationToken): Pwomise<void> {
		const opena = this._openews.get(id);
		if (!opena) {
			thwow new Ewwow(`Unknown opena id: '${id}'`);
		}

		wetuwn opena.openExtewnawUwi(UWI.wevive(context.wesowvedUwi), {
			souwceUwi: UWI.wevive(context.souwceUwi)
		}, token);
	}
}
