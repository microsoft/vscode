/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';

const LANGUAGE_DEFAULT = 'en';

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
let _locale: string | undefined = undefined;
let _language: string = LANGUAGE_DEFAULT;
let _translationsConfigFile: string | undefined = undefined;
let _userAgent: string | undefined = undefined;

interface NLSConfig {
	locale: string;
	availableLanguages: { [key: string]: string };
	_translationsConfigFile: string;
}

export interface IProcessEnvironment {
	[key: string]: string | undefined;
}

/**
 * This interface is intentionally not identical to node.js
 * process because it also works in sandboxed environments
 * where the process object is implemented differently. We
 * define the properties here that we need for `platform`
 * to work and nothing else.
 */
export interface INodeProcess {
	platform: string;
	arch: string;
	env: IProcessEnvironment;
	versions?: {
		electron?: string;
	};
	type?: string;
	cwd: () => string;
}

declare const process: INodeProcess;
declare const global: unknown;
declare const self: unknown;

export const globals: any = (typeof self === 'object' ? self : typeof global === 'object' ? global : {});

let nodeProcess: INodeProcess | undefined = undefined;
if (typeof globals.vscode !== 'undefined' && typeof globals.vscode.process !== 'undefined') {
	// Native environment (sandboxed)
	nodeProcess = globals.vscode.process;
} else if (typeof process !== 'undefined') {
	// Native environment (non-sandboxed)
	nodeProcess = process;
}

const isElectronProcess = typeof nodeProcess?.versions?.electron === 'string';
const isElectronRenderer = isElectronProcess && nodeProcess?.type === 'renderer';

interface INavigator {
	userAgent: string;
	maxTouchPoints?: number;
}
declare const navigator: INavigator;

// Web environment
if (typeof navigator === 'object' && !isElectronRenderer) {
	_userAgent = navigator.userAgent;
	_isWindows = _userAgent.indexOf('Windows') >= 0;
	_isMacintosh = _userAgent.indexOf('Macintosh') >= 0;
	_isIOS = (_userAgent.indexOf('Macintosh') >= 0 || _userAgent.indexOf('iPad') >= 0 || _userAgent.indexOf('iPhone') >= 0) && !!navigator.maxTouchPoints && navigator.maxTouchPoints > 0;
	_isLinux = _userAgent.indexOf('Linux') >= 0;
	_isMobile = _userAgent?.indexOf('Mobi') >= 0;
	_isWeb = true;

	const configuredLocale = nls.getConfiguredDefaultLocale(
		// This call _must_ be done in the file that calls `nls.getConfiguredDefaultLocale`
		// to ensure that the NLS AMD Loader plugin has been loaded and configured.
		// This is because the loader plugin decides what the default locale is based on
		// how it's able to resolve the strings.
		nls.localize({ key: 'ensureLoaderPluginIsLoaded', comment: ['{Locked}'] }, '_')
	);

	_locale = configuredLocale || LANGUAGE_DEFAULT;

	_language = _locale;
}

// Native environment
else if (typeof nodeProcess === 'object') {
	_isWindows = (nodeProcess.platform === 'win32');
	_isMacintosh = (nodeProcess.platform === 'darwin');
	_isLinux = (nodeProcess.platform === 'linux');
	_isLinuxSnap = _isLinux && !!nodeProcess.env['SNAP'] && !!nodeProcess.env['SNAP_REVISION'];
	_isElectron = isElectronProcess;
	_isCI = !!nodeProcess.env['CI'] || !!nodeProcess.env['BUILD_ARTIFACTSTAGINGDIRECTORY'];
	_locale = LANGUAGE_DEFAULT;
	_language = LANGUAGE_DEFAULT;
	const rawNlsConfig = nodeProcess.env['VSCODE_NLS_CONFIG'];
	if (rawNlsConfig) {
		try {
			const nlsConfig: NLSConfig = JSON.parse(rawNlsConfig);
			const resolved = nlsConfig.availableLanguages['*'];
			_locale = nlsConfig.locale;
			// VSCode's default language is 'en'
			_language = resolved ? resolved : LANGUAGE_DEFAULT;
			_translationsConfigFile = nlsConfig._translationsConfigFile;
		} catch (e) {
		}
	}
	_isNative = true;
}

// Unknown environment
else {
	console.error('Unable to resolve platform.');
}

export const enum Platform {
	Web,
	Mac,
	Linux,
	Windows
}
export function PlatformToString(platform: Platform) {
	switch (platform) {
		case Platform.Web: return 'Web';
		case Platform.Mac: return 'Mac';
		case Platform.Linux: return 'Linux';
		case Platform.Windows: return 'Windows';
	}
}

let _platform: Platform = Platform.Web;
if (_isMacintosh) {
	_platform = Platform.Mac;
} else if (_isWindows) {
	_platform = Platform.Windows;
} else if (_isLinux) {
	_platform = Platform.Linux;
}

export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isLinux = _isLinux;
export const isLinuxSnap = _isLinuxSnap;
export const isNative = _isNative;
export const isElectron = _isElectron;
export const isWeb = _isWeb;
export const isWebWorker = (_isWeb && typeof globals.importScripts === 'function');
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
 * Chinese)
 */
export const language = _language;

export namespace Language {

	export function value(): string {
		return language;
	}

	export function isDefaultVariant(): boolean {
		if (language.length === 2) {
			return language === 'en';
		} else if (language.length >= 3) {
			return language[0] === 'e' && language[1] === 'n' && language[2] === '-';
		} else {
			return false;
		}
	}

	export function isDefault(): boolean {
		return language === 'en';
	}
}

/**
 * The OS locale or the locale specified by --locale. The format of
 * the string is all lower case (e.g. zh-tw for Traditional
 * Chinese). The UI is not necessarily shown in the provided locale.
 */
export const locale = _locale;

/**
 * The translations that are available through language packs.
 */
export const translationsConfigFile = _translationsConfigFile;

export const setTimeout0IsFaster = (typeof globals.postMessage === 'function' && !globals.importScripts);

/**
 * See https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#:~:text=than%204%2C%20then-,set%20timeout%20to%204,-.
 *
 * Works similarly to `setTimeout(0)` but doesn't suffer from the 4ms artificial delay
 * that browsers set when the nesting level is > 5.
 */
export const setTimeout0 = (() => {
	if (setTimeout0IsFaster) {
		interface IQueueElement {
			id: number;
			callback: () => void;
		}
		const pending: IQueueElement[] = [];
		globals.addEventListener('message', (e: MessageEvent) => {
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
		return (callback: () => void) => {
			const myId = ++lastId;
			pending.push({
				id: myId,
				callback: callback
			});
			globals.postMessage({ vscodeScheduleAsyncWork: myId }, '*');
		};
	}
	return (callback: () => void) => setTimeout(callback);
})();

export const enum OperatingSystem {
	Windows = 1,
	Macintosh = 2,
	Linux = 3
}
export const OS = (_isMacintosh || _isIOS ? OperatingSystem.Macintosh : (_isWindows ? OperatingSystem.Windows : OperatingSystem.Linux));

let _isLittleEndian = true;
let _isLittleEndianComputed = false;
export function isLittleEndian(): boolean {
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
