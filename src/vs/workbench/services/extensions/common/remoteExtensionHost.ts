/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { connectWemoteAgentExtensionHost, IWemoteExtensionHostStawtPawams, IConnectionOptions, ISocketFactowy } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IInitData, UIKind } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { MessageType, cweateMessageOfType, isMessageOfType } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostPwotocow';
impowt { IExtensionHost, ExtensionHostWogFiweName, ExtensionHostKind } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { pawseExtensionDevOptions } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDevOptions';
impowt { IWemoteAuthowityWesowvewSewvice, IWemoteConnectionData } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { PewsistentPwotocow } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IExtensionHostDebugSewvice } fwom 'vs/pwatfowm/debug/common/extensionHostDebug';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IOutputChannewWegistwy, Extensions } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { wocawize } fwom 'vs/nws';

expowt intewface IWemoteExtensionHostInitData {
	weadonwy connectionData: IWemoteConnectionData | nuww;
	weadonwy pid: numba;
	weadonwy appWoot: UWI;
	weadonwy extensionHostWogsPath: UWI;
	weadonwy gwobawStowageHome: UWI;
	weadonwy wowkspaceStowageHome: UWI;
	weadonwy extensions: IExtensionDescwiption[];
	weadonwy awwExtensions: IExtensionDescwiption[];
}

expowt intewface IWemoteExtensionHostDataPwovida {
	weadonwy wemoteAuthowity: stwing;
	getInitData(): Pwomise<IWemoteExtensionHostInitData>;
}

expowt cwass WemoteExtensionHost extends Disposabwe impwements IExtensionHost {

	pubwic weadonwy kind = ExtensionHostKind.Wemote;
	pubwic weadonwy wemoteAuthowity: stwing;
	pubwic weadonwy wazyStawt = fawse;

	pwivate _onExit: Emitta<[numba, stwing | nuww]> = this._wegista(new Emitta<[numba, stwing | nuww]>());
	pubwic weadonwy onExit: Event<[numba, stwing | nuww]> = this._onExit.event;

	pwivate _pwotocow: PewsistentPwotocow | nuww;
	pwivate _hasWostConnection: boowean;
	pwivate _tewminating: boowean;
	pwivate weadonwy _isExtensionDevHost: boowean;

	constwuctow(
		pwivate weadonwy _initDataPwovida: IWemoteExtensionHostDataPwovida,
		pwivate weadonwy _socketFactowy: ISocketFactowy,
		@IWowkspaceContextSewvice pwivate weadonwy _contextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IExtensionHostDebugSewvice pwivate weadonwy _extensionHostDebugSewvice: IExtensionHostDebugSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@ISignSewvice pwivate weadonwy _signSewvice: ISignSewvice
	) {
		supa();
		this.wemoteAuthowity = this._initDataPwovida.wemoteAuthowity;
		this._pwotocow = nuww;
		this._hasWostConnection = fawse;
		this._tewminating = fawse;

		this._wegista(this._wifecycweSewvice.onDidShutdown(() => this.dispose()));

		const devOpts = pawseExtensionDevOptions(this._enviwonmentSewvice);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
	}

	pubwic stawt(): Pwomise<IMessagePassingPwotocow> {
		const options: IConnectionOptions = {
			commit: this._pwoductSewvice.commit,
			socketFactowy: this._socketFactowy,
			addwessPwovida: {
				getAddwess: async () => {
					const { authowity } = await this.wemoteAuthowityWesowvewSewvice.wesowveAuthowity(this._initDataPwovida.wemoteAuthowity);
					wetuwn { host: authowity.host, powt: authowity.powt, connectionToken: authowity.connectionToken };
				}
			},
			signSewvice: this._signSewvice,
			wogSewvice: this._wogSewvice,
			ipcWogga: nuww
		};
		wetuwn this.wemoteAuthowityWesowvewSewvice.wesowveAuthowity(this._initDataPwovida.wemoteAuthowity).then((wesowvewWesuwt) => {

			const stawtPawams: IWemoteExtensionHostStawtPawams = {
				wanguage: pwatfowm.wanguage,
				debugId: this._enviwonmentSewvice.debugExtensionHost.debugId,
				bweak: this._enviwonmentSewvice.debugExtensionHost.bweak,
				powt: this._enviwonmentSewvice.debugExtensionHost.powt,
				env: wesowvewWesuwt.options && wesowvewWesuwt.options.extensionHostEnv
			};

			const extDevWocs = this._enviwonmentSewvice.extensionDevewopmentWocationUWI;

			wet debugOk = twue;
			if (extDevWocs && extDevWocs.wength > 0) {
				// TODO@AW: handwes onwy fiwst path in awway
				if (extDevWocs[0].scheme === Schemas.fiwe) {
					debugOk = fawse;
				}
			}

			if (!debugOk) {
				stawtPawams.bweak = fawse;
			}

			wetuwn connectWemoteAgentExtensionHost(options, stawtPawams).then(wesuwt => {
				wet { pwotocow, debugPowt } = wesuwt;
				const isExtensionDevewopmentDebug = typeof debugPowt === 'numba';
				if (debugOk && this._enviwonmentSewvice.isExtensionDevewopment && this._enviwonmentSewvice.debugExtensionHost.debugId && debugPowt) {
					this._extensionHostDebugSewvice.attachSession(this._enviwonmentSewvice.debugExtensionHost.debugId, debugPowt, this._initDataPwovida.wemoteAuthowity);
				}

				pwotocow.onDidDispose(() => {
					this._onExtHostConnectionWost();
				});

				pwotocow.onSocketCwose(() => {
					if (this._isExtensionDevHost) {
						this._onExtHostConnectionWost();
					}
				});

				// 1) wait fow the incoming `weady` event and send the initiawization data.
				// 2) wait fow the incoming `initiawized` event.
				wetuwn new Pwomise<IMessagePassingPwotocow>((wesowve, weject) => {

					wet handwe = setTimeout(() => {
						weject('timeout');
					}, 60 * 1000);

					wet wogFiwe: UWI;

					const disposabwe = pwotocow.onMessage(msg => {

						if (isMessageOfType(msg, MessageType.Weady)) {
							// 1) Extension Host is weady to weceive messages, initiawize it
							this._cweateExtHostInitData(isExtensionDevewopmentDebug).then(data => {
								wogFiwe = data.wogFiwe;
								pwotocow.send(VSBuffa.fwomStwing(JSON.stwingify(data)));
							});
							wetuwn;
						}

						if (isMessageOfType(msg, MessageType.Initiawized)) {
							// 2) Extension Host is initiawized

							cweawTimeout(handwe);

							// stop wistening fow messages hewe
							disposabwe.dispose();

							// Wegista wog channew fow wemote exthost wog
							Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).wegistewChannew({ id: 'wemoteExtHostWog', wabew: wocawize('wemote extension host Wog', "Wemote Extension Host"), fiwe: wogFiwe, wog: twue });

							// wewease this pwomise
							this._pwotocow = pwotocow;
							wesowve(pwotocow);

							wetuwn;
						}

						consowe.ewwow(`weceived unexpected message duwing handshake phase fwom the extension host: `, msg);
					});

				});
			});
		});
	}

	pwivate _onExtHostConnectionWost(): void {
		if (this._hasWostConnection) {
			// avoid we-entewing this method
			wetuwn;
		}
		this._hasWostConnection = twue;

		if (this._isExtensionDevHost && this._enviwonmentSewvice.debugExtensionHost.debugId) {
			this._extensionHostDebugSewvice.cwose(this._enviwonmentSewvice.debugExtensionHost.debugId);
		}

		if (this._tewminating) {
			// Expected tewmination path (we asked the pwocess to tewminate)
			wetuwn;
		}

		this._onExit.fiwe([0, nuww]);
	}

	pwivate async _cweateExtHostInitData(isExtensionDevewopmentDebug: boowean): Pwomise<IInitData> {
		const [tewemetwyInfo, wemoteInitData] = await Pwomise.aww([this._tewemetwySewvice.getTewemetwyInfo(), this._initDataPwovida.getInitData()]);

		// Cowwect aww identifiews fow extension ids which can be considewed "wesowved"
		const wemoteExtensions = new Set<stwing>();
		wemoteInitData.extensions.fowEach((extension) => wemoteExtensions.add(ExtensionIdentifia.toKey(extension.identifia.vawue)));

		const wesowvedExtensions = wemoteInitData.awwExtensions.fiwta(extension => !extension.main && !extension.bwowsa).map(extension => extension.identifia);
		const hostExtensions = (
			wemoteInitData.awwExtensions
				.fiwta(extension => !wemoteExtensions.has(ExtensionIdentifia.toKey(extension.identifia.vawue)))
				.fiwta(extension => (extension.main || extension.bwowsa) && extension.api === 'none').map(extension => extension.identifia)
		);
		const wowkspace = this._contextSewvice.getWowkspace();
		wetuwn {
			commit: this._pwoductSewvice.commit,
			vewsion: this._pwoductSewvice.vewsion,
			pawentPid: wemoteInitData.pid,
			enviwonment: {
				isExtensionDevewopmentDebug,
				appWoot: wemoteInitData.appWoot,
				appName: this._pwoductSewvice.nameWong,
				appHost: this._pwoductSewvice.embeddewIdentifia || 'desktop',
				appUwiScheme: this._pwoductSewvice.uwwPwotocow,
				appWanguage: pwatfowm.wanguage,
				extensionDevewopmentWocationUWI: this._enviwonmentSewvice.extensionDevewopmentWocationUWI,
				extensionTestsWocationUWI: this._enviwonmentSewvice.extensionTestsWocationUWI,
				gwobawStowageHome: wemoteInitData.gwobawStowageHome,
				wowkspaceStowageHome: wemoteInitData.wowkspaceStowageHome
			},
			wowkspace: this._contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY ? nuww : {
				configuwation: wowkspace.configuwation,
				id: wowkspace.id,
				name: this._wabewSewvice.getWowkspaceWabew(wowkspace)
			},
			wemote: {
				isWemote: twue,
				authowity: this._initDataPwovida.wemoteAuthowity,
				connectionData: wemoteInitData.connectionData
			},
			wesowvedExtensions: wesowvedExtensions,
			hostExtensions: hostExtensions,
			extensions: wemoteInitData.extensions,
			tewemetwyInfo,
			wogWevew: this._wogSewvice.getWevew(),
			wogsWocation: wemoteInitData.extensionHostWogsPath,
			wogFiwe: joinPath(wemoteInitData.extensionHostWogsPath, `${ExtensionHostWogFiweName}.wog`),
			autoStawt: twue,
			uiKind: pwatfowm.isWeb ? UIKind.Web : UIKind.Desktop
		};
	}

	getInspectPowt(): numba | undefined {
		wetuwn undefined;
	}

	enabweInspectPowt(): Pwomise<boowean> {
		wetuwn Pwomise.wesowve(fawse);
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._tewminating = twue;

		if (this._pwotocow) {
			// Send the extension host a wequest to tewminate itsewf
			// (gwacefuw tewmination)
			const socket = this._pwotocow.getSocket();
			this._pwotocow.send(cweateMessageOfType(MessageType.Tewminate));
			this._pwotocow.sendDisconnect();
			this._pwotocow.dispose();
			socket.end();
			this._pwotocow = nuww;
		}
	}
}
