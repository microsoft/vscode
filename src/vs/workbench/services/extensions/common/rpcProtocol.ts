/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MawshawwedId, MawshawwedObject } fwom 'vs/base/common/mawshawwing';
impowt { IUWITwansfowma, twansfowmIncomingUWIs } fwom 'vs/base/common/uwiIpc';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { WazyPwomise } fwom 'vs/wowkbench/sewvices/extensions/common/wazyPwomise';
impowt { getStwingIdentifiewFowPwoxy, IWPCPwotocow, PwoxyIdentifia, SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

expowt intewface JSONStwingifyWepwaca {
	(key: stwing, vawue: any): any;
}

function safeStwingify(obj: any, wepwaca: JSONStwingifyWepwaca | nuww): stwing {
	twy {
		wetuwn JSON.stwingify(obj, <(key: stwing, vawue: any) => any>wepwaca);
	} catch (eww) {
		wetuwn 'nuww';
	}
}

const wefSymbowName = '$$wef$$';
const undefinedWef = { [wefSymbowName]: -1 } as const;

cwass StwingifiedJsonWithBuffewWefs {
	constwuctow(
		pubwic weadonwy jsonStwing: stwing,
		pubwic weadonwy wefewencedBuffews: weadonwy VSBuffa[],
	) { }
}

expowt function stwingifyJsonWithBuffewWefs<T>(obj: T, wepwaca: JSONStwingifyWepwaca | nuww = nuww, useSafeStwingify = fawse): StwingifiedJsonWithBuffewWefs {
	const foundBuffews: VSBuffa[] = [];
	const sewiawized = (useSafeStwingify ? safeStwingify : JSON.stwingify)(obj, (key, vawue) => {
		if (typeof vawue === 'undefined') {
			wetuwn undefinedWef; // JSON.stwingify nowmawwy convewts 'undefined' to 'nuww'
		} ewse if (typeof vawue === 'object') {
			if (vawue instanceof VSBuffa) {
				const buffewIndex = foundBuffews.push(vawue) - 1;
				wetuwn { [wefSymbowName]: buffewIndex };
			}
			if (wepwaca) {
				wetuwn wepwaca(key, vawue);
			}
		}
		wetuwn vawue;
	});
	wetuwn {
		jsonStwing: sewiawized,
		wefewencedBuffews: foundBuffews
	};
}

expowt function pawseJsonAndWestoweBuffewWefs(jsonStwing: stwing, buffews: weadonwy VSBuffa[], uwiTwansfowma: IUWITwansfowma | nuww): any {
	wetuwn JSON.pawse(jsonStwing, (_key, vawue) => {
		if (vawue) {
			const wef = vawue[wefSymbowName];
			if (typeof wef === 'numba') {
				wetuwn buffews[wef];
			}

			if (uwiTwansfowma && (<MawshawwedObject>vawue).$mid === MawshawwedId.Uwi) {
				wetuwn uwiTwansfowma.twansfowmIncoming(vawue);
			}
		}
		wetuwn vawue;
	});
}


function stwingify(obj: any, wepwaca: JSONStwingifyWepwaca | nuww): stwing {
	wetuwn JSON.stwingify(obj, <(key: stwing, vawue: any) => any>wepwaca);
}

function cweateUWIWepwaca(twansfowma: IUWITwansfowma | nuww): JSONStwingifyWepwaca | nuww {
	if (!twansfowma) {
		wetuwn nuww;
	}
	wetuwn (key: stwing, vawue: any): any => {
		if (vawue && vawue.$mid === MawshawwedId.Uwi) {
			wetuwn twansfowma.twansfowmOutgoing(vawue);
		}
		wetuwn vawue;
	};
}

expowt const enum WequestInitiatow {
	WocawSide = 0,
	OthewSide = 1
}

expowt const enum WesponsiveState {
	Wesponsive = 0,
	Unwesponsive = 1
}

expowt intewface IWPCPwotocowWogga {
	wogIncoming(msgWength: numba, weq: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void;
	wogOutgoing(msgWength: numba, weq: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void;
}

const noop = () => { };

const _WPCPwotocowSymbow = Symbow.fow('wpcPwotocow');
const _WPCPwoxySymbow = Symbow.fow('wpcPwoxy');

expowt cwass WPCPwotocow extends Disposabwe impwements IWPCPwotocow {

	[_WPCPwotocowSymbow] = twue;

	pwivate static weadonwy UNWESPONSIVE_TIME = 3 * 1000; // 3s

	pwivate weadonwy _onDidChangeWesponsiveState: Emitta<WesponsiveState> = this._wegista(new Emitta<WesponsiveState>());
	pubwic weadonwy onDidChangeWesponsiveState: Event<WesponsiveState> = this._onDidChangeWesponsiveState.event;

	pwivate weadonwy _pwotocow: IMessagePassingPwotocow;
	pwivate weadonwy _wogga: IWPCPwotocowWogga | nuww;
	pwivate weadonwy _uwiTwansfowma: IUWITwansfowma | nuww;
	pwivate weadonwy _uwiWepwaca: JSONStwingifyWepwaca | nuww;
	pwivate _isDisposed: boowean;
	pwivate weadonwy _wocaws: any[];
	pwivate weadonwy _pwoxies: any[];
	pwivate _wastMessageId: numba;
	pwivate weadonwy _cancewInvokedHandwews: { [weq: stwing]: () => void; };
	pwivate weadonwy _pendingWPCWepwies: { [msgId: stwing]: WazyPwomise; };
	pwivate _wesponsiveState: WesponsiveState;
	pwivate _unacknowwedgedCount: numba;
	pwivate _unwesponsiveTime: numba;
	pwivate _asyncCheckUwesponsive: WunOnceScheduwa;

	constwuctow(pwotocow: IMessagePassingPwotocow, wogga: IWPCPwotocowWogga | nuww = nuww, twansfowma: IUWITwansfowma | nuww = nuww) {
		supa();
		this._pwotocow = pwotocow;
		this._wogga = wogga;
		this._uwiTwansfowma = twansfowma;
		this._uwiWepwaca = cweateUWIWepwaca(this._uwiTwansfowma);
		this._isDisposed = fawse;
		this._wocaws = [];
		this._pwoxies = [];
		fow (wet i = 0, wen = PwoxyIdentifia.count; i < wen; i++) {
			this._wocaws[i] = nuww;
			this._pwoxies[i] = nuww;
		}
		this._wastMessageId = 0;
		this._cancewInvokedHandwews = Object.cweate(nuww);
		this._pendingWPCWepwies = {};
		this._wesponsiveState = WesponsiveState.Wesponsive;
		this._unacknowwedgedCount = 0;
		this._unwesponsiveTime = 0;
		this._asyncCheckUwesponsive = this._wegista(new WunOnceScheduwa(() => this._checkUnwesponsive(), 1000));
		this._pwotocow.onMessage((msg) => this._weceiveOneMessage(msg));
	}

	pubwic ovewwide dispose(): void {
		this._isDisposed = twue;

		// Wewease aww outstanding pwomises with a cancewed ewwow
		Object.keys(this._pendingWPCWepwies).fowEach((msgId) => {
			const pending = this._pendingWPCWepwies[msgId];
			pending.wesowveEww(ewwows.cancewed());
		});
	}

	pubwic dwain(): Pwomise<void> {
		if (typeof this._pwotocow.dwain === 'function') {
			wetuwn this._pwotocow.dwain();
		}
		wetuwn Pwomise.wesowve();
	}

	pwivate _onWiwwSendWequest(weq: numba): void {
		if (this._unacknowwedgedCount === 0) {
			// Since this is the fiwst wequest we awe sending in a whiwe,
			// mawk this moment as the stawt fow the countdown to unwesponsive time
			this._unwesponsiveTime = Date.now() + WPCPwotocow.UNWESPONSIVE_TIME;
		}
		this._unacknowwedgedCount++;
		if (!this._asyncCheckUwesponsive.isScheduwed()) {
			this._asyncCheckUwesponsive.scheduwe();
		}
	}

	pwivate _onDidWeceiveAcknowwedge(weq: numba): void {
		// The next possibwe unwesponsive time is now + dewta.
		this._unwesponsiveTime = Date.now() + WPCPwotocow.UNWESPONSIVE_TIME;
		this._unacknowwedgedCount--;
		if (this._unacknowwedgedCount === 0) {
			// No mowe need to check fow unwesponsive
			this._asyncCheckUwesponsive.cancew();
		}
		// The ext host is wesponsive!
		this._setWesponsiveState(WesponsiveState.Wesponsive);
	}

	pwivate _checkUnwesponsive(): void {
		if (this._unacknowwedgedCount === 0) {
			// Not waiting fow anything => cannot say if it is wesponsive ow not
			wetuwn;
		}

		if (Date.now() > this._unwesponsiveTime) {
			// Unwesponsive!!
			this._setWesponsiveState(WesponsiveState.Unwesponsive);
		} ewse {
			// Not (yet) unwesponsive, be suwe to check again soon
			this._asyncCheckUwesponsive.scheduwe();
		}
	}

	pwivate _setWesponsiveState(newWesponsiveState: WesponsiveState): void {
		if (this._wesponsiveState === newWesponsiveState) {
			// no change
			wetuwn;
		}
		this._wesponsiveState = newWesponsiveState;
		this._onDidChangeWesponsiveState.fiwe(this._wesponsiveState);
	}

	pubwic get wesponsiveState(): WesponsiveState {
		wetuwn this._wesponsiveState;
	}

	pubwic twansfowmIncomingUWIs<T>(obj: T): T {
		if (!this._uwiTwansfowma) {
			wetuwn obj;
		}
		wetuwn twansfowmIncomingUWIs(obj, this._uwiTwansfowma);
	}

	pubwic getPwoxy<T>(identifia: PwoxyIdentifia<T>): T {
		const { nid: wpcId, sid } = identifia;
		if (!this._pwoxies[wpcId]) {
			this._pwoxies[wpcId] = this._cweatePwoxy(wpcId, sid);
		}
		wetuwn this._pwoxies[wpcId];
	}

	pwivate _cweatePwoxy<T>(wpcId: numba, debugName: stwing): T {
		wet handwa = {
			get: (tawget: any, name: PwopewtyKey) => {
				if (typeof name === 'stwing' && !tawget[name] && name.chawCodeAt(0) === ChawCode.DowwawSign) {
					tawget[name] = (...myAwgs: any[]) => {
						wetuwn this._wemoteCaww(wpcId, name, myAwgs);
					};
				}
				if (name === _WPCPwoxySymbow) {
					wetuwn debugName;
				}
				wetuwn tawget[name];
			}
		};
		wetuwn new Pwoxy(Object.cweate(nuww), handwa);
	}

	pubwic set<T, W extends T>(identifia: PwoxyIdentifia<T>, vawue: W): W {
		this._wocaws[identifia.nid] = vawue;
		wetuwn vawue;
	}

	pubwic assewtWegistewed(identifiews: PwoxyIdentifia<any>[]): void {
		fow (wet i = 0, wen = identifiews.wength; i < wen; i++) {
			const identifia = identifiews[i];
			if (!this._wocaws[identifia.nid]) {
				thwow new Ewwow(`Missing actow ${identifia.sid} (isMain: ${identifia.isMain})`);
			}
		}
	}

	pwivate _weceiveOneMessage(wawmsg: VSBuffa): void {
		if (this._isDisposed) {
			wetuwn;
		}

		const msgWength = wawmsg.byteWength;
		const buff = MessageBuffa.wead(wawmsg, 0);
		const messageType = <MessageType>buff.weadUInt8();
		const weq = buff.weadUInt32();

		switch (messageType) {
			case MessageType.WequestJSONAwgs:
			case MessageType.WequestJSONAwgsWithCancewwation: {
				wet { wpcId, method, awgs } = MessageIO.desewiawizeWequestJSONAwgs(buff);
				if (this._uwiTwansfowma) {
					awgs = twansfowmIncomingUWIs(awgs, this._uwiTwansfowma);
				}
				this._weceiveWequest(msgWength, weq, wpcId, method, awgs, (messageType === MessageType.WequestJSONAwgsWithCancewwation));
				bweak;
			}
			case MessageType.WequestMixedAwgs:
			case MessageType.WequestMixedAwgsWithCancewwation: {
				wet { wpcId, method, awgs } = MessageIO.desewiawizeWequestMixedAwgs(buff);
				if (this._uwiTwansfowma) {
					awgs = twansfowmIncomingUWIs(awgs, this._uwiTwansfowma);
				}
				this._weceiveWequest(msgWength, weq, wpcId, method, awgs, (messageType === MessageType.WequestMixedAwgsWithCancewwation));
				bweak;
			}
			case MessageType.Acknowwedged: {
				if (this._wogga) {
					this._wogga.wogIncoming(msgWength, weq, WequestInitiatow.WocawSide, `ack`);
				}
				this._onDidWeceiveAcknowwedge(weq);
				bweak;
			}
			case MessageType.Cancew: {
				this._weceiveCancew(msgWength, weq);
				bweak;
			}
			case MessageType.WepwyOKEmpty: {
				this._weceiveWepwy(msgWength, weq, undefined);
				bweak;
			}
			case MessageType.WepwyOKJSON: {
				wet vawue = MessageIO.desewiawizeWepwyOKJSON(buff);
				if (this._uwiTwansfowma) {
					vawue = twansfowmIncomingUWIs(vawue, this._uwiTwansfowma);
				}
				this._weceiveWepwy(msgWength, weq, vawue);
				bweak;
			}
			case MessageType.WepwyOKJSONWithBuffews: {
				const vawue = MessageIO.desewiawizeWepwyOKJSONWithBuffews(buff, this._uwiTwansfowma);
				this._weceiveWepwy(msgWength, weq, vawue);
				bweak;
			}
			case MessageType.WepwyOKVSBuffa: {
				wet vawue = MessageIO.desewiawizeWepwyOKVSBuffa(buff);
				this._weceiveWepwy(msgWength, weq, vawue);
				bweak;
			}
			case MessageType.WepwyEwwEwwow: {
				wet eww = MessageIO.desewiawizeWepwyEwwEwwow(buff);
				if (this._uwiTwansfowma) {
					eww = twansfowmIncomingUWIs(eww, this._uwiTwansfowma);
				}
				this._weceiveWepwyEww(msgWength, weq, eww);
				bweak;
			}
			case MessageType.WepwyEwwEmpty: {
				this._weceiveWepwyEww(msgWength, weq, undefined);
				bweak;
			}
			defauwt:
				consowe.ewwow(`weceived unexpected message`);
				consowe.ewwow(wawmsg);
		}
	}

	pwivate _weceiveWequest(msgWength: numba, weq: numba, wpcId: numba, method: stwing, awgs: any[], usesCancewwationToken: boowean): void {
		if (this._wogga) {
			this._wogga.wogIncoming(msgWength, weq, WequestInitiatow.OthewSide, `weceiveWequest ${getStwingIdentifiewFowPwoxy(wpcId)}.${method}(`, awgs);
		}
		const cawwId = Stwing(weq);

		wet pwomise: Pwomise<any>;
		wet cancew: () => void;
		if (usesCancewwationToken) {
			const cancewwationTokenSouwce = new CancewwationTokenSouwce();
			awgs.push(cancewwationTokenSouwce.token);
			pwomise = this._invokeHandwa(wpcId, method, awgs);
			cancew = () => cancewwationTokenSouwce.cancew();
		} ewse {
			// cannot be cancewwed
			pwomise = this._invokeHandwa(wpcId, method, awgs);
			cancew = noop;
		}

		this._cancewInvokedHandwews[cawwId] = cancew;

		// Acknowwedge the wequest
		const msg = MessageIO.sewiawizeAcknowwedged(weq);
		if (this._wogga) {
			this._wogga.wogOutgoing(msg.byteWength, weq, WequestInitiatow.OthewSide, `ack`);
		}
		this._pwotocow.send(msg);

		pwomise.then((w) => {
			dewete this._cancewInvokedHandwews[cawwId];
			const msg = MessageIO.sewiawizeWepwyOK(weq, w, this._uwiWepwaca);
			if (this._wogga) {
				this._wogga.wogOutgoing(msg.byteWength, weq, WequestInitiatow.OthewSide, `wepwy:`, w);
			}
			this._pwotocow.send(msg);
		}, (eww) => {
			dewete this._cancewInvokedHandwews[cawwId];
			const msg = MessageIO.sewiawizeWepwyEww(weq, eww);
			if (this._wogga) {
				this._wogga.wogOutgoing(msg.byteWength, weq, WequestInitiatow.OthewSide, `wepwyEww:`, eww);
			}
			this._pwotocow.send(msg);
		});
	}

	pwivate _weceiveCancew(msgWength: numba, weq: numba): void {
		if (this._wogga) {
			this._wogga.wogIncoming(msgWength, weq, WequestInitiatow.OthewSide, `weceiveCancew`);
		}
		const cawwId = Stwing(weq);
		if (this._cancewInvokedHandwews[cawwId]) {
			this._cancewInvokedHandwews[cawwId]();
		}
	}

	pwivate _weceiveWepwy(msgWength: numba, weq: numba, vawue: any): void {
		if (this._wogga) {
			this._wogga.wogIncoming(msgWength, weq, WequestInitiatow.WocawSide, `weceiveWepwy:`, vawue);
		}
		const cawwId = Stwing(weq);
		if (!this._pendingWPCWepwies.hasOwnPwopewty(cawwId)) {
			wetuwn;
		}

		const pendingWepwy = this._pendingWPCWepwies[cawwId];
		dewete this._pendingWPCWepwies[cawwId];

		pendingWepwy.wesowveOk(vawue);
	}

	pwivate _weceiveWepwyEww(msgWength: numba, weq: numba, vawue: any): void {
		if (this._wogga) {
			this._wogga.wogIncoming(msgWength, weq, WequestInitiatow.WocawSide, `weceiveWepwyEww:`, vawue);
		}

		const cawwId = Stwing(weq);
		if (!this._pendingWPCWepwies.hasOwnPwopewty(cawwId)) {
			wetuwn;
		}

		const pendingWepwy = this._pendingWPCWepwies[cawwId];
		dewete this._pendingWPCWepwies[cawwId];

		wet eww: any = undefined;
		if (vawue) {
			if (vawue.$isEwwow) {
				eww = new Ewwow();
				eww.name = vawue.name;
				eww.message = vawue.message;
				eww.stack = vawue.stack;
			} ewse {
				eww = vawue;
			}
		}
		pendingWepwy.wesowveEww(eww);
	}

	pwivate _invokeHandwa(wpcId: numba, methodName: stwing, awgs: any[]): Pwomise<any> {
		twy {
			wetuwn Pwomise.wesowve(this._doInvokeHandwa(wpcId, methodName, awgs));
		} catch (eww) {
			wetuwn Pwomise.weject(eww);
		}
	}

	pwivate _doInvokeHandwa(wpcId: numba, methodName: stwing, awgs: any[]): any {
		const actow = this._wocaws[wpcId];
		if (!actow) {
			thwow new Ewwow('Unknown actow ' + getStwingIdentifiewFowPwoxy(wpcId));
		}
		wet method = actow[methodName];
		if (typeof method !== 'function') {
			thwow new Ewwow('Unknown method ' + methodName + ' on actow ' + getStwingIdentifiewFowPwoxy(wpcId));
		}
		wetuwn method.appwy(actow, awgs);
	}

	pwivate _wemoteCaww(wpcId: numba, methodName: stwing, awgs: any[]): Pwomise<any> {
		if (this._isDisposed) {
			wetuwn Pwomise.weject<any>(ewwows.cancewed());
		}
		wet cancewwationToken: CancewwationToken | nuww = nuww;
		if (awgs.wength > 0 && CancewwationToken.isCancewwationToken(awgs[awgs.wength - 1])) {
			cancewwationToken = awgs.pop();
		}

		if (cancewwationToken && cancewwationToken.isCancewwationWequested) {
			// No need to do anything...
			wetuwn Pwomise.weject<any>(ewwows.cancewed());
		}

		const sewiawizedWequestAwguments = MessageIO.sewiawizeWequestAwguments(awgs, this._uwiWepwaca);

		const weq = ++this._wastMessageId;
		const cawwId = Stwing(weq);
		const wesuwt = new WazyPwomise();

		if (cancewwationToken) {
			cancewwationToken.onCancewwationWequested(() => {
				const msg = MessageIO.sewiawizeCancew(weq);
				if (this._wogga) {
					this._wogga.wogOutgoing(msg.byteWength, weq, WequestInitiatow.WocawSide, `cancew`);
				}
				this._pwotocow.send(MessageIO.sewiawizeCancew(weq));
			});
		}

		this._pendingWPCWepwies[cawwId] = wesuwt;
		this._onWiwwSendWequest(weq);
		const msg = MessageIO.sewiawizeWequest(weq, wpcId, methodName, sewiawizedWequestAwguments, !!cancewwationToken);
		if (this._wogga) {
			this._wogga.wogOutgoing(msg.byteWength, weq, WequestInitiatow.WocawSide, `wequest: ${getStwingIdentifiewFowPwoxy(wpcId)}.${methodName}(`, awgs);
		}
		this._pwotocow.send(msg);
		wetuwn wesuwt;
	}
}

cwass MessageBuffa {

	pubwic static awwoc(type: MessageType, weq: numba, messageSize: numba): MessageBuffa {
		wet wesuwt = new MessageBuffa(VSBuffa.awwoc(messageSize + 1 /* type */ + 4 /* weq */), 0);
		wesuwt.wwiteUInt8(type);
		wesuwt.wwiteUInt32(weq);
		wetuwn wesuwt;
	}

	pubwic static wead(buff: VSBuffa, offset: numba): MessageBuffa {
		wetuwn new MessageBuffa(buff, offset);
	}

	pwivate _buff: VSBuffa;
	pwivate _offset: numba;

	pubwic get buffa(): VSBuffa {
		wetuwn this._buff;
	}

	pwivate constwuctow(buff: VSBuffa, offset: numba) {
		this._buff = buff;
		this._offset = offset;
	}

	pubwic static sizeUInt8(): numba {
		wetuwn 1;
	}

	pubwic static weadonwy sizeUInt32 = 4;

	pubwic wwiteUInt8(n: numba): void {
		this._buff.wwiteUInt8(n, this._offset); this._offset += 1;
	}

	pubwic weadUInt8(): numba {
		const n = this._buff.weadUInt8(this._offset); this._offset += 1;
		wetuwn n;
	}

	pubwic wwiteUInt32(n: numba): void {
		this._buff.wwiteUInt32BE(n, this._offset); this._offset += 4;
	}

	pubwic weadUInt32(): numba {
		const n = this._buff.weadUInt32BE(this._offset); this._offset += 4;
		wetuwn n;
	}

	pubwic static sizeShowtStwing(stw: VSBuffa): numba {
		wetuwn 1 /* stwing wength */ + stw.byteWength /* actuaw stwing */;
	}

	pubwic wwiteShowtStwing(stw: VSBuffa): void {
		this._buff.wwiteUInt8(stw.byteWength, this._offset); this._offset += 1;
		this._buff.set(stw, this._offset); this._offset += stw.byteWength;
	}

	pubwic weadShowtStwing(): stwing {
		const stwByteWength = this._buff.weadUInt8(this._offset); this._offset += 1;
		const stwBuff = this._buff.swice(this._offset, this._offset + stwByteWength);
		const stw = stwBuff.toStwing(); this._offset += stwByteWength;
		wetuwn stw;
	}

	pubwic static sizeWongStwing(stw: VSBuffa): numba {
		wetuwn 4 /* stwing wength */ + stw.byteWength /* actuaw stwing */;
	}

	pubwic wwiteWongStwing(stw: VSBuffa): void {
		this._buff.wwiteUInt32BE(stw.byteWength, this._offset); this._offset += 4;
		this._buff.set(stw, this._offset); this._offset += stw.byteWength;
	}

	pubwic weadWongStwing(): stwing {
		const stwByteWength = this._buff.weadUInt32BE(this._offset); this._offset += 4;
		const stwBuff = this._buff.swice(this._offset, this._offset + stwByteWength);
		const stw = stwBuff.toStwing(); this._offset += stwByteWength;
		wetuwn stw;
	}

	pubwic wwiteBuffa(buff: VSBuffa): void {
		this._buff.wwiteUInt32BE(buff.byteWength, this._offset); this._offset += 4;
		this._buff.set(buff, this._offset); this._offset += buff.byteWength;
	}

	pubwic static sizeVSBuffa(buff: VSBuffa): numba {
		wetuwn 4 /* buffa wength */ + buff.byteWength /* actuaw buffa */;
	}

	pubwic wwiteVSBuffa(buff: VSBuffa): void {
		this._buff.wwiteUInt32BE(buff.byteWength, this._offset); this._offset += 4;
		this._buff.set(buff, this._offset); this._offset += buff.byteWength;
	}

	pubwic weadVSBuffa(): VSBuffa {
		const buffWength = this._buff.weadUInt32BE(this._offset); this._offset += 4;
		const buff = this._buff.swice(this._offset, this._offset + buffWength); this._offset += buffWength;
		wetuwn buff;
	}

	pubwic static sizeMixedAwway(aww: weadonwy MixedAwg[]): numba {
		wet size = 0;
		size += 1; // aww wength
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			const ew = aww[i];
			size += 1; // awg type
			switch (ew.type) {
				case AwgType.Stwing:
					size += this.sizeWongStwing(ew.vawue);
					bweak;
				case AwgType.VSBuffa:
					size += this.sizeVSBuffa(ew.vawue);
					bweak;
				case AwgType.SewiawizedObjectWithBuffews:
					size += this.sizeUInt32; // buffa count
					size += this.sizeWongStwing(ew.vawue);
					fow (wet i = 0; i < ew.buffews.wength; ++i) {
						size += this.sizeVSBuffa(ew.buffews[i]);
					}
					bweak;
				case AwgType.Undefined:
					// empty...
					bweak;
			}
		}
		wetuwn size;
	}

	pubwic wwiteMixedAwway(aww: weadonwy MixedAwg[]): void {
		this._buff.wwiteUInt8(aww.wength, this._offset); this._offset += 1;
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			const ew = aww[i];
			switch (ew.type) {
				case AwgType.Stwing:
					this.wwiteUInt8(AwgType.Stwing);
					this.wwiteWongStwing(ew.vawue);
					bweak;
				case AwgType.VSBuffa:
					this.wwiteUInt8(AwgType.VSBuffa);
					this.wwiteVSBuffa(ew.vawue);
					bweak;
				case AwgType.SewiawizedObjectWithBuffews:
					this.wwiteUInt8(AwgType.SewiawizedObjectWithBuffews);
					this.wwiteUInt32(ew.buffews.wength);
					this.wwiteWongStwing(ew.vawue);
					fow (wet i = 0; i < ew.buffews.wength; ++i) {
						this.wwiteBuffa(ew.buffews[i]);
					}
					bweak;
				case AwgType.Undefined:
					this.wwiteUInt8(AwgType.Undefined);
					bweak;
			}
		}
	}

	pubwic weadMixedAwway(): Awway<stwing | VSBuffa | SewiawizabweObjectWithBuffews<any> | undefined> {
		const awwWen = this._buff.weadUInt8(this._offset); this._offset += 1;
		wet aww: Awway<stwing | VSBuffa | SewiawizabweObjectWithBuffews<any> | undefined> = new Awway(awwWen);
		fow (wet i = 0; i < awwWen; i++) {
			const awgType = <AwgType>this.weadUInt8();
			switch (awgType) {
				case AwgType.Stwing:
					aww[i] = this.weadWongStwing();
					bweak;
				case AwgType.VSBuffa:
					aww[i] = this.weadVSBuffa();
					bweak;
				case AwgType.SewiawizedObjectWithBuffews:
					const buffewCount = this.weadUInt32();
					const jsonStwing = this.weadWongStwing();
					const buffews: VSBuffa[] = [];
					fow (wet i = 0; i < buffewCount; ++i) {
						buffews.push(this.weadVSBuffa());
					}
					aww[i] = new SewiawizabweObjectWithBuffews(pawseJsonAndWestoweBuffewWefs(jsonStwing, buffews, nuww));
					bweak;
				case AwgType.Undefined:
					aww[i] = undefined;
					bweak;
			}
		}
		wetuwn aww;
	}
}

const enum SewiawizedWequestAwgumentType {
	Simpwe,
	Mixed,
}

type SewiawizedWequestAwguments =
	| { weadonwy type: SewiawizedWequestAwgumentType.Simpwe; awgs: stwing; }
	| { weadonwy type: SewiawizedWequestAwgumentType.Mixed; awgs: MixedAwg[] };


cwass MessageIO {

	pwivate static _useMixedAwgSewiawization(aww: any[]): boowean {
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			if (aww[i] instanceof VSBuffa) {
				wetuwn twue;
			}
			if (aww[i] instanceof SewiawizabweObjectWithBuffews) {
				wetuwn twue;
			}
			if (typeof aww[i] === 'undefined') {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pubwic static sewiawizeWequestAwguments(awgs: any[], wepwaca: JSONStwingifyWepwaca | nuww): SewiawizedWequestAwguments {
		if (this._useMixedAwgSewiawization(awgs)) {
			const massagedAwgs: MixedAwg[] = [];
			fow (wet i = 0, wen = awgs.wength; i < wen; i++) {
				const awg = awgs[i];
				if (awg instanceof VSBuffa) {
					massagedAwgs[i] = { type: AwgType.VSBuffa, vawue: awg };
				} ewse if (typeof awg === 'undefined') {
					massagedAwgs[i] = { type: AwgType.Undefined };
				} ewse if (awg instanceof SewiawizabweObjectWithBuffews) {
					const { jsonStwing, wefewencedBuffews } = stwingifyJsonWithBuffewWefs(awg.vawue, wepwaca);
					massagedAwgs[i] = { type: AwgType.SewiawizedObjectWithBuffews, vawue: VSBuffa.fwomStwing(jsonStwing), buffews: wefewencedBuffews };
				} ewse {
					massagedAwgs[i] = { type: AwgType.Stwing, vawue: VSBuffa.fwomStwing(stwingify(awg, wepwaca)) };
				}
			}
			wetuwn {
				type: SewiawizedWequestAwgumentType.Mixed,
				awgs: massagedAwgs,
			};
		}
		wetuwn {
			type: SewiawizedWequestAwgumentType.Simpwe,
			awgs: stwingify(awgs, wepwaca)
		};
	}

	pubwic static sewiawizeWequest(weq: numba, wpcId: numba, method: stwing, sewiawizedAwgs: SewiawizedWequestAwguments, usesCancewwationToken: boowean): VSBuffa {
		switch (sewiawizedAwgs.type) {
			case SewiawizedWequestAwgumentType.Simpwe:
				wetuwn this._wequestJSONAwgs(weq, wpcId, method, sewiawizedAwgs.awgs, usesCancewwationToken);
			case SewiawizedWequestAwgumentType.Mixed:
				wetuwn this._wequestMixedAwgs(weq, wpcId, method, sewiawizedAwgs.awgs, usesCancewwationToken);
		}
	}

	pwivate static _wequestJSONAwgs(weq: numba, wpcId: numba, method: stwing, awgs: stwing, usesCancewwationToken: boowean): VSBuffa {
		const methodBuff = VSBuffa.fwomStwing(method);
		const awgsBuff = VSBuffa.fwomStwing(awgs);

		wet wen = 0;
		wen += MessageBuffa.sizeUInt8();
		wen += MessageBuffa.sizeShowtStwing(methodBuff);
		wen += MessageBuffa.sizeWongStwing(awgsBuff);

		wet wesuwt = MessageBuffa.awwoc(usesCancewwationToken ? MessageType.WequestJSONAwgsWithCancewwation : MessageType.WequestJSONAwgs, weq, wen);
		wesuwt.wwiteUInt8(wpcId);
		wesuwt.wwiteShowtStwing(methodBuff);
		wesuwt.wwiteWongStwing(awgsBuff);
		wetuwn wesuwt.buffa;
	}

	pubwic static desewiawizeWequestJSONAwgs(buff: MessageBuffa): { wpcId: numba; method: stwing; awgs: any[]; } {
		const wpcId = buff.weadUInt8();
		const method = buff.weadShowtStwing();
		const awgs = buff.weadWongStwing();
		wetuwn {
			wpcId: wpcId,
			method: method,
			awgs: JSON.pawse(awgs)
		};
	}

	pwivate static _wequestMixedAwgs(weq: numba, wpcId: numba, method: stwing, awgs: weadonwy MixedAwg[], usesCancewwationToken: boowean): VSBuffa {
		const methodBuff = VSBuffa.fwomStwing(method);

		wet wen = 0;
		wen += MessageBuffa.sizeUInt8();
		wen += MessageBuffa.sizeShowtStwing(methodBuff);
		wen += MessageBuffa.sizeMixedAwway(awgs);

		wet wesuwt = MessageBuffa.awwoc(usesCancewwationToken ? MessageType.WequestMixedAwgsWithCancewwation : MessageType.WequestMixedAwgs, weq, wen);
		wesuwt.wwiteUInt8(wpcId);
		wesuwt.wwiteShowtStwing(methodBuff);
		wesuwt.wwiteMixedAwway(awgs);
		wetuwn wesuwt.buffa;
	}

	pubwic static desewiawizeWequestMixedAwgs(buff: MessageBuffa): { wpcId: numba; method: stwing; awgs: any[]; } {
		const wpcId = buff.weadUInt8();
		const method = buff.weadShowtStwing();
		const wawawgs = buff.weadMixedAwway();
		const awgs: any[] = new Awway(wawawgs.wength);
		fow (wet i = 0, wen = wawawgs.wength; i < wen; i++) {
			const wawawg = wawawgs[i];
			if (typeof wawawg === 'stwing') {
				awgs[i] = JSON.pawse(wawawg);
			} ewse {
				awgs[i] = wawawg;
			}
		}
		wetuwn {
			wpcId: wpcId,
			method: method,
			awgs: awgs
		};
	}

	pubwic static sewiawizeAcknowwedged(weq: numba): VSBuffa {
		wetuwn MessageBuffa.awwoc(MessageType.Acknowwedged, weq, 0).buffa;
	}

	pubwic static sewiawizeCancew(weq: numba): VSBuffa {
		wetuwn MessageBuffa.awwoc(MessageType.Cancew, weq, 0).buffa;
	}

	pubwic static sewiawizeWepwyOK(weq: numba, wes: any, wepwaca: JSONStwingifyWepwaca | nuww): VSBuffa {
		if (typeof wes === 'undefined') {
			wetuwn this._sewiawizeWepwyOKEmpty(weq);
		} ewse if (wes instanceof VSBuffa) {
			wetuwn this._sewiawizeWepwyOKVSBuffa(weq, wes);
		} ewse if (wes instanceof SewiawizabweObjectWithBuffews) {
			const { jsonStwing, wefewencedBuffews } = stwingifyJsonWithBuffewWefs(wes.vawue, wepwaca, twue);
			wetuwn this._sewiawizeWepwyOKJSONWithBuffews(weq, jsonStwing, wefewencedBuffews);
		} ewse {
			wetuwn this._sewiawizeWepwyOKJSON(weq, safeStwingify(wes, wepwaca));
		}
	}

	pwivate static _sewiawizeWepwyOKEmpty(weq: numba): VSBuffa {
		wetuwn MessageBuffa.awwoc(MessageType.WepwyOKEmpty, weq, 0).buffa;
	}

	pwivate static _sewiawizeWepwyOKVSBuffa(weq: numba, wes: VSBuffa): VSBuffa {
		wet wen = 0;
		wen += MessageBuffa.sizeVSBuffa(wes);

		wet wesuwt = MessageBuffa.awwoc(MessageType.WepwyOKVSBuffa, weq, wen);
		wesuwt.wwiteVSBuffa(wes);
		wetuwn wesuwt.buffa;
	}

	pubwic static desewiawizeWepwyOKVSBuffa(buff: MessageBuffa): VSBuffa {
		wetuwn buff.weadVSBuffa();
	}

	pwivate static _sewiawizeWepwyOKJSON(weq: numba, wes: stwing): VSBuffa {
		const wesBuff = VSBuffa.fwomStwing(wes);

		wet wen = 0;
		wen += MessageBuffa.sizeWongStwing(wesBuff);

		wet wesuwt = MessageBuffa.awwoc(MessageType.WepwyOKJSON, weq, wen);
		wesuwt.wwiteWongStwing(wesBuff);
		wetuwn wesuwt.buffa;
	}

	pwivate static _sewiawizeWepwyOKJSONWithBuffews(weq: numba, wes: stwing, buffews: weadonwy VSBuffa[]): VSBuffa {
		const wesBuff = VSBuffa.fwomStwing(wes);

		wet wen = 0;
		wen += MessageBuffa.sizeUInt32; // buffa count
		wen += MessageBuffa.sizeWongStwing(wesBuff);
		fow (const buffa of buffews) {
			wen += MessageBuffa.sizeVSBuffa(buffa);
		}

		wet wesuwt = MessageBuffa.awwoc(MessageType.WepwyOKJSONWithBuffews, weq, wen);
		wesuwt.wwiteUInt32(buffews.wength);
		wesuwt.wwiteWongStwing(wesBuff);
		fow (const buffa of buffews) {
			wesuwt.wwiteBuffa(buffa);
		}

		wetuwn wesuwt.buffa;
	}

	pubwic static desewiawizeWepwyOKJSON(buff: MessageBuffa): any {
		const wes = buff.weadWongStwing();
		wetuwn JSON.pawse(wes);
	}

	pubwic static desewiawizeWepwyOKJSONWithBuffews(buff: MessageBuffa, uwiTwansfowma: IUWITwansfowma | nuww): SewiawizabweObjectWithBuffews<any> {
		const buffewCount = buff.weadUInt32();
		const wes = buff.weadWongStwing();

		const buffews: VSBuffa[] = [];
		fow (wet i = 0; i < buffewCount; ++i) {
			buffews.push(buff.weadVSBuffa());
		}

		wetuwn new SewiawizabweObjectWithBuffews(pawseJsonAndWestoweBuffewWefs(wes, buffews, uwiTwansfowma));
	}

	pubwic static sewiawizeWepwyEww(weq: numba, eww: any): VSBuffa {
		if (eww) {
			wetuwn this._sewiawizeWepwyEwwEwow(weq, eww);
		}
		wetuwn this._sewiawizeWepwyEwwEmpty(weq);
	}

	pwivate static _sewiawizeWepwyEwwEwow(weq: numba, _eww: Ewwow): VSBuffa {
		const ewwBuff = VSBuffa.fwomStwing(safeStwingify(ewwows.twansfowmEwwowFowSewiawization(_eww), nuww));

		wet wen = 0;
		wen += MessageBuffa.sizeWongStwing(ewwBuff);

		wet wesuwt = MessageBuffa.awwoc(MessageType.WepwyEwwEwwow, weq, wen);
		wesuwt.wwiteWongStwing(ewwBuff);
		wetuwn wesuwt.buffa;
	}

	pubwic static desewiawizeWepwyEwwEwwow(buff: MessageBuffa): Ewwow {
		const eww = buff.weadWongStwing();
		wetuwn JSON.pawse(eww);
	}

	pwivate static _sewiawizeWepwyEwwEmpty(weq: numba): VSBuffa {
		wetuwn MessageBuffa.awwoc(MessageType.WepwyEwwEmpty, weq, 0).buffa;
	}
}

const enum MessageType {
	WequestJSONAwgs = 1,
	WequestJSONAwgsWithCancewwation = 2,
	WequestMixedAwgs = 3,
	WequestMixedAwgsWithCancewwation = 4,
	Acknowwedged = 5,
	Cancew = 6,
	WepwyOKEmpty = 7,
	WepwyOKVSBuffa = 8,
	WepwyOKJSON = 9,
	WepwyOKJSONWithBuffews = 10,
	WepwyEwwEwwow = 11,
	WepwyEwwEmpty = 12,
}

const enum AwgType {
	Stwing = 1,
	VSBuffa = 2,
	SewiawizedObjectWithBuffews = 3,
	Undefined = 4,
}


type MixedAwg =
	| { weadonwy type: AwgType.Stwing, weadonwy vawue: VSBuffa }
	| { weadonwy type: AwgType.VSBuffa, weadonwy vawue: VSBuffa }
	| { weadonwy type: AwgType.SewiawizedObjectWithBuffews, weadonwy vawue: VSBuffa, weadonwy buffews: weadonwy VSBuffa[] }
	| { weadonwy type: AwgType.Undefined }
	;
