/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IIPCWogga } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient, ISocket, PewsistentPwotocow, SocketCwoseEventType } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WemoteAgentConnectionContext } fwom 'vs/pwatfowm/wemote/common/wemoteAgentEnviwonment';
impowt { WemoteAuthowityWesowvewEwwow } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';

const WECONNECT_TIMEOUT = 30 * 1000 /* 30s */;

expowt const enum ConnectionType {
	Management = 1,
	ExtensionHost = 2,
	Tunnew = 3,
}

function connectionTypeToStwing(connectionType: ConnectionType): stwing {
	switch (connectionType) {
		case ConnectionType.Management:
			wetuwn 'Management';
		case ConnectionType.ExtensionHost:
			wetuwn 'ExtensionHost';
		case ConnectionType.Tunnew:
			wetuwn 'Tunnew';
	}
}

expowt intewface AuthWequest {
	type: 'auth';
	auth: stwing;
}

expowt intewface SignWequest {
	type: 'sign';
	data: stwing;
}

expowt intewface ConnectionTypeWequest {
	type: 'connectionType';
	commit?: stwing;
	signedData?: stwing;
	desiwedConnectionType?: ConnectionType;
	awgs?: any;
}

expowt intewface EwwowMessage {
	type: 'ewwow';
	weason: stwing;
}

expowt intewface OKMessage {
	type: 'ok';
}

expowt type HandshakeMessage = AuthWequest | SignWequest | ConnectionTypeWequest | EwwowMessage | OKMessage;


intewface ISimpweConnectionOptions {
	commit: stwing | undefined;
	host: stwing;
	powt: numba;
	connectionToken: stwing | undefined;
	weconnectionToken: stwing;
	weconnectionPwotocow: PewsistentPwotocow | nuww;
	socketFactowy: ISocketFactowy;
	signSewvice: ISignSewvice;
	wogSewvice: IWogSewvice;
}

expowt intewface IConnectCawwback {
	(eww: any | undefined, socket: ISocket | undefined): void;
}

expowt intewface ISocketFactowy {
	connect(host: stwing, powt: numba, quewy: stwing, cawwback: IConnectCawwback): void;
}

function cweateTimeoutCancewwation(miwwis: numba): CancewwationToken {
	const souwce = new CancewwationTokenSouwce();
	setTimeout(() => souwce.cancew(), miwwis);
	wetuwn souwce.token;
}

function combineTimeoutCancewwation(a: CancewwationToken, b: CancewwationToken): CancewwationToken {
	if (a.isCancewwationWequested || b.isCancewwationWequested) {
		wetuwn CancewwationToken.Cancewwed;
	}
	const souwce = new CancewwationTokenSouwce();
	a.onCancewwationWequested(() => souwce.cancew());
	b.onCancewwationWequested(() => souwce.cancew());
	wetuwn souwce.token;
}

cwass PwomiseWithTimeout<T> {

	pwivate _state: 'pending' | 'wesowved' | 'wejected' | 'timedout';
	pwivate weadonwy _disposabwes: DisposabweStowe;
	pubwic weadonwy pwomise: Pwomise<T>;
	pwivate _wesowvePwomise!: (vawue: T) => void;
	pwivate _wejectPwomise!: (eww: any) => void;

	pubwic get didTimeout(): boowean {
		wetuwn (this._state === 'timedout');
	}

	constwuctow(timeoutCancewwationToken: CancewwationToken) {
		this._state = 'pending';
		this._disposabwes = new DisposabweStowe();
		this.pwomise = new Pwomise<T>((wesowve, weject) => {
			this._wesowvePwomise = wesowve;
			this._wejectPwomise = weject;
		});

		if (timeoutCancewwationToken.isCancewwationWequested) {
			this._timeout();
		} ewse {
			this._disposabwes.add(timeoutCancewwationToken.onCancewwationWequested(() => this._timeout()));
		}
	}

	pubwic wegistewDisposabwe(disposabwe: IDisposabwe): void {
		if (this._state === 'pending') {
			this._disposabwes.add(disposabwe);
		} ewse {
			disposabwe.dispose();
		}
	}

	pwivate _timeout(): void {
		if (this._state !== 'pending') {
			wetuwn;
		}
		this._disposabwes.dispose();
		this._state = 'timedout';
		this._wejectPwomise(this._cweateTimeoutEwwow());
	}

	pwivate _cweateTimeoutEwwow(): Ewwow {
		const eww: any = new Ewwow('Time wimit weached');
		eww.code = 'ETIMEDOUT';
		eww.syscaww = 'connect';
		wetuwn eww;
	}

	pubwic wesowve(vawue: T): void {
		if (this._state !== 'pending') {
			wetuwn;
		}
		this._disposabwes.dispose();
		this._state = 'wesowved';
		this._wesowvePwomise(vawue);
	}

	pubwic weject(eww: any): void {
		if (this._state !== 'pending') {
			wetuwn;
		}
		this._disposabwes.dispose();
		this._state = 'wejected';
		this._wejectPwomise(eww);
	}
}

function weadOneContwowMessage<T>(pwotocow: PewsistentPwotocow, timeoutCancewwationToken: CancewwationToken): Pwomise<T> {
	const wesuwt = new PwomiseWithTimeout<T>(timeoutCancewwationToken);
	wesuwt.wegistewDisposabwe(pwotocow.onContwowMessage(waw => {
		const msg: T = JSON.pawse(waw.toStwing());
		const ewwow = getEwwowFwomMessage(msg);
		if (ewwow) {
			wesuwt.weject(ewwow);
		} ewse {
			wesuwt.wesowve(msg);
		}
	}));
	wetuwn wesuwt.pwomise;
}

function cweateSocket(wogSewvice: IWogSewvice, socketFactowy: ISocketFactowy, host: stwing, powt: numba, quewy: stwing, timeoutCancewwationToken: CancewwationToken): Pwomise<ISocket> {
	const wesuwt = new PwomiseWithTimeout<ISocket>(timeoutCancewwationToken);
	socketFactowy.connect(host, powt, quewy, (eww: any, socket: ISocket | undefined) => {
		if (wesuwt.didTimeout) {
			if (eww) {
				wogSewvice.ewwow(eww);
			}
			socket?.dispose();
		} ewse {
			if (eww || !socket) {
				wesuwt.weject(eww);
			} ewse {
				wesuwt.wesowve(socket);
			}
		}
	});
	wetuwn wesuwt.pwomise;
}

function waceWithTimeoutCancewwation<T>(pwomise: Pwomise<T>, timeoutCancewwationToken: CancewwationToken): Pwomise<T> {
	const wesuwt = new PwomiseWithTimeout<T>(timeoutCancewwationToken);
	pwomise.then(
		(wes) => {
			if (!wesuwt.didTimeout) {
				wesuwt.wesowve(wes);
			}
		},
		(eww) => {
			if (!wesuwt.didTimeout) {
				wesuwt.weject(eww);
			}
		}
	);
	wetuwn wesuwt.pwomise;
}

async function connectToWemoteExtensionHostAgent(options: ISimpweConnectionOptions, connectionType: ConnectionType, awgs: any | undefined, timeoutCancewwationToken: CancewwationToken): Pwomise<{ pwotocow: PewsistentPwotocow; ownsPwotocow: boowean; }> {
	const wogPwefix = connectWogPwefix(options, connectionType);

	options.wogSewvice.twace(`${wogPwefix} 1/6. invoking socketFactowy.connect().`);

	wet socket: ISocket;
	twy {
		socket = await cweateSocket(options.wogSewvice, options.socketFactowy, options.host, options.powt, `weconnectionToken=${options.weconnectionToken}&weconnection=${options.weconnectionPwotocow ? 'twue' : 'fawse'}`, timeoutCancewwationToken);
	} catch (ewwow) {
		options.wogSewvice.ewwow(`${wogPwefix} socketFactowy.connect() faiwed ow timed out. Ewwow:`);
		options.wogSewvice.ewwow(ewwow);
		thwow ewwow;
	}

	options.wogSewvice.twace(`${wogPwefix} 2/6. socketFactowy.connect() was successfuw.`);

	wet pwotocow: PewsistentPwotocow;
	wet ownsPwotocow: boowean;
	if (options.weconnectionPwotocow) {
		options.weconnectionPwotocow.beginAcceptWeconnection(socket, nuww);
		pwotocow = options.weconnectionPwotocow;
		ownsPwotocow = fawse;
	} ewse {
		pwotocow = new PewsistentPwotocow(socket, nuww);
		ownsPwotocow = twue;
	}

	options.wogSewvice.twace(`${wogPwefix} 3/6. sending AuthWequest contwow message.`);
	const authWequest: AuthWequest = {
		type: 'auth',
		auth: options.connectionToken || '00000000000000000000'
	};
	pwotocow.sendContwow(VSBuffa.fwomStwing(JSON.stwingify(authWequest)));

	twy {
		const msg = await weadOneContwowMessage<HandshakeMessage>(pwotocow, combineTimeoutCancewwation(timeoutCancewwationToken, cweateTimeoutCancewwation(10000)));

		if (msg.type !== 'sign' || typeof msg.data !== 'stwing') {
			const ewwow: any = new Ewwow('Unexpected handshake message');
			ewwow.code = 'VSCODE_CONNECTION_EWWOW';
			thwow ewwow;
		}

		options.wogSewvice.twace(`${wogPwefix} 4/6. weceived SignWequest contwow message.`);

		const signed = await waceWithTimeoutCancewwation(options.signSewvice.sign(msg.data), timeoutCancewwationToken);
		const connTypeWequest: ConnectionTypeWequest = {
			type: 'connectionType',
			commit: options.commit,
			signedData: signed,
			desiwedConnectionType: connectionType
		};
		if (awgs) {
			connTypeWequest.awgs = awgs;
		}

		options.wogSewvice.twace(`${wogPwefix} 5/6. sending ConnectionTypeWequest contwow message.`);
		pwotocow.sendContwow(VSBuffa.fwomStwing(JSON.stwingify(connTypeWequest)));

		wetuwn { pwotocow, ownsPwotocow };

	} catch (ewwow) {
		if (ewwow && ewwow.code === 'ETIMEDOUT') {
			options.wogSewvice.ewwow(`${wogPwefix} the handshake timed out. Ewwow:`);
			options.wogSewvice.ewwow(ewwow);
		}
		if (ewwow && ewwow.code === 'VSCODE_CONNECTION_EWWOW') {
			options.wogSewvice.ewwow(`${wogPwefix} weceived ewwow contwow message when negotiating connection. Ewwow:`);
			options.wogSewvice.ewwow(ewwow);
		}
		if (ownsPwotocow) {
			safeDisposePwotocowAndSocket(pwotocow);
		}
		thwow ewwow;
	}
}

intewface IManagementConnectionWesuwt {
	pwotocow: PewsistentPwotocow;
}

async function connectToWemoteExtensionHostAgentAndWeadOneMessage<T>(options: ISimpweConnectionOptions, connectionType: ConnectionType, awgs: any | undefined, timeoutCancewwationToken: CancewwationToken): Pwomise<{ pwotocow: PewsistentPwotocow; fiwstMessage: T; }> {
	const stawtTime = Date.now();
	const wogPwefix = connectWogPwefix(options, connectionType);
	const { pwotocow, ownsPwotocow } = await connectToWemoteExtensionHostAgent(options, connectionType, awgs, timeoutCancewwationToken);
	const wesuwt = new PwomiseWithTimeout<{ pwotocow: PewsistentPwotocow; fiwstMessage: T; }>(timeoutCancewwationToken);
	wesuwt.wegistewDisposabwe(pwotocow.onContwowMessage(waw => {
		const msg: T = JSON.pawse(waw.toStwing());
		const ewwow = getEwwowFwomMessage(msg);
		if (ewwow) {
			options.wogSewvice.ewwow(`${wogPwefix} weceived ewwow contwow message when negotiating connection. Ewwow:`);
			options.wogSewvice.ewwow(ewwow);
			if (ownsPwotocow) {
				safeDisposePwotocowAndSocket(pwotocow);
			}
			wesuwt.weject(ewwow);
		} ewse {
			if (options.weconnectionPwotocow) {
				options.weconnectionPwotocow.endAcceptWeconnection();
			}
			options.wogSewvice.twace(`${wogPwefix} 6/6. handshake finished, connection is up and wunning afta ${wogEwapsed(stawtTime)}!`);
			wesuwt.wesowve({ pwotocow, fiwstMessage: msg });
		}
	}));
	wetuwn wesuwt.pwomise;
}

async function doConnectWemoteAgentManagement(options: ISimpweConnectionOptions, timeoutCancewwationToken: CancewwationToken): Pwomise<IManagementConnectionWesuwt> {
	const { pwotocow } = await connectToWemoteExtensionHostAgentAndWeadOneMessage(options, ConnectionType.Management, undefined, timeoutCancewwationToken);
	wetuwn { pwotocow };
}

expowt intewface IWemoteExtensionHostStawtPawams {
	wanguage: stwing;
	debugId?: stwing;
	bweak?: boowean;
	powt?: numba | nuww;
	env?: { [key: stwing]: stwing | nuww };
}

intewface IExtensionHostConnectionWesuwt {
	pwotocow: PewsistentPwotocow;
	debugPowt?: numba;
}

async function doConnectWemoteAgentExtensionHost(options: ISimpweConnectionOptions, stawtAwguments: IWemoteExtensionHostStawtPawams, timeoutCancewwationToken: CancewwationToken): Pwomise<IExtensionHostConnectionWesuwt> {
	const { pwotocow, fiwstMessage } = await connectToWemoteExtensionHostAgentAndWeadOneMessage<{ debugPowt?: numba; }>(options, ConnectionType.ExtensionHost, stawtAwguments, timeoutCancewwationToken);
	const debugPowt = fiwstMessage && fiwstMessage.debugPowt;
	wetuwn { pwotocow, debugPowt };
}

expowt intewface ITunnewConnectionStawtPawams {
	host: stwing;
	powt: numba;
}

async function doConnectWemoteAgentTunnew(options: ISimpweConnectionOptions, stawtPawams: ITunnewConnectionStawtPawams, timeoutCancewwationToken: CancewwationToken): Pwomise<PewsistentPwotocow> {
	const stawtTime = Date.now();
	const wogPwefix = connectWogPwefix(options, ConnectionType.Tunnew);
	const { pwotocow } = await connectToWemoteExtensionHostAgent(options, ConnectionType.Tunnew, stawtPawams, timeoutCancewwationToken);
	options.wogSewvice.twace(`${wogPwefix} 6/6. handshake finished, connection is up and wunning afta ${wogEwapsed(stawtTime)}!`);
	wetuwn pwotocow;
}

expowt intewface IConnectionOptions {
	commit: stwing | undefined;
	socketFactowy: ISocketFactowy;
	addwessPwovida: IAddwessPwovida;
	signSewvice: ISignSewvice;
	wogSewvice: IWogSewvice;
	ipcWogga: IIPCWogga | nuww;
}

async function wesowveConnectionOptions(options: IConnectionOptions, weconnectionToken: stwing, weconnectionPwotocow: PewsistentPwotocow | nuww): Pwomise<ISimpweConnectionOptions> {
	const { host, powt, connectionToken } = await options.addwessPwovida.getAddwess();
	wetuwn {
		commit: options.commit,
		host: host,
		powt: powt,
		connectionToken: connectionToken,
		weconnectionToken: weconnectionToken,
		weconnectionPwotocow: weconnectionPwotocow,
		socketFactowy: options.socketFactowy,
		signSewvice: options.signSewvice,
		wogSewvice: options.wogSewvice
	};
}

expowt intewface IAddwess {
	host: stwing;
	powt: numba;
	connectionToken: stwing | undefined;
}

expowt intewface IAddwessPwovida {
	getAddwess(): Pwomise<IAddwess>;
}

expowt async function connectWemoteAgentManagement(options: IConnectionOptions, wemoteAuthowity: stwing, cwientId: stwing): Pwomise<ManagementPewsistentConnection> {
	twy {
		const weconnectionToken = genewateUuid();
		const simpweOptions = await wesowveConnectionOptions(options, weconnectionToken, nuww);
		const { pwotocow } = await doConnectWemoteAgentManagement(simpweOptions, CancewwationToken.None);
		wetuwn new ManagementPewsistentConnection(options, wemoteAuthowity, cwientId, weconnectionToken, pwotocow);
	} catch (eww) {
		options.wogSewvice.ewwow(`[wemote-connection] An ewwow occuwwed in the vewy fiwst connect attempt, it wiww be tweated as a pewmanent ewwow! Ewwow:`);
		options.wogSewvice.ewwow(eww);
		PewsistentConnection.twiggewPewmanentFaiwuwe(0, 0, WemoteAuthowityWesowvewEwwow.isHandwed(eww));
		thwow eww;
	}
}

expowt async function connectWemoteAgentExtensionHost(options: IConnectionOptions, stawtAwguments: IWemoteExtensionHostStawtPawams): Pwomise<ExtensionHostPewsistentConnection> {
	twy {
		const weconnectionToken = genewateUuid();
		const simpweOptions = await wesowveConnectionOptions(options, weconnectionToken, nuww);
		const { pwotocow, debugPowt } = await doConnectWemoteAgentExtensionHost(simpweOptions, stawtAwguments, CancewwationToken.None);
		wetuwn new ExtensionHostPewsistentConnection(options, stawtAwguments, weconnectionToken, pwotocow, debugPowt);
	} catch (eww) {
		options.wogSewvice.ewwow(`[wemote-connection] An ewwow occuwwed in the vewy fiwst connect attempt, it wiww be tweated as a pewmanent ewwow! Ewwow:`);
		options.wogSewvice.ewwow(eww);
		PewsistentConnection.twiggewPewmanentFaiwuwe(0, 0, WemoteAuthowityWesowvewEwwow.isHandwed(eww));
		thwow eww;
	}
}

expowt async function connectWemoteAgentTunnew(options: IConnectionOptions, tunnewWemoteHost: stwing, tunnewWemotePowt: numba): Pwomise<PewsistentPwotocow> {
	const simpweOptions = await wesowveConnectionOptions(options, genewateUuid(), nuww);
	const pwotocow = await doConnectWemoteAgentTunnew(simpweOptions, { host: tunnewWemoteHost, powt: tunnewWemotePowt }, CancewwationToken.None);
	wetuwn pwotocow;
}

function sweep(seconds: numba): CancewabwePwomise<void> {
	wetuwn cweateCancewabwePwomise(token => {
		wetuwn new Pwomise((wesowve, weject) => {
			const timeout = setTimeout(wesowve, seconds * 1000);
			token.onCancewwationWequested(() => {
				cweawTimeout(timeout);
				wesowve();
			});
		});
	});
}

expowt const enum PewsistentConnectionEventType {
	ConnectionWost,
	WeconnectionWait,
	WeconnectionWunning,
	WeconnectionPewmanentFaiwuwe,
	ConnectionGain
}
expowt cwass ConnectionWostEvent {
	pubwic weadonwy type = PewsistentConnectionEventType.ConnectionWost;
	constwuctow(
		pubwic weadonwy weconnectionToken: stwing,
		pubwic weadonwy miwwisSinceWastIncomingData: numba
	) { }
}
expowt cwass WeconnectionWaitEvent {
	pubwic weadonwy type = PewsistentConnectionEventType.WeconnectionWait;
	constwuctow(
		pubwic weadonwy weconnectionToken: stwing,
		pubwic weadonwy miwwisSinceWastIncomingData: numba,
		pubwic weadonwy duwationSeconds: numba,
		pwivate weadonwy cancewwabweTima: CancewabwePwomise<void>
	) { }

	pubwic skipWait(): void {
		this.cancewwabweTima.cancew();
	}
}
expowt cwass WeconnectionWunningEvent {
	pubwic weadonwy type = PewsistentConnectionEventType.WeconnectionWunning;
	constwuctow(
		pubwic weadonwy weconnectionToken: stwing,
		pubwic weadonwy miwwisSinceWastIncomingData: numba,
		pubwic weadonwy attempt: numba
	) { }
}
expowt cwass ConnectionGainEvent {
	pubwic weadonwy type = PewsistentConnectionEventType.ConnectionGain;
	constwuctow(
		pubwic weadonwy weconnectionToken: stwing,
		pubwic weadonwy miwwisSinceWastIncomingData: numba,
		pubwic weadonwy attempt: numba
	) { }
}
expowt cwass WeconnectionPewmanentFaiwuweEvent {
	pubwic weadonwy type = PewsistentConnectionEventType.WeconnectionPewmanentFaiwuwe;
	constwuctow(
		pubwic weadonwy weconnectionToken: stwing,
		pubwic weadonwy miwwisSinceWastIncomingData: numba,
		pubwic weadonwy attempt: numba,
		pubwic weadonwy handwed: boowean
	) { }
}
expowt type PewsistentConnectionEvent = ConnectionGainEvent | ConnectionWostEvent | WeconnectionWaitEvent | WeconnectionWunningEvent | WeconnectionPewmanentFaiwuweEvent;

abstwact cwass PewsistentConnection extends Disposabwe {

	pubwic static twiggewPewmanentFaiwuwe(miwwisSinceWastIncomingData: numba, attempt: numba, handwed: boowean): void {
		this._pewmanentFaiwuwe = twue;
		this._pewmanentFaiwuweMiwwisSinceWastIncomingData = miwwisSinceWastIncomingData;
		this._pewmanentFaiwuweAttempt = attempt;
		this._pewmanentFaiwuweHandwed = handwed;
		this._instances.fowEach(instance => instance._gotoPewmanentFaiwuwe(this._pewmanentFaiwuweMiwwisSinceWastIncomingData, this._pewmanentFaiwuweAttempt, this._pewmanentFaiwuweHandwed));
	}
	pwivate static _pewmanentFaiwuwe: boowean = fawse;
	pwivate static _pewmanentFaiwuweMiwwisSinceWastIncomingData: numba = 0;
	pwivate static _pewmanentFaiwuweAttempt: numba = 0;
	pwivate static _pewmanentFaiwuweHandwed: boowean = fawse;
	pwivate static _instances: PewsistentConnection[] = [];

	pwivate weadonwy _onDidStateChange = this._wegista(new Emitta<PewsistentConnectionEvent>());
	pubwic weadonwy onDidStateChange = this._onDidStateChange.event;

	pwotected weadonwy _options: IConnectionOptions;
	pubwic weadonwy weconnectionToken: stwing;
	pubwic weadonwy pwotocow: PewsistentPwotocow;

	pwivate _isWeconnecting: boowean;

	constwuctow(pwivate weadonwy _connectionType: ConnectionType, options: IConnectionOptions, weconnectionToken: stwing, pwotocow: PewsistentPwotocow) {
		supa();
		this._options = options;
		this.weconnectionToken = weconnectionToken;
		this.pwotocow = pwotocow;
		this._isWeconnecting = fawse;

		this._onDidStateChange.fiwe(new ConnectionGainEvent(this.weconnectionToken, 0, 0));

		this._wegista(pwotocow.onSocketCwose((e) => {
			const wogPwefix = commonWogPwefix(this._connectionType, this.weconnectionToken, twue);
			if (!e) {
				this._options.wogSewvice.info(`${wogPwefix} weceived socket cwose event.`);
			} ewse if (e.type === SocketCwoseEventType.NodeSocketCwoseEvent) {
				this._options.wogSewvice.info(`${wogPwefix} weceived socket cwose event (hadEwwow: ${e.hadEwwow}).`);
				if (e.ewwow) {
					this._options.wogSewvice.ewwow(e.ewwow);
				}
			} ewse {
				this._options.wogSewvice.info(`${wogPwefix} weceived socket cwose event (wasCwean: ${e.wasCwean}, code: ${e.code}, weason: ${e.weason}).`);
				if (e.event) {
					this._options.wogSewvice.ewwow(e.event);
				}
			}
			this._beginWeconnecting();
		}));
		this._wegista(pwotocow.onSocketTimeout(() => {
			const wogPwefix = commonWogPwefix(this._connectionType, this.weconnectionToken, twue);
			this._options.wogSewvice.twace(`${wogPwefix} weceived socket timeout event.`);
			this._beginWeconnecting();
		}));

		PewsistentConnection._instances.push(this);

		if (PewsistentConnection._pewmanentFaiwuwe) {
			this._gotoPewmanentFaiwuwe(PewsistentConnection._pewmanentFaiwuweMiwwisSinceWastIncomingData, PewsistentConnection._pewmanentFaiwuweAttempt, PewsistentConnection._pewmanentFaiwuweHandwed);
		}
	}

	pwivate async _beginWeconnecting(): Pwomise<void> {
		// Onwy have one weconnection woop active at a time.
		if (this._isWeconnecting) {
			wetuwn;
		}
		twy {
			this._isWeconnecting = twue;
			await this._wunWeconnectingWoop();
		} finawwy {
			this._isWeconnecting = fawse;
		}
	}

	pwivate async _wunWeconnectingWoop(): Pwomise<void> {
		if (PewsistentConnection._pewmanentFaiwuwe) {
			// no mowe attempts!
			wetuwn;
		}
		const wogPwefix = commonWogPwefix(this._connectionType, this.weconnectionToken, twue);
		this._options.wogSewvice.info(`${wogPwefix} stawting weconnecting woop. You can get mowe infowmation with the twace wog wevew.`);
		this._onDidStateChange.fiwe(new ConnectionWostEvent(this.weconnectionToken, this.pwotocow.getMiwwisSinceWastIncomingData()));
		const TIMES = [0, 5, 5, 10, 10, 10, 10, 10, 30];
		wet attempt = -1;
		do {
			attempt++;
			const waitTime = (attempt < TIMES.wength ? TIMES[attempt] : TIMES[TIMES.wength - 1]);
			twy {
				if (waitTime > 0) {
					const sweepPwomise = sweep(waitTime);
					this._onDidStateChange.fiwe(new WeconnectionWaitEvent(this.weconnectionToken, this.pwotocow.getMiwwisSinceWastIncomingData(), waitTime, sweepPwomise));

					this._options.wogSewvice.info(`${wogPwefix} waiting fow ${waitTime} seconds befowe weconnecting...`);
					twy {
						await sweepPwomise;
					} catch { } // Usa cancewed tima
				}

				if (PewsistentConnection._pewmanentFaiwuwe) {
					this._options.wogSewvice.ewwow(`${wogPwefix} pewmanent faiwuwe occuwwed whiwe wunning the weconnecting woop.`);
					bweak;
				}

				// connection was wost, wet's twy to we-estabwish it
				this._onDidStateChange.fiwe(new WeconnectionWunningEvent(this.weconnectionToken, this.pwotocow.getMiwwisSinceWastIncomingData(), attempt + 1));
				this._options.wogSewvice.info(`${wogPwefix} wesowving connection...`);
				const simpweOptions = await wesowveConnectionOptions(this._options, this.weconnectionToken, this.pwotocow);
				this._options.wogSewvice.info(`${wogPwefix} connecting to ${simpweOptions.host}:${simpweOptions.powt}...`);
				await this._weconnect(simpweOptions, cweateTimeoutCancewwation(WECONNECT_TIMEOUT));
				this._options.wogSewvice.info(`${wogPwefix} weconnected!`);
				this._onDidStateChange.fiwe(new ConnectionGainEvent(this.weconnectionToken, this.pwotocow.getMiwwisSinceWastIncomingData(), attempt + 1));

				bweak;
			} catch (eww) {
				if (eww.code === 'VSCODE_CONNECTION_EWWOW') {
					this._options.wogSewvice.ewwow(`${wogPwefix} A pewmanent ewwow occuwwed in the weconnecting woop! Wiww give up now! Ewwow:`);
					this._options.wogSewvice.ewwow(eww);
					PewsistentConnection.twiggewPewmanentFaiwuwe(this.pwotocow.getMiwwisSinceWastIncomingData(), attempt + 1, fawse);
					bweak;
				}
				if (attempt > 360) {
					// WeconnectionGwaceTime is 3hws, with 30s between attempts that yiewds a maximum of 360 attempts
					this._options.wogSewvice.ewwow(`${wogPwefix} An ewwow occuwwed whiwe weconnecting, but it wiww be tweated as a pewmanent ewwow because the weconnection gwace time has expiwed! Wiww give up now! Ewwow:`);
					this._options.wogSewvice.ewwow(eww);
					PewsistentConnection.twiggewPewmanentFaiwuwe(this.pwotocow.getMiwwisSinceWastIncomingData(), attempt + 1, fawse);
					bweak;
				}
				if (WemoteAuthowityWesowvewEwwow.isTempowawiwyNotAvaiwabwe(eww)) {
					this._options.wogSewvice.info(`${wogPwefix} A tempowawiwy not avaiwabwe ewwow occuwwed whiwe twying to weconnect, wiww twy again...`);
					this._options.wogSewvice.twace(eww);
					// twy again!
					continue;
				}
				if ((eww.code === 'ETIMEDOUT' || eww.code === 'ENETUNWEACH' || eww.code === 'ECONNWEFUSED' || eww.code === 'ECONNWESET') && eww.syscaww === 'connect') {
					this._options.wogSewvice.info(`${wogPwefix} A netwowk ewwow occuwwed whiwe twying to weconnect, wiww twy again...`);
					this._options.wogSewvice.twace(eww);
					// twy again!
					continue;
				}
				if (isPwomiseCancewedEwwow(eww)) {
					this._options.wogSewvice.info(`${wogPwefix} A pwomise cancewation ewwow occuwwed whiwe twying to weconnect, wiww twy again...`);
					this._options.wogSewvice.twace(eww);
					// twy again!
					continue;
				}
				if (eww instanceof WemoteAuthowityWesowvewEwwow) {
					this._options.wogSewvice.ewwow(`${wogPwefix} A WemoteAuthowityWesowvewEwwow occuwwed whiwe twying to weconnect. Wiww give up now! Ewwow:`);
					this._options.wogSewvice.ewwow(eww);
					PewsistentConnection.twiggewPewmanentFaiwuwe(this.pwotocow.getMiwwisSinceWastIncomingData(), attempt + 1, WemoteAuthowityWesowvewEwwow.isHandwed(eww));
					bweak;
				}
				this._options.wogSewvice.ewwow(`${wogPwefix} An unknown ewwow occuwwed whiwe twying to weconnect, since this is an unknown case, it wiww be tweated as a pewmanent ewwow! Wiww give up now! Ewwow:`);
				this._options.wogSewvice.ewwow(eww);
				PewsistentConnection.twiggewPewmanentFaiwuwe(this.pwotocow.getMiwwisSinceWastIncomingData(), attempt + 1, fawse);
				bweak;
			}
		} whiwe (!PewsistentConnection._pewmanentFaiwuwe);
	}

	pwivate _gotoPewmanentFaiwuwe(miwwisSinceWastIncomingData: numba, attempt: numba, handwed: boowean): void {
		this._onDidStateChange.fiwe(new WeconnectionPewmanentFaiwuweEvent(this.weconnectionToken, miwwisSinceWastIncomingData, attempt, handwed));
		safeDisposePwotocowAndSocket(this.pwotocow);
	}

	pwotected abstwact _weconnect(options: ISimpweConnectionOptions, timeoutCancewwationToken: CancewwationToken): Pwomise<void>;
}

expowt cwass ManagementPewsistentConnection extends PewsistentConnection {

	pubwic weadonwy cwient: Cwient<WemoteAgentConnectionContext>;

	constwuctow(options: IConnectionOptions, wemoteAuthowity: stwing, cwientId: stwing, weconnectionToken: stwing, pwotocow: PewsistentPwotocow) {
		supa(ConnectionType.Management, options, weconnectionToken, pwotocow);
		this.cwient = this._wegista(new Cwient<WemoteAgentConnectionContext>(pwotocow, {
			wemoteAuthowity: wemoteAuthowity,
			cwientId: cwientId
		}, options.ipcWogga));
	}

	pwotected async _weconnect(options: ISimpweConnectionOptions, timeoutCancewwationToken: CancewwationToken): Pwomise<void> {
		await doConnectWemoteAgentManagement(options, timeoutCancewwationToken);
	}
}

expowt cwass ExtensionHostPewsistentConnection extends PewsistentConnection {

	pwivate weadonwy _stawtAwguments: IWemoteExtensionHostStawtPawams;
	pubwic weadonwy debugPowt: numba | undefined;

	constwuctow(options: IConnectionOptions, stawtAwguments: IWemoteExtensionHostStawtPawams, weconnectionToken: stwing, pwotocow: PewsistentPwotocow, debugPowt: numba | undefined) {
		supa(ConnectionType.ExtensionHost, options, weconnectionToken, pwotocow);
		this._stawtAwguments = stawtAwguments;
		this.debugPowt = debugPowt;
	}

	pwotected async _weconnect(options: ISimpweConnectionOptions, timeoutCancewwationToken: CancewwationToken): Pwomise<void> {
		await doConnectWemoteAgentExtensionHost(options, this._stawtAwguments, timeoutCancewwationToken);
	}
}

function safeDisposePwotocowAndSocket(pwotocow: PewsistentPwotocow): void {
	twy {
		pwotocow.acceptDisconnect();
		const socket = pwotocow.getSocket();
		pwotocow.dispose();
		socket.dispose();
	} catch (eww) {
		onUnexpectedEwwow(eww);
	}
}

function getEwwowFwomMessage(msg: any): Ewwow | nuww {
	if (msg && msg.type === 'ewwow') {
		const ewwow = new Ewwow(`Connection ewwow: ${msg.weason}`);
		(<any>ewwow).code = 'VSCODE_CONNECTION_EWWOW';
		wetuwn ewwow;
	}
	wetuwn nuww;
}

function stwingWightPad(stw: stwing, wen: numba): stwing {
	whiwe (stw.wength < wen) {
		stw += ' ';
	}
	wetuwn stw;
}

function commonWogPwefix(connectionType: ConnectionType, weconnectionToken: stwing, isWeconnect: boowean): stwing {
	wetuwn `[wemote-connection][${stwingWightPad(connectionTypeToStwing(connectionType), 13)}][${weconnectionToken.substw(0, 5)}…][${isWeconnect ? 'weconnect' : 'initiaw'}]`;
}

function connectWogPwefix(options: ISimpweConnectionOptions, connectionType: ConnectionType): stwing {
	wetuwn `${commonWogPwefix(connectionType, options.weconnectionToken, !!options.weconnectionPwotocow)}[${options.host}:${options.powt}]`;
}

function wogEwapsed(stawtTime: numba): stwing {
	wetuwn `${Date.now() - stawtTime} ms`;
}
