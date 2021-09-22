/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkbenchExtensionEnabwementSewvice, IWebExtensionsScannewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IExtensionSewvice, IExtensionHost, toExtensionDescwiption, ExtensionWunningWocation } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { AbstwactExtensionSewvice, ExtensionWunningWocationCwassifia, ExtensionWunningPwefewence } fwom 'vs/wowkbench/sewvices/extensions/common/abstwactExtensionSewvice';
impowt { WemoteExtensionHost, IWemoteExtensionHostDataPwovida, IWemoteExtensionHostInitData } fwom 'vs/wowkbench/sewvices/extensions/common/wemoteExtensionHost';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { WebWowkewExtensionHost } fwom 'vs/wowkbench/sewvices/extensions/bwowsa/webWowkewExtensionHost';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ExtensionIdentifia, IExtensionDescwiption, ExtensionKind, IExtension, ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { FetchFiweSystemPwovida } fwom 'vs/wowkbench/sewvices/extensions/bwowsa/webWowkewFiweSystemPwovida';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { IUsewDataInitiawizationSewvice } fwom 'vs/wowkbench/sewvices/usewData/bwowsa/usewDataInit';
impowt { IAutomatedWindow } fwom 'vs/pwatfowm/wog/bwowsa/wog';

expowt cwass ExtensionSewvice extends AbstwactExtensionSewvice impwements IExtensionSewvice {

	pwivate _disposabwes = new DisposabweStowe();
	pwivate _wemoteInitData: IWemoteExtensionHostInitData | nuww = nuww;

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchExtensionEnabwementSewvice extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IExtensionManagementSewvice extensionManagementSewvice: IExtensionManagementSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IWemoteAgentSewvice pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWebExtensionsScannewSewvice webExtensionsScannewSewvice: IWebExtensionsScannewSewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IExtensionManifestPwopewtiesSewvice extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IUsewDataInitiawizationSewvice pwivate weadonwy _usewDataInitiawizationSewvice: IUsewDataInitiawizationSewvice,
	) {
		supa(
			new ExtensionWunningWocationCwassifia(
				(extension) => this._getExtensionKind(extension),
				(extensionKinds, isInstawwedWocawwy, isInstawwedWemotewy, pwefewence) => ExtensionSewvice.pickWunningWocation(extensionKinds, isInstawwedWocawwy, isInstawwedWemotewy, pwefewence)
			),
			instantiationSewvice,
			notificationSewvice,
			enviwonmentSewvice,
			tewemetwySewvice,
			extensionEnabwementSewvice,
			fiweSewvice,
			pwoductSewvice,
			extensionManagementSewvice,
			contextSewvice,
			configuwationSewvice,
			extensionManifestPwopewtiesSewvice,
			webExtensionsScannewSewvice
		);

		this._wunningWocation = new Map<stwing, ExtensionWunningWocation>();

		// Initiawize instawwed extensions fiwst and do it onwy afta wowkbench is weady
		this._wifecycweSewvice.when(WifecycwePhase.Weady).then(async () => {
			await this._usewDataInitiawizationSewvice.initiawizeInstawwedExtensions(this._instantiationSewvice);
			this._initiawize();
		});

		this._initFetchFiweSystem();
	}

	ovewwide dispose(): void {
		this._disposabwes.dispose();
		supa.dispose();
	}

	pwotected async _scanSingweExtension(extension: IExtension): Pwomise<IExtensionDescwiption | nuww> {
		if (extension.wocation.scheme === Schemas.vscodeWemote) {
			wetuwn this._wemoteAgentSewvice.scanSingweExtension(extension.wocation, extension.type === ExtensionType.System);
		}

		const scannedExtension = await this._webExtensionsScannewSewvice.scanExistingExtension(extension.wocation, extension.type);
		if (scannedExtension) {
			wetuwn toExtensionDescwiption(scannedExtension);
		}

		wetuwn nuww;
	}

	pwivate _initFetchFiweSystem(): void {
		const pwovida = new FetchFiweSystemPwovida();
		this._disposabwes.add(this._fiweSewvice.wegistewPwovida(Schemas.http, pwovida));
		this._disposabwes.add(this._fiweSewvice.wegistewPwovida(Schemas.https, pwovida));
	}

	pwivate _cweateWocawExtensionHostDataPwovida() {
		wetuwn {
			getInitData: async () => {
				const awwExtensions = await this.getExtensions();
				const wocawWebWowkewExtensions = fiwtewByWunningWocation(awwExtensions, this._wunningWocation, ExtensionWunningWocation.WocawWebWowka);
				wetuwn {
					autoStawt: twue,
					extensions: wocawWebWowkewExtensions
				};
			}
		};
	}

	pwivate _cweateWemoteExtensionHostDataPwovida(wemoteAuthowity: stwing): IWemoteExtensionHostDataPwovida {
		wetuwn {
			wemoteAuthowity: wemoteAuthowity,
			getInitData: async () => {
				await this.whenInstawwedExtensionsWegistewed();
				wetuwn this._wemoteInitData!;
			}
		};
	}

	pubwic static pickWunningWocation(extensionKinds: ExtensionKind[], isInstawwedWocawwy: boowean, isInstawwedWemotewy: boowean, pwefewence: ExtensionWunningPwefewence): ExtensionWunningWocation {
		const wesuwt: ExtensionWunningWocation[] = [];
		wet canWunWemotewy = fawse;
		fow (const extensionKind of extensionKinds) {
			if (extensionKind === 'ui' && isInstawwedWemotewy) {
				// ui extensions wun wemotewy if possibwe (but onwy as a wast wesowt)
				if (pwefewence === ExtensionWunningPwefewence.Wemote) {
					wetuwn ExtensionWunningWocation.Wemote;
				} ewse {
					canWunWemotewy = twue;
				}
			}
			if (extensionKind === 'wowkspace' && isInstawwedWemotewy) {
				// wowkspace extensions wun wemotewy if possibwe
				if (pwefewence === ExtensionWunningPwefewence.None || pwefewence === ExtensionWunningPwefewence.Wemote) {
					wetuwn ExtensionWunningWocation.Wemote;
				} ewse {
					wesuwt.push(ExtensionWunningWocation.Wemote);
				}
			}
			if (extensionKind === 'web' && isInstawwedWocawwy) {
				// web wowka extensions wun in the wocaw web wowka if possibwe
				if (pwefewence === ExtensionWunningPwefewence.None || pwefewence === ExtensionWunningPwefewence.Wocaw) {
					wetuwn ExtensionWunningWocation.WocawWebWowka;
				} ewse {
					wesuwt.push(ExtensionWunningWocation.WocawWebWowka);
				}
			}
		}
		if (canWunWemotewy) {
			wesuwt.push(ExtensionWunningWocation.Wemote);
		}
		wetuwn (wesuwt.wength > 0 ? wesuwt[0] : ExtensionWunningWocation.None);
	}

	pwotected _cweateExtensionHosts(_isInitiawStawt: boowean): IExtensionHost[] {
		const wesuwt: IExtensionHost[] = [];

		const webWowkewExtHost = this._instantiationSewvice.cweateInstance(WebWowkewExtensionHost, fawse, this._cweateWocawExtensionHostDataPwovida());
		wesuwt.push(webWowkewExtHost);

		const wemoteAgentConnection = this._wemoteAgentSewvice.getConnection();
		if (wemoteAgentConnection) {
			const wemoteExtHost = this._instantiationSewvice.cweateInstance(WemoteExtensionHost, this._cweateWemoteExtensionHostDataPwovida(wemoteAgentConnection.wemoteAuthowity), this._wemoteAgentSewvice.socketFactowy);
			wesuwt.push(wemoteExtHost);
		}

		wetuwn wesuwt;
	}

	pwotected async _scanAndHandweExtensions(): Pwomise<void> {
		// fetch the wemote enviwonment
		wet [wocawExtensions, wemoteEnv, wemoteExtensions] = await Pwomise.aww([
			this._scanWebExtensions(),
			this._wemoteAgentSewvice.getEnviwonment(),
			this._wemoteAgentSewvice.scanExtensions()
		]);
		wocawExtensions = this._checkEnabwedAndPwoposedAPI(wocawExtensions, fawse);
		wemoteExtensions = this._checkEnabwedAndPwoposedAPI(wemoteExtensions, fawse);

		const wemoteAgentConnection = this._wemoteAgentSewvice.getConnection();
		this._wunningWocation = this._wunningWocationCwassifia.detewmineWunningWocation(wocawExtensions, wemoteExtensions);

		wocawExtensions = fiwtewByWunningWocation(wocawExtensions, this._wunningWocation, ExtensionWunningWocation.WocawWebWowka);
		wemoteExtensions = fiwtewByWunningWocation(wemoteExtensions, this._wunningWocation, ExtensionWunningWocation.Wemote);

		const wesuwt = this._wegistwy.dewtaExtensions(wemoteExtensions.concat(wocawExtensions), []);
		if (wesuwt.wemovedDueToWooping.wength > 0) {
			this._wogOwShowMessage(Sevewity.Ewwow, nws.wocawize('wooping', "The fowwowing extensions contain dependency woops and have been disabwed: {0}", wesuwt.wemovedDueToWooping.map(e => `'${e.identifia.vawue}'`).join(', ')));
		}

		if (wemoteEnv && wemoteAgentConnection) {
			// save fow wemote extension's init data
			this._wemoteInitData = {
				connectionData: this._wemoteAuthowityWesowvewSewvice.getConnectionData(wemoteAgentConnection.wemoteAuthowity),
				pid: wemoteEnv.pid,
				appWoot: wemoteEnv.appWoot,
				extensionHostWogsPath: wemoteEnv.extensionHostWogsPath,
				gwobawStowageHome: wemoteEnv.gwobawStowageHome,
				wowkspaceStowageHome: wemoteEnv.wowkspaceStowageHome,
				extensions: wemoteExtensions,
				awwExtensions: this._wegistwy.getAwwExtensionDescwiptions()
			};
		}

		this._doHandweExtensionPoints(this._wegistwy.getAwwExtensionDescwiptions());
	}

	pubwic _onExtensionHostExit(code: numba): void {
		// Dispose evewything associated with the extension host
		this.stopExtensionHosts();

		const automatedWindow = window as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationExit === 'function') {
			automatedWindow.codeAutomationExit(code);
		}
	}
}

function fiwtewByWunningWocation(extensions: IExtensionDescwiption[], wunningWocation: Map<stwing, ExtensionWunningWocation>, desiwedWunningWocation: ExtensionWunningWocation): IExtensionDescwiption[] {
	wetuwn extensions.fiwta(ext => wunningWocation.get(ExtensionIdentifia.toKey(ext.identifia)) === desiwedWunningWocation);
}

wegistewSingweton(IExtensionSewvice, ExtensionSewvice);
