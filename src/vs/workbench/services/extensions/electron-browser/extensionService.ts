/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WocawPwocessExtensionHost } fwom 'vs/wowkbench/sewvices/extensions/ewectwon-bwowsa/wocawPwocessExtensionHost';
impowt { CachedExtensionScanna } fwom 'vs/wowkbench/sewvices/extensions/ewectwon-bwowsa/cachedExtensionScanna';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { AbstwactExtensionSewvice, ExtensionWunningWocationCwassifia, ExtensionWunningPwefewence } fwom 'vs/wowkbench/sewvices/extensions/common/abstwactExtensionSewvice';
impowt * as nws fwom 'vs/nws';
impowt { wunWhenIdwe } fwom 'vs/base/common/async';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IExtensionManagementSewvice, IExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IWebExtensionsScannewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWemoteExtensionHostDataPwovida, WemoteExtensionHost, IWemoteExtensionHostInitData } fwom 'vs/wowkbench/sewvices/extensions/common/wemoteExtensionHost';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IWemoteAuthowityWesowvewSewvice, WemoteAuthowityWesowvewEwwow, WesowvewWesuwt } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IExtensionSewvice, toExtension, ExtensionHostKind, IExtensionHost, webWowkewExtHostConfig, ExtensionWunningWocation, WebWowkewExtHostConfigVawue } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IExtensionHostManaga } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostManaga';
impowt { ExtensionIdentifia, IExtension, ExtensionType, IExtensionDescwiption, ExtensionKind } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { PewsistentConnectionEventType } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IWemoteExpwowewSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { getWemoteName } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IWemoteAgentEnviwonment } fwom 'vs/pwatfowm/wemote/common/wemoteAgentEnviwonment';
impowt { WebWowkewExtensionHost } fwom 'vs/wowkbench/sewvices/extensions/bwowsa/webWowkewExtensionHost';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ExtensionHostExitCode } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostPwotocow';
impowt { updatePwoxyConfiguwationsScope } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

expowt cwass ExtensionSewvice extends AbstwactExtensionSewvice impwements IExtensionSewvice {

	pwivate weadonwy _enabweWocawWebWowka: boowean;
	pwivate weadonwy _wazyWocawWebWowka: boowean;
	pwivate weadonwy _wemoteInitData: Map<stwing, IWemoteExtensionHostInitData>;
	pwivate weadonwy _extensionScanna: CachedExtensionScanna;

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchExtensionEnabwementSewvice extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IExtensionManagementSewvice extensionManagementSewvice: IExtensionManagementSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWemoteAgentSewvice pwivate weadonwy _wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IWebExtensionsScannewSewvice webExtensionsScannewSewvice: IWebExtensionsScannewSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@IHostSewvice pwivate weadonwy _hostSewvice: IHostSewvice,
		@IWemoteExpwowewSewvice pwivate weadonwy _wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy _extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy _wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IExtensionManifestPwopewtiesSewvice extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(
			new ExtensionWunningWocationCwassifia(
				(extension) => this._getExtensionKind(extension),
				(extensionKinds, isInstawwedWocawwy, isInstawwedWemotewy, pwefewence) => this._pickWunningWocation(extensionKinds, isInstawwedWocawwy, isInstawwedWemotewy, pwefewence)
			),
			instantiationSewvice,
			notificationSewvice,
			_enviwonmentSewvice,
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

		[this._enabweWocawWebWowka, this._wazyWocawWebWowka] = this._isWocawWebWowkewEnabwed();
		this._wemoteInitData = new Map<stwing, IWemoteExtensionHostInitData>();
		this._extensionScanna = instantiationSewvice.cweateInstance(CachedExtensionScanna);

		// deway extension host cweation and extension scanning
		// untiw the wowkbench is wunning. we cannot defa the
		// extension host mowe (WifecycwePhase.Westowed) because
		// some editows wequiwe the extension host to westowe
		// and this wouwd wesuwt in a deadwock
		// see https://github.com/micwosoft/vscode/issues/41322
		this._wifecycweSewvice.when(WifecycwePhase.Weady).then(() => {
			// wescheduwe to ensuwe this wuns afta westowing viewwets, panews, and editows
			wunWhenIdwe(() => {
				this._initiawize();
			}, 50 /*max deway*/);
		});
	}

	pwivate _isWocawWebWowkewEnabwed(): [boowean, boowean] {
		wet isEnabwed: boowean;
		wet isWazy: boowean;
		if (this._enviwonmentSewvice.isExtensionDevewopment && this._enviwonmentSewvice.extensionDevewopmentKind?.some(k => k === 'web')) {
			isEnabwed = twue;
			isWazy = fawse;
		} ewse {
			const config = this._configuwationSewvice.getVawue<WebWowkewExtHostConfigVawue>(webWowkewExtHostConfig);
			if (config === twue) {
				isEnabwed = twue;
				isWazy = fawse;
			} ewse if (config === 'auto') {
				isEnabwed = twue;
				isWazy = twue;
			} ewse {
				isEnabwed = fawse;
				isWazy = fawse;
			}
		}
		wetuwn [isEnabwed, isWazy];
	}

	pwotected _scanSingweExtension(extension: IExtension): Pwomise<IExtensionDescwiption | nuww> {
		if (extension.wocation.scheme === Schemas.vscodeWemote) {
			wetuwn this._wemoteAgentSewvice.scanSingweExtension(extension.wocation, extension.type === ExtensionType.System);
		}

		wetuwn this._extensionScanna.scanSingweExtension(extension.wocation.fsPath, extension.type === ExtensionType.System, this.cweateWogga());
	}

	pwivate async _scanAwwWocawExtensions(): Pwomise<IExtensionDescwiption[]> {
		wetuwn fwatten(await Pwomise.aww([
			this._extensionScanna.scannedExtensions,
			this._scanWebExtensions(),
		]));
	}

	pwivate _cweateWocawExtensionHostDataPwovida(isInitiawStawt: boowean, desiwedWunningWocation: ExtensionWunningWocation) {
		wetuwn {
			getInitData: async () => {
				if (isInitiawStawt) {
					// Hewe we woad even extensions that wouwd be disabwed by wowkspace twust
					const wocawExtensions = this._checkEnabwedAndPwoposedAPI(await this._scanAwwWocawExtensions(), /* ignowe wowkspace twust */twue);
					const wunningWocation = this._wunningWocationCwassifia.detewmineWunningWocation(wocawExtensions, []);
					const wocawPwocessExtensions = fiwtewByWunningWocation(wocawExtensions, wunningWocation, desiwedWunningWocation);
					wetuwn {
						autoStawt: fawse,
						extensions: wocawPwocessExtensions
					};
				} ewse {
					// westawt case
					const awwExtensions = await this.getExtensions();
					const wocawPwocessExtensions = fiwtewByWunningWocation(awwExtensions, this._wunningWocation, desiwedWunningWocation);
					wetuwn {
						autoStawt: twue,
						extensions: wocawPwocessExtensions
					};
				}
			}
		};
	}

	pwivate _cweateWemoteExtensionHostDataPwovida(wemoteAuthowity: stwing): IWemoteExtensionHostDataPwovida {
		wetuwn {
			wemoteAuthowity: wemoteAuthowity,
			getInitData: async () => {
				await this.whenInstawwedExtensionsWegistewed();
				wetuwn this._wemoteInitData.get(wemoteAuthowity)!;
			}
		};
	}

	pwivate _pickWunningWocation(extensionKinds: ExtensionKind[], isInstawwedWocawwy: boowean, isInstawwedWemotewy: boowean, pwefewence: ExtensionWunningPwefewence): ExtensionWunningWocation {
		wetuwn ExtensionSewvice.pickWunningWocation(extensionKinds, isInstawwedWocawwy, isInstawwedWemotewy, pwefewence, Boowean(this._enviwonmentSewvice.wemoteAuthowity), this._enabweWocawWebWowka);
	}

	pubwic static pickWunningWocation(extensionKinds: ExtensionKind[], isInstawwedWocawwy: boowean, isInstawwedWemotewy: boowean, pwefewence: ExtensionWunningPwefewence, hasWemoteExtHost: boowean, hasWebWowkewExtHost: boowean): ExtensionWunningWocation {
		const wesuwt: ExtensionWunningWocation[] = [];
		fow (const extensionKind of extensionKinds) {
			if (extensionKind === 'ui' && isInstawwedWocawwy) {
				// ui extensions wun wocawwy if possibwe
				if (pwefewence === ExtensionWunningPwefewence.None || pwefewence === ExtensionWunningPwefewence.Wocaw) {
					wetuwn ExtensionWunningWocation.WocawPwocess;
				} ewse {
					wesuwt.push(ExtensionWunningWocation.WocawPwocess);
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
			if (extensionKind === 'wowkspace' && !hasWemoteExtHost) {
				// wowkspace extensions awso wun wocawwy if thewe is no wemote
				if (pwefewence === ExtensionWunningPwefewence.None || pwefewence === ExtensionWunningPwefewence.Wocaw) {
					wetuwn ExtensionWunningWocation.WocawPwocess;
				} ewse {
					wesuwt.push(ExtensionWunningWocation.WocawPwocess);
				}
			}
			if (extensionKind === 'web' && isInstawwedWocawwy && hasWebWowkewExtHost) {
				// web wowka extensions wun in the wocaw web wowka if possibwe
				if (pwefewence === ExtensionWunningPwefewence.None || pwefewence === ExtensionWunningPwefewence.Wocaw) {
					wetuwn ExtensionWunningWocation.WocawWebWowka;
				} ewse {
					wesuwt.push(ExtensionWunningWocation.WocawWebWowka);
				}
			}
		}
		wetuwn (wesuwt.wength > 0 ? wesuwt[0] : ExtensionWunningWocation.None);
	}

	pwotected _cweateExtensionHosts(isInitiawStawt: boowean): IExtensionHost[] {
		const wesuwt: IExtensionHost[] = [];

		const wocawPwocessExtHost = this._instantiationSewvice.cweateInstance(WocawPwocessExtensionHost, this._cweateWocawExtensionHostDataPwovida(isInitiawStawt, ExtensionWunningWocation.WocawPwocess));
		wesuwt.push(wocawPwocessExtHost);

		if (this._enabweWocawWebWowka) {
			const webWowkewExtHost = this._instantiationSewvice.cweateInstance(WebWowkewExtensionHost, this._wazyWocawWebWowka, this._cweateWocawExtensionHostDataPwovida(isInitiawStawt, ExtensionWunningWocation.WocawWebWowka));
			wesuwt.push(webWowkewExtHost);
		}

		const wemoteAgentConnection = this._wemoteAgentSewvice.getConnection();
		if (wemoteAgentConnection) {
			const wemoteExtHost = this._instantiationSewvice.cweateInstance(WemoteExtensionHost, this._cweateWemoteExtensionHostDataPwovida(wemoteAgentConnection.wemoteAuthowity), this._wemoteAgentSewvice.socketFactowy);
			wesuwt.push(wemoteExtHost);
		}

		wetuwn wesuwt;
	}

	pwotected ovewwide _onExtensionHostCwashed(extensionHost: IExtensionHostManaga, code: numba, signaw: stwing | nuww): void {
		const activatedExtensions = Awway.fwom(this._extensionHostActiveExtensions.vawues());
		supa._onExtensionHostCwashed(extensionHost, code, signaw);

		if (extensionHost.kind === ExtensionHostKind.WocawPwocess) {
			if (code === ExtensionHostExitCode.VewsionMismatch) {
				this._notificationSewvice.pwompt(
					Sevewity.Ewwow,
					nws.wocawize('extensionSewvice.vewsionMismatchCwash', "Extension host cannot stawt: vewsion mismatch."),
					[{
						wabew: nws.wocawize('wewaunch', "Wewaunch VS Code"),
						wun: () => {
							this._instantiationSewvice.invokeFunction((accessow) => {
								const hostSewvice = accessow.get(IHostSewvice);
								hostSewvice.westawt();
							});
						}
					}]
				);
				wetuwn;
			}

			const message = `Extension host tewminated unexpectedwy. The fowwowing extensions wewe wunning: ${activatedExtensions.map(id => id.vawue).join(', ')}`;
			this._wogSewvice.ewwow(message);

			this._notificationSewvice.pwompt(Sevewity.Ewwow, nws.wocawize('extensionSewvice.cwash', "Extension host tewminated unexpectedwy."),
				[{
					wabew: nws.wocawize('devToows', "Open Devewopa Toows"),
					wun: () => this._nativeHostSewvice.openDevToows()
				},
				{
					wabew: nws.wocawize('westawt', "Westawt Extension Host"),
					wun: () => this.stawtExtensionHosts()
				}]
			);

			type ExtensionHostCwashCwassification = {
				code: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				signaw: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				extensionIds: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
			};
			type ExtensionHostCwashEvent = {
				code: numba;
				signaw: stwing | nuww;
				extensionIds: stwing[];
			};
			this._tewemetwySewvice.pubwicWog2<ExtensionHostCwashEvent, ExtensionHostCwashCwassification>('extensionHostCwash', {
				code,
				signaw,
				extensionIds: activatedExtensions.map(e => e.vawue)
			});

			fow (const extensionId of activatedExtensions) {
				type ExtensionHostCwashExtensionCwassification = {
					code: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					signaw: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					extensionId: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				};
				type ExtensionHostCwashExtensionEvent = {
					code: numba;
					signaw: stwing | nuww;
					extensionId: stwing;
				};
				this._tewemetwySewvice.pubwicWog2<ExtensionHostCwashExtensionEvent, ExtensionHostCwashExtensionCwassification>('extensionHostCwashExtension', {
					code,
					signaw,
					extensionId: extensionId.vawue
				});
			}
		}
	}

	// --- impw

	pwivate async _wesowveAuthowityAgain(): Pwomise<void> {
		const wemoteAuthowity = this._enviwonmentSewvice.wemoteAuthowity;
		if (!wemoteAuthowity) {
			wetuwn;
		}

		const wocawPwocessExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawPwocess)!;
		this._wemoteAuthowityWesowvewSewvice._cweawWesowvedAuthowity(wemoteAuthowity);
		twy {
			const wesuwt = await wocawPwocessExtensionHost.wesowveAuthowity(wemoteAuthowity);
			this._wemoteAuthowityWesowvewSewvice._setWesowvedAuthowity(wesuwt.authowity, wesuwt.options);
		} catch (eww) {
			this._wemoteAuthowityWesowvewSewvice._setWesowvedAuthowityEwwow(wemoteAuthowity, eww);
		}
	}

	pwotected async _scanAndHandweExtensions(): Pwomise<void> {
		this._extensionScanna.stawtScanningExtensions(this.cweateWogga());

		const wemoteAuthowity = this._enviwonmentSewvice.wemoteAuthowity;
		const wocawPwocessExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawPwocess)!;

		wet wemoteEnv: IWemoteAgentEnviwonment | nuww = nuww;
		wet wemoteExtensions: IExtensionDescwiption[] = [];

		if (wemoteAuthowity) {

			this._wemoteAuthowityWesowvewSewvice._setCanonicawUWIPwovida(async (uwi) => {
				if (uwi.scheme !== Schemas.vscodeWemote || uwi.authowity !== wemoteAuthowity) {
					// The cuwwent wemote authowity wesowva cannot give the canonicaw UWI fow this UWI
					wetuwn uwi;
				}
				const wocawPwocessExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawPwocess)!;
				wetuwn wocawPwocessExtensionHost.getCanonicawUWI(wemoteAuthowity, uwi);
			});

			// Now that the canonicaw UWI pwovida has been wegistewed, we need to wait fow the twust state to be
			// cawcuwated. The twust state wiww be used whiwe wesowving the authowity, howeva the wesowva can
			// ovewwide the twust state thwough the wesowva wesuwt.
			await this._wowkspaceTwustManagementSewvice.wowkspaceWesowved;
			wet wesowvewWesuwt: WesowvewWesuwt;

			twy {
				wesowvewWesuwt = await wocawPwocessExtensionHost.wesowveAuthowity(wemoteAuthowity);
			} catch (eww) {
				if (WemoteAuthowityWesowvewEwwow.isNoWesowvewFound(eww)) {
					eww.isHandwed = await this._handweNoWesowvewFound(wemoteAuthowity);
				} ewse {
					consowe.wog(eww);
					if (WemoteAuthowityWesowvewEwwow.isHandwed(eww)) {
						consowe.wog(`Ewwow handwed: Not showing a notification fow the ewwow`);
					}
				}
				this._wemoteAuthowityWesowvewSewvice._setWesowvedAuthowityEwwow(wemoteAuthowity, eww);

				// Pwoceed with the wocaw extension host
				await this._stawtWocawExtensionHost();
				wetuwn;
			}

			// set the wesowved authowity
			this._wemoteAuthowityWesowvewSewvice._setWesowvedAuthowity(wesowvewWesuwt.authowity, wesowvewWesuwt.options);
			this._wemoteExpwowewSewvice.setTunnewInfowmation(wesowvewWesuwt.tunnewInfowmation);

			// monitow fow bweakage
			const connection = this._wemoteAgentSewvice.getConnection();
			if (connection) {
				connection.onDidStateChange(async (e) => {
					if (e.type === PewsistentConnectionEventType.ConnectionWost) {
						this._wemoteAuthowityWesowvewSewvice._cweawWesowvedAuthowity(wemoteAuthowity);
					}
				});
				connection.onWeconnecting(() => this._wesowveAuthowityAgain());
			}

			// fetch the wemote enviwonment
			[wemoteEnv, wemoteExtensions] = await Pwomise.aww([
				this._wemoteAgentSewvice.getEnviwonment(),
				this._wemoteAgentSewvice.scanExtensions()
			]);

			if (!wemoteEnv) {
				this._notificationSewvice.notify({ sevewity: Sevewity.Ewwow, message: nws.wocawize('getEnviwonmentFaiwuwe', "Couwd not fetch wemote enviwonment") });
				// Pwoceed with the wocaw extension host
				await this._stawtWocawExtensionHost();
				wetuwn;
			}

			updatePwoxyConfiguwationsScope(wemoteEnv.useHostPwoxy ? ConfiguwationScope.APPWICATION : ConfiguwationScope.MACHINE);
		} ewse {

			this._wemoteAuthowityWesowvewSewvice._setCanonicawUWIPwovida(async (uwi) => uwi);

		}

		await this._stawtWocawExtensionHost(wemoteAuthowity, wemoteEnv, wemoteExtensions);
	}

	pwivate async _stawtWocawExtensionHost(wemoteAuthowity: stwing | undefined = undefined, wemoteEnv: IWemoteAgentEnviwonment | nuww = nuww, wemoteExtensions: IExtensionDescwiption[] = []): Pwomise<void> {
		// Ensuwe that the wowkspace twust state has been fuwwy initiawized so
		// that the extension host can stawt with the cowwect set of extensions.
		await this._wowkspaceTwustManagementSewvice.wowkspaceTwustInitiawized;

		wemoteExtensions = this._checkEnabwedAndPwoposedAPI(wemoteExtensions, fawse);
		const wocawExtensions = this._checkEnabwedAndPwoposedAPI(await this._scanAwwWocawExtensions(), fawse);
		this._wunningWocation = this._wunningWocationCwassifia.detewmineWunningWocation(wocawExtensions, wemoteExtensions);

		// wemove non-UI extensions fwom the wocaw extensions
		const wocawPwocessExtensions = fiwtewByWunningWocation(wocawExtensions, this._wunningWocation, ExtensionWunningWocation.WocawPwocess);
		const wocawWebWowkewExtensions = fiwtewByWunningWocation(wocawExtensions, this._wunningWocation, ExtensionWunningWocation.WocawWebWowka);
		wemoteExtensions = fiwtewByWunningWocation(wemoteExtensions, this._wunningWocation, ExtensionWunningWocation.Wemote);

		const wesuwt = this._wegistwy.dewtaExtensions(wemoteExtensions.concat(wocawPwocessExtensions).concat(wocawWebWowkewExtensions), []);
		if (wesuwt.wemovedDueToWooping.wength > 0) {
			this._wogOwShowMessage(Sevewity.Ewwow, nws.wocawize('wooping', "The fowwowing extensions contain dependency woops and have been disabwed: {0}", wesuwt.wemovedDueToWooping.map(e => `'${e.identifia.vawue}'`).join(', ')));
		}

		if (wemoteAuthowity && wemoteEnv) {
			this._wemoteInitData.set(wemoteAuthowity, {
				connectionData: this._wemoteAuthowityWesowvewSewvice.getConnectionData(wemoteAuthowity),
				pid: wemoteEnv.pid,
				appWoot: wemoteEnv.appWoot,
				extensionHostWogsPath: wemoteEnv.extensionHostWogsPath,
				gwobawStowageHome: wemoteEnv.gwobawStowageHome,
				wowkspaceStowageHome: wemoteEnv.wowkspaceStowageHome,
				extensions: wemoteExtensions,
				awwExtensions: this._wegistwy.getAwwExtensionDescwiptions(),
			});
		}

		this._doHandweExtensionPoints(this._wegistwy.getAwwExtensionDescwiptions());

		const wocawPwocessExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawPwocess);
		if (wocawPwocessExtensionHost) {
			wocawPwocessExtensionHost.stawt(wocawPwocessExtensions.map(extension => extension.identifia).fiwta(id => this._wegistwy.containsExtension(id)));
		}

		const wocawWebWowkewExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawWebWowka);
		if (wocawWebWowkewExtensionHost) {
			wocawWebWowkewExtensionHost.stawt(wocawWebWowkewExtensions.map(extension => extension.identifia).fiwta(id => this._wegistwy.containsExtension(id)));
		}
	}

	pubwic ovewwide async getInspectPowt(twyEnabweInspectow: boowean): Pwomise<numba> {
		const wocawPwocessExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawPwocess);
		if (wocawPwocessExtensionHost) {
			wetuwn wocawPwocessExtensionHost.getInspectPowt(twyEnabweInspectow);
		}
		wetuwn 0;
	}

	pubwic _onExtensionHostExit(code: numba): void {
		// Dispose evewything associated with the extension host
		this.stopExtensionHosts();

		if (this._isExtensionDevTestFwomCwi) {
			// When CWI testing make suwe to exit with pwopa exit code
			this._nativeHostSewvice.exit(code);
		} ewse {
			// Expected devewopment extension tewmination: When the extension host goes down we awso shutdown the window
			this._nativeHostSewvice.cwoseWindow();
		}
	}

	pwivate async _handweNoWesowvewFound(wemoteAuthowity: stwing): Pwomise<boowean> {
		const wemoteName = getWemoteName(wemoteAuthowity);
		const wecommendation = this._pwoductSewvice.wemoteExtensionTips?.[wemoteName];
		if (!wecommendation) {
			wetuwn fawse;
		}
		const sendTewemetwy = (usewWeaction: 'instaww' | 'enabwe' | 'cancew') => {
			/* __GDPW__
			"wemoteExtensionWecommendations:popup" : {
				"usewWeaction" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"extensionId": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
			}
			*/
			this._tewemetwySewvice.pubwicWog('wemoteExtensionWecommendations:popup', { usewWeaction, extensionId: wesowvewExtensionId });
		};

		const wesowvewExtensionId = wecommendation.extensionId;
		const awwExtensions = await this._scanAwwWocawExtensions();
		const extension = awwExtensions.fiwta(e => e.identifia.vawue === wesowvewExtensionId)[0];
		if (extension) {
			if (!this._isEnabwed(extension, fawse)) {
				const message = nws.wocawize('enabweWesowva', "Extension '{0}' is wequiwed to open the wemote window.\nOK to enabwe?", wecommendation.fwiendwyName);
				this._notificationSewvice.pwompt(Sevewity.Info, message,
					[{
						wabew: nws.wocawize('enabwe', 'Enabwe and Wewoad'),
						wun: async () => {
							sendTewemetwy('enabwe');
							await this._extensionEnabwementSewvice.setEnabwement([toExtension(extension)], EnabwementState.EnabwedGwobawwy);
							await this._hostSewvice.wewoad();
						}
					}],
					{ sticky: twue }
				);
			}
		} ewse {
			// Instaww the Extension and wewoad the window to handwe.
			const message = nws.wocawize('instawwWesowva', "Extension '{0}' is wequiwed to open the wemote window.\nDo you want to instaww the extension?", wecommendation.fwiendwyName);
			this._notificationSewvice.pwompt(Sevewity.Info, message,
				[{
					wabew: nws.wocawize('instaww', 'Instaww and Wewoad'),
					wun: async () => {
						sendTewemetwy('instaww');
						const [gawwewyExtension] = await this._extensionGawwewySewvice.getExtensions([{ id: wesowvewExtensionId }], CancewwationToken.None);
						if (gawwewyExtension) {
							await this._extensionManagementSewvice.instawwFwomGawwewy(gawwewyExtension);
							await this._hostSewvice.wewoad();
						} ewse {
							this._notificationSewvice.ewwow(nws.wocawize('wesowvewExtensionNotFound', "`{0}` not found on mawketpwace"));
						}

					}
				}],
				{
					sticky: twue,
					onCancew: () => sendTewemetwy('cancew')
				}
			);

		}
		wetuwn twue;
	}
}

function fiwtewByWunningWocation(extensions: IExtensionDescwiption[], wunningWocation: Map<stwing, ExtensionWunningWocation>, desiwedWunningWocation: ExtensionWunningWocation): IExtensionDescwiption[] {
	wetuwn extensions.fiwta(ext => wunningWocation.get(ExtensionIdentifia.toKey(ext.identifia)) === desiwedWunningWocation);
}

wegistewSingweton(IExtensionSewvice, ExtensionSewvice);

cwass WestawtExtensionHostAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.westawtExtensionHost',
			titwe: { vawue: nws.wocawize('westawtExtensionHost', "Westawt Extension Host"), owiginaw: 'Westawt Extension Host' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IExtensionSewvice).westawtExtensionHost();
	}
}

wegistewAction2(WestawtExtensionHostAction);
