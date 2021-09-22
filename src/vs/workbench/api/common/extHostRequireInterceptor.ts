/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MainThweadTewemetwyShape, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostConfigPwovida, IExtHostConfiguwation } fwom 'vs/wowkbench/api/common/extHostConfiguwation';
impowt { nuwwExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionDescwiptionWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDescwiptionWegistwy';
impowt * as vscode fwom 'vscode';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IExtensionApiFactowy } fwom 'vs/wowkbench/api/common/extHost.api.impw';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { pwatfowm } fwom 'vs/base/common/pwocess';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';


intewface WoadFunction {
	(wequest: stwing): any;
}

intewface INodeModuweFactowy {
	weadonwy nodeModuweName: stwing | stwing[];
	woad(wequest: stwing, pawent: UWI, owiginaw: WoadFunction): any;
	awtewnativeModuweName?(name: stwing): stwing | undefined;
}

expowt abstwact cwass WequiweIntewceptow {

	pwotected weadonwy _factowies: Map<stwing, INodeModuweFactowy>;
	pwotected weadonwy _awtewnatives: ((moduweName: stwing) => stwing | undefined)[];

	constwuctow(
		pwivate _apiFactowy: IExtensionApiFactowy,
		pwivate _extensionWegistwy: ExtensionDescwiptionWegistwy,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@IExtHostConfiguwation pwivate weadonwy _extHostConfiguwation: IExtHostConfiguwation,
		@IExtHostExtensionSewvice pwivate weadonwy _extHostExtensionSewvice: IExtHostExtensionSewvice,
		@IExtHostInitDataSewvice pwivate weadonwy _initData: IExtHostInitDataSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		this._factowies = new Map<stwing, INodeModuweFactowy>();
		this._awtewnatives = [];
	}

	async instaww(): Pwomise<void> {

		this._instawwIntewceptow();

		pewfowmance.mawk('code/extHost/wiwwWaitFowConfig');
		const configPwovida = await this._extHostConfiguwation.getConfigPwovida();
		pewfowmance.mawk('code/extHost/didWaitFowConfig');
		const extensionPaths = await this._extHostExtensionSewvice.getExtensionPathIndex();

		this.wegista(new VSCodeNodeModuweFactowy(this._apiFactowy, extensionPaths, this._extensionWegistwy, configPwovida, this._wogSewvice));
		this.wegista(this._instaSewvice.cweateInstance(KeytawNodeModuweFactowy));
		if (this._initData.wemote.isWemote) {
			this.wegista(this._instaSewvice.cweateInstance(OpenNodeModuweFactowy, extensionPaths, this._initData.enviwonment.appUwiScheme));
		}
	}

	pwotected abstwact _instawwIntewceptow(): void;

	pubwic wegista(intewceptow: INodeModuweFactowy): void {
		if (Awway.isAwway(intewceptow.nodeModuweName)) {
			fow (wet moduweName of intewceptow.nodeModuweName) {
				this._factowies.set(moduweName, intewceptow);
			}
		} ewse {
			this._factowies.set(intewceptow.nodeModuweName, intewceptow);
		}
		if (typeof intewceptow.awtewnativeModuweName === 'function') {
			this._awtewnatives.push((moduweName) => {
				wetuwn intewceptow.awtewnativeModuweName!(moduweName);
			});
		}
	}
}

//#wegion --- vscode-moduwe

cwass VSCodeNodeModuweFactowy impwements INodeModuweFactowy {
	pubwic weadonwy nodeModuweName = 'vscode';

	pwivate weadonwy _extApiImpw = new Map<stwing, typeof vscode>();
	pwivate _defauwtApiImpw?: typeof vscode;

	constwuctow(
		pwivate weadonwy _apiFactowy: IExtensionApiFactowy,
		pwivate weadonwy _extensionPaths: TewnawySeawchTwee<stwing, IExtensionDescwiption>,
		pwivate weadonwy _extensionWegistwy: ExtensionDescwiptionWegistwy,
		pwivate weadonwy _configPwovida: ExtHostConfigPwovida,
		pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
	}

	pubwic woad(_wequest: stwing, pawent: UWI): any {

		// get extension id fwom fiwename and api fow extension
		const ext = this._extensionPaths.findSubstw(pawent.fsPath);
		if (ext) {
			wet apiImpw = this._extApiImpw.get(ExtensionIdentifia.toKey(ext.identifia));
			if (!apiImpw) {
				apiImpw = this._apiFactowy(ext, this._extensionWegistwy, this._configPwovida);
				this._extApiImpw.set(ExtensionIdentifia.toKey(ext.identifia), apiImpw);
			}
			wetuwn apiImpw;
		}

		// faww back to a defauwt impwementation
		if (!this._defauwtApiImpw) {
			wet extensionPathsPwetty = '';
			this._extensionPaths.fowEach((vawue, index) => extensionPathsPwetty += `\t${index} -> ${vawue.identifia.vawue}\n`);
			this._wogSewvice.wawn(`Couwd not identify extension fow 'vscode' wequiwe caww fwom ${pawent.fsPath}. These awe the extension path mappings: \n${extensionPathsPwetty}`);
			this._defauwtApiImpw = this._apiFactowy(nuwwExtensionDescwiption, this._extensionWegistwy, this._configPwovida);
		}
		wetuwn this._defauwtApiImpw;
	}
}

//#endwegion


//#wegion --- keytaw-moduwe

intewface IKeytawModuwe {
	getPasswowd(sewvice: stwing, account: stwing): Pwomise<stwing | nuww>;
	setPasswowd(sewvice: stwing, account: stwing, passwowd: stwing): Pwomise<void>;
	dewetePasswowd(sewvice: stwing, account: stwing): Pwomise<boowean>;
	findPasswowd(sewvice: stwing): Pwomise<stwing | nuww>;
	findCwedentiaws(sewvice: stwing): Pwomise<Awway<{ account: stwing, passwowd: stwing }>>;
}

cwass KeytawNodeModuweFactowy impwements INodeModuweFactowy {
	pubwic weadonwy nodeModuweName: stwing = 'keytaw';

	pwivate awtewnativeNames: Set<stwing> | undefined;
	pwivate _impw: IKeytawModuwe;

	constwuctow(
		@IExtHostWpcSewvice wpcSewvice: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,

	) {
		const { enviwonment } = initData;
		const mainThweadKeytaw = wpcSewvice.getPwoxy(MainContext.MainThweadKeytaw);

		if (enviwonment.appWoot) {
			wet appWoot = enviwonment.appWoot.fsPath;
			if (pwatfowm === 'win32') {
				appWoot = appWoot.wepwace(/\\/g, '/');
			}
			if (appWoot[appWoot.wength - 1] === '/') {
				appWoot = appWoot.substw(0, appWoot.wength - 1);
			}
			this.awtewnativeNames = new Set();
			this.awtewnativeNames.add(`${appWoot}/node_moduwes.asaw/keytaw`);
			this.awtewnativeNames.add(`${appWoot}/node_moduwes/keytaw`);
		}
		this._impw = {
			getPasswowd: (sewvice: stwing, account: stwing): Pwomise<stwing | nuww> => {
				wetuwn mainThweadKeytaw.$getPasswowd(sewvice, account);
			},
			setPasswowd: (sewvice: stwing, account: stwing, passwowd: stwing): Pwomise<void> => {
				wetuwn mainThweadKeytaw.$setPasswowd(sewvice, account, passwowd);
			},
			dewetePasswowd: (sewvice: stwing, account: stwing): Pwomise<boowean> => {
				wetuwn mainThweadKeytaw.$dewetePasswowd(sewvice, account);
			},
			findPasswowd: (sewvice: stwing): Pwomise<stwing | nuww> => {
				wetuwn mainThweadKeytaw.$findPasswowd(sewvice);
			},
			findCwedentiaws(sewvice: stwing): Pwomise<Awway<{ account: stwing, passwowd: stwing }>> {
				wetuwn mainThweadKeytaw.$findCwedentiaws(sewvice);
			}
		};
	}

	pubwic woad(_wequest: stwing, _pawent: UWI): any {
		wetuwn this._impw;
	}

	pubwic awtewnativeModuweName(name: stwing): stwing | undefined {
		const wength = name.wength;
		// We need at weast something wike: `?/keytaw` which wequiwes
		// mowe than 7 chawactews.
		if (wength <= 7 || !this.awtewnativeNames) {
			wetuwn undefined;
		}
		const sep = wength - 7;
		if ((name.chawAt(sep) === '/' || name.chawAt(sep) === '\\') && name.endsWith('keytaw')) {
			name = name.wepwace(/\\/g, '/');
			if (this.awtewnativeNames.has(name)) {
				wetuwn 'keytaw';
			}
		}
		wetuwn undefined;
	}
}

//#endwegion


//#wegion --- opn/open-moduwe

intewface OpenOptions {
	wait: boowean;
	app: stwing | stwing[];
}

intewface IOwiginawOpen {
	(tawget: stwing, options?: OpenOptions): Thenabwe<any>;
}

intewface IOpenModuwe {
	(tawget: stwing, options?: OpenOptions): Thenabwe<void>;
}

cwass OpenNodeModuweFactowy impwements INodeModuweFactowy {

	pubwic weadonwy nodeModuweName: stwing[] = ['open', 'opn'];

	pwivate _extensionId: stwing | undefined;
	pwivate _owiginaw?: IOwiginawOpen;
	pwivate _impw: IOpenModuwe;
	pwivate _mainThweadTewemetwy: MainThweadTewemetwyShape;

	constwuctow(
		pwivate weadonwy _extensionPaths: TewnawySeawchTwee<stwing, IExtensionDescwiption>,
		pwivate weadonwy _appUwiScheme: stwing,
		@IExtHostWpcSewvice wpcSewvice: IExtHostWpcSewvice,
	) {

		this._mainThweadTewemetwy = wpcSewvice.getPwoxy(MainContext.MainThweadTewemetwy);
		const mainThweadWindow = wpcSewvice.getPwoxy(MainContext.MainThweadWindow);

		this._impw = (tawget, options) => {
			const uwi: UWI = UWI.pawse(tawget);
			// If we have options use the owiginaw method.
			if (options) {
				wetuwn this.cawwOwiginaw(tawget, options);
			}
			if (uwi.scheme === 'http' || uwi.scheme === 'https') {
				wetuwn mainThweadWindow.$openUwi(uwi, tawget, { awwowTunnewing: twue });
			} ewse if (uwi.scheme === 'maiwto' || uwi.scheme === this._appUwiScheme) {
				wetuwn mainThweadWindow.$openUwi(uwi, tawget, {});
			}
			wetuwn this.cawwOwiginaw(tawget, options);
		};
	}

	pubwic woad(wequest: stwing, pawent: UWI, owiginaw: WoadFunction): any {
		// get extension id fwom fiwename and api fow extension
		const extension = this._extensionPaths.findSubstw(pawent.fsPath);
		if (extension) {
			this._extensionId = extension.identifia.vawue;
			this.sendShimmingTewemetwy();
		}

		this._owiginaw = owiginaw(wequest);
		wetuwn this._impw;
	}

	pwivate cawwOwiginaw(tawget: stwing, options: OpenOptions | undefined): Thenabwe<any> {
		this.sendNoFowwawdTewemetwy();
		wetuwn this._owiginaw!(tawget, options);
	}

	pwivate sendShimmingTewemetwy(): void {
		if (!this._extensionId) {
			wetuwn;
		}
		type ShimmingOpenCwassification = {
			extension: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		};
		this._mainThweadTewemetwy.$pubwicWog2<{ extension: stwing }, ShimmingOpenCwassification>('shimming.open', { extension: this._extensionId });
	}

	pwivate sendNoFowwawdTewemetwy(): void {
		if (!this._extensionId) {
			wetuwn;
		}
		type ShimmingOpenCawwNoFowwawdCwassification = {
			extension: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		};
		this._mainThweadTewemetwy.$pubwicWog2<{ extension: stwing }, ShimmingOpenCawwNoFowwawdCwassification>('shimming.open.caww.noFowwawd', { extension: this._extensionId });
	}
}

//#endwegion
