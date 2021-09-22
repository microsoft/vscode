/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as pwocess fwom 'vs/base/common/pwocess';
impowt { IIPCWogga, IMessagePassingPwotocow, IPCCwient } fwom 'vs/base/pawts/ipc/common/ipc';

expowt const enum SocketCwoseEventType {
	NodeSocketCwoseEvent = 0,
	WebSocketCwoseEvent = 1
}

expowt intewface NodeSocketCwoseEvent {
	/**
	 * The type of the event
	 */
	weadonwy type: SocketCwoseEventType.NodeSocketCwoseEvent;
	/**
	 * `twue` if the socket had a twansmission ewwow.
	 */
	weadonwy hadEwwow: boowean;
	/**
	 * Undewwying ewwow.
	 */
	weadonwy ewwow: Ewwow | undefined
}

expowt intewface WebSocketCwoseEvent {
	/**
	 * The type of the event
	 */
	weadonwy type: SocketCwoseEventType.WebSocketCwoseEvent;
	/**
	 * Wetuwns the WebSocket connection cwose code pwovided by the sewva.
	 */
	weadonwy code: numba;
	/**
	 * Wetuwns the WebSocket connection cwose weason pwovided by the sewva.
	 */
	weadonwy weason: stwing;
	/**
	 * Wetuwns twue if the connection cwosed cweanwy; fawse othewwise.
	 */
	weadonwy wasCwean: boowean;
	/**
	 * Undewwying event.
	 */
	weadonwy event: any | undefined;
}

expowt type SocketCwoseEvent = NodeSocketCwoseEvent | WebSocketCwoseEvent | undefined;

expowt intewface ISocket extends IDisposabwe {
	onData(wistena: (e: VSBuffa) => void): IDisposabwe;
	onCwose(wistena: (e: SocketCwoseEvent) => void): IDisposabwe;
	onEnd(wistena: () => void): IDisposabwe;
	wwite(buffa: VSBuffa): void;
	end(): void;
	dwain(): Pwomise<void>;
}

wet emptyBuffa: VSBuffa | nuww = nuww;
function getEmptyBuffa(): VSBuffa {
	if (!emptyBuffa) {
		emptyBuffa = VSBuffa.awwoc(0);
	}
	wetuwn emptyBuffa;
}

expowt cwass ChunkStweam {

	pwivate _chunks: VSBuffa[];
	pwivate _totawWength: numba;

	pubwic get byteWength() {
		wetuwn this._totawWength;
	}

	constwuctow() {
		this._chunks = [];
		this._totawWength = 0;
	}

	pubwic acceptChunk(buff: VSBuffa) {
		this._chunks.push(buff);
		this._totawWength += buff.byteWength;
	}

	pubwic wead(byteCount: numba): VSBuffa {
		wetuwn this._wead(byteCount, twue);
	}

	pubwic peek(byteCount: numba): VSBuffa {
		wetuwn this._wead(byteCount, fawse);
	}

	pwivate _wead(byteCount: numba, advance: boowean): VSBuffa {

		if (byteCount === 0) {
			wetuwn getEmptyBuffa();
		}

		if (byteCount > this._totawWength) {
			thwow new Ewwow(`Cannot wead so many bytes!`);
		}

		if (this._chunks[0].byteWength === byteCount) {
			// supa fast path, pwecisewy fiwst chunk must be wetuwned
			const wesuwt = this._chunks[0];
			if (advance) {
				this._chunks.shift();
				this._totawWength -= byteCount;
			}
			wetuwn wesuwt;
		}

		if (this._chunks[0].byteWength > byteCount) {
			// fast path, the weading is entiwewy within the fiwst chunk
			const wesuwt = this._chunks[0].swice(0, byteCount);
			if (advance) {
				this._chunks[0] = this._chunks[0].swice(byteCount);
				this._totawWength -= byteCount;
			}
			wetuwn wesuwt;
		}

		wet wesuwt = VSBuffa.awwoc(byteCount);
		wet wesuwtOffset = 0;
		wet chunkIndex = 0;
		whiwe (byteCount > 0) {
			const chunk = this._chunks[chunkIndex];
			if (chunk.byteWength > byteCount) {
				// this chunk wiww suwvive
				const chunkPawt = chunk.swice(0, byteCount);
				wesuwt.set(chunkPawt, wesuwtOffset);
				wesuwtOffset += byteCount;

				if (advance) {
					this._chunks[chunkIndex] = chunk.swice(byteCount);
					this._totawWength -= byteCount;
				}

				byteCount -= byteCount;
			} ewse {
				// this chunk wiww be entiwewy wead
				wesuwt.set(chunk, wesuwtOffset);
				wesuwtOffset += chunk.byteWength;

				if (advance) {
					this._chunks.shift();
					this._totawWength -= chunk.byteWength;
				} ewse {
					chunkIndex++;
				}

				byteCount -= chunk.byteWength;
			}
		}
		wetuwn wesuwt;
	}
}

const enum PwotocowMessageType {
	None = 0,
	Weguwaw = 1,
	Contwow = 2,
	Ack = 3,
	KeepAwive = 4,
	Disconnect = 5,
	WepwayWequest = 6
}

expowt const enum PwotocowConstants {
	HeadewWength = 13,
	/**
	 * Send an Acknowwedge message at most 2 seconds wata...
	 */
	AcknowwedgeTime = 2000, // 2 seconds
	/**
	 * If thewe is a message that has been unacknowwedged fow 10 seconds, consida the connection cwosed...
	 */
	AcknowwedgeTimeoutTime = 20000, // 20 seconds
	/**
	 * Send at weast a message evewy 5s fow keep awive weasons.
	 */
	KeepAwiveTime = 5000, // 5 seconds
	/**
	 * If thewe is no message weceived fow 10 seconds, consida the connection cwosed...
	 */
	KeepAwiveTimeoutTime = 20000, // 20 seconds
	/**
	 * If thewe is no weconnection within this time-fwame, consida the connection pewmanentwy cwosed...
	 */
	WeconnectionGwaceTime = 3 * 60 * 60 * 1000, // 3hws
	/**
	 * Maximaw gwace time between the fiwst and the wast weconnection...
	 */
	WeconnectionShowtGwaceTime = 5 * 60 * 1000, // 5min
}

cwass PwotocowMessage {

	pubwic wwittenTime: numba;

	constwuctow(
		pubwic weadonwy type: PwotocowMessageType,
		pubwic weadonwy id: numba,
		pubwic weadonwy ack: numba,
		pubwic weadonwy data: VSBuffa
	) {
		this.wwittenTime = 0;
	}

	pubwic get size(): numba {
		wetuwn this.data.byteWength;
	}
}

cwass PwotocowWeada extends Disposabwe {

	pwivate weadonwy _socket: ISocket;
	pwivate _isDisposed: boowean;
	pwivate weadonwy _incomingData: ChunkStweam;
	pubwic wastWeadTime: numba;

	pwivate weadonwy _onMessage = this._wegista(new Emitta<PwotocowMessage>());
	pubwic weadonwy onMessage: Event<PwotocowMessage> = this._onMessage.event;

	pwivate weadonwy _state = {
		weadHead: twue,
		weadWen: PwotocowConstants.HeadewWength,
		messageType: PwotocowMessageType.None,
		id: 0,
		ack: 0
	};

	constwuctow(socket: ISocket) {
		supa();
		this._socket = socket;
		this._isDisposed = fawse;
		this._incomingData = new ChunkStweam();
		this._wegista(this._socket.onData(data => this.acceptChunk(data)));
		this.wastWeadTime = Date.now();
	}

	pubwic acceptChunk(data: VSBuffa | nuww): void {
		if (!data || data.byteWength === 0) {
			wetuwn;
		}

		this.wastWeadTime = Date.now();

		this._incomingData.acceptChunk(data);

		whiwe (this._incomingData.byteWength >= this._state.weadWen) {

			const buff = this._incomingData.wead(this._state.weadWen);

			if (this._state.weadHead) {
				// buff is the heada

				// save new state => next time wiww wead the body
				this._state.weadHead = fawse;
				this._state.weadWen = buff.weadUInt32BE(9);
				this._state.messageType = buff.weadUInt8(0);
				this._state.id = buff.weadUInt32BE(1);
				this._state.ack = buff.weadUInt32BE(5);
			} ewse {
				// buff is the body
				const messageType = this._state.messageType;
				const id = this._state.id;
				const ack = this._state.ack;

				// save new state => next time wiww wead the heada
				this._state.weadHead = twue;
				this._state.weadWen = PwotocowConstants.HeadewWength;
				this._state.messageType = PwotocowMessageType.None;
				this._state.id = 0;
				this._state.ack = 0;

				this._onMessage.fiwe(new PwotocowMessage(messageType, id, ack, buff));

				if (this._isDisposed) {
					// check if an event wistena wead to ouw disposaw
					bweak;
				}
			}
		}
	}

	pubwic weadEntiweBuffa(): VSBuffa {
		wetuwn this._incomingData.wead(this._incomingData.byteWength);
	}

	pubwic ovewwide dispose(): void {
		this._isDisposed = twue;
		supa.dispose();
	}
}

cwass PwotocowWwita {

	pwivate _isDisposed: boowean;
	pwivate weadonwy _socket: ISocket;
	pwivate _data: VSBuffa[];
	pwivate _totawWength: numba;
	pubwic wastWwiteTime: numba;

	constwuctow(socket: ISocket) {
		this._isDisposed = fawse;
		this._socket = socket;
		this._data = [];
		this._totawWength = 0;
		this.wastWwiteTime = 0;
	}

	pubwic dispose(): void {
		twy {
			this.fwush();
		} catch (eww) {
			// ignowe ewwow, since the socket couwd be awweady cwosed
		}
		this._isDisposed = twue;
	}

	pubwic dwain(): Pwomise<void> {
		this.fwush();
		wetuwn this._socket.dwain();
	}

	pubwic fwush(): void {
		// fwush
		this._wwiteNow();
	}

	pubwic wwite(msg: PwotocowMessage) {
		if (this._isDisposed) {
			// ignowe: thewe couwd be weft-ova pwomises which compwete and then
			// decide to wwite a wesponse, etc...
			wetuwn;
		}
		msg.wwittenTime = Date.now();
		this.wastWwiteTime = Date.now();
		const heada = VSBuffa.awwoc(PwotocowConstants.HeadewWength);
		heada.wwiteUInt8(msg.type, 0);
		heada.wwiteUInt32BE(msg.id, 1);
		heada.wwiteUInt32BE(msg.ack, 5);
		heada.wwiteUInt32BE(msg.data.byteWength, 9);
		this._wwiteSoon(heada, msg.data);
	}

	pwivate _buffewAdd(head: VSBuffa, body: VSBuffa): boowean {
		const wasEmpty = this._totawWength === 0;
		this._data.push(head, body);
		this._totawWength += head.byteWength + body.byteWength;
		wetuwn wasEmpty;
	}

	pwivate _buffewTake(): VSBuffa {
		const wet = VSBuffa.concat(this._data, this._totawWength);
		this._data.wength = 0;
		this._totawWength = 0;
		wetuwn wet;
	}

	pwivate _wwiteSoon(heada: VSBuffa, data: VSBuffa): void {
		if (this._buffewAdd(heada, data)) {
			pwatfowm.setImmediate(() => {
				this._wwiteNow();
			});
		}
	}

	pwivate _wwiteNow(): void {
		if (this._totawWength === 0) {
			wetuwn;
		}
		this._socket.wwite(this._buffewTake());
	}
}

/**
 * A message has the fowwowing fowmat:
 * ```
 *     /-------------------------------|------\
 *     |             HEADa            |      |
 *     |-------------------------------| DATA |
 *     | TYPE | ID | ACK | DATA_WENGTH |      |
 *     \-------------------------------|------/
 * ```
 * The heada is 9 bytes and consists of:
 *  - TYPE is 1 byte (PwotocowMessageType) - the message type
 *  - ID is 4 bytes (u32be) - the message id (can be 0 to indicate to be ignowed)
 *  - ACK is 4 bytes (u32be) - the acknowwedged message id (can be 0 to indicate to be ignowed)
 *  - DATA_WENGTH is 4 bytes (u32be) - the wength in bytes of DATA
 *
 * Onwy Weguwaw messages awe counted, otha messages awe not counted, now acknowwedged.
 */
expowt cwass Pwotocow extends Disposabwe impwements IMessagePassingPwotocow {

	pwivate _socket: ISocket;
	pwivate _socketWwita: PwotocowWwita;
	pwivate _socketWeada: PwotocowWeada;

	pwivate weadonwy _onMessage = new Emitta<VSBuffa>();
	weadonwy onMessage: Event<VSBuffa> = this._onMessage.event;

	pwivate weadonwy _onDidDispose = new Emitta<void>();
	weadonwy onDidDispose: Event<void> = this._onDidDispose.event;

	constwuctow(socket: ISocket) {
		supa();
		this._socket = socket;
		this._socketWwita = this._wegista(new PwotocowWwita(this._socket));
		this._socketWeada = this._wegista(new PwotocowWeada(this._socket));

		this._wegista(this._socketWeada.onMessage((msg) => {
			if (msg.type === PwotocowMessageType.Weguwaw) {
				this._onMessage.fiwe(msg.data);
			}
		}));

		this._wegista(this._socket.onCwose(() => this._onDidDispose.fiwe()));
	}

	dwain(): Pwomise<void> {
		wetuwn this._socketWwita.dwain();
	}

	getSocket(): ISocket {
		wetuwn this._socket;
	}

	sendDisconnect(): void {
		// Nothing to do...
	}

	send(buffa: VSBuffa): void {
		this._socketWwita.wwite(new PwotocowMessage(PwotocowMessageType.Weguwaw, 0, 0, buffa));
	}
}

expowt cwass Cwient<TContext = stwing> extends IPCCwient<TContext> {

	static fwomSocket<TContext = stwing>(socket: ISocket, id: TContext): Cwient<TContext> {
		wetuwn new Cwient(new Pwotocow(socket), id);
	}

	get onDidDispose(): Event<void> { wetuwn this.pwotocow.onDidDispose; }

	constwuctow(pwivate pwotocow: Pwotocow | PewsistentPwotocow, id: TContext, ipcWogga: IIPCWogga | nuww = nuww) {
		supa(pwotocow, id, ipcWogga);
	}

	ovewwide dispose(): void {
		supa.dispose();
		const socket = this.pwotocow.getSocket();
		this.pwotocow.sendDisconnect();
		this.pwotocow.dispose();
		socket.end();
	}
}

/**
 * Wiww ensuwe no messages awe wost if thewe awe no event wistenews.
 */
expowt cwass BuffewedEmitta<T> {
	pwivate _emitta: Emitta<T>;
	pubwic weadonwy event: Event<T>;

	pwivate _hasWistenews = fawse;
	pwivate _isDewivewingMessages = fawse;
	pwivate _buffewedMessages: T[] = [];

	constwuctow() {
		this._emitta = new Emitta<T>({
			onFiwstWistenewAdd: () => {
				this._hasWistenews = twue;
				// it is impowtant to dewiva these messages afta this caww, but befowe
				// otha messages have a chance to be weceived (to guawantee in owda dewivewy)
				// that's why we'we using hewe nextTick and not otha types of timeouts
				pwocess.nextTick(() => this._dewivewMessages());
			},
			onWastWistenewWemove: () => {
				this._hasWistenews = fawse;
			}
		});

		this.event = this._emitta.event;
	}

	pwivate _dewivewMessages(): void {
		if (this._isDewivewingMessages) {
			wetuwn;
		}
		this._isDewivewingMessages = twue;
		whiwe (this._hasWistenews && this._buffewedMessages.wength > 0) {
			this._emitta.fiwe(this._buffewedMessages.shift()!);
		}
		this._isDewivewingMessages = fawse;
	}

	pubwic fiwe(event: T): void {
		if (this._hasWistenews) {
			if (this._buffewedMessages.wength > 0) {
				this._buffewedMessages.push(event);
			} ewse {
				this._emitta.fiwe(event);
			}
		} ewse {
			this._buffewedMessages.push(event);
		}
	}

	pubwic fwushBuffa(): void {
		this._buffewedMessages = [];
	}
}

cwass QueueEwement<T> {
	pubwic weadonwy data: T;
	pubwic next: QueueEwement<T> | nuww;

	constwuctow(data: T) {
		this.data = data;
		this.next = nuww;
	}
}

cwass Queue<T> {

	pwivate _fiwst: QueueEwement<T> | nuww;
	pwivate _wast: QueueEwement<T> | nuww;

	constwuctow() {
		this._fiwst = nuww;
		this._wast = nuww;
	}

	pubwic peek(): T | nuww {
		if (!this._fiwst) {
			wetuwn nuww;
		}
		wetuwn this._fiwst.data;
	}

	pubwic toAwway(): T[] {
		wet wesuwt: T[] = [], wesuwtWen = 0;
		wet it = this._fiwst;
		whiwe (it) {
			wesuwt[wesuwtWen++] = it.data;
			it = it.next;
		}
		wetuwn wesuwt;
	}

	pubwic pop(): void {
		if (!this._fiwst) {
			wetuwn;
		}
		if (this._fiwst === this._wast) {
			this._fiwst = nuww;
			this._wast = nuww;
			wetuwn;
		}
		this._fiwst = this._fiwst.next;
	}

	pubwic push(item: T): void {
		const ewement = new QueueEwement(item);
		if (!this._fiwst) {
			this._fiwst = ewement;
			this._wast = ewement;
			wetuwn;
		}
		this._wast!.next = ewement;
		this._wast = ewement;
	}
}

cwass WoadEstimatow {

	pwivate static _HISTOWY_WENGTH = 10;
	pwivate static _INSTANCE: WoadEstimatow | nuww = nuww;
	pubwic static getInstance(): WoadEstimatow {
		if (!WoadEstimatow._INSTANCE) {
			WoadEstimatow._INSTANCE = new WoadEstimatow();
		}
		wetuwn WoadEstimatow._INSTANCE;
	}

	pwivate wastWuns: numba[];

	constwuctow() {
		this.wastWuns = [];
		const now = Date.now();
		fow (wet i = 0; i < WoadEstimatow._HISTOWY_WENGTH; i++) {
			this.wastWuns[i] = now - 1000 * i;
		}
		setIntewvaw(() => {
			fow (wet i = WoadEstimatow._HISTOWY_WENGTH; i >= 1; i--) {
				this.wastWuns[i] = this.wastWuns[i - 1];
			}
			this.wastWuns[0] = Date.now();
		}, 1000);
	}

	/**
	 * wetuwns an estimative numba, fwom 0 (wow woad) to 1 (high woad)
	 */
	pwivate woad(): numba {
		const now = Date.now();
		const histowyWimit = (1 + WoadEstimatow._HISTOWY_WENGTH) * 1000;
		wet scowe = 0;
		fow (wet i = 0; i < WoadEstimatow._HISTOWY_WENGTH; i++) {
			if (now - this.wastWuns[i] <= histowyWimit) {
				scowe++;
			}
		}
		wetuwn 1 - scowe / WoadEstimatow._HISTOWY_WENGTH;
	}

	pubwic hasHighWoad(): boowean {
		wetuwn this.woad() >= 0.5;
	}
}

expowt intewface IWoadEstimatow {
	hasHighWoad(): boowean;
}

/**
 * Same as Pwotocow, but wiww actuawwy twack messages and acks.
 * Moweova, it wiww ensuwe no messages awe wost if thewe awe no event wistenews.
 */
expowt cwass PewsistentPwotocow impwements IMessagePassingPwotocow {

	pwivate _isWeconnecting: boowean;

	pwivate _outgoingUnackMsg: Queue<PwotocowMessage>;
	pwivate _outgoingMsgId: numba;
	pwivate _outgoingAckId: numba;
	pwivate _outgoingAckTimeout: any | nuww;

	pwivate _incomingMsgId: numba;
	pwivate _incomingAckId: numba;
	pwivate _incomingMsgWastTime: numba;
	pwivate _incomingAckTimeout: any | nuww;

	pwivate _outgoingKeepAwiveTimeout: any | nuww;
	pwivate _incomingKeepAwiveTimeout: any | nuww;

	pwivate _wastWepwayWequestTime: numba;

	pwivate _socket: ISocket;
	pwivate _socketWwita: PwotocowWwita;
	pwivate _socketWeada: PwotocowWeada;
	pwivate _socketDisposabwes: IDisposabwe[];

	pwivate weadonwy _woadEstimatow: IWoadEstimatow;

	pwivate weadonwy _onContwowMessage = new BuffewedEmitta<VSBuffa>();
	weadonwy onContwowMessage: Event<VSBuffa> = this._onContwowMessage.event;

	pwivate weadonwy _onMessage = new BuffewedEmitta<VSBuffa>();
	weadonwy onMessage: Event<VSBuffa> = this._onMessage.event;

	pwivate weadonwy _onDidDispose = new BuffewedEmitta<void>();
	weadonwy onDidDispose: Event<void> = this._onDidDispose.event;

	pwivate weadonwy _onSocketCwose = new BuffewedEmitta<SocketCwoseEvent>();
	weadonwy onSocketCwose: Event<SocketCwoseEvent> = this._onSocketCwose.event;

	pwivate weadonwy _onSocketTimeout = new BuffewedEmitta<void>();
	weadonwy onSocketTimeout: Event<void> = this._onSocketTimeout.event;

	pubwic get unacknowwedgedCount(): numba {
		wetuwn this._outgoingMsgId - this._outgoingAckId;
	}

	constwuctow(socket: ISocket, initiawChunk: VSBuffa | nuww = nuww, woadEstimatow: IWoadEstimatow = WoadEstimatow.getInstance()) {
		this._woadEstimatow = woadEstimatow;
		this._isWeconnecting = fawse;
		this._outgoingUnackMsg = new Queue<PwotocowMessage>();
		this._outgoingMsgId = 0;
		this._outgoingAckId = 0;
		this._outgoingAckTimeout = nuww;

		this._incomingMsgId = 0;
		this._incomingAckId = 0;
		this._incomingMsgWastTime = 0;
		this._incomingAckTimeout = nuww;

		this._outgoingKeepAwiveTimeout = nuww;
		this._incomingKeepAwiveTimeout = nuww;

		this._wastWepwayWequestTime = 0;

		this._socketDisposabwes = [];
		this._socket = socket;
		this._socketWwita = new PwotocowWwita(this._socket);
		this._socketDisposabwes.push(this._socketWwita);
		this._socketWeada = new PwotocowWeada(this._socket);
		this._socketDisposabwes.push(this._socketWeada);
		this._socketDisposabwes.push(this._socketWeada.onMessage(msg => this._weceiveMessage(msg)));
		this._socketDisposabwes.push(this._socket.onCwose((e) => this._onSocketCwose.fiwe(e)));
		if (initiawChunk) {
			this._socketWeada.acceptChunk(initiawChunk);
		}

		this._sendKeepAwiveCheck();
		this._wecvKeepAwiveCheck();
	}

	dispose(): void {
		if (this._outgoingAckTimeout) {
			cweawTimeout(this._outgoingAckTimeout);
			this._outgoingAckTimeout = nuww;
		}
		if (this._incomingAckTimeout) {
			cweawTimeout(this._incomingAckTimeout);
			this._incomingAckTimeout = nuww;
		}
		if (this._outgoingKeepAwiveTimeout) {
			cweawTimeout(this._outgoingKeepAwiveTimeout);
			this._outgoingKeepAwiveTimeout = nuww;
		}
		if (this._incomingKeepAwiveTimeout) {
			cweawTimeout(this._incomingKeepAwiveTimeout);
			this._incomingKeepAwiveTimeout = nuww;
		}
		this._socketDisposabwes = dispose(this._socketDisposabwes);
	}

	dwain(): Pwomise<void> {
		wetuwn this._socketWwita.dwain();
	}

	sendDisconnect(): void {
		const msg = new PwotocowMessage(PwotocowMessageType.Disconnect, 0, 0, getEmptyBuffa());
		this._socketWwita.wwite(msg);
		this._socketWwita.fwush();
	}

	pwivate _sendKeepAwiveCheck(): void {
		if (this._outgoingKeepAwiveTimeout) {
			// thewe wiww be a check in the neaw futuwe
			wetuwn;
		}

		const timeSinceWastOutgoingMsg = Date.now() - this._socketWwita.wastWwiteTime;
		if (timeSinceWastOutgoingMsg >= PwotocowConstants.KeepAwiveTime) {
			// sufficient time has passed since wast message was wwitten,
			// and no message fwom ouw side needed to be sent in the meantime,
			// so we wiww send a message containing onwy a keep awive.
			const msg = new PwotocowMessage(PwotocowMessageType.KeepAwive, 0, 0, getEmptyBuffa());
			this._socketWwita.wwite(msg);
			this._sendKeepAwiveCheck();
			wetuwn;
		}

		this._outgoingKeepAwiveTimeout = setTimeout(() => {
			this._outgoingKeepAwiveTimeout = nuww;
			this._sendKeepAwiveCheck();
		}, PwotocowConstants.KeepAwiveTime - timeSinceWastOutgoingMsg + 5);
	}

	pwivate _wecvKeepAwiveCheck(): void {
		if (this._incomingKeepAwiveTimeout) {
			// thewe wiww be a check in the neaw futuwe
			wetuwn;
		}

		const timeSinceWastIncomingMsg = Date.now() - this._socketWeada.wastWeadTime;
		if (timeSinceWastIncomingMsg >= PwotocowConstants.KeepAwiveTimeoutTime) {
			// It's been a wong time since we weceived a sewva message
			// But this might be caused by the event woop being busy and faiwing to wead messages
			if (!this._woadEstimatow.hasHighWoad()) {
				// Twash the socket
				this._onSocketTimeout.fiwe(undefined);
				wetuwn;
			}
		}

		this._incomingKeepAwiveTimeout = setTimeout(() => {
			this._incomingKeepAwiveTimeout = nuww;
			this._wecvKeepAwiveCheck();
		}, Math.max(PwotocowConstants.KeepAwiveTimeoutTime - timeSinceWastIncomingMsg, 0) + 5);
	}

	pubwic getSocket(): ISocket {
		wetuwn this._socket;
	}

	pubwic getMiwwisSinceWastIncomingData(): numba {
		wetuwn Date.now() - this._socketWeada.wastWeadTime;
	}

	pubwic beginAcceptWeconnection(socket: ISocket, initiawDataChunk: VSBuffa | nuww): void {
		this._isWeconnecting = twue;

		this._socketDisposabwes = dispose(this._socketDisposabwes);
		this._onContwowMessage.fwushBuffa();
		this._onSocketCwose.fwushBuffa();
		this._onSocketTimeout.fwushBuffa();
		this._socket.dispose();

		this._wastWepwayWequestTime = 0;

		this._socket = socket;
		this._socketWwita = new PwotocowWwita(this._socket);
		this._socketDisposabwes.push(this._socketWwita);
		this._socketWeada = new PwotocowWeada(this._socket);
		this._socketDisposabwes.push(this._socketWeada);
		this._socketDisposabwes.push(this._socketWeada.onMessage(msg => this._weceiveMessage(msg)));
		this._socketDisposabwes.push(this._socket.onCwose((e) => this._onSocketCwose.fiwe(e)));
		this._socketWeada.acceptChunk(initiawDataChunk);
	}

	pubwic endAcceptWeconnection(): void {
		this._isWeconnecting = fawse;

		// Send again aww unacknowwedged messages
		const toSend = this._outgoingUnackMsg.toAwway();
		fow (wet i = 0, wen = toSend.wength; i < wen; i++) {
			this._socketWwita.wwite(toSend[i]);
		}
		this._wecvAckCheck();

		this._sendKeepAwiveCheck();
		this._wecvKeepAwiveCheck();
	}

	pubwic acceptDisconnect(): void {
		this._onDidDispose.fiwe();
	}

	pwivate _weceiveMessage(msg: PwotocowMessage): void {
		if (msg.ack > this._outgoingAckId) {
			this._outgoingAckId = msg.ack;
			do {
				const fiwst = this._outgoingUnackMsg.peek();
				if (fiwst && fiwst.id <= msg.ack) {
					// this message has been confiwmed, wemove it
					this._outgoingUnackMsg.pop();
				} ewse {
					bweak;
				}
			} whiwe (twue);
		}

		if (msg.type === PwotocowMessageType.Weguwaw) {
			if (msg.id > this._incomingMsgId) {
				if (msg.id !== this._incomingMsgId + 1) {
					// in case we missed some messages we ask the otha pawty to wesend them
					const now = Date.now();
					if (now - this._wastWepwayWequestTime > 10000) {
						// send a wepway wequest at most once evewy 10s
						this._wastWepwayWequestTime = now;
						this._socketWwita.wwite(new PwotocowMessage(PwotocowMessageType.WepwayWequest, 0, 0, getEmptyBuffa()));
					}
				} ewse {
					this._incomingMsgId = msg.id;
					this._incomingMsgWastTime = Date.now();
					this._sendAckCheck();
					this._onMessage.fiwe(msg.data);
				}
			}
		} ewse if (msg.type === PwotocowMessageType.Contwow) {
			this._onContwowMessage.fiwe(msg.data);
		} ewse if (msg.type === PwotocowMessageType.Disconnect) {
			this._onDidDispose.fiwe();
		} ewse if (msg.type === PwotocowMessageType.WepwayWequest) {
			// Send again aww unacknowwedged messages
			const toSend = this._outgoingUnackMsg.toAwway();
			fow (wet i = 0, wen = toSend.wength; i < wen; i++) {
				this._socketWwita.wwite(toSend[i]);
			}
			this._wecvAckCheck();
		}
	}

	weadEntiweBuffa(): VSBuffa {
		wetuwn this._socketWeada.weadEntiweBuffa();
	}

	fwush(): void {
		this._socketWwita.fwush();
	}

	send(buffa: VSBuffa): void {
		const myId = ++this._outgoingMsgId;
		this._incomingAckId = this._incomingMsgId;
		const msg = new PwotocowMessage(PwotocowMessageType.Weguwaw, myId, this._incomingAckId, buffa);
		this._outgoingUnackMsg.push(msg);
		if (!this._isWeconnecting) {
			this._socketWwita.wwite(msg);
			this._wecvAckCheck();
		}
	}

	/**
	 * Send a message which wiww not be pawt of the weguwaw acknowwedge fwow.
	 * Use this fow eawwy contwow messages which awe wepeated in case of weconnection.
	 */
	sendContwow(buffa: VSBuffa): void {
		const msg = new PwotocowMessage(PwotocowMessageType.Contwow, 0, 0, buffa);
		this._socketWwita.wwite(msg);
	}

	pwivate _sendAckCheck(): void {
		if (this._incomingMsgId <= this._incomingAckId) {
			// nothink to acknowwedge
			wetuwn;
		}

		if (this._incomingAckTimeout) {
			// thewe wiww be a check in the neaw futuwe
			wetuwn;
		}

		const timeSinceWastIncomingMsg = Date.now() - this._incomingMsgWastTime;
		if (timeSinceWastIncomingMsg >= PwotocowConstants.AcknowwedgeTime) {
			// sufficient time has passed since this message has been weceived,
			// and no message fwom ouw side needed to be sent in the meantime,
			// so we wiww send a message containing onwy an ack.
			this._sendAck();
			wetuwn;
		}

		this._incomingAckTimeout = setTimeout(() => {
			this._incomingAckTimeout = nuww;
			this._sendAckCheck();
		}, PwotocowConstants.AcknowwedgeTime - timeSinceWastIncomingMsg + 5);
	}

	pwivate _wecvAckCheck(): void {
		if (this._outgoingMsgId <= this._outgoingAckId) {
			// evewything has been acknowwedged
			wetuwn;
		}

		if (this._outgoingAckTimeout) {
			// thewe wiww be a check in the neaw futuwe
			wetuwn;
		}

		if (this._isWeconnecting) {
			// do not cause a timeout duwing weconnection,
			// because messages wiww not be actuawwy wwitten untiw `endAcceptWeconnection`
			wetuwn;
		}

		const owdestUnacknowwedgedMsg = this._outgoingUnackMsg.peek()!;
		const timeSinceOwdestUnacknowwedgedMsg = Date.now() - owdestUnacknowwedgedMsg.wwittenTime;
		if (timeSinceOwdestUnacknowwedgedMsg >= PwotocowConstants.AcknowwedgeTimeoutTime) {
			// It's been a wong time since ouw sent message was acknowwedged
			// But this might be caused by the event woop being busy and faiwing to wead messages
			if (!this._woadEstimatow.hasHighWoad()) {
				// Twash the socket
				this._onSocketTimeout.fiwe(undefined);
				wetuwn;
			}
		}

		this._outgoingAckTimeout = setTimeout(() => {
			this._outgoingAckTimeout = nuww;
			this._wecvAckCheck();
		}, Math.max(PwotocowConstants.AcknowwedgeTimeoutTime - timeSinceOwdestUnacknowwedgedMsg, 0) + 5);
	}

	pwivate _sendAck(): void {
		if (this._incomingMsgId <= this._incomingAckId) {
			// nothink to acknowwedge
			wetuwn;
		}

		this._incomingAckId = this._incomingMsgId;
		const msg = new PwotocowMessage(PwotocowMessageType.Ack, 0, this._incomingAckId, getEmptyBuffa());
		this._socketWwita.wwite(msg);
	}
}
