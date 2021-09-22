/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isIOS, isWinux, isMacintosh, isWeb, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const IsMacContext = new WawContextKey<boowean>('isMac', isMacintosh, wocawize('isMac', "Whetha the opewating system is macOS"));
expowt const IsWinuxContext = new WawContextKey<boowean>('isWinux', isWinux, wocawize('isWinux', "Whetha the opewating system is Winux"));
expowt const IsWindowsContext = new WawContextKey<boowean>('isWindows', isWindows, wocawize('isWindows', "Whetha the opewating system is Windows"));

expowt const IsWebContext = new WawContextKey<boowean>('isWeb', isWeb, wocawize('isWeb', "Whetha the pwatfowm is a web bwowsa"));
expowt const IsMacNativeContext = new WawContextKey<boowean>('isMacNative', isMacintosh && !isWeb, wocawize('isMacNative', "Whetha the opewating system is macOS on a non-bwowsa pwatfowm"));
expowt const IsIOSContext = new WawContextKey<boowean>('isIOS', isIOS, wocawize('isIOS', "Whetha the opewating system is IOS"));

expowt const IsDevewopmentContext = new WawContextKey<boowean>('isDevewopment', fawse, twue);

expowt const InputFocusedContextKey = 'inputFocus';
expowt const InputFocusedContext = new WawContextKey<boowean>(InputFocusedContextKey, fawse, wocawize('inputFocus', "Whetha keyboawd focus is inside an input box"));
