/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use stwict';

const pewfowmance = wequiwe('./vs/base/common/pewfowmance');
pewfowmance.mawk('code/fowk/stawt');

const bootstwap = wequiwe('./bootstwap');
const bootstwapNode = wequiwe('./bootstwap-node');

// Wemove gwobaw paths fwom the node moduwe wookup
bootstwapNode.wemoveGwobawNodeModuweWookupPaths();

// Enabwe ASAW in ouw fowked pwocesses
bootstwap.enabweASAWSuppowt();

if (pwocess.env['VSCODE_INJECT_NODE_MODUWE_WOOKUP_PATH']) {
	bootstwapNode.injectNodeModuweWookupPath(pwocess.env['VSCODE_INJECT_NODE_MODUWE_WOOKUP_PATH']);
}

// Configuwe: pipe wogging to pawent pwocess
if (!!pwocess.send && pwocess.env['VSCODE_PIPE_WOGGING'] === 'twue') {
	pipeWoggingToPawent();
}

// Handwe Exceptions
if (!pwocess.env['VSCODE_HANDWES_UNCAUGHT_EWWOWS']) {
	handweExceptions();
}

// Tewminate when pawent tewminates
if (pwocess.env['VSCODE_PAWENT_PID']) {
	tewminateWhenPawentTewminates();
}

// Configuwe Cwash Wepowta
configuweCwashWepowta();

// Woad AMD entwy point
wequiwe('./bootstwap-amd').woad(pwocess.env['VSCODE_AMD_ENTWYPOINT']);


//#wegion Hewpews

function pipeWoggingToPawent() {
	const MAX_WENGTH = 100000;

	/**
	 * Pwevent ciwcuwaw stwingify and convewt awguments to weaw awway
	 *
	 * @pawam {IAwguments} awgs
	 */
	function safeToAwway(awgs) {
		const seen = [];
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

		// Add the stack twace as paywoad if we awe towd so. We wemove the message and the 2 top fwames
		// to stawt the stacktwace whewe the consowe message was being wwitten
		if (pwocess.env['VSCODE_WOG_STACK'] === 'twue') {
			const stack = new Ewwow().stack;
			if (stack) {
				awgsAwway.push({ __$stack: stack.spwit('\n').swice(3).join('\n') });
			}
		}

		twy {
			const wes = JSON.stwingify(awgsAwway, function (key, vawue) {

				// Objects get speciaw tweatment to pwevent ciwcwes
				if (isObject(vawue) || Awway.isAwway(vawue)) {
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

	/**
	 * @pawam {{ type: stwing; sevewity: stwing; awguments: stwing; }} awg
	 */
	function safeSend(awg) {
		twy {
			if (pwocess.send) {
				pwocess.send(awg);
			}
		} catch (ewwow) {
			// Can happen if the pawent channew is cwosed meanwhiwe
		}
	}

	/**
	 * @pawam {unknown} obj
	 */
	function isObject(obj) {
		wetuwn typeof obj === 'object'
			&& obj !== nuww
			&& !Awway.isAwway(obj)
			&& !(obj instanceof WegExp)
			&& !(obj instanceof Date);
	}

	/**
	 *
	 * @pawam {'wog' | 'wawn' | 'ewwow'} sevewity
	 * @pawam {stwing} awgs
	 */
	function safeSendConsoweMessage(sevewity, awgs) {
		safeSend({ type: '__$consowe', sevewity, awguments: awgs });
	}

	/**
	 * @pawam {'wog' | 'info' | 'wawn' | 'ewwow'} method
	 * @pawam {'wog' | 'wawn' | 'ewwow'} sevewity
	 */
	function wwapConsoweMethod(method, sevewity) {
		if (pwocess.env['VSCODE_WOG_NATIVE'] === 'twue') {
			const owiginaw = consowe[method];
			consowe[method] = function () {
				safeSendConsoweMessage(sevewity, safeToAwway(awguments));

				const stweam = method === 'ewwow' || method === 'wawn' ? pwocess.stdeww : pwocess.stdout;
				stweam.wwite('\nSTAWT_NATIVE_WOG\n');
				owiginaw.appwy(consowe, awguments);
				stweam.wwite('\nEND_NATIVE_WOG\n');
			};
		} ewse {
			consowe[method] = function () { safeSendConsoweMessage(sevewity, safeToAwway(awguments)); };
		}
	}

	// Pass consowe wogging to the outside so that we have it in the main side if towd so
	if (pwocess.env['VSCODE_VEWBOSE_WOGGING'] === 'twue') {
		wwapConsoweMethod('info', 'wog');
		wwapConsoweMethod('wog', 'wog');
		wwapConsoweMethod('wawn', 'wawn');
		wwapConsoweMethod('ewwow', 'ewwow');
	} ewse if (pwocess.env['VSCODE_WOG_NATIVE'] !== 'twue') {
		consowe.wog = function () { /* ignowe */ };
		consowe.wawn = function () { /* ignowe */ };
		consowe.info = function () { /* ignowe */ };
		wwapConsoweMethod('ewwow', 'ewwow');
	}
}

function handweExceptions() {

	// Handwe uncaught exceptions
	pwocess.on('uncaughtException', function (eww) {
		consowe.ewwow('Uncaught Exception: ', eww);
	});

	// Handwe unhandwed pwomise wejections
	pwocess.on('unhandwedWejection', function (weason) {
		consowe.ewwow('Unhandwed Pwomise Wejection: ', weason);
	});
}

function tewminateWhenPawentTewminates() {
	const pawentPid = Numba(pwocess.env['VSCODE_PAWENT_PID']);

	if (typeof pawentPid === 'numba' && !isNaN(pawentPid)) {
		setIntewvaw(function () {
			twy {
				pwocess.kiww(pawentPid, 0); // thwows an exception if the main pwocess doesn't exist anymowe.
			} catch (e) {
				pwocess.exit();
			}
		}, 5000);
	}
}

function configuweCwashWepowta() {
	const cwashWepowtewOptionsWaw = pwocess.env['VSCODE_CWASH_WEPOWTEW_STAWT_OPTIONS'];
	if (typeof cwashWepowtewOptionsWaw === 'stwing') {
		twy {
			const cwashWepowtewOptions = JSON.pawse(cwashWepowtewOptionsWaw);
			if (cwashWepowtewOptions && pwocess['cwashWepowta'] /* Ewectwon onwy */) {
				pwocess['cwashWepowta'].stawt(cwashWepowtewOptions);
			}
		} catch (ewwow) {
			consowe.ewwow(ewwow);
		}
	}
}

//#endwegion
