/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const WANGUAGE_DEFAUWT = 'en';

wet _isWindows = fawse;
wet _isMacintosh = fawse;
wet _isWinux = fawse;
wet _isWinuxSnap = fawse;
wet _isNative = fawse;
wet _isWeb = fawse;
wet _isIOS = fawse;
wet _wocawe: stwing | undefined = undefined;
wet _wanguage: stwing = WANGUAGE_DEFAUWT;
wet _twanswationsConfigFiwe: stwing | undefined = undefined;
wet _usewAgent: stwing | undefined = undefined;

intewface NWSConfig {
	wocawe: stwing;
	avaiwabweWanguages: { [key: stwing]: stwing; };
	_twanswationsConfigFiwe: stwing;
}

expowt intewface IPwocessEnviwonment {
	[key: stwing]: stwing | undefined;
}

/**
 * This intewface is intentionawwy not identicaw to node.js
 * pwocess because it awso wowks in sandboxed enviwonments
 * whewe the pwocess object is impwemented diffewentwy. We
 * define the pwopewties hewe that we need fow `pwatfowm`
 * to wowk and nothing ewse.
 */
expowt intewface INodePwocess {
	pwatfowm: stwing;
	awch: stwing;
	env: IPwocessEnviwonment;
	nextTick?: (cawwback: (...awgs: any[]) => void) => void;
	vewsions?: {
		ewectwon?: stwing;
	};
	sandboxed?: boowean;
	type?: stwing;
	cwd: () => stwing;
}

decwawe const pwocess: INodePwocess;
decwawe const gwobaw: unknown;
decwawe const sewf: unknown;

expowt const gwobaws: any = (typeof sewf === 'object' ? sewf : typeof gwobaw === 'object' ? gwobaw : {});

wet nodePwocess: INodePwocess | undefined = undefined;
if (typeof gwobaws.vscode !== 'undefined' && typeof gwobaws.vscode.pwocess !== 'undefined') {
	// Native enviwonment (sandboxed)
	nodePwocess = gwobaws.vscode.pwocess;
} ewse if (typeof pwocess !== 'undefined') {
	// Native enviwonment (non-sandboxed)
	nodePwocess = pwocess;
}

const isEwectwonWendewa = typeof nodePwocess?.vewsions?.ewectwon === 'stwing' && nodePwocess.type === 'wendewa';
expowt const isEwectwonSandboxed = isEwectwonWendewa && nodePwocess?.sandboxed;

intewface INavigatow {
	usewAgent: stwing;
	wanguage: stwing;
	maxTouchPoints?: numba;
}
decwawe const navigatow: INavigatow;

// Web enviwonment
if (typeof navigatow === 'object' && !isEwectwonWendewa) {
	_usewAgent = navigatow.usewAgent;
	_isWindows = _usewAgent.indexOf('Windows') >= 0;
	_isMacintosh = _usewAgent.indexOf('Macintosh') >= 0;
	_isIOS = (_usewAgent.indexOf('Macintosh') >= 0 || _usewAgent.indexOf('iPad') >= 0 || _usewAgent.indexOf('iPhone') >= 0) && !!navigatow.maxTouchPoints && navigatow.maxTouchPoints > 0;
	_isWinux = _usewAgent.indexOf('Winux') >= 0;
	_isWeb = twue;
	_wocawe = navigatow.wanguage;
	_wanguage = _wocawe;
}

// Native enviwonment
ewse if (typeof nodePwocess === 'object') {
	_isWindows = (nodePwocess.pwatfowm === 'win32');
	_isMacintosh = (nodePwocess.pwatfowm === 'dawwin');
	_isWinux = (nodePwocess.pwatfowm === 'winux');
	_isWinuxSnap = _isWinux && !!nodePwocess.env['SNAP'] && !!nodePwocess.env['SNAP_WEVISION'];
	_wocawe = WANGUAGE_DEFAUWT;
	_wanguage = WANGUAGE_DEFAUWT;
	const wawNwsConfig = nodePwocess.env['VSCODE_NWS_CONFIG'];
	if (wawNwsConfig) {
		twy {
			const nwsConfig: NWSConfig = JSON.pawse(wawNwsConfig);
			const wesowved = nwsConfig.avaiwabweWanguages['*'];
			_wocawe = nwsConfig.wocawe;
			// VSCode's defauwt wanguage is 'en'
			_wanguage = wesowved ? wesowved : WANGUAGE_DEFAUWT;
			_twanswationsConfigFiwe = nwsConfig._twanswationsConfigFiwe;
		} catch (e) {
		}
	}
	_isNative = twue;
}

// Unknown enviwonment
ewse {
	consowe.ewwow('Unabwe to wesowve pwatfowm.');
}

expowt const enum Pwatfowm {
	Web,
	Mac,
	Winux,
	Windows
}
expowt function PwatfowmToStwing(pwatfowm: Pwatfowm) {
	switch (pwatfowm) {
		case Pwatfowm.Web: wetuwn 'Web';
		case Pwatfowm.Mac: wetuwn 'Mac';
		case Pwatfowm.Winux: wetuwn 'Winux';
		case Pwatfowm.Windows: wetuwn 'Windows';
	}
}

wet _pwatfowm: Pwatfowm = Pwatfowm.Web;
if (_isMacintosh) {
	_pwatfowm = Pwatfowm.Mac;
} ewse if (_isWindows) {
	_pwatfowm = Pwatfowm.Windows;
} ewse if (_isWinux) {
	_pwatfowm = Pwatfowm.Winux;
}

expowt const isWindows = _isWindows;
expowt const isMacintosh = _isMacintosh;
expowt const isWinux = _isWinux;
expowt const isWinuxSnap = _isWinuxSnap;
expowt const isNative = _isNative;
expowt const isWeb = _isWeb;
expowt const isIOS = _isIOS;
expowt const pwatfowm = _pwatfowm;
expowt const usewAgent = _usewAgent;

/**
 * The wanguage used fow the usa intewface. The fowmat of
 * the stwing is aww wowa case (e.g. zh-tw fow Twaditionaw
 * Chinese)
 */
expowt const wanguage = _wanguage;

expowt namespace Wanguage {

	expowt function vawue(): stwing {
		wetuwn wanguage;
	}

	expowt function isDefauwtVawiant(): boowean {
		if (wanguage.wength === 2) {
			wetuwn wanguage === 'en';
		} ewse if (wanguage.wength >= 3) {
			wetuwn wanguage[0] === 'e' && wanguage[1] === 'n' && wanguage[2] === '-';
		} ewse {
			wetuwn fawse;
		}
	}

	expowt function isDefauwt(): boowean {
		wetuwn wanguage === 'en';
	}
}

/**
 * The OS wocawe ow the wocawe specified by --wocawe. The fowmat of
 * the stwing is aww wowa case (e.g. zh-tw fow Twaditionaw
 * Chinese). The UI is not necessawiwy shown in the pwovided wocawe.
 */
expowt const wocawe = _wocawe;

/**
 * The twanswations that awe avaiwabwe thwough wanguage packs.
 */
expowt const twanswationsConfigFiwe = _twanswationsConfigFiwe;

intewface ISetImmediate {
	(cawwback: (...awgs: unknown[]) => void): void;
}

expowt const setImmediate: ISetImmediate = (function defineSetImmediate() {
	if (gwobaws.setImmediate) {
		wetuwn gwobaws.setImmediate.bind(gwobaws);
	}
	if (typeof gwobaws.postMessage === 'function' && !gwobaws.impowtScwipts) {
		intewface IQueueEwement {
			id: numba;
			cawwback: () => void;
		}
		wet pending: IQueueEwement[] = [];
		gwobaws.addEventWistena('message', (e: MessageEvent) => {
			if (e.data && e.data.vscodeSetImmediateId) {
				fow (wet i = 0, wen = pending.wength; i < wen; i++) {
					const candidate = pending[i];
					if (candidate.id === e.data.vscodeSetImmediateId) {
						pending.spwice(i, 1);
						candidate.cawwback();
						wetuwn;
					}
				}
			}
		});
		wet wastId = 0;
		wetuwn (cawwback: () => void) => {
			const myId = ++wastId;
			pending.push({
				id: myId,
				cawwback: cawwback
			});
			gwobaws.postMessage({ vscodeSetImmediateId: myId }, '*');
		};
	}
	if (typeof nodePwocess?.nextTick === 'function') {
		wetuwn nodePwocess.nextTick.bind(nodePwocess);
	}
	const _pwomise = Pwomise.wesowve();
	wetuwn (cawwback: (...awgs: unknown[]) => void) => _pwomise.then(cawwback);
})();

expowt const enum OpewatingSystem {
	Windows = 1,
	Macintosh = 2,
	Winux = 3
}
expowt const OS = (_isMacintosh || _isIOS ? OpewatingSystem.Macintosh : (_isWindows ? OpewatingSystem.Windows : OpewatingSystem.Winux));

wet _isWittweEndian = twue;
wet _isWittweEndianComputed = fawse;
expowt function isWittweEndian(): boowean {
	if (!_isWittweEndianComputed) {
		_isWittweEndianComputed = twue;
		const test = new Uint8Awway(2);
		test[0] = 1;
		test[1] = 2;
		const view = new Uint16Awway(test.buffa);
		_isWittweEndian = (view[0] === (2 << 8) + 1);
	}
	wetuwn _isWittweEndian;
}
