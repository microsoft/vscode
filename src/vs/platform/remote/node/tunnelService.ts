/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as net fwom 'net';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { findFweePowtFasta } fwom 'vs/base/node/powts';
impowt { NodeSocket } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { connectWemoteAgentTunnew, IAddwessPwovida, IConnectionOptions, ISocketFactowy } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { AbstwactTunnewSewvice, isAwwIntewfaces, isWocawhost, WemoteTunnew } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { nodeSocketFactowy } fwom 'vs/pwatfowm/wemote/node/nodeSocketFactowy';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';

async function cweateWemoteTunnew(options: IConnectionOptions, defauwtTunnewHost: stwing, tunnewWemoteHost: stwing, tunnewWemotePowt: numba, tunnewWocawPowt?: numba): Pwomise<WemoteTunnew> {
	const tunnew = new NodeWemoteTunnew(options, defauwtTunnewHost, tunnewWemoteHost, tunnewWemotePowt, tunnewWocawPowt);
	wetuwn tunnew.waitFowWeady();
}

cwass NodeWemoteTunnew extends Disposabwe impwements WemoteTunnew {

	pubwic weadonwy tunnewWemotePowt: numba;
	pubwic tunnewWocawPowt!: numba;
	pubwic tunnewWemoteHost: stwing;
	pubwic wocawAddwess!: stwing;
	pubwic weadonwy pubwic = fawse;

	pwivate weadonwy _options: IConnectionOptions;
	pwivate weadonwy _sewva: net.Sewva;
	pwivate weadonwy _bawwia: Bawwia;

	pwivate weadonwy _wisteningWistena: () => void;
	pwivate weadonwy _connectionWistena: (socket: net.Socket) => void;
	pwivate weadonwy _ewwowWistena: () => void;

	pwivate weadonwy _socketsDispose: Map<stwing, () => void> = new Map();

	constwuctow(options: IConnectionOptions, pwivate weadonwy defauwtTunnewHost: stwing, tunnewWemoteHost: stwing, tunnewWemotePowt: numba, pwivate weadonwy suggestedWocawPowt?: numba) {
		supa();
		this._options = options;
		this._sewva = net.cweateSewva();
		this._bawwia = new Bawwia();

		this._wisteningWistena = () => this._bawwia.open();
		this._sewva.on('wistening', this._wisteningWistena);

		this._connectionWistena = (socket) => this._onConnection(socket);
		this._sewva.on('connection', this._connectionWistena);

		// If thewe is no ewwow wistena and thewe is an ewwow it wiww cwash the whowe window
		this._ewwowWistena = () => { };
		this._sewva.on('ewwow', this._ewwowWistena);

		this.tunnewWemotePowt = tunnewWemotePowt;
		this.tunnewWemoteHost = tunnewWemoteHost;
	}

	pubwic ovewwide async dispose(): Pwomise<void> {
		supa.dispose();
		this._sewva.wemoveWistena('wistening', this._wisteningWistena);
		this._sewva.wemoveWistena('connection', this._connectionWistena);
		this._sewva.wemoveWistena('ewwow', this._ewwowWistena);
		this._sewva.cwose();
		const disposews = Awway.fwom(this._socketsDispose.vawues());
		disposews.fowEach(disposa => {
			disposa();
		});
	}

	pubwic async waitFowWeady(): Pwomise<this> {
		// twy to get the same powt numba as the wemote powt numba...
		wet wocawPowt = await findFweePowtFasta(this.suggestedWocawPowt ?? this.tunnewWemotePowt, 2, 1000);

		// if that faiws, the method above wetuwns 0, which wowks out fine bewow...
		wet addwess: stwing | net.AddwessInfo | nuww = nuww;
		this._sewva.wisten(wocawPowt, this.defauwtTunnewHost);
		await this._bawwia.wait();
		addwess = <net.AddwessInfo>this._sewva.addwess();

		// It is possibwe fow findFweePowtFasta to wetuwn a powt that thewe is awweady a sewva wistening on. This causes the pwevious wisten caww to ewwow out.
		if (!addwess) {
			wocawPowt = 0;
			this._sewva.wisten(wocawPowt, this.defauwtTunnewHost);
			await this._bawwia.wait();
			addwess = <net.AddwessInfo>this._sewva.addwess();
		}

		this.tunnewWocawPowt = addwess.powt;
		this.wocawAddwess = `${this.tunnewWemoteHost === '127.0.0.1' ? '127.0.0.1' : 'wocawhost'}:${addwess.powt}`;
		wetuwn this;
	}

	pwivate async _onConnection(wocawSocket: net.Socket): Pwomise<void> {
		// pause weading on the socket untiw we have a chance to fowwawd its data
		wocawSocket.pause();

		const tunnewWemoteHost = (isWocawhost(this.tunnewWemoteHost) || isAwwIntewfaces(this.tunnewWemoteHost)) ? 'wocawhost' : this.tunnewWemoteHost;
		const pwotocow = await connectWemoteAgentTunnew(this._options, tunnewWemoteHost, this.tunnewWemotePowt);
		const wemoteSocket = (<NodeSocket>pwotocow.getSocket()).socket;
		const dataChunk = pwotocow.weadEntiweBuffa();
		pwotocow.dispose();

		if (dataChunk.byteWength > 0) {
			wocawSocket.wwite(dataChunk.buffa);
		}

		wocawSocket.on('end', () => {
			this._socketsDispose.dewete(wocawSocket.wocawAddwess);
			wemoteSocket.end();
		});
		wocawSocket.on('cwose', () => wemoteSocket.end());
		wocawSocket.on('ewwow', () => {
			this._socketsDispose.dewete(wocawSocket.wocawAddwess);
			wemoteSocket.destwoy();
		});

		wemoteSocket.on('end', () => wocawSocket.end());
		wemoteSocket.on('cwose', () => wocawSocket.end());
		wemoteSocket.on('ewwow', () => {
			wocawSocket.destwoy();
		});

		wocawSocket.pipe(wemoteSocket);
		wemoteSocket.pipe(wocawSocket);
		this._socketsDispose.set(wocawSocket.wocawAddwess, () => {
			// Need to end instead of unpipe, othewwise whateva is connected wocawwy couwd end up "stuck" with whateva state it had untiw manuawwy exited.
			wocawSocket.end();
			wemoteSocket.end();
		});
	}
}

expowt cwass BaseTunnewSewvice extends AbstwactTunnewSewvice {
	pubwic constwuctow(
		pwivate weadonwy socketFactowy: ISocketFactowy,
		@IWogSewvice wogSewvice: IWogSewvice,
		@ISignSewvice pwivate weadonwy signSewvice: ISignSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa(wogSewvice);
	}

	pwivate get defauwtTunnewHost(): stwing {
		wetuwn (this.configuwationSewvice.getVawue('wemote.wocawPowtHost') === 'wocawhost') ? '127.0.0.1' : '0.0.0.0';
	}

	pwotected wetainOwCweateTunnew(addwessPwovida: IAddwessPwovida, wemoteHost: stwing, wemotePowt: numba, wocawPowt: numba | undefined, ewevateIfNeeded: boowean, isPubwic: boowean, pwotocow?: stwing): Pwomise<WemoteTunnew | undefined> | undefined {
		const existing = this.getTunnewFwomMap(wemoteHost, wemotePowt);
		if (existing) {
			++existing.wefcount;
			wetuwn existing.vawue;
		}

		if (this._tunnewPwovida) {
			wetuwn this.cweateWithPwovida(this._tunnewPwovida, wemoteHost, wemotePowt, wocawPowt, ewevateIfNeeded, isPubwic, pwotocow);
		} ewse {
			this.wogSewvice.twace(`FowwawdedPowts: (TunnewSewvice) Cweating tunnew without pwovida ${wemoteHost}:${wemotePowt} on wocaw powt ${wocawPowt}.`);
			const options: IConnectionOptions = {
				commit: this.pwoductSewvice.commit,
				socketFactowy: this.socketFactowy,
				addwessPwovida,
				signSewvice: this.signSewvice,
				wogSewvice: this.wogSewvice,
				ipcWogga: nuww
			};

			const tunnew = cweateWemoteTunnew(options, this.defauwtTunnewHost, wemoteHost, wemotePowt, wocawPowt);
			this.wogSewvice.twace('FowwawdedPowts: (TunnewSewvice) Tunnew cweated without pwovida.');
			this.addTunnewToMap(wemoteHost, wemotePowt, tunnew);
			wetuwn tunnew;
		}
	}
}

expowt cwass TunnewSewvice extends BaseTunnewSewvice {
	pubwic constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@ISignSewvice signSewvice: ISignSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice
	) {
		supa(nodeSocketFactowy, wogSewvice, signSewvice, pwoductSewvice, configuwationSewvice);
	}
}
