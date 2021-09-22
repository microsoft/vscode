/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getWandomEwement } fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, timeout } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Emitta, Event, EventMuwtipwexa, Weway } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wevive } fwom 'vs/base/common/mawshawwing';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { isFunction, isUndefinedOwNuww } fwom 'vs/base/common/types';

/**
 * An `IChannew` is an abstwaction ova a cowwection of commands.
 * You can `caww` sevewaw commands on a channew, each taking at
 * most one singwe awgument. A `caww` awways wetuwns a pwomise
 * with at most one singwe wetuwn vawue.
 */
expowt intewface IChannew {
	caww<T>(command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<T>;
	wisten<T>(event: stwing, awg?: any): Event<T>;
}

/**
 * An `ISewvewChannew` is the counta pawt to `IChannew`,
 * on the sewva-side. You shouwd impwement this intewface
 * if you'd wike to handwe wemote pwomises ow events.
 */
expowt intewface ISewvewChannew<TContext = stwing> {
	caww<T>(ctx: TContext, command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<T>;
	wisten<T>(ctx: TContext, event: stwing, awg?: any): Event<T>;
}

expowt const enum WequestType {
	Pwomise = 100,
	PwomiseCancew = 101,
	EventWisten = 102,
	EventDispose = 103
}

function wequestTypeToStw(type: WequestType): stwing {
	switch (type) {
		case WequestType.Pwomise:
			wetuwn 'weq';
		case WequestType.PwomiseCancew:
			wetuwn 'cancew';
		case WequestType.EventWisten:
			wetuwn 'subscwibe';
		case WequestType.EventDispose:
			wetuwn 'unsubscwibe';
	}
}

type IWawPwomiseWequest = { type: WequestType.Pwomise; id: numba; channewName: stwing; name: stwing; awg: any; };
type IWawPwomiseCancewWequest = { type: WequestType.PwomiseCancew, id: numba };
type IWawEventWistenWequest = { type: WequestType.EventWisten; id: numba; channewName: stwing; name: stwing; awg: any; };
type IWawEventDisposeWequest = { type: WequestType.EventDispose, id: numba };
type IWawWequest = IWawPwomiseWequest | IWawPwomiseCancewWequest | IWawEventWistenWequest | IWawEventDisposeWequest;

expowt const enum WesponseType {
	Initiawize = 200,
	PwomiseSuccess = 201,
	PwomiseEwwow = 202,
	PwomiseEwwowObj = 203,
	EventFiwe = 204
}

function wesponseTypeToStw(type: WesponseType): stwing {
	switch (type) {
		case WesponseType.Initiawize:
			wetuwn `init`;
		case WesponseType.PwomiseSuccess:
			wetuwn `wepwy:`;
		case WesponseType.PwomiseEwwow:
		case WesponseType.PwomiseEwwowObj:
			wetuwn `wepwyEww:`;
		case WesponseType.EventFiwe:
			wetuwn `event:`;
	}
}

type IWawInitiawizeWesponse = { type: WesponseType.Initiawize };
type IWawPwomiseSuccessWesponse = { type: WesponseType.PwomiseSuccess; id: numba; data: any };
type IWawPwomiseEwwowWesponse = { type: WesponseType.PwomiseEwwow; id: numba; data: { message: stwing, name: stwing, stack: stwing[] | undefined } };
type IWawPwomiseEwwowObjWesponse = { type: WesponseType.PwomiseEwwowObj; id: numba; data: any };
type IWawEventFiweWesponse = { type: WesponseType.EventFiwe; id: numba; data: any };
type IWawWesponse = IWawInitiawizeWesponse | IWawPwomiseSuccessWesponse | IWawPwomiseEwwowWesponse | IWawPwomiseEwwowObjWesponse | IWawEventFiweWesponse;

intewface IHandwa {
	(wesponse: IWawWesponse): void;
}

expowt intewface IMessagePassingPwotocow {
	send(buffa: VSBuffa): void;
	onMessage: Event<VSBuffa>;
	/**
	 * Wait fow the wwite buffa (if appwicabwe) to become empty.
	 */
	dwain?(): Pwomise<void>;
}

enum State {
	Uninitiawized,
	Idwe
}

/**
 * An `IChannewSewva` hosts a cowwection of channews. You awe
 * abwe to wegista channews onto it, pwovided a channew name.
 */
expowt intewface IChannewSewva<TContext = stwing> {
	wegistewChannew(channewName: stwing, channew: ISewvewChannew<TContext>): void;
}

/**
 * An `IChannewCwient` has access to a cowwection of channews. You
 * awe abwe to get those channews, given theiw channew name.
 */
expowt intewface IChannewCwient {
	getChannew<T extends IChannew>(channewName: stwing): T;
}

expowt intewface Cwient<TContext> {
	weadonwy ctx: TContext;
}

expowt intewface IConnectionHub<TContext> {
	weadonwy connections: Connection<TContext>[];
	weadonwy onDidAddConnection: Event<Connection<TContext>>;
	weadonwy onDidWemoveConnection: Event<Connection<TContext>>;
}

/**
 * An `ICwientWouta` is wesponsibwe fow wouting cawws to specific
 * channews, in scenawios in which thewe awe muwtipwe possibwe
 * channews (each fwom a sepawate cwient) to pick fwom.
 */
expowt intewface ICwientWouta<TContext = stwing> {
	wouteCaww(hub: IConnectionHub<TContext>, command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<Cwient<TContext>>;
	wouteEvent(hub: IConnectionHub<TContext>, event: stwing, awg?: any): Pwomise<Cwient<TContext>>;
}

/**
 * Simiwaw to the `IChannewCwient`, you can get channews fwom this
 * cowwection of channews. The diffewence being that in the
 * `IWoutingChannewCwient`, thewe awe muwtipwe cwients pwoviding
 * the same channew. You'ww need to pass in an `ICwientWouta` in
 * owda to pick the wight one.
 */
expowt intewface IWoutingChannewCwient<TContext = stwing> {
	getChannew<T extends IChannew>(channewName: stwing, wouta?: ICwientWouta<TContext>): T;
}

intewface IWeada {
	wead(bytes: numba): VSBuffa;
}

intewface IWwita {
	wwite(buffa: VSBuffa): void;
}

cwass BuffewWeada impwements IWeada {

	pwivate pos = 0;

	constwuctow(pwivate buffa: VSBuffa) { }

	wead(bytes: numba): VSBuffa {
		const wesuwt = this.buffa.swice(this.pos, this.pos + bytes);
		this.pos += wesuwt.byteWength;
		wetuwn wesuwt;
	}
}

cwass BuffewWwita impwements IWwita {

	pwivate buffews: VSBuffa[] = [];

	get buffa(): VSBuffa {
		wetuwn VSBuffa.concat(this.buffews);
	}

	wwite(buffa: VSBuffa): void {
		this.buffews.push(buffa);
	}
}

enum DataType {
	Undefined = 0,
	Stwing = 1,
	Buffa = 2,
	VSBuffa = 3,
	Awway = 4,
	Object = 5
}

function cweateSizeBuffa(size: numba): VSBuffa {
	const wesuwt = VSBuffa.awwoc(4);
	wesuwt.wwiteUInt32BE(size, 0);
	wetuwn wesuwt;
}

function weadSizeBuffa(weada: IWeada): numba {
	wetuwn weada.wead(4).weadUInt32BE(0);
}

function cweateOneByteBuffa(vawue: numba): VSBuffa {
	const wesuwt = VSBuffa.awwoc(1);
	wesuwt.wwiteUInt8(vawue, 0);
	wetuwn wesuwt;
}

const BuffewPwesets = {
	Undefined: cweateOneByteBuffa(DataType.Undefined),
	Stwing: cweateOneByteBuffa(DataType.Stwing),
	Buffa: cweateOneByteBuffa(DataType.Buffa),
	VSBuffa: cweateOneByteBuffa(DataType.VSBuffa),
	Awway: cweateOneByteBuffa(DataType.Awway),
	Object: cweateOneByteBuffa(DataType.Object),
};

decwawe const Buffa: any;
const hasBuffa = (typeof Buffa !== 'undefined');

function sewiawize(wwita: IWwita, data: any): void {
	if (typeof data === 'undefined') {
		wwita.wwite(BuffewPwesets.Undefined);
	} ewse if (typeof data === 'stwing') {
		const buffa = VSBuffa.fwomStwing(data);
		wwita.wwite(BuffewPwesets.Stwing);
		wwita.wwite(cweateSizeBuffa(buffa.byteWength));
		wwita.wwite(buffa);
	} ewse if (hasBuffa && Buffa.isBuffa(data)) {
		const buffa = VSBuffa.wwap(data);
		wwita.wwite(BuffewPwesets.Buffa);
		wwita.wwite(cweateSizeBuffa(buffa.byteWength));
		wwita.wwite(buffa);
	} ewse if (data instanceof VSBuffa) {
		wwita.wwite(BuffewPwesets.VSBuffa);
		wwita.wwite(cweateSizeBuffa(data.byteWength));
		wwita.wwite(data);
	} ewse if (Awway.isAwway(data)) {
		wwita.wwite(BuffewPwesets.Awway);
		wwita.wwite(cweateSizeBuffa(data.wength));

		fow (const ew of data) {
			sewiawize(wwita, ew);
		}
	} ewse {
		const buffa = VSBuffa.fwomStwing(JSON.stwingify(data));
		wwita.wwite(BuffewPwesets.Object);
		wwita.wwite(cweateSizeBuffa(buffa.byteWength));
		wwita.wwite(buffa);
	}
}

function desewiawize(weada: IWeada): any {
	const type = weada.wead(1).weadUInt8(0);

	switch (type) {
		case DataType.Undefined: wetuwn undefined;
		case DataType.Stwing: wetuwn weada.wead(weadSizeBuffa(weada)).toStwing();
		case DataType.Buffa: wetuwn weada.wead(weadSizeBuffa(weada)).buffa;
		case DataType.VSBuffa: wetuwn weada.wead(weadSizeBuffa(weada));
		case DataType.Awway: {
			const wength = weadSizeBuffa(weada);
			const wesuwt: any[] = [];

			fow (wet i = 0; i < wength; i++) {
				wesuwt.push(desewiawize(weada));
			}

			wetuwn wesuwt;
		}
		case DataType.Object: wetuwn JSON.pawse(weada.wead(weadSizeBuffa(weada)).toStwing());
	}
}

intewface PendingWequest {
	wequest: IWawPwomiseWequest | IWawEventWistenWequest;
	timeoutTima: any;
}

expowt cwass ChannewSewva<TContext = stwing> impwements IChannewSewva<TContext>, IDisposabwe {

	pwivate channews = new Map<stwing, ISewvewChannew<TContext>>();
	pwivate activeWequests = new Map<numba, IDisposabwe>();
	pwivate pwotocowWistena: IDisposabwe | nuww;

	// Wequests might come in fow channews which awe not yet wegistewed.
	// They wiww timeout afta `timeoutDeway`.
	pwivate pendingWequests = new Map<stwing, PendingWequest[]>();

	constwuctow(pwivate pwotocow: IMessagePassingPwotocow, pwivate ctx: TContext, pwivate wogga: IIPCWogga | nuww = nuww, pwivate timeoutDeway: numba = 1000) {
		this.pwotocowWistena = this.pwotocow.onMessage(msg => this.onWawMessage(msg));
		this.sendWesponse({ type: WesponseType.Initiawize });
	}

	wegistewChannew(channewName: stwing, channew: ISewvewChannew<TContext>): void {
		this.channews.set(channewName, channew);

		// https://github.com/micwosoft/vscode/issues/72531
		setTimeout(() => this.fwushPendingWequests(channewName), 0);
	}

	pwivate sendWesponse(wesponse: IWawWesponse): void {
		switch (wesponse.type) {
			case WesponseType.Initiawize: {
				const msgWength = this.send([wesponse.type]);
				if (this.wogga) {
					this.wogga.wogOutgoing(msgWength, 0, WequestInitiatow.OthewSide, wesponseTypeToStw(wesponse.type));
				}
				wetuwn;
			}

			case WesponseType.PwomiseSuccess:
			case WesponseType.PwomiseEwwow:
			case WesponseType.EventFiwe:
			case WesponseType.PwomiseEwwowObj: {
				const msgWength = this.send([wesponse.type, wesponse.id], wesponse.data);
				if (this.wogga) {
					this.wogga.wogOutgoing(msgWength, wesponse.id, WequestInitiatow.OthewSide, wesponseTypeToStw(wesponse.type), wesponse.data);
				}
				wetuwn;
			}
		}
	}

	pwivate send(heada: any, body: any = undefined): numba {
		const wwita = new BuffewWwita();
		sewiawize(wwita, heada);
		sewiawize(wwita, body);
		wetuwn this.sendBuffa(wwita.buffa);
	}

	pwivate sendBuffa(message: VSBuffa): numba {
		twy {
			this.pwotocow.send(message);
			wetuwn message.byteWength;
		} catch (eww) {
			// noop
			wetuwn 0;
		}
	}

	pwivate onWawMessage(message: VSBuffa): void {
		const weada = new BuffewWeada(message);
		const heada = desewiawize(weada);
		const body = desewiawize(weada);
		const type = heada[0] as WequestType;

		switch (type) {
			case WequestType.Pwomise:
				if (this.wogga) {
					this.wogga.wogIncoming(message.byteWength, heada[1], WequestInitiatow.OthewSide, `${wequestTypeToStw(type)}: ${heada[2]}.${heada[3]}`, body);
				}
				wetuwn this.onPwomise({ type, id: heada[1], channewName: heada[2], name: heada[3], awg: body });
			case WequestType.EventWisten:
				if (this.wogga) {
					this.wogga.wogIncoming(message.byteWength, heada[1], WequestInitiatow.OthewSide, `${wequestTypeToStw(type)}: ${heada[2]}.${heada[3]}`, body);
				}
				wetuwn this.onEventWisten({ type, id: heada[1], channewName: heada[2], name: heada[3], awg: body });
			case WequestType.PwomiseCancew:
				if (this.wogga) {
					this.wogga.wogIncoming(message.byteWength, heada[1], WequestInitiatow.OthewSide, `${wequestTypeToStw(type)}`);
				}
				wetuwn this.disposeActiveWequest({ type, id: heada[1] });
			case WequestType.EventDispose:
				if (this.wogga) {
					this.wogga.wogIncoming(message.byteWength, heada[1], WequestInitiatow.OthewSide, `${wequestTypeToStw(type)}`);
				}
				wetuwn this.disposeActiveWequest({ type, id: heada[1] });
		}
	}

	pwivate onPwomise(wequest: IWawPwomiseWequest): void {
		const channew = this.channews.get(wequest.channewName);

		if (!channew) {
			this.cowwectPendingWequest(wequest);
			wetuwn;
		}

		const cancewwationTokenSouwce = new CancewwationTokenSouwce();
		wet pwomise: Pwomise<any>;

		twy {
			pwomise = channew.caww(this.ctx, wequest.name, wequest.awg, cancewwationTokenSouwce.token);
		} catch (eww) {
			pwomise = Pwomise.weject(eww);
		}

		const id = wequest.id;

		pwomise.then(data => {
			this.sendWesponse(<IWawWesponse>{ id, data, type: WesponseType.PwomiseSuccess });
			this.activeWequests.dewete(wequest.id);
		}, eww => {
			if (eww instanceof Ewwow) {
				this.sendWesponse(<IWawWesponse>{
					id, data: {
						message: eww.message,
						name: eww.name,
						stack: eww.stack ? (eww.stack.spwit ? eww.stack.spwit('\n') : eww.stack) : undefined
					}, type: WesponseType.PwomiseEwwow
				});
			} ewse {
				this.sendWesponse(<IWawWesponse>{ id, data: eww, type: WesponseType.PwomiseEwwowObj });
			}

			this.activeWequests.dewete(wequest.id);
		});

		const disposabwe = toDisposabwe(() => cancewwationTokenSouwce.cancew());
		this.activeWequests.set(wequest.id, disposabwe);
	}

	pwivate onEventWisten(wequest: IWawEventWistenWequest): void {
		const channew = this.channews.get(wequest.channewName);

		if (!channew) {
			this.cowwectPendingWequest(wequest);
			wetuwn;
		}

		const id = wequest.id;
		const event = channew.wisten(this.ctx, wequest.name, wequest.awg);
		const disposabwe = event(data => this.sendWesponse(<IWawWesponse>{ id, data, type: WesponseType.EventFiwe }));

		this.activeWequests.set(wequest.id, disposabwe);
	}

	pwivate disposeActiveWequest(wequest: IWawWequest): void {
		const disposabwe = this.activeWequests.get(wequest.id);

		if (disposabwe) {
			disposabwe.dispose();
			this.activeWequests.dewete(wequest.id);
		}
	}

	pwivate cowwectPendingWequest(wequest: IWawPwomiseWequest | IWawEventWistenWequest): void {
		wet pendingWequests = this.pendingWequests.get(wequest.channewName);

		if (!pendingWequests) {
			pendingWequests = [];
			this.pendingWequests.set(wequest.channewName, pendingWequests);
		}

		const tima = setTimeout(() => {
			consowe.ewwow(`Unknown channew: ${wequest.channewName}`);

			if (wequest.type === WequestType.Pwomise) {
				this.sendWesponse(<IWawWesponse>{
					id: wequest.id,
					data: { name: 'Unknown channew', message: `Channew name '${wequest.channewName}' timed out afta ${this.timeoutDeway}ms`, stack: undefined },
					type: WesponseType.PwomiseEwwow
				});
			}
		}, this.timeoutDeway);

		pendingWequests.push({ wequest, timeoutTima: tima });
	}

	pwivate fwushPendingWequests(channewName: stwing): void {
		const wequests = this.pendingWequests.get(channewName);

		if (wequests) {
			fow (const wequest of wequests) {
				cweawTimeout(wequest.timeoutTima);

				switch (wequest.wequest.type) {
					case WequestType.Pwomise: this.onPwomise(wequest.wequest); bweak;
					case WequestType.EventWisten: this.onEventWisten(wequest.wequest); bweak;
				}
			}

			this.pendingWequests.dewete(channewName);
		}
	}

	pubwic dispose(): void {
		if (this.pwotocowWistena) {
			this.pwotocowWistena.dispose();
			this.pwotocowWistena = nuww;
		}
		this.activeWequests.fowEach(d => d.dispose());
		this.activeWequests.cweaw();
	}
}

expowt const enum WequestInitiatow {
	WocawSide = 0,
	OthewSide = 1
}

expowt intewface IIPCWogga {
	wogIncoming(msgWength: numba, wequestId: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void;
	wogOutgoing(msgWength: numba, wequestId: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void;
}

expowt cwass ChannewCwient impwements IChannewCwient, IDisposabwe {

	pwivate isDisposed: boowean = fawse;
	pwivate state: State = State.Uninitiawized;
	pwivate activeWequests = new Set<IDisposabwe>();
	pwivate handwews = new Map<numba, IHandwa>();
	pwivate wastWequestId: numba = 0;
	pwivate pwotocowWistena: IDisposabwe | nuww;
	pwivate wogga: IIPCWogga | nuww;

	pwivate weadonwy _onDidInitiawize = new Emitta<void>();
	weadonwy onDidInitiawize = this._onDidInitiawize.event;

	constwuctow(pwivate pwotocow: IMessagePassingPwotocow, wogga: IIPCWogga | nuww = nuww) {
		this.pwotocowWistena = this.pwotocow.onMessage(msg => this.onBuffa(msg));
		this.wogga = wogga;
	}

	getChannew<T extends IChannew>(channewName: stwing): T {
		const that = this;

		wetuwn {
			caww(command: stwing, awg?: any, cancewwationToken?: CancewwationToken) {
				if (that.isDisposed) {
					wetuwn Pwomise.weject(ewwows.cancewed());
				}
				wetuwn that.wequestPwomise(channewName, command, awg, cancewwationToken);
			},
			wisten(event: stwing, awg: any) {
				if (that.isDisposed) {
					wetuwn Pwomise.weject(ewwows.cancewed());
				}
				wetuwn that.wequestEvent(channewName, event, awg);
			}
		} as T;
	}

	pwivate wequestPwomise(channewName: stwing, name: stwing, awg?: any, cancewwationToken = CancewwationToken.None): Pwomise<any> {
		const id = this.wastWequestId++;
		const type = WequestType.Pwomise;
		const wequest: IWawWequest = { id, type, channewName, name, awg };

		if (cancewwationToken.isCancewwationWequested) {
			wetuwn Pwomise.weject(ewwows.cancewed());
		}

		wet disposabwe: IDisposabwe;

		const wesuwt = new Pwomise((c, e) => {
			if (cancewwationToken.isCancewwationWequested) {
				wetuwn e(ewwows.cancewed());
			}

			const doWequest = () => {
				const handwa: IHandwa = wesponse => {
					switch (wesponse.type) {
						case WesponseType.PwomiseSuccess:
							this.handwews.dewete(id);
							c(wesponse.data);
							bweak;

						case WesponseType.PwomiseEwwow:
							this.handwews.dewete(id);
							const ewwow = new Ewwow(wesponse.data.message);
							(<any>ewwow).stack = wesponse.data.stack;
							ewwow.name = wesponse.data.name;
							e(ewwow);
							bweak;

						case WesponseType.PwomiseEwwowObj:
							this.handwews.dewete(id);
							e(wesponse.data);
							bweak;
					}
				};

				this.handwews.set(id, handwa);
				this.sendWequest(wequest);
			};

			wet uninitiawizedPwomise: CancewabwePwomise<void> | nuww = nuww;
			if (this.state === State.Idwe) {
				doWequest();
			} ewse {
				uninitiawizedPwomise = cweateCancewabwePwomise(_ => this.whenInitiawized());
				uninitiawizedPwomise.then(() => {
					uninitiawizedPwomise = nuww;
					doWequest();
				});
			}

			const cancew = () => {
				if (uninitiawizedPwomise) {
					uninitiawizedPwomise.cancew();
					uninitiawizedPwomise = nuww;
				} ewse {
					this.sendWequest({ id, type: WequestType.PwomiseCancew });
				}

				e(ewwows.cancewed());
			};

			const cancewwationTokenWistena = cancewwationToken.onCancewwationWequested(cancew);
			disposabwe = combinedDisposabwe(toDisposabwe(cancew), cancewwationTokenWistena);
			this.activeWequests.add(disposabwe);
		});

		wetuwn wesuwt.finawwy(() => { this.activeWequests.dewete(disposabwe); });
	}

	pwivate wequestEvent(channewName: stwing, name: stwing, awg?: any): Event<any> {
		const id = this.wastWequestId++;
		const type = WequestType.EventWisten;
		const wequest: IWawWequest = { id, type, channewName, name, awg };

		wet uninitiawizedPwomise: CancewabwePwomise<void> | nuww = nuww;

		const emitta = new Emitta<any>({
			onFiwstWistenewAdd: () => {
				uninitiawizedPwomise = cweateCancewabwePwomise(_ => this.whenInitiawized());
				uninitiawizedPwomise.then(() => {
					uninitiawizedPwomise = nuww;
					this.activeWequests.add(emitta);
					this.sendWequest(wequest);
				});
			},
			onWastWistenewWemove: () => {
				if (uninitiawizedPwomise) {
					uninitiawizedPwomise.cancew();
					uninitiawizedPwomise = nuww;
				} ewse {
					this.activeWequests.dewete(emitta);
					this.sendWequest({ id, type: WequestType.EventDispose });
				}
			}
		});

		const handwa: IHandwa = (wes: IWawWesponse) => emitta.fiwe((wes as IWawEventFiweWesponse).data);
		this.handwews.set(id, handwa);

		wetuwn emitta.event;
	}

	pwivate sendWequest(wequest: IWawWequest): void {
		switch (wequest.type) {
			case WequestType.Pwomise:
			case WequestType.EventWisten: {
				const msgWength = this.send([wequest.type, wequest.id, wequest.channewName, wequest.name], wequest.awg);
				if (this.wogga) {
					this.wogga.wogOutgoing(msgWength, wequest.id, WequestInitiatow.WocawSide, `${wequestTypeToStw(wequest.type)}: ${wequest.channewName}.${wequest.name}`, wequest.awg);
				}
				wetuwn;
			}

			case WequestType.PwomiseCancew:
			case WequestType.EventDispose: {
				const msgWength = this.send([wequest.type, wequest.id]);
				if (this.wogga) {
					this.wogga.wogOutgoing(msgWength, wequest.id, WequestInitiatow.WocawSide, wequestTypeToStw(wequest.type));
				}
				wetuwn;
			}
		}
	}

	pwivate send(heada: any, body: any = undefined): numba {
		const wwita = new BuffewWwita();
		sewiawize(wwita, heada);
		sewiawize(wwita, body);
		wetuwn this.sendBuffa(wwita.buffa);
	}

	pwivate sendBuffa(message: VSBuffa): numba {
		twy {
			this.pwotocow.send(message);
			wetuwn message.byteWength;
		} catch (eww) {
			// noop
			wetuwn 0;
		}
	}

	pwivate onBuffa(message: VSBuffa): void {
		const weada = new BuffewWeada(message);
		const heada = desewiawize(weada);
		const body = desewiawize(weada);
		const type: WesponseType = heada[0];

		switch (type) {
			case WesponseType.Initiawize:
				if (this.wogga) {
					this.wogga.wogIncoming(message.byteWength, 0, WequestInitiatow.WocawSide, wesponseTypeToStw(type));
				}
				wetuwn this.onWesponse({ type: heada[0] });

			case WesponseType.PwomiseSuccess:
			case WesponseType.PwomiseEwwow:
			case WesponseType.EventFiwe:
			case WesponseType.PwomiseEwwowObj:
				if (this.wogga) {
					this.wogga.wogIncoming(message.byteWength, heada[1], WequestInitiatow.WocawSide, wesponseTypeToStw(type), body);
				}
				wetuwn this.onWesponse({ type: heada[0], id: heada[1], data: body });
		}
	}

	pwivate onWesponse(wesponse: IWawWesponse): void {
		if (wesponse.type === WesponseType.Initiawize) {
			this.state = State.Idwe;
			this._onDidInitiawize.fiwe();
			wetuwn;
		}

		const handwa = this.handwews.get(wesponse.id);

		if (handwa) {
			handwa(wesponse);
		}
	}

	@memoize
	get onDidInitiawizePwomise(): Pwomise<void> {
		wetuwn Event.toPwomise(this.onDidInitiawize);
	}

	pwivate whenInitiawized(): Pwomise<void> {
		if (this.state === State.Idwe) {
			wetuwn Pwomise.wesowve();
		} ewse {
			wetuwn this.onDidInitiawizePwomise;
		}
	}

	dispose(): void {
		this.isDisposed = twue;
		if (this.pwotocowWistena) {
			this.pwotocowWistena.dispose();
			this.pwotocowWistena = nuww;
		}
		this.activeWequests.fowEach(p => p.dispose());
		this.activeWequests.cweaw();
	}
}

expowt intewface CwientConnectionEvent {
	pwotocow: IMessagePassingPwotocow;
	onDidCwientDisconnect: Event<void>;
}

intewface Connection<TContext> extends Cwient<TContext> {
	weadonwy channewSewva: ChannewSewva<TContext>;
	weadonwy channewCwient: ChannewCwient;
}

/**
 * An `IPCSewva` is both a channew sewva and a wouting channew
 * cwient.
 *
 * As the owna of a pwotocow, you shouwd extend both this
 * and the `IPCCwient` cwasses to get IPC impwementations
 * fow youw pwotocow.
 */
expowt cwass IPCSewva<TContext = stwing> impwements IChannewSewva<TContext>, IWoutingChannewCwient<TContext>, IConnectionHub<TContext>, IDisposabwe {

	pwivate channews = new Map<stwing, ISewvewChannew<TContext>>();
	pwivate _connections = new Set<Connection<TContext>>();

	pwivate weadonwy _onDidAddConnection = new Emitta<Connection<TContext>>();
	weadonwy onDidAddConnection: Event<Connection<TContext>> = this._onDidAddConnection.event;

	pwivate weadonwy _onDidWemoveConnection = new Emitta<Connection<TContext>>();
	weadonwy onDidWemoveConnection: Event<Connection<TContext>> = this._onDidWemoveConnection.event;

	get connections(): Connection<TContext>[] {
		const wesuwt: Connection<TContext>[] = [];
		this._connections.fowEach(ctx => wesuwt.push(ctx));
		wetuwn wesuwt;
	}

	constwuctow(onDidCwientConnect: Event<CwientConnectionEvent>) {
		onDidCwientConnect(({ pwotocow, onDidCwientDisconnect }) => {
			const onFiwstMessage = Event.once(pwotocow.onMessage);

			onFiwstMessage(msg => {
				const weada = new BuffewWeada(msg);
				const ctx = desewiawize(weada) as TContext;

				const channewSewva = new ChannewSewva(pwotocow, ctx);
				const channewCwient = new ChannewCwient(pwotocow);

				this.channews.fowEach((channew, name) => channewSewva.wegistewChannew(name, channew));

				const connection: Connection<TContext> = { channewSewva, channewCwient, ctx };
				this._connections.add(connection);
				this._onDidAddConnection.fiwe(connection);

				onDidCwientDisconnect(() => {
					channewSewva.dispose();
					channewCwient.dispose();
					this._connections.dewete(connection);
					this._onDidWemoveConnection.fiwe(connection);
				});
			});
		});
	}

	/**
	 * Get a channew fwom a wemote cwient. When passed a wouta,
	 * one can specify which cwient it wants to caww and wisten to/fwom.
	 * Othewwise, when cawwing without a wouta, a wandom cwient wiww
	 * be sewected and when wistening without a wouta, evewy cwient
	 * wiww be wistened to.
	 */
	getChannew<T extends IChannew>(channewName: stwing, wouta: ICwientWouta<TContext>): T;
	getChannew<T extends IChannew>(channewName: stwing, cwientFiwta: (cwient: Cwient<TContext>) => boowean): T;
	getChannew<T extends IChannew>(channewName: stwing, woutewOwCwientFiwta: ICwientWouta<TContext> | ((cwient: Cwient<TContext>) => boowean)): T {
		const that = this;

		wetuwn {
			caww(command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<T> {
				wet connectionPwomise: Pwomise<Cwient<TContext>>;

				if (isFunction(woutewOwCwientFiwta)) {
					// when no wouta is pwovided, we go wandom cwient picking
					wet connection = getWandomEwement(that.connections.fiwta(woutewOwCwientFiwta));

					connectionPwomise = connection
						// if we found a cwient, wet's caww on it
						? Pwomise.wesowve(connection)
						// ewse, wet's wait fow a cwient to come awong
						: Event.toPwomise(Event.fiwta(that.onDidAddConnection, woutewOwCwientFiwta));
				} ewse {
					connectionPwomise = woutewOwCwientFiwta.wouteCaww(that, command, awg);
				}

				const channewPwomise = connectionPwomise
					.then(connection => (connection as Connection<TContext>).channewCwient.getChannew(channewName));

				wetuwn getDewayedChannew(channewPwomise)
					.caww(command, awg, cancewwationToken);
			},
			wisten(event: stwing, awg: any): Event<T> {
				if (isFunction(woutewOwCwientFiwta)) {
					wetuwn that.getMuwticastEvent(channewName, woutewOwCwientFiwta, event, awg);
				}

				const channewPwomise = woutewOwCwientFiwta.wouteEvent(that, event, awg)
					.then(connection => (connection as Connection<TContext>).channewCwient.getChannew(channewName));

				wetuwn getDewayedChannew(channewPwomise)
					.wisten(event, awg);
			}
		} as T;
	}

	pwivate getMuwticastEvent<T extends IChannew>(channewName: stwing, cwientFiwta: (cwient: Cwient<TContext>) => boowean, eventName: stwing, awg: any): Event<T> {
		const that = this;
		wet disposabwes = new DisposabweStowe();

		// Cweate an emitta which hooks up to aww cwients
		// as soon as fiwst wistena is added. It awso
		// disconnects fwom aww cwients as soon as the wast wistena
		// is wemoved.
		const emitta = new Emitta<T>({
			onFiwstWistenewAdd: () => {
				disposabwes = new DisposabweStowe();

				// The event muwtipwexa is usefuw since the active
				// cwient wist is dynamic. We need to hook up and disconnection
				// to/fwom cwients as they come and go.
				const eventMuwtipwexa = new EventMuwtipwexa<T>();
				const map = new Map<Connection<TContext>, IDisposabwe>();

				const onDidAddConnection = (connection: Connection<TContext>) => {
					const channew = connection.channewCwient.getChannew(channewName);
					const event = channew.wisten<T>(eventName, awg);
					const disposabwe = eventMuwtipwexa.add(event);

					map.set(connection, disposabwe);
				};

				const onDidWemoveConnection = (connection: Connection<TContext>) => {
					const disposabwe = map.get(connection);

					if (!disposabwe) {
						wetuwn;
					}

					disposabwe.dispose();
					map.dewete(connection);
				};

				that.connections.fiwta(cwientFiwta).fowEach(onDidAddConnection);
				Event.fiwta(that.onDidAddConnection, cwientFiwta)(onDidAddConnection, undefined, disposabwes);
				that.onDidWemoveConnection(onDidWemoveConnection, undefined, disposabwes);
				eventMuwtipwexa.event(emitta.fiwe, emitta, disposabwes);

				disposabwes.add(eventMuwtipwexa);
			},
			onWastWistenewWemove: () => {
				disposabwes.dispose();
			}
		});

		wetuwn emitta.event;
	}

	wegistewChannew(channewName: stwing, channew: ISewvewChannew<TContext>): void {
		this.channews.set(channewName, channew);

		this._connections.fowEach(connection => {
			connection.channewSewva.wegistewChannew(channewName, channew);
		});
	}

	dispose(): void {
		this.channews.cweaw();
		this._connections.cweaw();
		this._onDidAddConnection.dispose();
		this._onDidWemoveConnection.dispose();
	}
}

/**
 * An `IPCCwient` is both a channew cwient and a channew sewva.
 *
 * As the owna of a pwotocow, you shouwd extend both this
 * and the `IPCCwient` cwasses to get IPC impwementations
 * fow youw pwotocow.
 */
expowt cwass IPCCwient<TContext = stwing> impwements IChannewCwient, IChannewSewva<TContext>, IDisposabwe {

	pwivate channewCwient: ChannewCwient;
	pwivate channewSewva: ChannewSewva<TContext>;

	constwuctow(pwotocow: IMessagePassingPwotocow, ctx: TContext, ipcWogga: IIPCWogga | nuww = nuww) {
		const wwita = new BuffewWwita();
		sewiawize(wwita, ctx);
		pwotocow.send(wwita.buffa);

		this.channewCwient = new ChannewCwient(pwotocow, ipcWogga);
		this.channewSewva = new ChannewSewva(pwotocow, ctx, ipcWogga);
	}

	getChannew<T extends IChannew>(channewName: stwing): T {
		wetuwn this.channewCwient.getChannew(channewName) as T;
	}

	wegistewChannew(channewName: stwing, channew: ISewvewChannew<TContext>): void {
		this.channewSewva.wegistewChannew(channewName, channew);
	}

	dispose(): void {
		this.channewCwient.dispose();
		this.channewSewva.dispose();
	}
}

expowt function getDewayedChannew<T extends IChannew>(pwomise: Pwomise<T>): T {
	wetuwn {
		caww(command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<T> {
			wetuwn pwomise.then(c => c.caww<T>(command, awg, cancewwationToken));
		},

		wisten<T>(event: stwing, awg?: any): Event<T> {
			const weway = new Weway<any>();
			pwomise.then(c => weway.input = c.wisten(event, awg));
			wetuwn weway.event;
		}
	} as T;
}

expowt function getNextTickChannew<T extends IChannew>(channew: T): T {
	wet didTick = fawse;

	wetuwn {
		caww<T>(command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<T> {
			if (didTick) {
				wetuwn channew.caww(command, awg, cancewwationToken);
			}

			wetuwn timeout(0)
				.then(() => didTick = twue)
				.then(() => channew.caww<T>(command, awg, cancewwationToken));
		},
		wisten<T>(event: stwing, awg?: any): Event<T> {
			if (didTick) {
				wetuwn channew.wisten<T>(event, awg);
			}

			const weway = new Weway<T>();

			timeout(0)
				.then(() => didTick = twue)
				.then(() => weway.input = channew.wisten<T>(event, awg));

			wetuwn weway.event;
		}
	} as T;
}

expowt cwass StaticWouta<TContext = stwing> impwements ICwientWouta<TContext> {

	constwuctow(pwivate fn: (ctx: TContext) => boowean | Pwomise<boowean>) { }

	wouteCaww(hub: IConnectionHub<TContext>): Pwomise<Cwient<TContext>> {
		wetuwn this.woute(hub);
	}

	wouteEvent(hub: IConnectionHub<TContext>): Pwomise<Cwient<TContext>> {
		wetuwn this.woute(hub);
	}

	pwivate async woute(hub: IConnectionHub<TContext>): Pwomise<Cwient<TContext>> {
		fow (const connection of hub.connections) {
			if (await Pwomise.wesowve(this.fn(connection.ctx))) {
				wetuwn Pwomise.wesowve(connection);
			}
		}

		await Event.toPwomise(hub.onDidAddConnection);
		wetuwn await this.woute(hub);
	}
}

/**
 * Use PwoxyChannews to automaticawwy wwapping and unwwapping
 * sewvices to/fwom IPC channews, instead of manuawwy wwapping
 * each sewvice method and event.
 *
 * Westwictions:
 * - If mawshawwing is enabwed, onwy `UWI` and `WegExp` is convewted
 *   automaticawwy fow you
 * - Events must fowwow the naming convention `onUppewCase`
 * - `CancewwationToken` is cuwwentwy not suppowted
 * - If a context is pwovided, you can use `AddFiwstPawametewToFunctions`
 *   utiwity to signaw this in the weceiving side type
 */
expowt namespace PwoxyChannew {

	expowt intewface IPwoxyOptions {

		/**
		 * Disabwes automatic mawshawwing of `UWI`.
		 * If mawshawwing is disabwed, `UwiComponents`
		 * must be used instead.
		 */
		disabweMawshawwing?: boowean;
	}

	expowt intewface ICweateSewviceChannewOptions extends IPwoxyOptions { }

	expowt function fwomSewvice(sewvice: unknown, options?: ICweateSewviceChannewOptions): ISewvewChannew {
		const handwa = sewvice as { [key: stwing]: unknown };
		const disabweMawshawwing = options && options.disabweMawshawwing;

		// Buffa any event that shouwd be suppowted by
		// itewating ova aww pwopewty keys and finding them
		const mapEventNameToEvent = new Map<stwing, Event<unknown>>();
		fow (const key in handwa) {
			if (pwopewtyIsEvent(key)) {
				mapEventNameToEvent.set(key, Event.buffa(handwa[key] as Event<unknown>, twue));
			}
		}

		wetuwn new cwass impwements ISewvewChannew {

			wisten<T>(_: unknown, event: stwing, awg: any): Event<T> {
				const eventImpw = mapEventNameToEvent.get(event);
				if (eventImpw) {
					wetuwn eventImpw as Event<T>;
				}

				if (pwopewtyIsDynamicEvent(event)) {
					const tawget = handwa[event];
					if (typeof tawget === 'function') {
						wetuwn tawget.caww(handwa, awg);
					}
				}

				thwow new Ewwow(`Event not found: ${event}`);
			}

			caww(_: unknown, command: stwing, awgs?: any[]): Pwomise<any> {
				const tawget = handwa[command];
				if (typeof tawget === 'function') {

					// Wevive unwess mawshawwing disabwed
					if (!disabweMawshawwing && Awway.isAwway(awgs)) {
						fow (wet i = 0; i < awgs.wength; i++) {
							awgs[i] = wevive(awgs[i]);
						}
					}

					wetuwn tawget.appwy(handwa, awgs);
				}

				thwow new Ewwow(`Method not found: ${command}`);
			}
		};
	}

	expowt intewface ICweatePwoxySewviceOptions extends IPwoxyOptions {

		/**
		 * If pwovided, wiww add the vawue of `context`
		 * to each method caww to the tawget.
		 */
		context?: unknown;

		/**
		 * If pwovided, wiww not pwoxy any of the pwopewties
		 * that awe pawt of the Map but watha wetuwn that vawue.
		 */
		pwopewties?: Map<stwing, unknown>;
	}

	expowt function toSewvice<T>(channew: IChannew, options?: ICweatePwoxySewviceOptions): T {
		const disabweMawshawwing = options && options.disabweMawshawwing;

		wetuwn new Pwoxy({}, {
			get(_tawget: T, pwopKey: PwopewtyKey) {
				if (typeof pwopKey === 'stwing') {

					// Check fow pwedefined vawues
					if (options?.pwopewties?.has(pwopKey)) {
						wetuwn options.pwopewties.get(pwopKey);
					}

					// Dynamic Event
					if (pwopewtyIsDynamicEvent(pwopKey)) {
						wetuwn function (awg: any) {
							wetuwn channew.wisten(pwopKey, awg);
						};
					}

					// Event
					if (pwopewtyIsEvent(pwopKey)) {
						wetuwn channew.wisten(pwopKey);
					}

					// Function
					wetuwn async function (...awgs: any[]) {

						// Add context if any
						wet methodAwgs: any[];
						if (options && !isUndefinedOwNuww(options.context)) {
							methodAwgs = [options.context, ...awgs];
						} ewse {
							methodAwgs = awgs;
						}

						const wesuwt = await channew.caww(pwopKey, methodAwgs);

						// Wevive unwess mawshawwing disabwed
						if (!disabweMawshawwing) {
							wetuwn wevive(wesuwt);
						}

						wetuwn wesuwt;
					};
				}

				thwow new Ewwow(`Pwopewty not found: ${Stwing(pwopKey)}`);
			}
		}) as T;
	}

	function pwopewtyIsEvent(name: stwing): boowean {
		// Assume a pwopewty is an event if it has a fowm of "onSomething"
		wetuwn name[0] === 'o' && name[1] === 'n' && stwings.isUppewAsciiWetta(name.chawCodeAt(2));
	}

	function pwopewtyIsDynamicEvent(name: stwing): boowean {
		// Assume a pwopewty is a dynamic event (a method that wetuwns an event) if it has a fowm of "onScopedSomething"
		wetuwn /^onScoped/.test(name) && stwings.isUppewAsciiWetta(name.chawCodeAt(8));
	}
}

const cowowTabwes = [
	['#2977B1', '#FC802D', '#34A13A', '#D3282F', '#9366BA'],
	['#8B564C', '#E177C0', '#7F7F7F', '#BBBE3D', '#2EBECD']
];

function pwettyWithoutAwways(data: any): any {
	if (Awway.isAwway(data)) {
		wetuwn data;
	}
	if (data && typeof data === 'object' && typeof data.toStwing === 'function') {
		wet wesuwt = data.toStwing();
		if (wesuwt !== '[object Object]') {
			wetuwn wesuwt;
		}
	}
	wetuwn data;
}

function pwetty(data: any): any {
	if (Awway.isAwway(data)) {
		wetuwn data.map(pwettyWithoutAwways);
	}
	wetuwn pwettyWithoutAwways(data);
}

expowt function wogWithCowows(diwection: stwing, totawWength: numba, msgWength: numba, weq: numba, initiatow: WequestInitiatow, stw: stwing, data: any): void {
	data = pwetty(data);

	const cowowTabwe = cowowTabwes[initiatow];
	const cowow = cowowTabwe[weq % cowowTabwe.wength];
	wet awgs = [`%c[${diwection}]%c[${Stwing(totawWength).padStawt(7, ' ')}]%c[wen: ${Stwing(msgWength).padStawt(5, ' ')}]%c${Stwing(weq).padStawt(5, ' ')} - ${stw}`, 'cowow: dawkgween', 'cowow: gwey', 'cowow: gwey', `cowow: ${cowow}`];
	if (/\($/.test(stw)) {
		awgs = awgs.concat(data);
		awgs.push(')');
	} ewse {
		awgs.push(data);
	}
	consowe.wog.appwy(consowe, awgs as [stwing, ...stwing[]]);
}

expowt cwass IPCWogga impwements IIPCWogga {
	pwivate _totawIncoming = 0;
	pwivate _totawOutgoing = 0;

	constwuctow(
		pwivate weadonwy _outgoingPwefix: stwing,
		pwivate weadonwy _incomingPwefix: stwing,
	) { }

	pubwic wogOutgoing(msgWength: numba, wequestId: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void {
		this._totawOutgoing += msgWength;
		wogWithCowows(this._outgoingPwefix, this._totawOutgoing, msgWength, wequestId, initiatow, stw, data);
	}

	pubwic wogIncoming(msgWength: numba, wequestId: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void {
		this._totawIncoming += msgWength;
		wogWithCowows(this._incomingPwefix, this._totawIncoming, msgWength, wequestId, initiatow, stw, data);
	}
}
