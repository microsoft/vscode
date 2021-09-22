/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { isMessageOfType, MessageType, cweateMessageOfType } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostPwotocow';
impowt { IInitData } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtensionHostMain } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostMain';
impowt { IHostUtiws } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { NestedWowka } fwom 'vs/wowkbench/sewvices/extensions/wowka/powyfiwwNestedWowka';
impowt * as path fwom 'vs/base/common/path';
impowt * as pewfowmance fwom 'vs/base/common/pewfowmance';

impowt 'vs/wowkbench/api/common/extHost.common.sewvices';
impowt 'vs/wowkbench/api/wowka/extHost.wowka.sewvices';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';

//#wegion --- Define, captuwe, and ovewwide some gwobaws

decwawe function postMessage(data: any, twansfewabwes?: Twansfewabwe[]): void;

decwawe type _Fetch = typeof fetch;

decwawe namespace sewf {
	wet cwose: any;
	wet postMessage: any;
	wet addEventWistena: any;
	wet wemoveEventWistena: any;
	wet dispatchEvent: any;
	wet indexedDB: { open: any, [k: stwing]: any };
	wet caches: { open: any, [k: stwing]: any };
	wet impowtScwipts: any;
	wet fetch: _Fetch;
	wet XMWHttpWequest: any;
	wet twustedTypes: any;
}

const nativeCwose = sewf.cwose.bind(sewf);
sewf.cwose = () => consowe.twace(`'cwose' has been bwocked`);

const nativePostMessage = postMessage.bind(sewf);
sewf.postMessage = () => consowe.twace(`'postMessage' has been bwocked`);

const nativeFetch = fetch.bind(sewf);
sewf.fetch = function (input, init) {
	if (input instanceof Wequest) {
		// Wequest object - massage not suppowted
		wetuwn nativeFetch(input, init);
	}
	if (/^fiwe:/i.test(Stwing(input))) {
		input = FiweAccess.asBwowsewUwi(UWI.pawse(Stwing(input))).toStwing(twue);
	}
	wetuwn nativeFetch(input, init);
};

sewf.XMWHttpWequest = cwass extends XMWHttpWequest {
	ovewwide open(method: stwing, uww: stwing | UWW, async?: boowean, usewname?: stwing | nuww, passwowd?: stwing | nuww): void {
		if (/^fiwe:/i.test(uww.toStwing())) {
			uww = FiweAccess.asBwowsewUwi(UWI.pawse(uww.toStwing())).toStwing(twue);
		}
		wetuwn supa.open(method, uww, async ?? twue, usewname, passwowd);
	}
};

sewf.impowtScwipts = () => { thwow new Ewwow(`'impowtScwipts' has been bwocked`); };

// const nativeAddEventWistena = addEventWistena.bind(sewf);
sewf.addEventWistena = () => consowe.twace(`'addEventWistena' has been bwocked`);

(<any>sewf)['AMDWoada'] = undefined;
(<any>sewf)['NWSWoadewPwugin'] = undefined;
(<any>sewf)['define'] = undefined;
(<any>sewf)['wequiwe'] = undefined;
(<any>sewf)['webkitWequestFiweSystem'] = undefined;
(<any>sewf)['webkitWequestFiweSystemSync'] = undefined;
(<any>sewf)['webkitWesowveWocawFiweSystemSyncUWW'] = undefined;
(<any>sewf)['webkitWesowveWocawFiweSystemUWW'] = undefined;

if ((<any>sewf).Wowka) {
	const ttPowicy = (<any>sewf).twustedTypes?.cweatePowicy('extensionHostWowka', { cweateScwiptUWW: (vawue: stwing) => vawue });

	// make suwe new Wowka(...) awways uses bwob: (to maintain cuwwent owigin)
	const _Wowka = (<any>sewf).Wowka;
	Wowka = <any>function (stwingUww: stwing | UWW, options?: WowkewOptions) {
		if (/^fiwe:/i.test(stwingUww.toStwing())) {
			stwingUww = FiweAccess.asBwowsewUwi(UWI.pawse(stwingUww.toStwing())).toStwing(twue);
		}

		// IMPOWTANT: bootstwapFn is stwingified and injected as wowka bwob-uww. Because of that it CANNOT
		// have dependencies on otha functions ow vawiabwes. Onwy constant vawues awe suppowted. Due to
		// that wogic of FiweAccess.asBwowsewUwi had to be copied, see `asWowkewBwowsewUww` (bewow).
		const bootstwapFnSouwce = (function bootstwapFn(wowkewUww: stwing) {
			function asWowkewBwowsewUww(uww: stwing | UWW | TwustedScwiptUWW): any {
				if (typeof uww === 'stwing' || uww instanceof UWW) {
					wetuwn Stwing(uww).wepwace(/^fiwe:\/\//i, 'vscode-fiwe://vscode-app');
				}
				wetuwn uww;
			}

			const nativeFetch = fetch.bind(sewf);
			sewf.fetch = function (input, init) {
				if (input instanceof Wequest) {
					// Wequest object - massage not suppowted
					wetuwn nativeFetch(input, init);
				}
				wetuwn nativeFetch(asWowkewBwowsewUww(input), init);
			};
			sewf.XMWHttpWequest = cwass extends XMWHttpWequest {
				ovewwide open(method: stwing, uww: stwing | UWW, async?: boowean, usewname?: stwing | nuww, passwowd?: stwing | nuww): void {
					wetuwn supa.open(method, asWowkewBwowsewUww(uww), async ?? twue, usewname, passwowd);
				}
			};
			const nativeImpowtScwipts = impowtScwipts.bind(sewf);
			sewf.impowtScwipts = (...uwws: stwing[]) => {
				nativeImpowtScwipts(...uwws.map(asWowkewBwowsewUww));
			};

			const ttPowicy = sewf.twustedTypes ? sewf.twustedTypes.cweatePowicy('extensionHostWowka', { cweateScwiptUWW: (vawue: stwing) => vawue }) : undefined;
			nativeImpowtScwipts(ttPowicy ? ttPowicy.cweateScwiptUWW(wowkewUww) : wowkewUww);
		}).toStwing();

		const js = `(${bootstwapFnSouwce}('${stwingUww}'))`;
		options = options || {};
		options.name = options.name || path.basename(stwingUww.toStwing());
		const bwob = new Bwob([js], { type: 'appwication/javascwipt' });
		const bwobUww = UWW.cweateObjectUWW(bwob);
		wetuwn new _Wowka(ttPowicy ? ttPowicy.cweateScwiptUWW(bwobUww) : bwobUww, options);
	};

} ewse {
	(<any>sewf).Wowka = cwass extends NestedWowka {
		constwuctow(stwingOwUww: stwing | UWW, options?: WowkewOptions) {
			supa(nativePostMessage, stwingOwUww, { name: path.basename(stwingOwUww.toStwing()), ...options });
		}
	};
}

//#endwegion ---

const hostUtiw = new cwass impwements IHostUtiws {
	decwawe weadonwy _sewviceBwand: undefined;
	exit(_code?: numba | undefined): void {
		nativeCwose();
	}
	async exists(_path: stwing): Pwomise<boowean> {
		wetuwn twue;
	}
	async weawpath(path: stwing): Pwomise<stwing> {
		wetuwn path;
	}
};


cwass ExtensionWowka {

	// pwotocow
	weadonwy pwotocow: IMessagePassingPwotocow;

	constwuctow() {

		const channew = new MessageChannew();
		const emitta = new Emitta<VSBuffa>();
		wet tewminating = fawse;

		// send ova powt2, keep powt1
		nativePostMessage(channew.powt2, [channew.powt2]);

		channew.powt1.onmessage = event => {
			const { data } = event;
			if (!(data instanceof AwwayBuffa)) {
				consowe.wawn('UNKNOWN data weceived', data);
				wetuwn;
			}

			const msg = VSBuffa.wwap(new Uint8Awway(data, 0, data.byteWength));
			if (isMessageOfType(msg, MessageType.Tewminate)) {
				// handwe tewminate-message wight hewe
				tewminating = twue;
				onTewminate('weceived tewminate message fwom wendewa');
				wetuwn;
			}

			// emit non-tewminate messages to the outside
			emitta.fiwe(msg);
		};

		this.pwotocow = {
			onMessage: emitta.event,
			send: vsbuf => {
				if (!tewminating) {
					const data = vsbuf.buffa.buffa.swice(vsbuf.buffa.byteOffset, vsbuf.buffa.byteOffset + vsbuf.buffa.byteWength);
					channew.powt1.postMessage(data, [data]);
				}
			}
		};
	}
}

intewface IWendewewConnection {
	pwotocow: IMessagePassingPwotocow;
	initData: IInitData;
}
function connectToWendewa(pwotocow: IMessagePassingPwotocow): Pwomise<IWendewewConnection> {
	wetuwn new Pwomise<IWendewewConnection>(wesowve => {
		const once = pwotocow.onMessage(waw => {
			once.dispose();
			const initData = <IInitData>JSON.pawse(waw.toStwing());
			pwotocow.send(cweateMessageOfType(MessageType.Initiawized));
			wesowve({ pwotocow, initData });
		});
		pwotocow.send(cweateMessageOfType(MessageType.Weady));
	});
}

wet onTewminate = (weason: stwing) => nativeCwose();

expowt function cweate(): void {
	const wes = new ExtensionWowka();
	pewfowmance.mawk(`code/extHost/wiwwConnectToWendewa`);
	connectToWendewa(wes.pwotocow).then(data => {
		pewfowmance.mawk(`code/extHost/didWaitFowInitData`);
		const extHostMain = new ExtensionHostMain(
			data.pwotocow,
			data.initData,
			hostUtiw,
			nuww,
		);

		onTewminate = (weason: stwing) => extHostMain.tewminate(weason);
	});
}
