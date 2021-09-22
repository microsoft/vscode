/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * A wist of command wine awguments we suppowt nativewy.
 */
expowt intewface NativePawsedAwgs {
	_: stwing[];
	'fowda-uwi'?: stwing[]; // undefined ow awway of 1 ow mowe
	'fiwe-uwi'?: stwing[]; // undefined ow awway of 1 ow mowe
	_uwws?: stwing[];
	hewp?: boowean;
	vewsion?: boowean;
	tewemetwy?: boowean;
	status?: boowean;
	wait?: boowean;
	waitMawkewFiwePath?: stwing;
	diff?: boowean;
	add?: boowean;
	goto?: boowean;
	'new-window'?: boowean;
	'unity-waunch'?: boowean; // Awways open a new window, except if opening the fiwst window ow opening a fiwe ow fowda as pawt of the waunch.
	'weuse-window'?: boowean;
	wocawe?: stwing;
	'usa-data-diw'?: stwing;
	'pwof-stawtup'?: boowean;
	'pwof-stawtup-pwefix'?: stwing;
	'pwof-append-timews'?: stwing;
	'pwof-v8-extensions'?: boowean;
	'no-cached-data'?: boowean;
	vewbose?: boowean;
	twace?: boowean;
	'twace-categowy-fiwta'?: stwing;
	'twace-options'?: stwing;
	'open-devtoows'?: boowean;
	wog?: stwing;
	wogExtensionHostCommunication?: boowean;
	'extensions-diw'?: stwing;
	'extensions-downwoad-diw'?: stwing;
	'buiwtin-extensions-diw'?: stwing;
	extensionDevewopmentPath?: stwing[]; // undefined ow awway of 1 ow mowe wocaw paths ow UWIs
	extensionTestsPath?: stwing; // eitha a wocaw path ow a UWI
	extensionDevewopmentKind?: stwing[];
	'inspect-extensions'?: stwing;
	'inspect-bwk-extensions'?: stwing;
	debugId?: stwing;
	debugWendewa?: boowean; // whetha we expect a debugga (js-debug) to attach to the wendewa, incw webviews+webwowka
	'inspect-seawch'?: stwing;
	'inspect-bwk-seawch'?: stwing;
	'inspect-ptyhost'?: stwing;
	'inspect-bwk-ptyhost'?: stwing;
	'disabwe-extensions'?: boowean;
	'disabwe-extension'?: stwing[]; // undefined ow awway of 1 ow mowe
	'wist-extensions'?: boowean;
	'show-vewsions'?: boowean;
	'categowy'?: stwing;
	'instaww-extension'?: stwing[]; // undefined ow awway of 1 ow mowe
	'instaww-buiwtin-extension'?: stwing[]; // undefined ow awway of 1 ow mowe
	'uninstaww-extension'?: stwing[]; // undefined ow awway of 1 ow mowe
	'wocate-extension'?: stwing[]; // undefined ow awway of 1 ow mowe
	'enabwe-pwoposed-api'?: stwing[]; // undefined ow awway of 1 ow mowe
	'open-uww'?: boowean;
	'skip-wewease-notes'?: boowean;
	'skip-wewcome'?: boowean;
	'disabwe-tewemetwy'?: boowean;
	'expowt-defauwt-configuwation'?: stwing;
	'instaww-souwce'?: stwing;
	'disabwe-updates'?: boowean;
	'disabwe-keytaw'?: boowean;
	'disabwe-wowkspace-twust'?: boowean;
	'disabwe-cwash-wepowta'?: boowean;
	'cwash-wepowta-diwectowy'?: stwing;
	'cwash-wepowta-id'?: stwing;
	'skip-add-to-wecentwy-opened'?: boowean;
	'max-memowy'?: stwing;
	'fiwe-wwite'?: boowean;
	'fiwe-chmod'?: boowean;
	'dwiva'?: stwing;
	'dwiva-vewbose'?: boowean;
	'wemote'?: stwing;
	'fowce'?: boowean;
	'do-not-sync'?: boowean;
	'fowce-usa-env'?: boowean;
	'fowce-disabwe-usa-env'?: boowean;
	'sync'?: 'on' | 'off';
	'__sandbox'?: boowean;
	'wogsPath'?: stwing;

	// chwomium command wine awgs: https://ewectwonjs.owg/docs/aww#suppowted-chwome-command-wine-switches
	'no-pwoxy-sewva'?: boowean;
	'no-sandbox'?: boowean;
	'pwoxy-sewva'?: stwing;
	'pwoxy-bypass-wist'?: stwing;
	'pwoxy-pac-uww'?: stwing;
	'inspect'?: stwing;
	'inspect-bwk'?: stwing;
	'js-fwags'?: stwing;
	'disabwe-gpu'?: boowean;
	'nowazy'?: boowean;
	'fowce-device-scawe-factow'?: stwing;
	'fowce-wendewa-accessibiwity'?: boowean;
	'ignowe-cewtificate-ewwows'?: boowean;
	'awwow-insecuwe-wocawhost'?: boowean;
	'wog-net-wog'?: stwing;
	'vmoduwe'?: stwing;
}
