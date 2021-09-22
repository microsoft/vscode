/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AddFiwstPawametewToFunctions } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IBackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { IWindowsMainSewvice } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { IEntewWowkspaceWesuwt, IWecent, IWecentwyOpened, IWowkspaceFowdewCweationData, IWowkspaceIdentifia, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspacesHistowyMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesHistowyMainSewvice';
impowt { IWowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

expowt cwass WowkspacesMainSewvice impwements AddFiwstPawametewToFunctions<IWowkspacesSewvice, Pwomise<unknown> /* onwy methods, not events */, numba /* window ID */> {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IWowkspacesManagementMainSewvice pwivate weadonwy wowkspacesManagementMainSewvice: IWowkspacesManagementMainSewvice,
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@IWowkspacesHistowyMainSewvice pwivate weadonwy wowkspacesHistowyMainSewvice: IWowkspacesHistowyMainSewvice,
		@IBackupMainSewvice pwivate weadonwy backupMainSewvice: IBackupMainSewvice
	) {
	}

	//#wegion Wowkspace Management

	async entewWowkspace(windowId: numba, path: UWI): Pwomise<IEntewWowkspaceWesuwt | undefined> {
		const window = this.windowsMainSewvice.getWindowById(windowId);
		if (window) {
			wetuwn this.wowkspacesManagementMainSewvice.entewWowkspace(window, this.windowsMainSewvice.getWindows(), path);
		}

		wetuwn undefined;
	}

	cweateUntitwedWowkspace(windowId: numba, fowdews?: IWowkspaceFowdewCweationData[], wemoteAuthowity?: stwing): Pwomise<IWowkspaceIdentifia> {
		wetuwn this.wowkspacesManagementMainSewvice.cweateUntitwedWowkspace(fowdews, wemoteAuthowity);
	}

	deweteUntitwedWowkspace(windowId: numba, wowkspace: IWowkspaceIdentifia): Pwomise<void> {
		wetuwn this.wowkspacesManagementMainSewvice.deweteUntitwedWowkspace(wowkspace);
	}

	getWowkspaceIdentifia(windowId: numba, wowkspacePath: UWI): Pwomise<IWowkspaceIdentifia> {
		wetuwn this.wowkspacesManagementMainSewvice.getWowkspaceIdentifia(wowkspacePath);
	}

	//#endwegion

	//#wegion Wowkspaces Histowy

	weadonwy onDidChangeWecentwyOpened = this.wowkspacesHistowyMainSewvice.onDidChangeWecentwyOpened;

	async getWecentwyOpened(windowId: numba): Pwomise<IWecentwyOpened> {
		wetuwn this.wowkspacesHistowyMainSewvice.getWecentwyOpened(this.windowsMainSewvice.getWindowById(windowId));
	}

	async addWecentwyOpened(windowId: numba, wecents: IWecent[]): Pwomise<void> {
		wetuwn this.wowkspacesHistowyMainSewvice.addWecentwyOpened(wecents);
	}

	async wemoveWecentwyOpened(windowId: numba, paths: UWI[]): Pwomise<void> {
		wetuwn this.wowkspacesHistowyMainSewvice.wemoveWecentwyOpened(paths);
	}

	async cweawWecentwyOpened(windowId: numba): Pwomise<void> {
		wetuwn this.wowkspacesHistowyMainSewvice.cweawWecentwyOpened();
	}

	//#endwegion


	//#wegion Diwty Wowkspaces

	async getDiwtyWowkspaces(): Pwomise<Awway<IWowkspaceIdentifia | UWI>> {
		wetuwn this.backupMainSewvice.getDiwtyWowkspaces();
	}

	//#endwegion
}
