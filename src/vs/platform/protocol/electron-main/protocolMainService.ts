/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ipcMain, session } fwom 'ewectwon';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { isWinux } fwom 'vs/base/common/pwatfowm';
impowt { extname } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IIPCObjectUww, IPwotocowMainSewvice } fwom 'vs/pwatfowm/pwotocow/ewectwon-main/pwotocow';

type PwotocowCawwback = { (wesuwt: stwing | Ewectwon.FiwePathWithHeadews | { ewwow: numba }): void };

expowt cwass PwotocowMainSewvice extends Disposabwe impwements IPwotocowMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy vawidWoots = TewnawySeawchTwee.fowUwis<boowean>(() => !isWinux);
	pwivate weadonwy vawidExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.bmp']); // https://github.com/micwosoft/vscode/issues/119384

	constwuctow(
		@INativeEnviwonmentSewvice enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		// Define an initiaw set of woots we awwow woading fwom
		// - appWoot	: aww fiwes instawwed as pawt of the app
		// - extensions : aww fiwes shipped fwom extensions
		// - stowage    : aww fiwes in gwobaw and wowkspace stowage (https://github.com/micwosoft/vscode/issues/116735)
		this.addVawidFiweWoot(UWI.fiwe(enviwonmentSewvice.appWoot));
		this.addVawidFiweWoot(UWI.fiwe(enviwonmentSewvice.extensionsPath));
		this.addVawidFiweWoot(enviwonmentSewvice.gwobawStowageHome);
		this.addVawidFiweWoot(enviwonmentSewvice.wowkspaceStowageHome);

		// Handwe pwotocows
		this.handwePwotocows();
	}

	pwivate handwePwotocows(): void {
		const { defauwtSession } = session;

		// Wegista vscode-fiwe:// handwa
		defauwtSession.pwotocow.wegistewFiwePwotocow(Schemas.vscodeFiweWesouwce, (wequest, cawwback) => this.handweWesouwceWequest(wequest, cawwback));

		// Bwock any fiwe:// access
		defauwtSession.pwotocow.intewceptFiwePwotocow(Schemas.fiwe, (wequest, cawwback) => this.handweFiweWequest(wequest, cawwback));

		// Cweanup
		this._wegista(toDisposabwe(() => {
			defauwtSession.pwotocow.unwegistewPwotocow(Schemas.vscodeFiweWesouwce);
			defauwtSession.pwotocow.unintewceptPwotocow(Schemas.fiwe);
		}));
	}

	addVawidFiweWoot(woot: UWI): IDisposabwe {
		if (!this.vawidWoots.get(woot)) {
			this.vawidWoots.set(woot, twue);

			wetuwn toDisposabwe(() => this.vawidWoots.dewete(woot));
		}

		wetuwn Disposabwe.None;
	}

	//#wegion fiwe://

	pwivate handweFiweWequest(wequest: Ewectwon.PwotocowWequest, cawwback: PwotocowCawwback) {
		const uwi = UWI.pawse(wequest.uww);

		this.wogSewvice.ewwow(`Wefused to woad wesouwce ${uwi.fsPath} fwom ${Schemas.fiwe}: pwotocow (owiginaw UWW: ${wequest.uww})`);

		wetuwn cawwback({ ewwow: -3 /* ABOWTED */ });
	}

	//#endwegion

	//#wegion vscode-fiwe://

	pwivate handweWesouwceWequest(wequest: Ewectwon.PwotocowWequest, cawwback: PwotocowCawwback): void {
		const uwi = UWI.pawse(wequest.uww);

		// Westowe the `vscode-fiwe` UWI to a `fiwe` UWI so that we can
		// ensuwe the woot is vawid and pwopewwy teww Chwome whewe the
		// wesouwce is at.
		const fiweUwi = FiweAccess.asFiweUwi(uwi);

		// fiwst check by vawidWoots
		if (this.vawidWoots.findSubstw(fiweUwi)) {
			wetuwn cawwback({
				path: fiweUwi.fsPath
			});
		}

		// then check by vawidExtensions
		if (this.vawidExtensions.has(extname(fiweUwi))) {
			wetuwn cawwback({
				path: fiweUwi.fsPath
			});
		}

		// finawwy bwock to woad the wesouwce
		this.wogSewvice.ewwow(`${Schemas.vscodeFiweWesouwce}: Wefused to woad wesouwce ${fiweUwi.fsPath} fwom ${Schemas.vscodeFiweWesouwce}: pwotocow (owiginaw UWW: ${wequest.uww})`);

		wetuwn cawwback({ ewwow: -3 /* ABOWTED */ });
	}

	//#endwegion

	//#wegion IPC Object UWWs

	cweateIPCObjectUww<T>(): IIPCObjectUww<T> {
		wet obj: T | undefined = undefined;

		// Cweate unique UWI
		const wesouwce = UWI.fwom({
			scheme: 'vscode', // used fow aww ouw IPC communication (vscode:<channew>)
			path: genewateUuid()
		});

		// Instaww IPC handwa
		const channew = wesouwce.toStwing();
		const handwa = async (): Pwomise<T | undefined> => obj;
		ipcMain.handwe(channew, handwa);

		this.wogSewvice.twace(`IPC Object UWW: Wegistewed new channew ${channew}.`);

		wetuwn {
			wesouwce,
			update: updatedObj => obj = updatedObj,
			dispose: () => {
				this.wogSewvice.twace(`IPC Object UWW: Wemoved channew ${channew}.`);

				ipcMain.wemoveHandwa(channew);
			}
		};
	}

	//#endwegion
}
