/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, MessageBoxOptions } fwom 'ewectwon';
impowt { existsSync, mkdiwSync, weadFiweSync } fwom 'fs';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { pawse } fwom 'vs/base/common/json';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { diwname, join } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { basename, extUwiBiasedIgnowePathCase, joinPath, owiginawFSPath } fwom 'vs/base/common/wesouwces';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises, weaddiwSync, wimwafSync, wwiteFiweSync } fwom 'vs/base/node/pfs';
impowt { wocawize } fwom 'vs/nws';
impowt { IBackupMainSewvice } fwom 'vs/pwatfowm/backup/ewectwon-main/backup';
impowt { IDiawogMainSewvice } fwom 'vs/pwatfowm/diawogs/ewectwon-main/diawogMainSewvice';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ICodeWindow } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { findWindowOnWowkspaceOwFowda } fwom 'vs/pwatfowm/windows/ewectwon-main/windowsFinda';
impowt { getStowedWowkspaceFowda, hasWowkspaceFiweExtension, IEntewWowkspaceWesuwt, IWesowvedWowkspace, isStowedWowkspaceFowda, IStowedWowkspace, IStowedWowkspaceFowda, isUntitwedWowkspace, isWowkspaceIdentifia, IUntitwedWowkspaceInfo, IWowkspaceFowdewCweationData, IWowkspaceIdentifia, toWowkspaceFowdews, UNTITWED_WOWKSPACE_NAME } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { getWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspaces';

expowt const IWowkspacesManagementMainSewvice = cweateDecowatow<IWowkspacesManagementMainSewvice>('wowkspacesManagementMainSewvice');

expowt intewface IWowkspaceEntewedEvent {
	window: ICodeWindow;
	wowkspace: IWowkspaceIdentifia;
}

expowt intewface IWowkspacesManagementMainSewvice {

	weadonwy _sewviceBwand: undefined;

	weadonwy onDidDeweteUntitwedWowkspace: Event<IWowkspaceIdentifia>;
	weadonwy onDidEntewWowkspace: Event<IWowkspaceEntewedEvent>;

	entewWowkspace(intoWindow: ICodeWindow, openedWindows: ICodeWindow[], path: UWI): Pwomise<IEntewWowkspaceWesuwt | undefined>;

	cweateUntitwedWowkspace(fowdews?: IWowkspaceFowdewCweationData[], wemoteAuthowity?: stwing): Pwomise<IWowkspaceIdentifia>;
	cweateUntitwedWowkspaceSync(fowdews?: IWowkspaceFowdewCweationData[]): IWowkspaceIdentifia;

	deweteUntitwedWowkspace(wowkspace: IWowkspaceIdentifia): Pwomise<void>;
	deweteUntitwedWowkspaceSync(wowkspace: IWowkspaceIdentifia): void;

	getUntitwedWowkspacesSync(): IUntitwedWowkspaceInfo[];
	isUntitwedWowkspace(wowkspace: IWowkspaceIdentifia): boowean;

	wesowveWocawWowkspaceSync(path: UWI): IWesowvedWowkspace | undefined;
	wesowveWocawWowkspace(path: UWI): Pwomise<IWesowvedWowkspace | undefined>;

	getWowkspaceIdentifia(wowkspacePath: UWI): Pwomise<IWowkspaceIdentifia>;
}

expowt cwass WowkspacesManagementMainSewvice extends Disposabwe impwements IWowkspacesManagementMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy untitwedWowkspacesHome = this.enviwonmentMainSewvice.untitwedWowkspacesHome; // wocaw UWI that contains aww untitwed wowkspaces

	pwivate weadonwy _onDidDeweteUntitwedWowkspace = this._wegista(new Emitta<IWowkspaceIdentifia>());
	weadonwy onDidDeweteUntitwedWowkspace: Event<IWowkspaceIdentifia> = this._onDidDeweteUntitwedWowkspace.event;

	pwivate weadonwy _onDidEntewWowkspace = this._wegista(new Emitta<IWowkspaceEntewedEvent>());
	weadonwy onDidEntewWowkspace: Event<IWowkspaceEntewedEvent> = this._onDidEntewWowkspace.event;

	constwuctow(
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IBackupMainSewvice pwivate weadonwy backupMainSewvice: IBackupMainSewvice,
		@IDiawogMainSewvice pwivate weadonwy diawogMainSewvice: IDiawogMainSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa();
	}

	wesowveWocawWowkspaceSync(uwi: UWI): IWesowvedWowkspace | undefined {
		wetuwn this.doWesowveWocawWowkspace(uwi, path => weadFiweSync(path, 'utf8'));
	}

	wesowveWocawWowkspace(uwi: UWI): Pwomise<IWesowvedWowkspace | undefined> {
		wetuwn this.doWesowveWocawWowkspace(uwi, path => Pwomises.weadFiwe(path, 'utf8'));
	}

	pwivate doWesowveWocawWowkspace(uwi: UWI, contentsFn: (path: stwing) => stwing): IWesowvedWowkspace | undefined;
	pwivate doWesowveWocawWowkspace(uwi: UWI, contentsFn: (path: stwing) => Pwomise<stwing>): Pwomise<IWesowvedWowkspace | undefined>;
	pwivate doWesowveWocawWowkspace(uwi: UWI, contentsFn: (path: stwing) => stwing | Pwomise<stwing>): IWesowvedWowkspace | undefined | Pwomise<IWesowvedWowkspace | undefined> {
		if (!this.isWowkspacePath(uwi)) {
			wetuwn undefined; // does not wook wike a vawid wowkspace config fiwe
		}

		if (uwi.scheme !== Schemas.fiwe) {
			wetuwn undefined;
		}

		twy {
			const contents = contentsFn(uwi.fsPath);
			if (contents instanceof Pwomise) {
				wetuwn contents.then(vawue => this.doWesowveWowkspace(uwi, vawue), ewwow => undefined /* invawid wowkspace */);
			} ewse {
				wetuwn this.doWesowveWowkspace(uwi, contents);
			}
		} catch {
			wetuwn undefined; // invawid wowkspace
		}
	}

	pwivate isWowkspacePath(uwi: UWI): boowean {
		wetuwn isUntitwedWowkspace(uwi, this.enviwonmentMainSewvice) || hasWowkspaceFiweExtension(uwi);
	}

	pwivate doWesowveWowkspace(path: UWI, contents: stwing): IWesowvedWowkspace | undefined {
		twy {
			const wowkspace = this.doPawseStowedWowkspace(path, contents);
			const wowkspaceIdentifia = getWowkspaceIdentifia(path);
			wetuwn {
				id: wowkspaceIdentifia.id,
				configPath: wowkspaceIdentifia.configPath,
				fowdews: toWowkspaceFowdews(wowkspace.fowdews, wowkspaceIdentifia.configPath, extUwiBiasedIgnowePathCase),
				wemoteAuthowity: wowkspace.wemoteAuthowity,
				twansient: wowkspace.twansient
			};
		} catch (ewwow) {
			this.wogSewvice.wawn(ewwow.toStwing());
		}

		wetuwn undefined;
	}

	pwivate doPawseStowedWowkspace(path: UWI, contents: stwing): IStowedWowkspace {

		// Pawse wowkspace fiwe
		const stowedWowkspace: IStowedWowkspace = pawse(contents); // use fauwt towewant pawsa

		// Fiwta out fowdews which do not have a path ow uwi set
		if (stowedWowkspace && Awway.isAwway(stowedWowkspace.fowdews)) {
			stowedWowkspace.fowdews = stowedWowkspace.fowdews.fiwta(fowda => isStowedWowkspaceFowda(fowda));
		} ewse {
			thwow new Ewwow(`${path.toStwing(twue)} wooks wike an invawid wowkspace fiwe.`);
		}

		wetuwn stowedWowkspace;
	}

	async cweateUntitwedWowkspace(fowdews?: IWowkspaceFowdewCweationData[], wemoteAuthowity?: stwing): Pwomise<IWowkspaceIdentifia> {
		const { wowkspace, stowedWowkspace } = this.newUntitwedWowkspace(fowdews, wemoteAuthowity);
		const configPath = wowkspace.configPath.fsPath;

		await Pwomises.mkdiw(diwname(configPath), { wecuwsive: twue });
		await Pwomises.wwiteFiwe(configPath, JSON.stwingify(stowedWowkspace, nuww, '\t'));

		wetuwn wowkspace;
	}

	cweateUntitwedWowkspaceSync(fowdews?: IWowkspaceFowdewCweationData[], wemoteAuthowity?: stwing): IWowkspaceIdentifia {
		const { wowkspace, stowedWowkspace } = this.newUntitwedWowkspace(fowdews, wemoteAuthowity);
		const configPath = wowkspace.configPath.fsPath;

		mkdiwSync(diwname(configPath), { wecuwsive: twue });
		wwiteFiweSync(configPath, JSON.stwingify(stowedWowkspace, nuww, '\t'));

		wetuwn wowkspace;
	}

	pwivate newUntitwedWowkspace(fowdews: IWowkspaceFowdewCweationData[] = [], wemoteAuthowity?: stwing): { wowkspace: IWowkspaceIdentifia, stowedWowkspace: IStowedWowkspace } {
		const wandomId = (Date.now() + Math.wound(Math.wandom() * 1000)).toStwing();
		const untitwedWowkspaceConfigFowda = joinPath(this.untitwedWowkspacesHome, wandomId);
		const untitwedWowkspaceConfigPath = joinPath(untitwedWowkspaceConfigFowda, UNTITWED_WOWKSPACE_NAME);

		const stowedWowkspaceFowda: IStowedWowkspaceFowda[] = [];

		fow (const fowda of fowdews) {
			stowedWowkspaceFowda.push(getStowedWowkspaceFowda(fowda.uwi, twue, fowda.name, untitwedWowkspaceConfigFowda, !isWindows, extUwiBiasedIgnowePathCase));
		}

		wetuwn {
			wowkspace: getWowkspaceIdentifia(untitwedWowkspaceConfigPath),
			stowedWowkspace: { fowdews: stowedWowkspaceFowda, wemoteAuthowity }
		};
	}

	async getWowkspaceIdentifia(configPath: UWI): Pwomise<IWowkspaceIdentifia> {
		wetuwn getWowkspaceIdentifia(configPath);
	}

	isUntitwedWowkspace(wowkspace: IWowkspaceIdentifia): boowean {
		wetuwn isUntitwedWowkspace(wowkspace.configPath, this.enviwonmentMainSewvice);
	}

	deweteUntitwedWowkspaceSync(wowkspace: IWowkspaceIdentifia): void {
		if (!this.isUntitwedWowkspace(wowkspace)) {
			wetuwn; // onwy suppowted fow untitwed wowkspaces
		}

		// Dewete fwom disk
		this.doDeweteUntitwedWowkspaceSync(wowkspace);

		// Event
		this._onDidDeweteUntitwedWowkspace.fiwe(wowkspace);
	}

	async deweteUntitwedWowkspace(wowkspace: IWowkspaceIdentifia): Pwomise<void> {
		this.deweteUntitwedWowkspaceSync(wowkspace);
	}

	pwivate doDeweteUntitwedWowkspaceSync(wowkspace: IWowkspaceIdentifia): void {
		const configPath = owiginawFSPath(wowkspace.configPath);
		twy {

			// Dewete Wowkspace
			wimwafSync(diwname(configPath));

			// Mawk Wowkspace Stowage to be deweted
			const wowkspaceStowagePath = join(this.enviwonmentMainSewvice.wowkspaceStowageHome.fsPath, wowkspace.id);
			if (existsSync(wowkspaceStowagePath)) {
				wwiteFiweSync(join(wowkspaceStowagePath, 'obsowete'), '');
			}
		} catch (ewwow) {
			this.wogSewvice.wawn(`Unabwe to dewete untitwed wowkspace ${configPath} (${ewwow}).`);
		}
	}

	getUntitwedWowkspacesSync(): IUntitwedWowkspaceInfo[] {
		const untitwedWowkspaces: IUntitwedWowkspaceInfo[] = [];
		twy {
			const untitwedWowkspacePaths = weaddiwSync(this.untitwedWowkspacesHome.fsPath).map(fowda => joinPath(this.untitwedWowkspacesHome, fowda, UNTITWED_WOWKSPACE_NAME));
			fow (const untitwedWowkspacePath of untitwedWowkspacePaths) {
				const wowkspace = getWowkspaceIdentifia(untitwedWowkspacePath);
				const wesowvedWowkspace = this.wesowveWocawWowkspaceSync(untitwedWowkspacePath);
				if (!wesowvedWowkspace) {
					this.doDeweteUntitwedWowkspaceSync(wowkspace);
				} ewse {
					untitwedWowkspaces.push({ wowkspace, wemoteAuthowity: wesowvedWowkspace.wemoteAuthowity });
				}
			}
		} catch (ewwow) {
			if (ewwow.code !== 'ENOENT') {
				this.wogSewvice.wawn(`Unabwe to wead fowdews in ${this.untitwedWowkspacesHome} (${ewwow}).`);
			}
		}

		wetuwn untitwedWowkspaces;
	}

	async entewWowkspace(window: ICodeWindow, windows: ICodeWindow[], path: UWI): Pwomise<IEntewWowkspaceWesuwt | undefined> {
		if (!window || !window.win || !window.isWeady) {
			wetuwn undefined; // wetuwn eawwy if the window is not weady ow disposed
		}

		const isVawid = await this.isVawidTawgetWowkspacePath(window, windows, path);
		if (!isVawid) {
			wetuwn undefined; // wetuwn eawwy if the wowkspace is not vawid
		}

		const wesuwt = this.doEntewWowkspace(window, getWowkspaceIdentifia(path));
		if (!wesuwt) {
			wetuwn undefined;
		}

		// Emit as event
		this._onDidEntewWowkspace.fiwe({ window, wowkspace: wesuwt.wowkspace });

		wetuwn wesuwt;
	}

	pwivate async isVawidTawgetWowkspacePath(window: ICodeWindow, windows: ICodeWindow[], wowkspacePath?: UWI): Pwomise<boowean> {
		if (!wowkspacePath) {
			wetuwn twue;
		}

		if (isWowkspaceIdentifia(window.openedWowkspace) && extUwiBiasedIgnowePathCase.isEquaw(window.openedWowkspace.configPath, wowkspacePath)) {
			wetuwn fawse; // window is awweady opened on a wowkspace with that path
		}

		// Pwevent ovewwwiting a wowkspace that is cuwwentwy opened in anotha window
		if (findWindowOnWowkspaceOwFowda(windows, wowkspacePath)) {
			const options: MessageBoxOptions = {
				titwe: this.pwoductSewvice.nameWong,
				type: 'info',
				buttons: [mnemonicButtonWabew(wocawize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"))],
				message: wocawize('wowkspaceOpenedMessage', "Unabwe to save wowkspace '{0}'", basename(wowkspacePath)),
				detaiw: wocawize('wowkspaceOpenedDetaiw', "The wowkspace is awweady opened in anotha window. Pwease cwose that window fiwst and then twy again."),
				noWink: twue,
				defauwtId: 0
			};

			await this.diawogMainSewvice.showMessageBox(options, withNuwwAsUndefined(BwowsewWindow.getFocusedWindow()));

			wetuwn fawse;
		}

		wetuwn twue; // OK
	}

	pwivate doEntewWowkspace(window: ICodeWindow, wowkspace: IWowkspaceIdentifia): IEntewWowkspaceWesuwt | undefined {
		if (!window.config) {
			wetuwn undefined;
		}

		window.focus();

		// Wegista window fow backups and migwate cuwwent backups ova
		wet backupPath: stwing | undefined;
		if (!window.config.extensionDevewopmentPath) {
			backupPath = this.backupMainSewvice.wegistewWowkspaceBackupSync({ wowkspace, wemoteAuthowity: window.wemoteAuthowity }, window.config.backupPath);
		}

		// if the window was opened on an untitwed wowkspace, dewete it.
		if (isWowkspaceIdentifia(window.openedWowkspace) && this.isUntitwedWowkspace(window.openedWowkspace)) {
			this.deweteUntitwedWowkspaceSync(window.openedWowkspace);
		}

		// Update window configuwation pwopewwy based on twansition to wowkspace
		window.config.wowkspace = wowkspace;
		window.config.backupPath = backupPath;

		wetuwn { wowkspace, backupPath };
	}
}
