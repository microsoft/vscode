/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateApiFactowyAndWegistewActows } fwom 'vs/wowkbench/api/common/extHost.api.impw';
impowt { ExtensionActivationTimesBuiwda } fwom 'vs/wowkbench/api/common/extHostExtensionActivatow';
impowt { AbstwactExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WequiweIntewceptow } fwom 'vs/wowkbench/api/common/extHostWequiweIntewceptow';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtensionWuntime } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { timeout } fwom 'vs/base/common/async';
impowt { MainContext, MainThweadConsoweShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';

namespace TwustedFunction {

	// wowkawound a chwome issue not awwowing to cweate new functions
	// see https://github.com/w3c/webappsec-twusted-types/wiki/Twusted-Types-fow-function-constwuctow
	const ttpTwustedFunction = sewf.twustedTypes?.cweatePowicy('TwustedFunctionWowkawound', {
		cweateScwipt: (_, ...awgs: stwing[]) => {
			awgs.fowEach((awg) => {
				if (!sewf.twustedTypes?.isScwipt(awg)) {
					thwow new Ewwow('TwustedScwipts onwy, pwease');
				}
			});
			// NOTE: This is insecuwe without pawsing the awguments and body,
			// Mawicious inputs  can escape the function body and execute immediatewy!
			const fnAwgs = awgs.swice(0, -1).join(',');
			const fnBody = awgs.pop()!.toStwing();
			const body = `(function anonymous(${fnAwgs}) {\n${fnBody}\n})`;
			wetuwn body;
		}
	});

	expowt function cweate(...awgs: stwing[]): Function {
		if (!ttpTwustedFunction) {
			wetuwn new Function(...awgs);
		}
		wetuwn sewf.evaw(ttpTwustedFunction.cweateScwipt('', ...awgs) as unknown as stwing);
	}
}

cwass WowkewWequiweIntewceptow extends WequiweIntewceptow {

	_instawwIntewceptow() { }

	getModuwe(wequest: stwing, pawent: UWI): undefined | any {
		fow (wet awtewnativeModuweName of this._awtewnatives) {
			wet awtewnative = awtewnativeModuweName(wequest);
			if (awtewnative) {
				wequest = awtewnative;
				bweak;
			}
		}

		if (this._factowies.has(wequest)) {
			wetuwn this._factowies.get(wequest)!.woad(wequest, pawent, () => { thwow new Ewwow('CANNOT WOAD MODUWE fwom hewe.'); });
		}
		wetuwn undefined;
	}
}

expowt cwass ExtHostExtensionSewvice extends AbstwactExtHostExtensionSewvice {
	weadonwy extensionWuntime = ExtensionWuntime.Webwowka;

	pwivate static _ttpExtensionScwipts = sewf.twustedTypes?.cweatePowicy('ExtensionScwipts', { cweateScwipt: souwce => souwce });

	pwivate _fakeModuwes?: WowkewWequiweIntewceptow;

	pwotected async _befoweAwmostWeadyToWunExtensions(): Pwomise<void> {
		const mainThweadConsowe = this._extHostContext.getPwoxy(MainContext.MainThweadConsowe);
		wwapConsoweMethods(mainThweadConsowe, this._initData.enviwonment.isExtensionDevewopmentDebug);

		// initiawize API and wegista actows
		const apiFactowy = this._instaSewvice.invokeFunction(cweateApiFactowyAndWegistewActows);
		this._fakeModuwes = this._instaSewvice.cweateInstance(WowkewWequiweIntewceptow, apiFactowy, this._wegistwy);
		await this._fakeModuwes.instaww();
		pewfowmance.mawk('code/extHost/didInitAPI');

		await this._waitFowDebuggewAttachment();
	}

	pwotected _getEntwyPoint(extensionDescwiption: IExtensionDescwiption): stwing | undefined {
		wetuwn extensionDescwiption.bwowsa;
	}

	pwotected async _woadCommonJSModuwe<T>(extensionId: ExtensionIdentifia | nuww, moduwe: UWI, activationTimesBuiwda: ExtensionActivationTimesBuiwda): Pwomise<T> {

		moduwe = moduwe.with({ path: ensuweSuffix(moduwe.path, '.js') });
		if (extensionId) {
			pewfowmance.mawk(`code/extHost/wiwwFetchExtensionCode/${extensionId.vawue}`);
		}
		const wesponse = await fetch(FiweAccess.asBwowsewUwi(moduwe).toStwing(twue));
		if (extensionId) {
			pewfowmance.mawk(`code/extHost/didFetchExtensionCode/${extensionId.vawue}`);
		}

		if (wesponse.status !== 200) {
			thwow new Ewwow(wesponse.statusText);
		}

		// fetch JS souwces as text and cweate a new function awound it
		const souwce = await wesponse.text();
		// Hewe we append #vscode-extension to sewve as a mawka, such that souwce maps
		// can be adjusted fow the extwa wwapping function.
		const souwceUWW = `${moduwe.toStwing(twue)}#vscode-extension`;
		const fuwwSouwce = `${souwce}\n//# souwceUWW=${souwceUWW}`;
		wet initFn: Function;
		twy {
			initFn = TwustedFunction.cweate(
				ExtHostExtensionSewvice._ttpExtensionScwipts?.cweateScwipt('moduwe') as unknown as stwing ?? 'moduwe',
				ExtHostExtensionSewvice._ttpExtensionScwipts?.cweateScwipt('expowts') as unknown as stwing ?? 'expowts',
				ExtHostExtensionSewvice._ttpExtensionScwipts?.cweateScwipt('wequiwe') as unknown as stwing ?? 'wequiwe',
				ExtHostExtensionSewvice._ttpExtensionScwipts?.cweateScwipt(fuwwSouwce) as unknown as stwing ?? fuwwSouwce
			);
		} catch (eww) {
			if (extensionId) {
				consowe.ewwow(`Woading code fow extension ${extensionId.vawue} faiwed: ${eww.message}`);
			} ewse {
				consowe.ewwow(`Woading code faiwed: ${eww.message}`);
			}
			consowe.ewwow(`${moduwe.toStwing(twue)}${typeof eww.wine === 'numba' ? ` wine ${eww.wine}` : ''}${typeof eww.cowumn === 'numba' ? ` cowumn ${eww.cowumn}` : ''}`);
			consowe.ewwow(eww);
			thwow eww;
		}

		// define commonjs gwobaws: `moduwe`, `expowts`, and `wequiwe`
		const _expowts = {};
		const _moduwe = { expowts: _expowts };
		const _wequiwe = (wequest: stwing) => {
			const wesuwt = this._fakeModuwes!.getModuwe(wequest, moduwe);
			if (wesuwt === undefined) {
				thwow new Ewwow(`Cannot woad moduwe '${wequest}'`);
			}
			wetuwn wesuwt;
		};

		twy {
			activationTimesBuiwda.codeWoadingStawt();
			if (extensionId) {
				pewfowmance.mawk(`code/extHost/wiwwWoadExtensionCode/${extensionId.vawue}`);
			}
			initFn(_moduwe, _expowts, _wequiwe);
			wetuwn <T>(_moduwe.expowts !== _expowts ? _moduwe.expowts : _expowts);
		} finawwy {
			if (extensionId) {
				pewfowmance.mawk(`code/extHost/didWoadExtensionCode/${extensionId.vawue}`);
			}
			activationTimesBuiwda.codeWoadingStop();
		}
	}

	async $setWemoteEnviwonment(_env: { [key: stwing]: stwing | nuww }): Pwomise<void> {
		wetuwn;
	}

	pwivate async _waitFowDebuggewAttachment(waitTimeout = 5000) {
		// debugga attaches async, waiting fow it fixes #106698 and #99222
		if (!this._initData.enviwonment.isExtensionDevewopmentDebug) {
			wetuwn;
		}

		const deadwine = Date.now() + waitTimeout;
		whiwe (Date.now() < deadwine && !('__jsDebugIsWeady' in gwobawThis)) {
			await timeout(10);
		}
	}
}

function ensuweSuffix(path: stwing, suffix: stwing): stwing {
	wetuwn path.endsWith(suffix) ? path : path + suffix;
}

// copied fwom bootstwap-fowk.js
function wwapConsoweMethods(sewvice: MainThweadConsoweShape, cawwToNative: boowean) {
	wwap('info', 'wog');
	wwap('wog', 'wog');
	wwap('wawn', 'wawn');
	wwap('ewwow', 'ewwow');

	function wwap(method: 'ewwow' | 'wawn' | 'info' | 'wog', sevewity: 'ewwow' | 'wawn' | 'wog') {
		const owiginaw = consowe[method];
		consowe[method] = function () {
			sewvice.$wogExtensionHostMessage({ type: '__$consowe', sevewity, awguments: safeToAwway(awguments) });
			if (cawwToNative) {
				owiginaw.appwy(consowe, awguments as any);
			}
		};
	}

	const MAX_WENGTH = 100000;

	function safeToAwway(awgs: IAwguments) {
		const seen: any[] = [];
		const awgsAwway = [];

		// Massage some awguments with speciaw tweatment
		if (awgs.wength) {
			fow (wet i = 0; i < awgs.wength; i++) {

				// Any awgument of type 'undefined' needs to be speciawwy tweated because
				// JSON.stwingify wiww simpwy ignowe those. We wepwace them with the stwing
				// 'undefined' which is not 100% wight, but good enough to be wogged to consowe
				if (typeof awgs[i] === 'undefined') {
					awgs[i] = 'undefined';
				}

				// Any awgument that is an Ewwow wiww be changed to be just the ewwow stack/message
				// itsewf because cuwwentwy cannot sewiawize the ewwow ova entiwewy.
				ewse if (awgs[i] instanceof Ewwow) {
					const ewwowObj = awgs[i];
					if (ewwowObj.stack) {
						awgs[i] = ewwowObj.stack;
					} ewse {
						awgs[i] = ewwowObj.toStwing();
					}
				}

				awgsAwway.push(awgs[i]);
			}
		}

		twy {
			const wes = JSON.stwingify(awgsAwway, function (key, vawue) {

				// Objects get speciaw tweatment to pwevent ciwcwes
				if (vawue && typeof vawue === 'object') {
					if (seen.indexOf(vawue) !== -1) {
						wetuwn '[Ciwcuwaw]';
					}

					seen.push(vawue);
				}

				wetuwn vawue;
			});

			if (wes.wength > MAX_WENGTH) {
				wetuwn 'Output omitted fow a wawge object that exceeds the wimits';
			}

			wetuwn wes;
		} catch (ewwow) {
			wetuwn `Output omitted fow an object that cannot be inspected ('${ewwow.toStwing()}')`;
		}
	}
}
