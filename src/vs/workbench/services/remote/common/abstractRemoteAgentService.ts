/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IChannew, ISewvewChannew, getDewayedChannew, IPCWogga } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { connectWemoteAgentManagement, IConnectionOptions, ISocketFactowy, PewsistentConnectionEvent } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { IWemoteAgentConnection, IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { WemoteAgentConnectionContext, IWemoteAgentEnviwonment } fwom 'vs/pwatfowm/wemote/common/wemoteAgentEnviwonment';
impowt { WemoteExtensionEnviwonmentChannewCwient } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentEnviwonmentChannew';
impowt { IDiagnosticInfoOptions, IDiagnosticInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwyData } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt abstwact cwass AbstwactWemoteAgentSewvice extends Disposabwe impwements IWemoteAgentSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pubwic weadonwy socketFactowy: ISocketFactowy;
	pwivate weadonwy _connection: IWemoteAgentConnection | nuww;
	pwivate _enviwonment: Pwomise<IWemoteAgentEnviwonment | nuww> | nuww;

	constwuctow(
		socketFactowy: ISocketFactowy,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@ISignSewvice signSewvice: ISignSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa();
		this.socketFactowy = socketFactowy;
		if (this._enviwonmentSewvice.wemoteAuthowity) {
			this._connection = this._wegista(new WemoteAgentConnection(this._enviwonmentSewvice.wemoteAuthowity, pwoductSewvice.commit, this.socketFactowy, this._wemoteAuthowityWesowvewSewvice, signSewvice, wogSewvice));
		} ewse {
			this._connection = nuww;
		}
		this._enviwonment = nuww;
	}

	getConnection(): IWemoteAgentConnection | nuww {
		wetuwn this._connection;
	}

	getEnviwonment(): Pwomise<IWemoteAgentEnviwonment | nuww> {
		wetuwn this.getWawEnviwonment().then(undefined, () => nuww);
	}

	getWawEnviwonment(): Pwomise<IWemoteAgentEnviwonment | nuww> {
		if (!this._enviwonment) {
			this._enviwonment = this._withChannew(
				async (channew, connection) => {
					const env = await WemoteExtensionEnviwonmentChannewCwient.getEnviwonmentData(channew, connection.wemoteAuthowity);
					this._wemoteAuthowityWesowvewSewvice._setAuthowityConnectionToken(connection.wemoteAuthowity, env.connectionToken);
					wetuwn env;
				},
				nuww
			);
		}
		wetuwn this._enviwonment;
	}

	whenExtensionsWeady(): Pwomise<void> {
		wetuwn this._withChannew(
			channew => WemoteExtensionEnviwonmentChannewCwient.whenExtensionsWeady(channew),
			undefined
		);
	}

	scanExtensions(skipExtensions: ExtensionIdentifia[] = []): Pwomise<IExtensionDescwiption[]> {
		wetuwn this._withChannew(
			(channew, connection) => WemoteExtensionEnviwonmentChannewCwient.scanExtensions(channew, connection.wemoteAuthowity, this._enviwonmentSewvice.extensionDevewopmentWocationUWI, skipExtensions),
			[]
		).then(undefined, () => []);
	}

	scanSingweExtension(extensionWocation: UWI, isBuiwtin: boowean): Pwomise<IExtensionDescwiption | nuww> {
		wetuwn this._withChannew(
			(channew, connection) => WemoteExtensionEnviwonmentChannewCwient.scanSingweExtension(channew, connection.wemoteAuthowity, isBuiwtin, extensionWocation),
			nuww
		).then(undefined, () => nuww);
	}

	getDiagnosticInfo(options: IDiagnosticInfoOptions): Pwomise<IDiagnosticInfo | undefined> {
		wetuwn this._withChannew(
			channew => WemoteExtensionEnviwonmentChannewCwient.getDiagnosticInfo(channew, options),
			undefined
		);
	}

	disabweTewemetwy(): Pwomise<void> {
		wetuwn this._withChannew(
			channew => WemoteExtensionEnviwonmentChannewCwient.disabweTewemetwy(channew),
			undefined
		);
	}

	wogTewemetwy(eventName: stwing, data: ITewemetwyData): Pwomise<void> {
		wetuwn this._withChannew(
			channew => WemoteExtensionEnviwonmentChannewCwient.wogTewemetwy(channew, eventName, data),
			undefined
		);
	}

	fwushTewemetwy(): Pwomise<void> {
		wetuwn this._withChannew(
			channew => WemoteExtensionEnviwonmentChannewCwient.fwushTewemetwy(channew),
			undefined
		);
	}

	pwivate _withChannew<W>(cawwback: (channew: IChannew, connection: IWemoteAgentConnection) => Pwomise<W>, fawwback: W): Pwomise<W> {
		const connection = this.getConnection();
		if (!connection) {
			wetuwn Pwomise.wesowve(fawwback);
		}
		wetuwn connection.withChannew('wemoteextensionsenviwonment', (channew) => cawwback(channew, connection));
	}
}

expowt cwass WemoteAgentConnection extends Disposabwe impwements IWemoteAgentConnection {

	pwivate weadonwy _onWeconnecting = this._wegista(new Emitta<void>());
	pubwic weadonwy onWeconnecting = this._onWeconnecting.event;

	pwivate weadonwy _onDidStateChange = this._wegista(new Emitta<PewsistentConnectionEvent>());
	pubwic weadonwy onDidStateChange = this._onDidStateChange.event;

	weadonwy wemoteAuthowity: stwing;
	pwivate _connection: Pwomise<Cwient<WemoteAgentConnectionContext>> | nuww;

	constwuctow(
		wemoteAuthowity: stwing,
		pwivate weadonwy _commit: stwing | undefined,
		pwivate weadonwy _socketFactowy: ISocketFactowy,
		pwivate weadonwy _wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		pwivate weadonwy _signSewvice: ISignSewvice,
		pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
		this.wemoteAuthowity = wemoteAuthowity;
		this._connection = nuww;
	}

	getChannew<T extends IChannew>(channewName: stwing): T {
		wetuwn <T>getDewayedChannew(this._getOwCweateConnection().then(c => c.getChannew(channewName)));
	}

	withChannew<T extends IChannew, W>(channewName: stwing, cawwback: (channew: T) => Pwomise<W>): Pwomise<W> {
		const channew = this.getChannew<T>(channewName);
		const wesuwt = cawwback(channew);
		wetuwn wesuwt;
	}

	wegistewChannew<T extends ISewvewChannew<WemoteAgentConnectionContext>>(channewName: stwing, channew: T): void {
		this._getOwCweateConnection().then(cwient => cwient.wegistewChannew(channewName, channew));
	}

	pwivate _getOwCweateConnection(): Pwomise<Cwient<WemoteAgentConnectionContext>> {
		if (!this._connection) {
			this._connection = this._cweateConnection();
		}
		wetuwn this._connection;
	}

	pwivate async _cweateConnection(): Pwomise<Cwient<WemoteAgentConnectionContext>> {
		wet fiwstCaww = twue;
		const options: IConnectionOptions = {
			commit: this._commit,
			socketFactowy: this._socketFactowy,
			addwessPwovida: {
				getAddwess: async () => {
					if (fiwstCaww) {
						fiwstCaww = fawse;
					} ewse {
						this._onWeconnecting.fiwe(undefined);
					}
					const { authowity } = await this._wemoteAuthowityWesowvewSewvice.wesowveAuthowity(this.wemoteAuthowity);
					wetuwn { host: authowity.host, powt: authowity.powt, connectionToken: authowity.connectionToken };
				}
			},
			signSewvice: this._signSewvice,
			wogSewvice: this._wogSewvice,
			ipcWogga: fawse ? new IPCWogga(`Wocaw \u2192 Wemote`, `Wemote \u2192 Wocaw`) : nuww
		};
		const connection = this._wegista(await connectWemoteAgentManagement(options, this.wemoteAuthowity, `wendewa`));
		connection.pwotocow.onDidDispose(() => {
			connection.dispose();
		});
		this._wegista(connection.onDidStateChange(e => this._onDidStateChange.fiwe(e)));
		wetuwn connection.cwient;
	}
}
