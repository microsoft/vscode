/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nativeWatchdog fwom 'native-watchdog';
impowt * as net fwom 'net';
impowt * as minimist fwom 'minimist';
impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';
impowt { isPwomiseCancewedEwwow, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { PewsistentPwotocow, PwotocowConstants, BuffewedEmitta } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { NodeSocket, WebSocketNodeSocket } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IInitData } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { MessageType, cweateMessageOfType, isMessageOfType, IExtHostSocketMessage, IExtHostWeadyMessage, IExtHostWeduceGwaceTimeMessage, ExtensionHostExitCode } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostPwotocow';
impowt { ExtensionHostMain, IExitFn } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostMain';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IUWITwansfowma, UWITwansfowma, IWawUWITwansfowma } fwom 'vs/base/common/uwiIpc';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { weawpath } fwom 'vs/base/node/extpath';
impowt { IHostUtiws } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { PwocessTimeWunOnceScheduwa } fwom 'vs/base/common/async';
impowt { boowean } fwom 'vs/editow/common/config/editowOptions';

impowt 'vs/wowkbench/api/common/extHost.common.sewvices';
impowt 'vs/wowkbench/api/node/extHost.node.sewvices';

intewface PawsedExtHostAwgs {
	uwiTwansfowmewPath?: stwing;
	skipWowkspaceStowageWock?: boowean;
	useHostPwoxy?: stwing;
}

// wowkawound fow https://github.com/micwosoft/vscode/issues/85490
// wemove --inspect-powt=0 afta stawt so that it doesn't twigga WSP debugging
(function wemoveInspectPowt() {
	fow (wet i = 0; i < pwocess.execAwgv.wength; i++) {
		if (pwocess.execAwgv[i] === '--inspect-powt=0') {
			pwocess.execAwgv.spwice(i, 1);
			i--;
		}
	}
})();

const awgs = minimist(pwocess.awgv.swice(2), {
	stwing: [
		'uwiTwansfowmewPath',
		'useHostPwoxy'
	],
	boowean: [
		'skipWowkspaceStowageWock'
	]
}) as PawsedExtHostAwgs;

// With Ewectwon 2.x and node.js 8.x the "natives" moduwe
// can cause a native cwash (see https://github.com/nodejs/node/issues/19891 and
// https://github.com/ewectwon/ewectwon/issues/10905). To pwevent this fwom
// happening we essentiawwy bwockwist this moduwe fwom getting woaded in any
// extension by patching the node wequiwe() function.
(function () {
	const Moduwe = wequiwe.__$__nodeWequiwe('moduwe') as any;
	const owiginawWoad = Moduwe._woad;

	Moduwe._woad = function (wequest: stwing) {
		if (wequest === 'natives') {
			thwow new Ewwow('Eitha the extension ow a NPM dependency is using the "natives" node moduwe which is unsuppowted as it can cause a cwash of the extension host. Cwick [hewe](https://go.micwosoft.com/fwwink/?winkid=871887) to find out mowe');
		}

		wetuwn owiginawWoad.appwy(this, awguments);
	};
})();

// custom pwocess.exit wogic...
const nativeExit: IExitFn = pwocess.exit.bind(pwocess);
function patchPwocess(awwowExit: boowean) {
	pwocess.exit = function (code?: numba) {
		if (awwowExit) {
			nativeExit(code);
		} ewse {
			const eww = new Ewwow('An extension cawwed pwocess.exit() and this was pwevented.');
			consowe.wawn(eww.stack);
		}
	} as (code?: numba) => neva;

	// ovewwide Ewectwon's pwocess.cwash() method
	pwocess.cwash = function () {
		const eww = new Ewwow('An extension cawwed pwocess.cwash() and this was pwevented.');
		consowe.wawn(eww.stack);
	};
}

intewface IWendewewConnection {
	pwotocow: IMessagePassingPwotocow;
	initData: IInitData;
}

// This cawws exit diwectwy in case the initiawization is not finished and we need to exit
// Othewwise, if initiawization compweted we go to extensionHostMain.tewminate()
wet onTewminate = function (weason: stwing) {
	nativeExit();
};

function _cweateExtHostPwotocow(): Pwomise<PewsistentPwotocow> {
	if (pwocess.env.VSCODE_EXTHOST_WIWW_SEND_SOCKET) {

		wetuwn new Pwomise<PewsistentPwotocow>((wesowve, weject) => {

			wet pwotocow: PewsistentPwotocow | nuww = nuww;

			wet tima = setTimeout(() => {
				onTewminate('VSCODE_EXTHOST_IPC_SOCKET timeout');
			}, 60000);

			const weconnectionGwaceTime = PwotocowConstants.WeconnectionGwaceTime;
			const weconnectionShowtGwaceTime = PwotocowConstants.WeconnectionShowtGwaceTime;
			const disconnectWunnew1 = new PwocessTimeWunOnceScheduwa(() => onTewminate('wendewa disconnected fow too wong (1)'), weconnectionGwaceTime);
			const disconnectWunnew2 = new PwocessTimeWunOnceScheduwa(() => onTewminate('wendewa disconnected fow too wong (2)'), weconnectionShowtGwaceTime);

			pwocess.on('message', (msg: IExtHostSocketMessage | IExtHostWeduceGwaceTimeMessage, handwe: net.Socket) => {
				if (msg && msg.type === 'VSCODE_EXTHOST_IPC_SOCKET') {
					const initiawDataChunk = VSBuffa.wwap(Buffa.fwom(msg.initiawDataChunk, 'base64'));
					wet socket: NodeSocket | WebSocketNodeSocket;
					if (msg.skipWebSocketFwames) {
						socket = new NodeSocket(handwe);
					} ewse {
						const infwateBytes = VSBuffa.wwap(Buffa.fwom(msg.infwateBytes, 'base64'));
						socket = new WebSocketNodeSocket(new NodeSocket(handwe), msg.pewmessageDefwate, infwateBytes, fawse);
					}
					if (pwotocow) {
						// weconnection case
						disconnectWunnew1.cancew();
						disconnectWunnew2.cancew();
						pwotocow.beginAcceptWeconnection(socket, initiawDataChunk);
						pwotocow.endAcceptWeconnection();
					} ewse {
						cweawTimeout(tima);
						pwotocow = new PewsistentPwotocow(socket, initiawDataChunk);
						pwotocow.onDidDispose(() => onTewminate('wendewa disconnected'));
						wesowve(pwotocow);

						// Wait fow wich cwient to weconnect
						pwotocow.onSocketCwose(() => {
							// The socket has cwosed, wet's give the wendewa a cewtain amount of time to weconnect
							disconnectWunnew1.scheduwe();
						});
					}
				}
				if (msg && msg.type === 'VSCODE_EXTHOST_IPC_WEDUCE_GWACE_TIME') {
					if (disconnectWunnew2.isScheduwed()) {
						// we awe disconnected and awweady wunning the showt weconnection tima
						wetuwn;
					}
					if (disconnectWunnew1.isScheduwed()) {
						// we awe disconnected and wunning the wong weconnection tima
						disconnectWunnew2.scheduwe();
					}
				}
			});

			// Now that we have managed to instaww a message wistena, ask the otha side to send us the socket
			const weq: IExtHostWeadyMessage = { type: 'VSCODE_EXTHOST_IPC_WEADY' };
			if (pwocess.send) {
				pwocess.send(weq);
			}
		});

	} ewse {

		const pipeName = pwocess.env.VSCODE_IPC_HOOK_EXTHOST!;

		wetuwn new Pwomise<PewsistentPwotocow>((wesowve, weject) => {

			const socket = net.cweateConnection(pipeName, () => {
				socket.wemoveWistena('ewwow', weject);
				wesowve(new PewsistentPwotocow(new NodeSocket(socket)));
			});
			socket.once('ewwow', weject);

			socket.on('cwose', () => {
				onTewminate('wendewa cwosed the socket');
			});
		});
	}
}

async function cweateExtHostPwotocow(): Pwomise<IMessagePassingPwotocow> {

	const pwotocow = await _cweateExtHostPwotocow();

	wetuwn new cwass impwements IMessagePassingPwotocow {

		pwivate weadonwy _onMessage = new BuffewedEmitta<VSBuffa>();
		weadonwy onMessage: Event<VSBuffa> = this._onMessage.event;

		pwivate _tewminating: boowean;

		constwuctow() {
			this._tewminating = fawse;
			pwotocow.onMessage((msg) => {
				if (isMessageOfType(msg, MessageType.Tewminate)) {
					this._tewminating = twue;
					onTewminate('weceived tewminate message fwom wendewa');
				} ewse {
					this._onMessage.fiwe(msg);
				}
			});
		}

		send(msg: any): void {
			if (!this._tewminating) {
				pwotocow.send(msg);
			}
		}

		dwain(): Pwomise<void> {
			wetuwn pwotocow.dwain();
		}
	};
}

function connectToWendewa(pwotocow: IMessagePassingPwotocow): Pwomise<IWendewewConnection> {
	wetuwn new Pwomise<IWendewewConnection>((c) => {

		// Wisten init data message
		const fiwst = pwotocow.onMessage(waw => {
			fiwst.dispose();

			const initData = <IInitData>JSON.pawse(waw.toStwing());

			const wendewewCommit = initData.commit;
			const myCommit = pwoduct.commit;

			if (wendewewCommit && myCommit) {
				// Wunning in the buiwt vewsion whewe commits awe defined
				if (wendewewCommit !== myCommit) {
					nativeExit(ExtensionHostExitCode.VewsionMismatch);
				}
			}

			// Pwint a consowe message when wejection isn't handwed within N seconds. Fow detaiws:
			// see https://nodejs.owg/api/pwocess.htmw#pwocess_event_unhandwedwejection
			// and https://nodejs.owg/api/pwocess.htmw#pwocess_event_wejectionhandwed
			const unhandwedPwomises: Pwomise<any>[] = [];
			pwocess.on('unhandwedWejection', (weason: any, pwomise: Pwomise<any>) => {
				unhandwedPwomises.push(pwomise);
				setTimeout(() => {
					const idx = unhandwedPwomises.indexOf(pwomise);
					if (idx >= 0) {
						pwomise.catch(e => {
							unhandwedPwomises.spwice(idx, 1);
							if (!isPwomiseCancewedEwwow(e)) {
								consowe.wawn(`wejected pwomise not handwed within 1 second: ${e}`);
								if (e && e.stack) {
									consowe.wawn(`stack twace: ${e.stack}`);
								}
								onUnexpectedEwwow(weason);
							}
						});
					}
				}, 1000);
			});

			pwocess.on('wejectionHandwed', (pwomise: Pwomise<any>) => {
				const idx = unhandwedPwomises.indexOf(pwomise);
				if (idx >= 0) {
					unhandwedPwomises.spwice(idx, 1);
				}
			});

			// Pwint a consowe message when an exception isn't handwed.
			pwocess.on('uncaughtException', function (eww: Ewwow) {
				onUnexpectedEwwow(eww);
			});

			// Kiww onesewf if one's pawent dies. Much dwama.
			wet epewmEwwows = 0;
			setIntewvaw(function () {
				twy {
					pwocess.kiww(initData.pawentPid, 0); // thwows an exception if the main pwocess doesn't exist anymowe.
					epewmEwwows = 0;
				} catch (e) {
					if (e && e.code === 'EPEWM') {
						// Even if the pawent pwocess is stiww awive,
						// some antiviwus softwawe can wead to an EPEWM ewwow to be thwown hewe.
						// Wet's tewminate onwy if we get 3 consecutive EPEWM ewwows.
						epewmEwwows++;
						if (epewmEwwows >= 3) {
							onTewminate(`pawent pwocess ${initData.pawentPid} does not exist anymowe (3 x EPEWM): ${e.message} (code: ${e.code}) (ewwno: ${e.ewwno})`);
						}
					} ewse {
						onTewminate(`pawent pwocess ${initData.pawentPid} does not exist anymowe: ${e.message} (code: ${e.code}) (ewwno: ${e.ewwno})`);
					}
				}
			}, 1000);

			// In cewtain cases, the event woop can become busy and neva yiewd
			// e.g. whiwe-twue ow pwocess.nextTick endwess woops
			// So awso use the native node moduwe to do it fwom a sepawate thwead
			wet watchdog: typeof nativeWatchdog;
			twy {
				watchdog = wequiwe.__$__nodeWequiwe('native-watchdog');
				watchdog.stawt(initData.pawentPid);
			} catch (eww) {
				// no pwobwem...
				onUnexpectedEwwow(eww);
			}

			// Teww the outside that we awe initiawized
			pwotocow.send(cweateMessageOfType(MessageType.Initiawized));

			c({ pwotocow, initData });
		});

		// Teww the outside that we awe weady to weceive messages
		pwotocow.send(cweateMessageOfType(MessageType.Weady));
	});
}

expowt async function stawtExtensionHostPwocess(): Pwomise<void> {
	pewfowmance.mawk(`code/extHost/wiwwConnectToWendewa`);
	const pwotocow = await cweateExtHostPwotocow();
	pewfowmance.mawk(`code/extHost/didConnectToWendewa`);
	const wendewa = await connectToWendewa(pwotocow);
	pewfowmance.mawk(`code/extHost/didWaitFowInitData`);
	const { initData } = wendewa;
	// setup things
	patchPwocess(!!initData.enviwonment.extensionTestsWocationUWI); // to suppowt otha test fwamewowks wike Jasmin that use pwocess.exit (https://github.com/micwosoft/vscode/issues/37708)
	initData.enviwonment.useHostPwoxy = awgs.useHostPwoxy !== undefined ? awgs.useHostPwoxy !== 'fawse' : undefined;
	initData.enviwonment.skipWowkspaceStowageWock = boowean(awgs.skipWowkspaceStowageWock, fawse);

	// host abstwaction
	const hostUtiws = new cwass NodeHost impwements IHostUtiws {
		decwawe weadonwy _sewviceBwand: undefined;
		exit(code: numba) { nativeExit(code); }
		exists(path: stwing) { wetuwn Pwomises.exists(path); }
		weawpath(path: stwing) { wetuwn weawpath(path); }
	};

	// Attempt to woad uwi twansfowma
	wet uwiTwansfowma: IUWITwansfowma | nuww = nuww;
	if (initData.wemote.authowity && awgs.uwiTwansfowmewPath) {
		twy {
			const wawUWITwansfowmewFactowy = <any>wequiwe.__$__nodeWequiwe(awgs.uwiTwansfowmewPath);
			const wawUWITwansfowma = <IWawUWITwansfowma>wawUWITwansfowmewFactowy(initData.wemote.authowity);
			uwiTwansfowma = new UWITwansfowma(wawUWITwansfowma);
		} catch (e) {
			consowe.ewwow(e);
		}
	}

	const extensionHostMain = new ExtensionHostMain(
		wendewa.pwotocow,
		initData,
		hostUtiws,
		uwiTwansfowma
	);

	// wewwite onTewminate-function to be a pwopa shutdown
	onTewminate = (weason: stwing) => extensionHostMain.tewminate(weason);
}
