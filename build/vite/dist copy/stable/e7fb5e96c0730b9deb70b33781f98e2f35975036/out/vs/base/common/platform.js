/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../nls.js';
export const LANGUAGE_DEFAULT = 'en';
let _isWindows = false;
let _isMacintosh = false;
let _isLinux = false;
let _isLinuxSnap = false;
let _isNative = false;
let _isWeb = false;
let _isElectron = false;
let _isIOS = false;
let _isCI = false;
let _isMobile = false;
let _locale = undefined;
let _language = LANGUAGE_DEFAULT;
let _platformLocale = LANGUAGE_DEFAULT;
let _translationsConfigFile = undefined;
let _userAgent = undefined;
const $globalThis = globalThis;
let nodeProcess = undefined;
if (typeof $globalThis.vscode !== 'undefined' && typeof $globalThis.vscode.process !== 'undefined') {
    // Native environment (sandboxed)
    nodeProcess = $globalThis.vscode.process;
}
else if (typeof process !== 'undefined' && typeof process?.versions?.node === 'string') {
    // Native environment (non-sandboxed)
    nodeProcess = process;
}
const isElectronProcess = typeof nodeProcess?.versions?.electron === 'string';
const isElectronRenderer = isElectronProcess && nodeProcess?.type === 'renderer';
// Native environment
if (typeof nodeProcess === 'object') {
    _isWindows = (nodeProcess.platform === 'win32');
    _isMacintosh = (nodeProcess.platform === 'darwin');
    _isLinux = (nodeProcess.platform === 'linux');
    _isLinuxSnap = _isLinux && !!nodeProcess.env['SNAP'] && !!nodeProcess.env['SNAP_REVISION'];
    _isElectron = isElectronProcess;
    _isCI = !!nodeProcess.env['CI'] || !!nodeProcess.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] || !!nodeProcess.env['GITHUB_WORKSPACE'];
    _locale = LANGUAGE_DEFAULT;
    _language = LANGUAGE_DEFAULT;
    const rawNlsConfig = nodeProcess.env['VSCODE_NLS_CONFIG'];
    if (rawNlsConfig) {
        try {
            const nlsConfig = JSON.parse(rawNlsConfig);
            _locale = nlsConfig.userLocale;
            _platformLocale = nlsConfig.osLocale;
            _language = nlsConfig.resolvedLanguage || LANGUAGE_DEFAULT;
            _translationsConfigFile = nlsConfig.languagePack?.translationsConfigFile;
        }
        catch (e) {
        }
    }
    _isNative = true;
}
// Web environment
else if (typeof navigator === 'object' && !isElectronRenderer) {
    _userAgent = navigator.userAgent;
    _isWindows = _userAgent.indexOf('Windows') >= 0;
    _isMacintosh = _userAgent.indexOf('Macintosh') >= 0;
    _isIOS = (_userAgent.indexOf('Macintosh') >= 0 || _userAgent.indexOf('iPad') >= 0 || _userAgent.indexOf('iPhone') >= 0) && !!navigator.maxTouchPoints && navigator.maxTouchPoints > 0;
    _isLinux = _userAgent.indexOf('Linux') >= 0;
    _isMobile = _userAgent?.indexOf('Mobi') >= 0;
    _isWeb = true;
    _language = nls.getNLSLanguage() || LANGUAGE_DEFAULT;
    _locale = navigator.language.toLowerCase();
    _platformLocale = _locale;
}
// Unknown environment
else {
    console.error('Unable to resolve platform.');
}
export var Platform;
(function (Platform) {
    Platform[Platform["Web"] = 0] = "Web";
    Platform[Platform["Mac"] = 1] = "Mac";
    Platform[Platform["Linux"] = 2] = "Linux";
    Platform[Platform["Windows"] = 3] = "Windows";
})(Platform || (Platform = {}));
export function PlatformToString(platform) {
    switch (platform) {
        case 0 /* Platform.Web */: return 'Web';
        case 1 /* Platform.Mac */: return 'Mac';
        case 2 /* Platform.Linux */: return 'Linux';
        case 3 /* Platform.Windows */: return 'Windows';
    }
}
let _platform = 0 /* Platform.Web */;
if (_isMacintosh) {
    _platform = 1 /* Platform.Mac */;
}
else if (_isWindows) {
    _platform = 3 /* Platform.Windows */;
}
else if (_isLinux) {
    _platform = 2 /* Platform.Linux */;
}
export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isLinux = _isLinux;
export const isLinuxSnap = _isLinuxSnap;
export const isNative = _isNative;
export const isElectron = _isElectron;
export const isWeb = _isWeb;
export const isWebWorker = (_isWeb && typeof $globalThis.importScripts === 'function');
export const webWorkerOrigin = isWebWorker ? $globalThis.origin : undefined;
export const isIOS = _isIOS;
export const isMobile = _isMobile;
/**
 * Whether we run inside a CI environment, such as
 * GH actions or Azure Pipelines.
 */
export const isCI = _isCI;
export const platform = _platform;
export const userAgent = _userAgent;
/**
 * The language used for the user interface. The format of
 * the string is all lower case (e.g. zh-tw for Traditional
 * Chinese or de for German)
 */
export const language = _language;
export var Language;
(function (Language) {
    function value() {
        return language;
    }
    Language.value = value;
    function isDefaultVariant() {
        if (language.length === 2) {
            return language === 'en';
        }
        else if (language.length >= 3) {
            return language[0] === 'e' && language[1] === 'n' && language[2] === '-';
        }
        else {
            return false;
        }
    }
    Language.isDefaultVariant = isDefaultVariant;
    function isDefault() {
        return language === 'en';
    }
    Language.isDefault = isDefault;
})(Language || (Language = {}));
/**
 * Desktop: The OS locale or the locale specified by --locale or `argv.json`.
 * Web: matches `platformLocale`.
 *
 * The UI is not necessarily shown in the provided locale.
 */
export const locale = _locale;
/**
 * This will always be set to the OS/browser's locale regardless of
 * what was specified otherwise. The format of the string is all
 * lower case (e.g. zh-tw for Traditional Chinese). The UI is not
 * necessarily shown in the provided locale.
 */
export const platformLocale = _platformLocale;
/**
 * The translations that are available through language packs.
 */
export const translationsConfigFile = _translationsConfigFile;
export const setTimeout0IsFaster = (typeof $globalThis.postMessage === 'function' && !$globalThis.importScripts);
/**
 * See https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#:~:text=than%204%2C%20then-,set%20timeout%20to%204,-.
 *
 * Works similarly to `setTimeout(0)` but doesn't suffer from the 4ms artificial delay
 * that browsers set when the nesting level is > 5.
 */
export const setTimeout0 = (() => {
    if (setTimeout0IsFaster) {
        const pending = [];
        $globalThis.addEventListener('message', (e) => {
            if (e.data && e.data.vscodeScheduleAsyncWork) {
                for (let i = 0, len = pending.length; i < len; i++) {
                    const candidate = pending[i];
                    if (candidate.id === e.data.vscodeScheduleAsyncWork) {
                        pending.splice(i, 1);
                        candidate.callback();
                        return;
                    }
                }
            }
        });
        let lastId = 0;
        return (callback) => {
            const myId = ++lastId;
            pending.push({
                id: myId,
                callback: callback
            });
            $globalThis.postMessage({ vscodeScheduleAsyncWork: myId }, '*');
        };
    }
    return (callback) => setTimeout(callback);
})();
export var OperatingSystem;
(function (OperatingSystem) {
    OperatingSystem[OperatingSystem["Windows"] = 1] = "Windows";
    OperatingSystem[OperatingSystem["Macintosh"] = 2] = "Macintosh";
    OperatingSystem[OperatingSystem["Linux"] = 3] = "Linux";
})(OperatingSystem || (OperatingSystem = {}));
export const OS = (_isMacintosh || _isIOS ? 2 /* OperatingSystem.Macintosh */ : (_isWindows ? 1 /* OperatingSystem.Windows */ : 3 /* OperatingSystem.Linux */));
let _isLittleEndian = true;
let _isLittleEndianComputed = false;
export function isLittleEndian() {
    if (!_isLittleEndianComputed) {
        _isLittleEndianComputed = true;
        const test = new Uint8Array(2);
        test[0] = 1;
        test[1] = 2;
        const view = new Uint16Array(test.buffer);
        _isLittleEndian = (view[0] === (2 << 8) + 1);
    }
    return _isLittleEndian;
}
export const isChrome = !!(userAgent && userAgent.indexOf('Chrome') >= 0);
export const isFirefox = !!(userAgent && userAgent.indexOf('Firefox') >= 0);
export const isSafari = !!(!isChrome && (userAgent && userAgent.indexOf('Safari') >= 0));
export const isEdge = !!(userAgent && userAgent.indexOf('Edg/') >= 0);
export const isAndroid = !!(userAgent && userAgent.indexOf('Android') >= 0);
export function isTahoeOrNewer(osVersion) {
    return parseFloat(osVersion) >= 25;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxhdGZvcm0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9wbGF0Zm9ybS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGNBQWMsQ0FBQztBQUVwQyxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFFckMsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ3ZCLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQztBQUN6QixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7QUFDckIsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO0FBQ3pCLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztBQUN0QixJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUM7QUFDbkIsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO0FBQ3hCLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQztBQUNuQixJQUFJLEtBQUssR0FBRyxLQUFLLENBQUM7QUFDbEIsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO0FBQ3RCLElBQUksT0FBTyxHQUF1QixTQUFTLENBQUM7QUFDNUMsSUFBSSxTQUFTLEdBQVcsZ0JBQWdCLENBQUM7QUFDekMsSUFBSSxlQUFlLEdBQVcsZ0JBQWdCLENBQUM7QUFDL0MsSUFBSSx1QkFBdUIsR0FBdUIsU0FBUyxDQUFDO0FBQzVELElBQUksVUFBVSxHQUF1QixTQUFTLENBQUM7QUE2Qi9DLE1BQU0sV0FBVyxHQUFRLFVBQVUsQ0FBQztBQUVwQyxJQUFJLFdBQVcsR0FBNkIsU0FBUyxDQUFDO0FBQ3RELElBQUksT0FBTyxXQUFXLENBQUMsTUFBTSxLQUFLLFdBQVcsSUFBSSxPQUFPLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxLQUFLLFdBQVcsRUFBRSxDQUFDO0lBQ3BHLGlDQUFpQztJQUNqQyxXQUFXLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7QUFDMUMsQ0FBQztLQUFNLElBQUksT0FBTyxPQUFPLEtBQUssV0FBVyxJQUFJLE9BQU8sT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7SUFDMUYscUNBQXFDO0lBQ3JDLFdBQVcsR0FBRyxPQUFPLENBQUM7QUFDdkIsQ0FBQztBQUVELE1BQU0saUJBQWlCLEdBQUcsT0FBTyxXQUFXLEVBQUUsUUFBUSxFQUFFLFFBQVEsS0FBSyxRQUFRLENBQUM7QUFDOUUsTUFBTSxrQkFBa0IsR0FBRyxpQkFBaUIsSUFBSSxXQUFXLEVBQUUsSUFBSSxLQUFLLFVBQVUsQ0FBQztBQVNqRixxQkFBcUI7QUFDckIsSUFBSSxPQUFPLFdBQVcsS0FBSyxRQUFRLEVBQUUsQ0FBQztJQUNyQyxVQUFVLEdBQUcsQ0FBQyxXQUFXLENBQUMsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0lBQ2hELFlBQVksR0FBRyxDQUFDLFdBQVcsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUM7SUFDbkQsUUFBUSxHQUFHLENBQUMsV0FBVyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQztJQUM5QyxZQUFZLEdBQUcsUUFBUSxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzNGLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQztJQUNoQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ2hJLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQztJQUMzQixTQUFTLEdBQUcsZ0JBQWdCLENBQUM7SUFDN0IsTUFBTSxZQUFZLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQzFELElBQUksWUFBWSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDO1lBQ0osTUFBTSxTQUFTLEdBQTBCLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDbEUsT0FBTyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7WUFDL0IsZUFBZSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUM7WUFDckMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxnQkFBZ0IsSUFBSSxnQkFBZ0IsQ0FBQztZQUMzRCx1QkFBdUIsR0FBRyxTQUFTLENBQUMsWUFBWSxFQUFFLHNCQUFzQixDQUFDO1FBQzFFLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFDRCxTQUFTLEdBQUcsSUFBSSxDQUFDO0FBQ2xCLENBQUM7QUFFRCxrQkFBa0I7S0FDYixJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDL0QsVUFBVSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7SUFDakMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hELFlBQVksR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwRCxNQUFNLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsY0FBYyxJQUFJLFNBQVMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO0lBQ3RMLFFBQVEsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1QyxTQUFTLEdBQUcsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDN0MsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNkLFNBQVMsR0FBRyxHQUFHLENBQUMsY0FBYyxFQUFFLElBQUksZ0JBQWdCLENBQUM7SUFDckQsT0FBTyxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDM0MsZUFBZSxHQUFHLE9BQU8sQ0FBQztBQUMzQixDQUFDO0FBRUQsc0JBQXNCO0tBQ2pCLENBQUM7SUFDTCxPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7QUFDOUMsQ0FBQztBQUVELE1BQU0sQ0FBTixJQUFrQixRQUtqQjtBQUxELFdBQWtCLFFBQVE7SUFDekIscUNBQUcsQ0FBQTtJQUNILHFDQUFHLENBQUE7SUFDSCx5Q0FBSyxDQUFBO0lBQ0wsNkNBQU8sQ0FBQTtBQUNSLENBQUMsRUFMaUIsUUFBUSxLQUFSLFFBQVEsUUFLekI7QUFHRCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBa0I7SUFDbEQsUUFBUSxRQUFRLEVBQUUsQ0FBQztRQUNsQix5QkFBaUIsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDO1FBQ2hDLHlCQUFpQixDQUFDLENBQUMsT0FBTyxLQUFLLENBQUM7UUFDaEMsMkJBQW1CLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQztRQUNwQyw2QkFBcUIsQ0FBQyxDQUFDLE9BQU8sU0FBUyxDQUFDO0lBQ3pDLENBQUM7QUFDRixDQUFDO0FBRUQsSUFBSSxTQUFTLHVCQUF5QixDQUFDO0FBQ3ZDLElBQUksWUFBWSxFQUFFLENBQUM7SUFDbEIsU0FBUyx1QkFBZSxDQUFDO0FBQzFCLENBQUM7S0FBTSxJQUFJLFVBQVUsRUFBRSxDQUFDO0lBQ3ZCLFNBQVMsMkJBQW1CLENBQUM7QUFDOUIsQ0FBQztLQUFNLElBQUksUUFBUSxFQUFFLENBQUM7SUFDckIsU0FBUyx5QkFBaUIsQ0FBQztBQUM1QixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQztBQUNwQyxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDO0FBQ3hDLE1BQU0sQ0FBQyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUM7QUFDaEMsTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQztBQUN4QyxNQUFNLENBQUMsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUM7QUFDdEMsTUFBTSxDQUFDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQztBQUM1QixNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxNQUFNLElBQUksT0FBTyxXQUFXLENBQUMsYUFBYSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQ3ZGLE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUM1RSxNQUFNLENBQUMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDO0FBQzVCLE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUM7QUFDbEM7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQztBQUMxQixNQUFNLENBQUMsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUM7QUFFcEM7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUM7QUFFbEMsTUFBTSxLQUFXLFFBQVEsQ0FtQnhCO0FBbkJELFdBQWlCLFFBQVE7SUFFeEIsU0FBZ0IsS0FBSztRQUNwQixPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRmUsY0FBSyxRQUVwQixDQUFBO0lBRUQsU0FBZ0IsZ0JBQWdCO1FBQy9CLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMzQixPQUFPLFFBQVEsS0FBSyxJQUFJLENBQUM7UUFDMUIsQ0FBQzthQUFNLElBQUksUUFBUSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNqQyxPQUFPLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDO1FBQzFFLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0YsQ0FBQztJQVJlLHlCQUFnQixtQkFRL0IsQ0FBQTtJQUVELFNBQWdCLFNBQVM7UUFDeEIsT0FBTyxRQUFRLEtBQUssSUFBSSxDQUFDO0lBQzFCLENBQUM7SUFGZSxrQkFBUyxZQUV4QixDQUFBO0FBQ0YsQ0FBQyxFQW5CZ0IsUUFBUSxLQUFSLFFBQVEsUUFtQnhCO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLENBQUMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDO0FBRTlCOzs7OztHQUtHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQztBQUU5Qzs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLHVCQUF1QixDQUFDO0FBRTlELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLENBQUMsT0FBTyxXQUFXLENBQUMsV0FBVyxLQUFLLFVBQVUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUVqSDs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQUcsRUFBRTtJQUNoQyxJQUFJLG1CQUFtQixFQUFFLENBQUM7UUFLekIsTUFBTSxPQUFPLEdBQW9CLEVBQUUsQ0FBQztRQUVwQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBTSxFQUFFLEVBQUU7WUFDbEQsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDOUMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO29CQUNwRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzdCLElBQUksU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7d0JBQ3JELE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNyQixTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7d0JBQ3JCLE9BQU87b0JBQ1IsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2YsT0FBTyxDQUFDLFFBQW9CLEVBQUUsRUFBRTtZQUMvQixNQUFNLElBQUksR0FBRyxFQUFFLE1BQU0sQ0FBQztZQUN0QixPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNaLEVBQUUsRUFBRSxJQUFJO2dCQUNSLFFBQVEsRUFBRSxRQUFRO2FBQ2xCLENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyxXQUFXLENBQUMsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTyxDQUFDLFFBQW9CLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUN2RCxDQUFDLENBQUMsRUFBRSxDQUFDO0FBRUwsTUFBTSxDQUFOLElBQWtCLGVBSWpCO0FBSkQsV0FBa0IsZUFBZTtJQUNoQywyREFBVyxDQUFBO0lBQ1gsK0RBQWEsQ0FBQTtJQUNiLHVEQUFTLENBQUE7QUFDVixDQUFDLEVBSmlCLGVBQWUsS0FBZixlQUFlLFFBSWhDO0FBQ0QsTUFBTSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxDQUFDLG1DQUEyQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxpQ0FBeUIsQ0FBQyw4QkFBc0IsQ0FBQyxDQUFDLENBQUM7QUFFeEksSUFBSSxlQUFlLEdBQUcsSUFBSSxDQUFDO0FBQzNCLElBQUksdUJBQXVCLEdBQUcsS0FBSyxDQUFDO0FBQ3BDLE1BQU0sVUFBVSxjQUFjO0lBQzdCLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQzlCLHVCQUF1QixHQUFHLElBQUksQ0FBQztRQUMvQixNQUFNLElBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1osSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNaLE1BQU0sSUFBSSxHQUFHLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxQyxlQUFlLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUNELE9BQU8sZUFBZSxDQUFDO0FBQ3hCLENBQUM7QUFFRCxNQUFNLENBQUMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDMUUsTUFBTSxDQUFDLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzVFLE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDekYsTUFBTSxDQUFDLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3RFLE1BQU0sQ0FBQyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUU1RSxNQUFNLFVBQVUsY0FBYyxDQUFDLFNBQWlCO0lBQy9DLE9BQU8sVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNwQyxDQUFDIn0=