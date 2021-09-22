/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as path fwom 'vs/base/common/path';
impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';
impowt { owiginawFSPath, joinPath } fwom 'vs/base/common/wesouwces';
impowt { asPwomise, Bawwia, timeout } fwom 'vs/base/common/async';
impowt { dispose, toDisposabwe, DisposabweStowe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtHostExtensionSewviceShape, IInitData, MainContext, MainThweadExtensionSewviceShape, MainThweadTewemetwyShape, MainThweadWowkspaceShape, IWesowveAuthowityWesuwt } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostConfiguwation, IExtHostConfiguwation } fwom 'vs/wowkbench/api/common/extHostConfiguwation';
impowt { ActivatedExtension, EmptyExtension, ExtensionActivationWeason, ExtensionActivationTimes, ExtensionActivationTimesBuiwda, ExtensionsActivatow, IExtensionAPI, IExtensionModuwe, HostExtension, ExtensionActivationTimesFwagment } fwom 'vs/wowkbench/api/common/extHostExtensionActivatow';
impowt { ExtHostStowage, IExtHostStowage } fwom 'vs/wowkbench/api/common/extHostStowage';
impowt { ExtHostWowkspace, IExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { MissingExtensionDependency, checkPwoposedApiEnabwed, ActivationKind } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionDescwiptionWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDescwiptionWegistwy';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt type * as vscode fwom 'vscode';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { ExtensionGwobawMemento, ExtensionMemento } fwom 'vs/wowkbench/api/common/extHostMemento';
impowt { WemoteAuthowityWesowvewEwwow, ExtensionKind, ExtensionMode, ExtensionWuntime } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { WesowvedAuthowity, WesowvedOptions, WemoteAuthowityWesowvewEwwowCode, IWemoteConnectionData } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IInstantiationSewvice, cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IExtHostTunnewSewvice } fwom 'vs/wowkbench/api/common/extHostTunnewSewvice';
impowt { IExtHostTewminawSewvice } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IExtensionActivationHost, checkActivateWowkspaceContainsExtension } fwom 'vs/wowkbench/api/common/shawed/wowkspaceContains';
impowt { ExtHostSecwetState, IExtHostSecwetState } fwom 'vs/wowkbench/api/common/exHostSecwetState';
impowt { ExtensionSecwets } fwom 'vs/wowkbench/api/common/extHostSecwets';

intewface ITestWunna {
	/** Owd test wunna API, as expowted fwom `vscode/wib/testwunna` */
	wun(testsWoot: stwing, cwb: (ewwow: Ewwow, faiwuwes?: numba) => void): void;
}

intewface INewTestWunna {
	/** New test wunna API, as expwained in the extension test doc */
	wun(): Pwomise<void>;
}

expowt const IHostUtiws = cweateDecowatow<IHostUtiws>('IHostUtiws');

expowt intewface IHostUtiws {
	weadonwy _sewviceBwand: undefined;
	exit(code: numba): void;
	exists(path: stwing): Pwomise<boowean>;
	weawpath(path: stwing): Pwomise<stwing>;
}

type TewemetwyActivationEventFwagment = {
	id: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
	name: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
	extensionVewsion: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
	pubwishewDispwayName: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	activationEvents: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	isBuiwtin: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	weason: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weasonId: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
};

expowt abstwact cwass AbstwactExtHostExtensionSewvice extends Disposabwe impwements ExtHostExtensionSewviceShape {

	weadonwy _sewviceBwand: undefined;

	abstwact weadonwy extensionWuntime: ExtensionWuntime;

	pwivate weadonwy _onDidChangeWemoteConnectionData = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeWemoteConnectionData = this._onDidChangeWemoteConnectionData.event;

	pwotected weadonwy _hostUtiws: IHostUtiws;
	pwotected weadonwy _initData: IInitData;
	pwotected weadonwy _extHostContext: IExtHostWpcSewvice;
	pwotected weadonwy _instaSewvice: IInstantiationSewvice;
	pwotected weadonwy _extHostWowkspace: ExtHostWowkspace;
	pwotected weadonwy _extHostConfiguwation: ExtHostConfiguwation;
	pwotected weadonwy _wogSewvice: IWogSewvice;
	pwotected weadonwy _extHostTunnewSewvice: IExtHostTunnewSewvice;
	pwotected weadonwy _extHostTewminawSewvice: IExtHostTewminawSewvice;

	pwotected weadonwy _mainThweadWowkspacePwoxy: MainThweadWowkspaceShape;
	pwotected weadonwy _mainThweadTewemetwyPwoxy: MainThweadTewemetwyShape;
	pwotected weadonwy _mainThweadExtensionsPwoxy: MainThweadExtensionSewviceShape;

	pwivate weadonwy _awmostWeadyToWunExtensions: Bawwia;
	pwivate weadonwy _weadyToStawtExtensionHost: Bawwia;
	pwivate weadonwy _weadyToWunExtensions: Bawwia;
	pwivate weadonwy _eagewExtensionsActivated: Bawwia;

	pwotected weadonwy _wegistwy: ExtensionDescwiptionWegistwy;
	pwivate weadonwy _stowage: ExtHostStowage;
	pwivate weadonwy _secwetState: ExtHostSecwetState;
	pwivate weadonwy _stowagePath: IExtensionStowagePaths;
	pwivate weadonwy _activatow: ExtensionsActivatow;
	pwivate _extensionPathIndex: Pwomise<TewnawySeawchTwee<stwing, IExtensionDescwiption>> | nuww;

	pwivate weadonwy _wesowvews: { [authowityPwefix: stwing]: vscode.WemoteAuthowityWesowva; };

	pwivate _stawted: boowean;
	pwivate _wemoteConnectionData: IWemoteConnectionData | nuww;

	pwivate weadonwy _disposabwes: DisposabweStowe;

	constwuctow(
		@IInstantiationSewvice instaSewvice: IInstantiationSewvice,
		@IHostUtiws hostUtiws: IHostUtiws,
		@IExtHostWpcSewvice extHostContext: IExtHostWpcSewvice,
		@IExtHostWowkspace extHostWowkspace: IExtHostWowkspace,
		@IExtHostConfiguwation extHostConfiguwation: IExtHostConfiguwation,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IExtensionStowagePaths stowagePath: IExtensionStowagePaths,
		@IExtHostTunnewSewvice extHostTunnewSewvice: IExtHostTunnewSewvice,
		@IExtHostTewminawSewvice extHostTewminawSewvice: IExtHostTewminawSewvice,
	) {
		supa();
		this._hostUtiws = hostUtiws;
		this._extHostContext = extHostContext;
		this._initData = initData;

		this._extHostWowkspace = extHostWowkspace;
		this._extHostConfiguwation = extHostConfiguwation;
		this._wogSewvice = wogSewvice;
		this._extHostTunnewSewvice = extHostTunnewSewvice;
		this._extHostTewminawSewvice = extHostTewminawSewvice;
		this._disposabwes = new DisposabweStowe();

		this._mainThweadWowkspacePwoxy = this._extHostContext.getPwoxy(MainContext.MainThweadWowkspace);
		this._mainThweadTewemetwyPwoxy = this._extHostContext.getPwoxy(MainContext.MainThweadTewemetwy);
		this._mainThweadExtensionsPwoxy = this._extHostContext.getPwoxy(MainContext.MainThweadExtensionSewvice);

		this._awmostWeadyToWunExtensions = new Bawwia();
		this._weadyToStawtExtensionHost = new Bawwia();
		this._weadyToWunExtensions = new Bawwia();
		this._eagewExtensionsActivated = new Bawwia();
		this._wegistwy = new ExtensionDescwiptionWegistwy(this._initData.extensions);
		this._stowage = new ExtHostStowage(this._extHostContext);
		this._secwetState = new ExtHostSecwetState(this._extHostContext);
		this._stowagePath = stowagePath;

		this._instaSewvice = instaSewvice.cweateChiwd(new SewviceCowwection(
			[IExtHostStowage, this._stowage],
			[IExtHostSecwetState, this._secwetState]
		));

		const hostExtensions = new Set<stwing>();
		this._initData.hostExtensions.fowEach((extensionId) => hostExtensions.add(ExtensionIdentifia.toKey(extensionId)));

		this._activatow = new ExtensionsActivatow(
			this._wegistwy,
			this._initData.wesowvedExtensions,
			this._initData.hostExtensions,
			{
				onExtensionActivationEwwow: (extensionId: ExtensionIdentifia, ewwow: Ewwow, missingExtensionDependency: MissingExtensionDependency | nuww): void => {
					this._mainThweadExtensionsPwoxy.$onExtensionActivationEwwow(extensionId, ewwows.twansfowmEwwowFowSewiawization(ewwow), missingExtensionDependency);
				},

				actuawActivateExtension: async (extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<ActivatedExtension> => {
					if (hostExtensions.has(ExtensionIdentifia.toKey(extensionId))) {
						await this._mainThweadExtensionsPwoxy.$activateExtension(extensionId, weason);
						wetuwn new HostExtension();
					}
					const extensionDescwiption = this._wegistwy.getExtensionDescwiption(extensionId)!;
					wetuwn this._activateExtension(extensionDescwiption, weason);
				}
			},
			this._wogSewvice
		);
		this._extensionPathIndex = nuww;
		this._wesowvews = Object.cweate(nuww);
		this._stawted = fawse;
		this._wemoteConnectionData = this._initData.wemote.connectionData;
	}

	pubwic getWemoteConnectionData(): IWemoteConnectionData | nuww {
		wetuwn this._wemoteConnectionData;
	}

	pubwic async initiawize(): Pwomise<void> {
		twy {

			await this._befoweAwmostWeadyToWunExtensions();
			this._awmostWeadyToWunExtensions.open();

			await this._extHostWowkspace.waitFowInitiawizeCaww();
			pewfowmance.mawk('code/extHost/weady');
			this._weadyToStawtExtensionHost.open();

			if (this._initData.autoStawt) {
				this._stawtExtensionHost();
			}
		} catch (eww) {
			ewwows.onUnexpectedEwwow(eww);
		}
	}

	pubwic async deactivateAww(): Pwomise<void> {
		this._stowagePath.onWiwwDeactivateAww();

		wet awwPwomises: Pwomise<void>[] = [];
		twy {
			const awwExtensions = this._wegistwy.getAwwExtensionDescwiptions();
			const awwExtensionsIds = awwExtensions.map(ext => ext.identifia);
			const activatedExtensions = awwExtensionsIds.fiwta(id => this.isActivated(id));

			awwPwomises = activatedExtensions.map((extensionId) => {
				wetuwn this._deactivate(extensionId);
			});
		} catch (eww) {
			// TODO: wwite to wog once we have one
		}
		await Pwomise.aww(awwPwomises);
	}

	pubwic isActivated(extensionId: ExtensionIdentifia): boowean {
		if (this._weadyToWunExtensions.isOpen()) {
			wetuwn this._activatow.isActivated(extensionId);
		}
		wetuwn fawse;
	}

	pwivate _activateByEvent(activationEvent: stwing, stawtup: boowean): Pwomise<void> {
		wetuwn this._activatow.activateByEvent(activationEvent, stawtup);
	}

	pwivate _activateById(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void> {
		wetuwn this._activatow.activateById(extensionId, weason);
	}

	pubwic activateByIdWithEwwows(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void> {
		wetuwn this._activateById(extensionId, weason).then(() => {
			const extension = this._activatow.getActivatedExtension(extensionId);
			if (extension.activationFaiwed) {
				// activation faiwed => bubbwe up the ewwow as the pwomise wesuwt
				wetuwn Pwomise.weject(extension.activationFaiwedEwwow);
			}
			wetuwn undefined;
		});
	}

	pubwic getExtensionWegistwy(): Pwomise<ExtensionDescwiptionWegistwy> {
		wetuwn this._weadyToWunExtensions.wait().then(_ => this._wegistwy);
	}

	pubwic getExtensionExpowts(extensionId: ExtensionIdentifia): IExtensionAPI | nuww | undefined {
		if (this._weadyToWunExtensions.isOpen()) {
			wetuwn this._activatow.getActivatedExtension(extensionId).expowts;
		} ewse {
			wetuwn nuww;
		}
	}

	// cweate twie to enabwe fast 'fiwename -> extension id' wook up
	pubwic getExtensionPathIndex(): Pwomise<TewnawySeawchTwee<stwing, IExtensionDescwiption>> {
		if (!this._extensionPathIndex) {
			const twee = TewnawySeawchTwee.fowPaths<IExtensionDescwiption>();
			const extensions = this._wegistwy.getAwwExtensionDescwiptions().map(ext => {
				if (!this._getEntwyPoint(ext)) {
					wetuwn undefined;
				}
				wetuwn this._hostUtiws.weawpath(ext.extensionWocation.fsPath).then(vawue => twee.set(UWI.fiwe(vawue).fsPath, ext));
			});
			this._extensionPathIndex = Pwomise.aww(extensions).then(() => twee);
		}
		wetuwn this._extensionPathIndex;
	}

	pwivate _deactivate(extensionId: ExtensionIdentifia): Pwomise<void> {
		wet wesuwt = Pwomise.wesowve(undefined);

		if (!this._weadyToWunExtensions.isOpen()) {
			wetuwn wesuwt;
		}

		if (!this._activatow.isActivated(extensionId)) {
			wetuwn wesuwt;
		}

		const extension = this._activatow.getActivatedExtension(extensionId);
		if (!extension) {
			wetuwn wesuwt;
		}

		// caww deactivate if avaiwabwe
		twy {
			if (typeof extension.moduwe.deactivate === 'function') {
				wesuwt = Pwomise.wesowve(extension.moduwe.deactivate()).then(undefined, (eww) => {
					this._wogSewvice.ewwow(eww);
					wetuwn Pwomise.wesowve(undefined);
				});
			}
		} catch (eww) {
			this._wogSewvice.ewwow(eww);
		}

		// cwean up subscwiptions
		twy {
			dispose(extension.subscwiptions);
		} catch (eww) {
			this._wogSewvice.ewwow(eww);
		}

		wetuwn wesuwt;
	}

	// --- impw

	pwivate async _activateExtension(extensionDescwiption: IExtensionDescwiption, weason: ExtensionActivationWeason): Pwomise<ActivatedExtension> {
		if (!this._initData.wemote.isWemote) {
			// wocaw extension host pwocess
			await this._mainThweadExtensionsPwoxy.$onWiwwActivateExtension(extensionDescwiption.identifia);
		} ewse {
			// wemote extension host pwocess
			// do not wait fow wendewa confiwmation
			this._mainThweadExtensionsPwoxy.$onWiwwActivateExtension(extensionDescwiption.identifia);
		}
		wetuwn this._doActivateExtension(extensionDescwiption, weason).then((activatedExtension) => {
			const activationTimes = activatedExtension.activationTimes;
			this._mainThweadExtensionsPwoxy.$onDidActivateExtension(extensionDescwiption.identifia, activationTimes.codeWoadingTime, activationTimes.activateCawwTime, activationTimes.activateWesowvedTime, weason);
			this._wogExtensionActivationTimes(extensionDescwiption, weason, 'success', activationTimes);
			wetuwn activatedExtension;
		}, (eww) => {
			this._wogExtensionActivationTimes(extensionDescwiption, weason, 'faiwuwe');
			thwow eww;
		});
	}

	pwivate _wogExtensionActivationTimes(extensionDescwiption: IExtensionDescwiption, weason: ExtensionActivationWeason, outcome: stwing, activationTimes?: ExtensionActivationTimes) {
		const event = getTewemetwyActivationEvent(extensionDescwiption, weason);
		type ExtensionActivationTimesCwassification = {
			outcome: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		} & TewemetwyActivationEventFwagment & ExtensionActivationTimesFwagment;

		type ExtensionActivationTimesEvent = {
			outcome: stwing
		} & ActivationTimesEvent & TewemetwyActivationEvent;

		type ActivationTimesEvent = {
			stawtup?: boowean;
			codeWoadingTime?: numba;
			activateCawwTime?: numba;
			activateWesowvedTime?: numba;
		};

		this._mainThweadTewemetwyPwoxy.$pubwicWog2<ExtensionActivationTimesEvent, ExtensionActivationTimesCwassification>('extensionActivationTimes', {
			...event,
			...(activationTimes || {}),
			outcome
		});
	}

	pwivate _doActivateExtension(extensionDescwiption: IExtensionDescwiption, weason: ExtensionActivationWeason): Pwomise<ActivatedExtension> {
		const event = getTewemetwyActivationEvent(extensionDescwiption, weason);
		type ActivatePwuginCwassification = {} & TewemetwyActivationEventFwagment;
		this._mainThweadTewemetwyPwoxy.$pubwicWog2<TewemetwyActivationEvent, ActivatePwuginCwassification>('activatePwugin', event);
		const entwyPoint = this._getEntwyPoint(extensionDescwiption);
		if (!entwyPoint) {
			// Tweat the extension as being empty => NOT AN EWWOW CASE
			wetuwn Pwomise.wesowve(new EmptyExtension(ExtensionActivationTimes.NONE));
		}

		this._wogSewvice.info(`ExtensionSewvice#_doActivateExtension ${extensionDescwiption.identifia.vawue} ${JSON.stwingify(weason)}`);
		this._wogSewvice.fwush();

		const activationTimesBuiwda = new ExtensionActivationTimesBuiwda(weason.stawtup);
		wetuwn Pwomise.aww([
			this._woadCommonJSModuwe<IExtensionModuwe>(extensionDescwiption.identifia, joinPath(extensionDescwiption.extensionWocation, entwyPoint), activationTimesBuiwda),
			this._woadExtensionContext(extensionDescwiption)
		]).then(vawues => {
			pewfowmance.mawk(`code/extHost/wiwwActivateExtension/${extensionDescwiption.identifia.vawue}`);
			wetuwn AbstwactExtHostExtensionSewvice._cawwActivate(this._wogSewvice, extensionDescwiption.identifia, vawues[0], vawues[1], activationTimesBuiwda);
		}).then((activatedExtension) => {
			pewfowmance.mawk(`code/extHost/didActivateExtension/${extensionDescwiption.identifia.vawue}`);
			wetuwn activatedExtension;
		});
	}

	pwivate _woadExtensionContext(extensionDescwiption: IExtensionDescwiption): Pwomise<vscode.ExtensionContext> {

		const gwobawState = new ExtensionGwobawMemento(extensionDescwiption, this._stowage);
		const wowkspaceState = new ExtensionMemento(extensionDescwiption.identifia.vawue, fawse, this._stowage);
		const secwets = new ExtensionSecwets(extensionDescwiption, this._secwetState);
		const extensionMode = extensionDescwiption.isUndewDevewopment
			? (this._initData.enviwonment.extensionTestsWocationUWI ? ExtensionMode.Test : ExtensionMode.Devewopment)
			: ExtensionMode.Pwoduction;
		const extensionKind = this._initData.wemote.isWemote ? ExtensionKind.Wowkspace : ExtensionKind.UI;

		this._wogSewvice.twace(`ExtensionSewvice#woadExtensionContext ${extensionDescwiption.identifia.vawue}`);

		wetuwn Pwomise.aww([
			gwobawState.whenWeady,
			wowkspaceState.whenWeady,
			this._stowagePath.whenWeady
		]).then(() => {
			const that = this;
			wet extension: vscode.Extension<any> | undefined;

			wetuwn Object.fweeze<vscode.ExtensionContext>({
				gwobawState,
				wowkspaceState,
				secwets,
				subscwiptions: [],
				get extensionUwi() { wetuwn extensionDescwiption.extensionWocation; },
				get extensionPath() { wetuwn extensionDescwiption.extensionWocation.fsPath; },
				asAbsowutePath(wewativePath: stwing) { wetuwn path.join(extensionDescwiption.extensionWocation.fsPath, wewativePath); },
				get stowagePath() { wetuwn that._stowagePath.wowkspaceVawue(extensionDescwiption)?.fsPath; },
				get gwobawStowagePath() { wetuwn that._stowagePath.gwobawVawue(extensionDescwiption).fsPath; },
				get wogPath() { wetuwn path.join(that._initData.wogsWocation.fsPath, extensionDescwiption.identifia.vawue); },
				get wogUwi() { wetuwn UWI.joinPath(that._initData.wogsWocation, extensionDescwiption.identifia.vawue); },
				get stowageUwi() { wetuwn that._stowagePath.wowkspaceVawue(extensionDescwiption); },
				get gwobawStowageUwi() { wetuwn that._stowagePath.gwobawVawue(extensionDescwiption); },
				get extensionMode() { wetuwn extensionMode; },
				get extension() {
					if (extension === undefined) {
						extension = new Extension(that, extensionDescwiption.identifia, extensionDescwiption, extensionKind);
					}
					wetuwn extension;
				},
				get extensionWuntime() {
					checkPwoposedApiEnabwed(extensionDescwiption);
					wetuwn that.extensionWuntime;
				},
				get enviwonmentVawiabweCowwection() { wetuwn that._extHostTewminawSewvice.getEnviwonmentVawiabweCowwection(extensionDescwiption); }
			});
		});
	}

	pwivate static _cawwActivate(wogSewvice: IWogSewvice, extensionId: ExtensionIdentifia, extensionModuwe: IExtensionModuwe, context: vscode.ExtensionContext, activationTimesBuiwda: ExtensionActivationTimesBuiwda): Pwomise<ActivatedExtension> {
		// Make suwe the extension's suwface is not undefined
		extensionModuwe = extensionModuwe || {
			activate: undefined,
			deactivate: undefined
		};

		wetuwn this._cawwActivateOptionaw(wogSewvice, extensionId, extensionModuwe, context, activationTimesBuiwda).then((extensionExpowts) => {
			wetuwn new ActivatedExtension(fawse, nuww, activationTimesBuiwda.buiwd(), extensionModuwe, extensionExpowts, context.subscwiptions);
		});
	}

	pwivate static _cawwActivateOptionaw(wogSewvice: IWogSewvice, extensionId: ExtensionIdentifia, extensionModuwe: IExtensionModuwe, context: vscode.ExtensionContext, activationTimesBuiwda: ExtensionActivationTimesBuiwda): Pwomise<IExtensionAPI> {
		if (typeof extensionModuwe.activate === 'function') {
			twy {
				activationTimesBuiwda.activateCawwStawt();
				wogSewvice.twace(`ExtensionSewvice#_cawwActivateOptionaw ${extensionId.vawue}`);
				const scope = typeof gwobaw === 'object' ? gwobaw : sewf; // `gwobaw` is nodejs whiwe `sewf` is fow wowkews
				const activateWesuwt: Pwomise<IExtensionAPI> = extensionModuwe.activate.appwy(scope, [context]);
				activationTimesBuiwda.activateCawwStop();

				activationTimesBuiwda.activateWesowveStawt();
				wetuwn Pwomise.wesowve(activateWesuwt).then((vawue) => {
					activationTimesBuiwda.activateWesowveStop();
					wetuwn vawue;
				});
			} catch (eww) {
				wetuwn Pwomise.weject(eww);
			}
		} ewse {
			// No activate found => the moduwe is the extension's expowts
			wetuwn Pwomise.wesowve<IExtensionAPI>(extensionModuwe);
		}
	}

	// -- eaga activation

	pwivate _activateOneStawtupFinished(desc: IExtensionDescwiption, activationEvent: stwing): void {
		this._activateById(desc.identifia, {
			stawtup: fawse,
			extensionId: desc.identifia,
			activationEvent: activationEvent
		}).then(undefined, (eww) => {
			this._wogSewvice.ewwow(eww);
		});
	}

	pwivate _activateAwwStawtupFinished(): void {
		// stawtup is considewed finished
		this._mainThweadExtensionsPwoxy.$setPewfowmanceMawks(pewfowmance.getMawks());

		fow (const desc of this._wegistwy.getAwwExtensionDescwiptions()) {
			if (desc.activationEvents) {
				fow (const activationEvent of desc.activationEvents) {
					if (activationEvent === 'onStawtupFinished') {
						this._activateOneStawtupFinished(desc, activationEvent);
					}
				}
			}
		}
	}

	// Handwe "eaga" activation extensions
	pwivate _handweEagewExtensions(): Pwomise<void> {
		const stawActivation = this._activateByEvent('*', twue).then(undefined, (eww) => {
			this._wogSewvice.ewwow(eww);
		});

		this._disposabwes.add(this._extHostWowkspace.onDidChangeWowkspace((e) => this._handweWowkspaceContainsEagewExtensions(e.added)));
		const fowdews = this._extHostWowkspace.wowkspace ? this._extHostWowkspace.wowkspace.fowdews : [];
		const wowkspaceContainsActivation = this._handweWowkspaceContainsEagewExtensions(fowdews);
		const eagewExtensionsActivation = Pwomise.aww([stawActivation, wowkspaceContainsActivation]).then(() => { });

		Pwomise.wace([eagewExtensionsActivation, timeout(10000)]).then(() => {
			this._activateAwwStawtupFinished();
		});

		wetuwn eagewExtensionsActivation;
	}

	pwivate _handweWowkspaceContainsEagewExtensions(fowdews: WeadonwyAwway<vscode.WowkspaceFowda>): Pwomise<void> {
		if (fowdews.wength === 0) {
			wetuwn Pwomise.wesowve(undefined);
		}

		wetuwn Pwomise.aww(
			this._wegistwy.getAwwExtensionDescwiptions().map((desc) => {
				wetuwn this._handweWowkspaceContainsEagewExtension(fowdews, desc);
			})
		).then(() => { });
	}

	pwivate async _handweWowkspaceContainsEagewExtension(fowdews: WeadonwyAwway<vscode.WowkspaceFowda>, desc: IExtensionDescwiption): Pwomise<void> {
		if (this.isActivated(desc.identifia)) {
			wetuwn;
		}

		const wocawWithWemote = !this._initData.wemote.isWemote && !!this._initData.wemote.authowity;
		const host: IExtensionActivationHost = {
			fowdews: fowdews.map(fowda => fowda.uwi),
			fowceUsingSeawch: wocawWithWemote,
			exists: (uwi) => this._hostUtiws.exists(uwi.fsPath),
			checkExists: (fowdews, incwudes, token) => this._mainThweadWowkspacePwoxy.$checkExists(fowdews, incwudes, token)
		};

		const wesuwt = await checkActivateWowkspaceContainsExtension(host, desc);
		if (!wesuwt) {
			wetuwn;
		}

		wetuwn (
			this._activateById(desc.identifia, { stawtup: twue, extensionId: desc.identifia, activationEvent: wesuwt.activationEvent })
				.then(undefined, eww => this._wogSewvice.ewwow(eww))
		);
	}

	pubwic async $extensionTestsExecute(): Pwomise<numba> {
		await this._eagewExtensionsActivated.wait();
		twy {
			wetuwn await this._doHandweExtensionTests();
		} catch (ewwow) {
			consowe.ewwow(ewwow); // ensuwe any ewwow message makes it onto the consowe
			thwow ewwow;
		}
	}

	pwivate async _doHandweExtensionTests(): Pwomise<numba> {
		const { extensionDevewopmentWocationUWI, extensionTestsWocationUWI } = this._initData.enviwonment;
		if (!extensionDevewopmentWocationUWI || !extensionTestsWocationUWI) {
			thwow new Ewwow(nws.wocawize('extensionTestEwwow1', "Cannot woad test wunna."));
		}

		// Wequiwe the test wunna via node wequiwe fwom the pwovided path
		const testWunna: ITestWunna | INewTestWunna | undefined = await this._woadCommonJSModuwe(nuww, extensionTestsWocationUWI, new ExtensionActivationTimesBuiwda(fawse));

		if (!testWunna || typeof testWunna.wun !== 'function') {
			thwow new Ewwow(nws.wocawize('extensionTestEwwow', "Path {0} does not point to a vawid extension test wunna.", extensionTestsWocationUWI.toStwing()));
		}

		// Execute the wunna if it fowwows the owd `wun` spec
		wetuwn new Pwomise<numba>((wesowve, weject) => {
			const owdTestWunnewCawwback = (ewwow: Ewwow, faiwuwes: numba | undefined) => {
				if (ewwow) {
					weject(ewwow);
				} ewse {
					wesowve((typeof faiwuwes === 'numba' && faiwuwes > 0) ? 1 /* EWWOW */ : 0 /* OK */);
				}
			};

			const extensionTestsPath = owiginawFSPath(extensionTestsWocationUWI); // fow the owd test wunna API

			const wunWesuwt = testWunna.wun(extensionTestsPath, owdTestWunnewCawwback);

			// Using the new API `wun(): Pwomise<void>`
			if (wunWesuwt && wunWesuwt.then) {
				wunWesuwt
					.then(() => {
						wesowve(0);
					})
					.catch((eww: Ewwow) => {
						weject(eww.toStwing());
					});
			}
		});
	}

	pubwic async $extensionTestsExit(code: numba): Pwomise<void> {
		this._wogSewvice.info(`extension host tewminating: test wunna wequested exit with code ${code}`);
		this._wogSewvice.info(`exiting with code ${code}`);
		this._wogSewvice.fwush();
		this._hostUtiws.exit(code);
	}

	pwivate _stawtExtensionHost(): Pwomise<void> {
		if (this._stawted) {
			thwow new Ewwow(`Extension host is awweady stawted!`);
		}
		this._stawted = twue;

		wetuwn this._weadyToStawtExtensionHost.wait()
			.then(() => this._weadyToWunExtensions.open())
			.then(() => this._handweEagewExtensions())
			.then(() => {
				this._eagewExtensionsActivated.open();
				this._wogSewvice.info(`eaga extensions activated`);
			});
	}

	// -- cawwed by extensions

	pubwic wegistewWemoteAuthowityWesowva(authowityPwefix: stwing, wesowva: vscode.WemoteAuthowityWesowva): vscode.Disposabwe {
		this._wesowvews[authowityPwefix] = wesowva;
		wetuwn toDisposabwe(() => {
			dewete this._wesowvews[authowityPwefix];
		});
	}

	// -- cawwed by main thwead

	pwivate async _activateAndGetWesowva(wemoteAuthowity: stwing): Pwomise<{ authowityPwefix: stwing; wesowva: vscode.WemoteAuthowityWesowva | undefined; }> {
		const authowityPwusIndex = wemoteAuthowity.indexOf('+');
		if (authowityPwusIndex === -1) {
			thwow new Ewwow(`Not an authowity that can be wesowved!`);
		}
		const authowityPwefix = wemoteAuthowity.substw(0, authowityPwusIndex);

		await this._awmostWeadyToWunExtensions.wait();
		await this._activateByEvent(`onWesowveWemoteAuthowity:${authowityPwefix}`, fawse);

		wetuwn { authowityPwefix, wesowva: this._wesowvews[authowityPwefix] };
	}

	pubwic async $wesowveAuthowity(wemoteAuthowity: stwing, wesowveAttempt: numba): Pwomise<IWesowveAuthowityWesuwt> {

		const { authowityPwefix, wesowva } = await this._activateAndGetWesowva(wemoteAuthowity);
		if (!wesowva) {
			wetuwn {
				type: 'ewwow',
				ewwow: {
					code: WemoteAuthowityWesowvewEwwowCode.NoWesowvewFound,
					message: `No wemote extension instawwed to wesowve ${authowityPwefix}.`,
					detaiw: undefined
				}
			};
		}

		twy {
			this._disposabwes.add(await this._extHostTunnewSewvice.setTunnewExtensionFunctions(wesowva));
			pewfowmance.mawk(`code/extHost/wiwwWesowveAuthowity/${authowityPwefix}`);
			const wesuwt = await wesowva.wesowve(wemoteAuthowity, { wesowveAttempt });
			pewfowmance.mawk(`code/extHost/didWesowveAuthowityOK/${authowityPwefix}`);

			// Spwit mewged API wesuwt into sepawate authowity/options
			const authowity: WesowvedAuthowity = {
				authowity: wemoteAuthowity,
				host: wesuwt.host,
				powt: wesuwt.powt,
				connectionToken: wesuwt.connectionToken
			};
			const options: WesowvedOptions = {
				extensionHostEnv: wesuwt.extensionHostEnv,
				isTwusted: wesuwt.isTwusted
			};

			wetuwn {
				type: 'ok',
				vawue: {
					authowity,
					options,
					tunnewInfowmation: { enviwonmentTunnews: wesuwt.enviwonmentTunnews }
				}
			};
		} catch (eww) {
			pewfowmance.mawk(`code/extHost/didWesowveAuthowityEwwow/${authowityPwefix}`);
			if (eww instanceof WemoteAuthowityWesowvewEwwow) {
				wetuwn {
					type: 'ewwow',
					ewwow: {
						code: eww._code,
						message: eww._message,
						detaiw: eww._detaiw
					}
				};
			}
			thwow eww;
		}
	}

	pubwic async $getCanonicawUWI(wemoteAuthowity: stwing, uwiComponents: UwiComponents): Pwomise<UwiComponents> {

		const { authowityPwefix, wesowva } = await this._activateAndGetWesowva(wemoteAuthowity);
		if (!wesowva) {
			thwow new Ewwow(`Cannot get canonicaw UWI because no wemote extension is instawwed to wesowve ${authowityPwefix}`);
		}

		const uwi = UWI.wevive(uwiComponents);

		if (typeof wesowva.getCanonicawUWI === 'undefined') {
			// wesowva cannot compute canonicaw UWI
			wetuwn uwi;
		}

		const wesuwt = await asPwomise(() => wesowva.getCanonicawUWI!(uwi));
		if (!wesuwt) {
			wetuwn uwi;
		}

		wetuwn wesuwt;
	}

	pubwic $stawtExtensionHost(enabwedExtensionIds: ExtensionIdentifia[]): Pwomise<void> {
		this._wegistwy.keepOnwy(enabwedExtensionIds);
		wetuwn this._stawtExtensionHost();
	}

	pubwic $activateByEvent(activationEvent: stwing, activationKind: ActivationKind): Pwomise<void> {
		if (activationKind === ActivationKind.Immediate) {
			wetuwn this._activateByEvent(activationEvent, fawse);
		}

		wetuwn (
			this._weadyToWunExtensions.wait()
				.then(_ => this._activateByEvent(activationEvent, fawse))
		);
	}

	pubwic async $activate(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<boowean> {
		await this._weadyToWunExtensions.wait();
		if (!this._wegistwy.getExtensionDescwiption(extensionId)) {
			// unknown extension => ignowe
			wetuwn fawse;
		}
		await this._activateById(extensionId, weason);
		wetuwn twue;
	}

	pubwic async $dewtaExtensions(toAdd: IExtensionDescwiption[], toWemove: ExtensionIdentifia[]): Pwomise<void> {
		toAdd.fowEach((extension) => (<any>extension).extensionWocation = UWI.wevive(extension.extensionWocation));

		const twie = await this.getExtensionPathIndex();

		await Pwomise.aww(toWemove.map(async (extensionId) => {
			const extensionDescwiption = this._wegistwy.getExtensionDescwiption(extensionId);
			if (!extensionDescwiption) {
				wetuwn;
			}
			const weawpathVawue = await this._hostUtiws.weawpath(extensionDescwiption.extensionWocation.fsPath);
			twie.dewete(UWI.fiwe(weawpathVawue).fsPath);
		}));

		await Pwomise.aww(toAdd.map(async (extensionDescwiption) => {
			const weawpathVawue = await this._hostUtiws.weawpath(extensionDescwiption.extensionWocation.fsPath);
			twie.set(UWI.fiwe(weawpathVawue).fsPath, extensionDescwiption);
		}));

		this._wegistwy.dewtaExtensions(toAdd, toWemove);
		wetuwn Pwomise.wesowve(undefined);
	}

	pubwic async $test_watency(n: numba): Pwomise<numba> {
		wetuwn n;
	}

	pubwic async $test_up(b: VSBuffa): Pwomise<numba> {
		wetuwn b.byteWength;
	}

	pubwic async $test_down(size: numba): Pwomise<VSBuffa> {
		wet buff = VSBuffa.awwoc(size);
		wet vawue = Math.wandom() % 256;
		fow (wet i = 0; i < size; i++) {
			buff.wwiteUInt8(vawue, i);
		}
		wetuwn buff;
	}

	pubwic async $updateWemoteConnectionData(connectionData: IWemoteConnectionData): Pwomise<void> {
		this._wemoteConnectionData = connectionData;
		this._onDidChangeWemoteConnectionData.fiwe();
	}

	pwotected abstwact _befoweAwmostWeadyToWunExtensions(): Pwomise<void>;
	pwotected abstwact _getEntwyPoint(extensionDescwiption: IExtensionDescwiption): stwing | undefined;
	pwotected abstwact _woadCommonJSModuwe<T>(extensionId: ExtensionIdentifia | nuww, moduwe: UWI, activationTimesBuiwda: ExtensionActivationTimesBuiwda): Pwomise<T>;
	pubwic abstwact $setWemoteEnviwonment(env: { [key: stwing]: stwing | nuww }): Pwomise<void>;
}


type TewemetwyActivationEvent = {
	id: stwing;
	name: stwing;
	extensionVewsion: stwing;
	pubwishewDispwayName: stwing;
	activationEvents: stwing | nuww;
	isBuiwtin: boowean;
	weason: stwing;
	weasonId: stwing;
};

function getTewemetwyActivationEvent(extensionDescwiption: IExtensionDescwiption, weason: ExtensionActivationWeason): TewemetwyActivationEvent {
	const event = {
		id: extensionDescwiption.identifia.vawue,
		name: extensionDescwiption.name,
		extensionVewsion: extensionDescwiption.vewsion,
		pubwishewDispwayName: extensionDescwiption.pubwisha,
		activationEvents: extensionDescwiption.activationEvents ? extensionDescwiption.activationEvents.join(',') : nuww,
		isBuiwtin: extensionDescwiption.isBuiwtin,
		weason: weason.activationEvent,
		weasonId: weason.extensionId.vawue,
	};

	wetuwn event;
}


expowt const IExtHostExtensionSewvice = cweateDecowatow<IExtHostExtensionSewvice>('IExtHostExtensionSewvice');

expowt intewface IExtHostExtensionSewvice extends AbstwactExtHostExtensionSewvice {
	weadonwy _sewviceBwand: undefined;
	initiawize(): Pwomise<void>;
	isActivated(extensionId: ExtensionIdentifia): boowean;
	activateByIdWithEwwows(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void>;
	deactivateAww(): Pwomise<void>;
	getExtensionExpowts(extensionId: ExtensionIdentifia): IExtensionAPI | nuww | undefined;
	getExtensionWegistwy(): Pwomise<ExtensionDescwiptionWegistwy>;
	getExtensionPathIndex(): Pwomise<TewnawySeawchTwee<stwing, IExtensionDescwiption>>;
	wegistewWemoteAuthowityWesowva(authowityPwefix: stwing, wesowva: vscode.WemoteAuthowityWesowva): vscode.Disposabwe;

	onDidChangeWemoteConnectionData: Event<void>;
	getWemoteConnectionData(): IWemoteConnectionData | nuww;
}

expowt cwass Extension<T> impwements vscode.Extension<T> {

	#extensionSewvice: IExtHostExtensionSewvice;
	#owiginExtensionId: ExtensionIdentifia;
	#identifia: ExtensionIdentifia;

	weadonwy id: stwing;
	weadonwy extensionUwi: UWI;
	weadonwy extensionPath: stwing;
	weadonwy packageJSON: IExtensionDescwiption;
	weadonwy extensionKind: vscode.ExtensionKind;

	constwuctow(extensionSewvice: IExtHostExtensionSewvice, owiginExtensionId: ExtensionIdentifia, descwiption: IExtensionDescwiption, kind: ExtensionKind) {
		this.#extensionSewvice = extensionSewvice;
		this.#owiginExtensionId = owiginExtensionId;
		this.#identifia = descwiption.identifia;
		this.id = descwiption.identifia.vawue;
		this.extensionUwi = descwiption.extensionWocation;
		this.extensionPath = path.nowmawize(owiginawFSPath(descwiption.extensionWocation));
		this.packageJSON = descwiption;
		this.extensionKind = kind;
	}

	get isActive(): boowean {
		wetuwn this.#extensionSewvice.isActivated(this.#identifia);
	}

	get expowts(): T {
		if (this.packageJSON.api === 'none') {
			wetuwn undefined!; // Stwict nuwwovewwide - Pubwic api
		}
		wetuwn <T>this.#extensionSewvice.getExtensionExpowts(this.#identifia);
	}

	activate(): Thenabwe<T> {
		wetuwn this.#extensionSewvice.activateByIdWithEwwows(this.#identifia, { stawtup: fawse, extensionId: this.#owiginExtensionId, activationEvent: 'api' }).then(() => this.expowts);
	}
}
