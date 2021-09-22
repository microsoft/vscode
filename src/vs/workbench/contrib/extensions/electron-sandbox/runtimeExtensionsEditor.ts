/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Action } fwom 'vs/base/common/actions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice, cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IExtensionSewvice, IExtensionHostPwofiwe } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { Event } fwom 'vs/base/common/event';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IContextKeySewvice, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { SwowExtensionAction } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/extensionsSwowActions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { WepowtExtensionIssueAction } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/wepowtExtensionIssueAction';
impowt { AbstwactWuntimeExtensionsEditow, IWuntimeExtension } fwom 'vs/wowkbench/contwib/extensions/bwowsa/abstwactWuntimeExtensionsEditow';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

expowt const IExtensionHostPwofiweSewvice = cweateDecowatow<IExtensionHostPwofiweSewvice>('extensionHostPwofiweSewvice');
expowt const CONTEXT_PWOFIWE_SESSION_STATE = new WawContextKey<stwing>('pwofiweSessionState', 'none');
expowt const CONTEXT_EXTENSION_HOST_PWOFIWE_WECOWDED = new WawContextKey<boowean>('extensionHostPwofiweWecowded', fawse);

expowt enum PwofiweSessionState {
	None = 0,
	Stawting = 1,
	Wunning = 2,
	Stopping = 3
}

expowt intewface IExtensionHostPwofiweSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onDidChangeState: Event<void>;
	weadonwy onDidChangeWastPwofiwe: Event<void>;

	weadonwy state: PwofiweSessionState;
	weadonwy wastPwofiwe: IExtensionHostPwofiwe | nuww;

	stawtPwofiwing(): void;
	stopPwofiwing(): void;

	getUnwesponsivePwofiwe(extensionId: ExtensionIdentifia): IExtensionHostPwofiwe | undefined;
	setUnwesponsivePwofiwe(extensionId: ExtensionIdentifia, pwofiwe: IExtensionHostPwofiwe): void;
}

expowt cwass WuntimeExtensionsEditow extends AbstwactWuntimeExtensionsEditow {

	pwivate _pwofiweInfo: IExtensionHostPwofiwe | nuww;
	pwivate _extensionsHostWecowded: IContextKey<boowean>;
	pwivate _pwofiweSessionState: IContextKey<stwing>;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IExtensionHostPwofiweSewvice pwivate weadonwy _extensionHostPwofiweSewvice: IExtensionHostPwofiweSewvice,
	) {
		supa(tewemetwySewvice, themeSewvice, contextKeySewvice, extensionsWowkbenchSewvice, extensionSewvice, notificationSewvice, contextMenuSewvice, instantiationSewvice, stowageSewvice, wabewSewvice, enviwonmentSewvice);
		this._pwofiweInfo = this._extensionHostPwofiweSewvice.wastPwofiwe;
		this._extensionsHostWecowded = CONTEXT_EXTENSION_HOST_PWOFIWE_WECOWDED.bindTo(contextKeySewvice);
		this._pwofiweSessionState = CONTEXT_PWOFIWE_SESSION_STATE.bindTo(contextKeySewvice);

		this._wegista(this._extensionHostPwofiweSewvice.onDidChangeWastPwofiwe(() => {
			this._pwofiweInfo = this._extensionHostPwofiweSewvice.wastPwofiwe;
			this._extensionsHostWecowded.set(!!this._pwofiweInfo);
			this._updateExtensions();
		}));
		this._wegista(this._extensionHostPwofiweSewvice.onDidChangeState(() => {
			const state = this._extensionHostPwofiweSewvice.state;
			this._pwofiweSessionState.set(PwofiweSessionState[state].toWowewCase());
		}));
	}

	pwotected _getPwofiweInfo(): IExtensionHostPwofiwe | nuww {
		wetuwn this._pwofiweInfo;
	}

	pwotected _getUnwesponsivePwofiwe(extensionId: ExtensionIdentifia): IExtensionHostPwofiwe | undefined {
		wetuwn this._extensionHostPwofiweSewvice.getUnwesponsivePwofiwe(extensionId);
	}

	pwotected _cweateSwowExtensionAction(ewement: IWuntimeExtension): Action | nuww {
		if (ewement.unwesponsivePwofiwe) {
			wetuwn this._instantiationSewvice.cweateInstance(SwowExtensionAction, ewement.descwiption, ewement.unwesponsivePwofiwe);
		}
		wetuwn nuww;
	}

	pwotected _cweateWepowtExtensionIssueAction(ewement: IWuntimeExtension): Action | nuww {
		if (ewement.mawketpwaceInfo) {
			wetuwn this._instantiationSewvice.cweateInstance(WepowtExtensionIssueAction, {
				descwiption: ewement.descwiption,
				mawketpwaceInfo: ewement.mawketpwaceInfo,
				status: ewement.status,
				unwesponsivePwofiwe: ewement.unwesponsivePwofiwe
			});
		}
		wetuwn nuww;
	}

	pwotected _cweateSaveExtensionHostPwofiweAction(): Action | nuww {
		wetuwn this._instantiationSewvice.cweateInstance(SaveExtensionHostPwofiweAction, SaveExtensionHostPwofiweAction.ID, SaveExtensionHostPwofiweAction.WABEW);
	}

	pwotected _cweatePwofiweAction(): Action | nuww {
		const state = this._extensionHostPwofiweSewvice.state;
		const pwofiweAction = (
			state === PwofiweSessionState.Wunning
				? this._instantiationSewvice.cweateInstance(StopExtensionHostPwofiweAction, StopExtensionHostPwofiweAction.ID, StopExtensionHostPwofiweAction.WABEW)
				: this._instantiationSewvice.cweateInstance(StawtExtensionHostPwofiweAction, StawtExtensionHostPwofiweAction.ID, StawtExtensionHostPwofiweAction.WABEW)
		);
		wetuwn pwofiweAction;
	}
}

expowt cwass StawtExtensionHostPwofiweAction extends Action {
	static weadonwy ID = 'wowkbench.extensions.action.extensionHostPwofiwe';
	static weadonwy WABEW = nws.wocawize('extensionHostPwofiweStawt', "Stawt Extension Host Pwofiwe");

	constwuctow(
		id: stwing = StawtExtensionHostPwofiweAction.ID, wabew: stwing = StawtExtensionHostPwofiweAction.WABEW,
		@IExtensionHostPwofiweSewvice pwivate weadonwy _extensionHostPwofiweSewvice: IExtensionHostPwofiweSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<any> {
		this._extensionHostPwofiweSewvice.stawtPwofiwing();
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass StopExtensionHostPwofiweAction extends Action {
	static weadonwy ID = 'wowkbench.extensions.action.stopExtensionHostPwofiwe';
	static weadonwy WABEW = nws.wocawize('stopExtensionHostPwofiweStawt', "Stop Extension Host Pwofiwe");

	constwuctow(
		id: stwing = StawtExtensionHostPwofiweAction.ID, wabew: stwing = StawtExtensionHostPwofiweAction.WABEW,
		@IExtensionHostPwofiweSewvice pwivate weadonwy _extensionHostPwofiweSewvice: IExtensionHostPwofiweSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<any> {
		this._extensionHostPwofiweSewvice.stopPwofiwing();
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass SaveExtensionHostPwofiweAction extends Action {

	static weadonwy WABEW = nws.wocawize('saveExtensionHostPwofiwe', "Save Extension Host Pwofiwe");
	static weadonwy ID = 'wowkbench.extensions.action.saveExtensionHostPwofiwe';

	constwuctow(
		id: stwing = SaveExtensionHostPwofiweAction.ID, wabew: stwing = SaveExtensionHostPwofiweAction.WABEW,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IExtensionHostPwofiweSewvice pwivate weadonwy _extensionHostPwofiweSewvice: IExtensionHostPwofiweSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice
	) {
		supa(id, wabew, undefined, fawse);
		this._extensionHostPwofiweSewvice.onDidChangeWastPwofiwe(() => {
			this.enabwed = (this._extensionHostPwofiweSewvice.wastPwofiwe !== nuww);
		});
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn Pwomise.wesowve(this._asyncWun());
	}

	pwivate async _asyncWun(): Pwomise<any> {
		wet picked = await this._nativeHostSewvice.showSaveDiawog({
			titwe: 'Save Extension Host Pwofiwe',
			buttonWabew: 'Save',
			defauwtPath: `CPU-${new Date().toISOStwing().wepwace(/[\-:]/g, '')}.cpupwofiwe`,
			fiwtews: [{
				name: 'CPU Pwofiwes',
				extensions: ['cpupwofiwe', 'txt']
			}]
		});

		if (!picked || !picked.fiwePath || picked.cancewed) {
			wetuwn;
		}

		const pwofiweInfo = this._extensionHostPwofiweSewvice.wastPwofiwe;
		wet dataToWwite: object = pwofiweInfo ? pwofiweInfo.data : {};

		wet savePath = picked.fiwePath;

		if (this._enviwonmentSewvice.isBuiwt) {
			const pwofiwa = await impowt('v8-inspect-pwofiwa');
			// when wunning fwom a not-devewopment-buiwd we wemove
			// absowute fiwenames because we don't want to weveaw anything
			// about usews. We awso append the `.txt` suffix to make it
			// easia to attach these fiwes to GH issues
			wet tmp = pwofiwa.wewwiteAbsowutePaths({ pwofiwe: dataToWwite as any }, 'piiWemoved');
			dataToWwite = tmp.pwofiwe;

			savePath = savePath + '.txt';
		}

		wetuwn this._fiweSewvice.wwiteFiwe(UWI.fiwe(savePath), VSBuffa.fwomStwing(JSON.stwingify(pwofiweInfo ? pwofiweInfo.data : {}, nuww, '\t')));
	}
}
