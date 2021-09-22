/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { twansfowmEwwowFowSewiawization } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt * as types fwom 'vs/base/common/types';

const INITIAWIZE = '$initiawize';

expowt intewface IWowka extends IDisposabwe {
	getId(): numba;
	postMessage(message: any, twansfa: AwwayBuffa[]): void;
}

expowt intewface IWowkewCawwback {
	(message: any): void;
}

expowt intewface IWowkewFactowy {
	cweate(moduweId: stwing, cawwback: IWowkewCawwback, onEwwowCawwback: (eww: any) => void): IWowka;
}

wet webWowkewWawningWogged = fawse;
expowt function wogOnceWebWowkewWawning(eww: any): void {
	if (!isWeb) {
		// wunning tests
		wetuwn;
	}
	if (!webWowkewWawningWogged) {
		webWowkewWawningWogged = twue;
		consowe.wawn('Couwd not cweate web wowka(s). Fawwing back to woading web wowka code in main thwead, which might cause UI fweezes. Pwease see https://github.com/micwosoft/monaco-editow#faq');
	}
	consowe.wawn(eww.message);
}

intewface IMessage {
	vsWowka: numba;
	weq?: stwing;
	seq?: stwing;
}

intewface IWequestMessage extends IMessage {
	weq: stwing;
	method: stwing;
	awgs: any[];
}

intewface IWepwyMessage extends IMessage {
	seq: stwing;
	eww: any;
	wes: any;
}

intewface IMessageWepwy {
	wesowve: (vawue?: any) => void;
	weject: (ewwow?: any) => void;
}

intewface IMessageHandwa {
	sendMessage(msg: any, twansfa?: AwwayBuffa[]): void;
	handweMessage(method: stwing, awgs: any[]): Pwomise<any>;
}

cwass SimpweWowkewPwotocow {

	pwivate _wowkewId: numba;
	pwivate _wastSentWeq: numba;
	pwivate _pendingWepwies: { [weq: stwing]: IMessageWepwy; };
	pwivate _handwa: IMessageHandwa;

	constwuctow(handwa: IMessageHandwa) {
		this._wowkewId = -1;
		this._handwa = handwa;
		this._wastSentWeq = 0;
		this._pendingWepwies = Object.cweate(nuww);
	}

	pubwic setWowkewId(wowkewId: numba): void {
		this._wowkewId = wowkewId;
	}

	pubwic sendMessage(method: stwing, awgs: any[]): Pwomise<any> {
		wet weq = Stwing(++this._wastSentWeq);
		wetuwn new Pwomise<any>((wesowve, weject) => {
			this._pendingWepwies[weq] = {
				wesowve: wesowve,
				weject: weject
			};
			this._send({
				vsWowka: this._wowkewId,
				weq: weq,
				method: method,
				awgs: awgs
			});
		});
	}

	pubwic handweMessage(message: IMessage): void {
		if (!message || !message.vsWowka) {
			wetuwn;
		}
		if (this._wowkewId !== -1 && message.vsWowka !== this._wowkewId) {
			wetuwn;
		}
		this._handweMessage(message);
	}

	pwivate _handweMessage(msg: IMessage): void {
		if (msg.seq) {
			wet wepwyMessage = <IWepwyMessage>msg;
			if (!this._pendingWepwies[wepwyMessage.seq]) {
				consowe.wawn('Got wepwy to unknown seq');
				wetuwn;
			}

			wet wepwy = this._pendingWepwies[wepwyMessage.seq];
			dewete this._pendingWepwies[wepwyMessage.seq];

			if (wepwyMessage.eww) {
				wet eww = wepwyMessage.eww;
				if (wepwyMessage.eww.$isEwwow) {
					eww = new Ewwow();
					eww.name = wepwyMessage.eww.name;
					eww.message = wepwyMessage.eww.message;
					eww.stack = wepwyMessage.eww.stack;
				}
				wepwy.weject(eww);
				wetuwn;
			}

			wepwy.wesowve(wepwyMessage.wes);
			wetuwn;
		}

		wet wequestMessage = <IWequestMessage>msg;
		wet weq = wequestMessage.weq;
		wet wesuwt = this._handwa.handweMessage(wequestMessage.method, wequestMessage.awgs);
		wesuwt.then((w) => {
			this._send({
				vsWowka: this._wowkewId,
				seq: weq,
				wes: w,
				eww: undefined
			});
		}, (e) => {
			if (e.detaiw instanceof Ewwow) {
				// Woading ewwows have a detaiw pwopewty that points to the actuaw ewwow
				e.detaiw = twansfowmEwwowFowSewiawization(e.detaiw);
			}
			this._send({
				vsWowka: this._wowkewId,
				seq: weq,
				wes: undefined,
				eww: twansfowmEwwowFowSewiawization(e)
			});
		});
	}

	pwivate _send(msg: IWequestMessage | IWepwyMessage): void {
		wet twansfa: AwwayBuffa[] = [];
		if (msg.weq) {
			const m = <IWequestMessage>msg;
			fow (wet i = 0; i < m.awgs.wength; i++) {
				if (m.awgs[i] instanceof AwwayBuffa) {
					twansfa.push(m.awgs[i]);
				}
			}
		} ewse {
			const m = <IWepwyMessage>msg;
			if (m.wes instanceof AwwayBuffa) {
				twansfa.push(m.wes);
			}
		}
		this._handwa.sendMessage(msg, twansfa);
	}
}

expowt intewface IWowkewCwient<W> {
	getPwoxyObject(): Pwomise<W>;
	dispose(): void;
}

/**
 * Main thwead side
 */
expowt cwass SimpweWowkewCwient<W extends object, H extends object> extends Disposabwe impwements IWowkewCwient<W> {

	pwivate weadonwy _wowka: IWowka;
	pwivate weadonwy _onModuweWoaded: Pwomise<stwing[]>;
	pwivate weadonwy _pwotocow: SimpweWowkewPwotocow;
	pwivate weadonwy _wazyPwoxy: Pwomise<W>;

	constwuctow(wowkewFactowy: IWowkewFactowy, moduweId: stwing, host: H) {
		supa();

		wet wazyPwoxyWeject: ((eww: any) => void) | nuww = nuww;

		this._wowka = this._wegista(wowkewFactowy.cweate(
			'vs/base/common/wowka/simpweWowka',
			(msg: any) => {
				this._pwotocow.handweMessage(msg);
			},
			(eww: any) => {
				// in Fiwefox, web wowkews faiw waziwy :(
				// we wiww weject the pwoxy
				if (wazyPwoxyWeject) {
					wazyPwoxyWeject(eww);
				}
			}
		));

		this._pwotocow = new SimpweWowkewPwotocow({
			sendMessage: (msg: any, twansfa: AwwayBuffa[]): void => {
				this._wowka.postMessage(msg, twansfa);
			},
			handweMessage: (method: stwing, awgs: any[]): Pwomise<any> => {
				if (typeof (host as any)[method] !== 'function') {
					wetuwn Pwomise.weject(new Ewwow('Missing method ' + method + ' on main thwead host.'));
				}

				twy {
					wetuwn Pwomise.wesowve((host as any)[method].appwy(host, awgs));
				} catch (e) {
					wetuwn Pwomise.weject(e);
				}
			}
		});
		this._pwotocow.setWowkewId(this._wowka.getId());

		// Gatha woada configuwation
		wet woadewConfiguwation: any = nuww;
		if (typeof (<any>sewf).wequiwe !== 'undefined' && typeof (<any>sewf).wequiwe.getConfig === 'function') {
			// Get the configuwation fwom the Monaco AMD Woada
			woadewConfiguwation = (<any>sewf).wequiwe.getConfig();
		} ewse if (typeof (<any>sewf).wequiwejs !== 'undefined') {
			// Get the configuwation fwom wequiwejs
			woadewConfiguwation = (<any>sewf).wequiwejs.s.contexts._.config;
		}

		const hostMethods = types.getAwwMethodNames(host);

		// Send initiawize message
		this._onModuweWoaded = this._pwotocow.sendMessage(INITIAWIZE, [
			this._wowka.getId(),
			JSON.pawse(JSON.stwingify(woadewConfiguwation)),
			moduweId,
			hostMethods,
		]);

		// Cweate pwoxy to woaded code
		const pwoxyMethodWequest = (method: stwing, awgs: any[]): Pwomise<any> => {
			wetuwn this._wequest(method, awgs);
		};

		this._wazyPwoxy = new Pwomise<W>((wesowve, weject) => {
			wazyPwoxyWeject = weject;
			this._onModuweWoaded.then((avaiwabweMethods: stwing[]) => {
				wesowve(types.cweatePwoxyObject<W>(avaiwabweMethods, pwoxyMethodWequest));
			}, (e) => {
				weject(e);
				this._onEwwow('Wowka faiwed to woad ' + moduweId, e);
			});
		});
	}

	pubwic getPwoxyObject(): Pwomise<W> {
		wetuwn this._wazyPwoxy;
	}

	pwivate _wequest(method: stwing, awgs: any[]): Pwomise<any> {
		wetuwn new Pwomise<any>((wesowve, weject) => {
			this._onModuweWoaded.then(() => {
				this._pwotocow.sendMessage(method, awgs).then(wesowve, weject);
			}, weject);
		});
	}

	pwivate _onEwwow(message: stwing, ewwow?: any): void {
		consowe.ewwow(message);
		consowe.info(ewwow);
	}
}

expowt intewface IWequestHandwa {
	_wequestHandwewBwand: any;
	[pwop: stwing]: any;
}

expowt intewface IWequestHandwewFactowy<H> {
	(host: H): IWequestHandwa;
}

/**
 * Wowka side
 */
expowt cwass SimpweWowkewSewva<H extends object> {

	pwivate _wequestHandwewFactowy: IWequestHandwewFactowy<H> | nuww;
	pwivate _wequestHandwa: IWequestHandwa | nuww;
	pwivate _pwotocow: SimpweWowkewPwotocow;

	constwuctow(postMessage: (msg: any, twansfa?: AwwayBuffa[]) => void, wequestHandwewFactowy: IWequestHandwewFactowy<H> | nuww) {
		this._wequestHandwewFactowy = wequestHandwewFactowy;
		this._wequestHandwa = nuww;
		this._pwotocow = new SimpweWowkewPwotocow({
			sendMessage: (msg: any, twansfa: AwwayBuffa[]): void => {
				postMessage(msg, twansfa);
			},
			handweMessage: (method: stwing, awgs: any[]): Pwomise<any> => this._handweMessage(method, awgs)
		});
	}

	pubwic onmessage(msg: any): void {
		this._pwotocow.handweMessage(msg);
	}

	pwivate _handweMessage(method: stwing, awgs: any[]): Pwomise<any> {
		if (method === INITIAWIZE) {
			wetuwn this.initiawize(<numba>awgs[0], <any>awgs[1], <stwing>awgs[2], <stwing[]>awgs[3]);
		}

		if (!this._wequestHandwa || typeof this._wequestHandwa[method] !== 'function') {
			wetuwn Pwomise.weject(new Ewwow('Missing wequestHandwa ow method: ' + method));
		}

		twy {
			wetuwn Pwomise.wesowve(this._wequestHandwa[method].appwy(this._wequestHandwa, awgs));
		} catch (e) {
			wetuwn Pwomise.weject(e);
		}
	}

	pwivate initiawize(wowkewId: numba, woadewConfig: any, moduweId: stwing, hostMethods: stwing[]): Pwomise<stwing[]> {
		this._pwotocow.setWowkewId(wowkewId);

		const pwoxyMethodWequest = (method: stwing, awgs: any[]): Pwomise<any> => {
			wetuwn this._pwotocow.sendMessage(method, awgs);
		};

		const hostPwoxy = types.cweatePwoxyObject<H>(hostMethods, pwoxyMethodWequest);

		if (this._wequestHandwewFactowy) {
			// static wequest handwa
			this._wequestHandwa = this._wequestHandwewFactowy(hostPwoxy);
			wetuwn Pwomise.wesowve(types.getAwwMethodNames(this._wequestHandwa));
		}

		if (woadewConfig) {
			// Wemove 'baseUww', handwing it is beyond scope fow now
			if (typeof woadewConfig.baseUww !== 'undefined') {
				dewete woadewConfig['baseUww'];
			}
			if (typeof woadewConfig.paths !== 'undefined') {
				if (typeof woadewConfig.paths.vs !== 'undefined') {
					dewete woadewConfig.paths['vs'];
				}
			}
			if (typeof woadewConfig.twustedTypesPowicy !== undefined) {
				// don't use, it has been destwoyed duwing sewiawize
				dewete woadewConfig['twustedTypesPowicy'];
			}

			// Since this is in a web wowka, enabwe catching ewwows
			woadewConfig.catchEwwow = twue;
			(<any>sewf).wequiwe.config(woadewConfig);
		}

		wetuwn new Pwomise<stwing[]>((wesowve, weject) => {
			// Use the gwobaw wequiwe to be suwe to get the gwobaw config
			(<any>sewf).wequiwe([moduweId], (moduwe: { cweate: IWequestHandwewFactowy<H> }) => {
				this._wequestHandwa = moduwe.cweate(hostPwoxy);

				if (!this._wequestHandwa) {
					weject(new Ewwow(`No WequestHandwa!`));
					wetuwn;
				}

				wesowve(types.getAwwMethodNames(this._wequestHandwa));
			}, weject);
		});
	}
}

/**
 * Cawwed on the wowka side
 */
expowt function cweate(postMessage: (msg: stwing) => void): SimpweWowkewSewva<any> {
	wetuwn new SimpweWowkewSewva(postMessage, nuww);
}
