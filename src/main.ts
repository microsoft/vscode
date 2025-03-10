/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'original-fs';
import * as os from 'os';
import { performance } from 'perf_hooks';
import { configurePortable } from './bootstrap-node.js';
import { bootstrapESM } from './bootstrap-esm.js';
import { fileURLToPath } from 'url';
import { app, protocol, crashReporter, Menu, contentTracing } from 'electron';
import minimist from 'minimist';
import { product } from './bootstrap-meta.js';
import { parse } from './vs/base/common/jsonc.js';
import { getUserDataPath } from './vs/platform/environment/node/userDataPath.js';
import * as perf from './vs/base/common/performance.js';
import { resolveNLSConfiguration } from './vs/base/node/nls.js';
import { getUNCHost, addUNCHostToAllowlist } from './vs/base/node/unc.js';
import { INLSConfiguration } from './vs/nls.js';
import { NativeParsedArgs } from './vs/platform/environment/common/argv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

perf.mark('code/didStartMain');

perf.mark('code/willLoadMainBundle', {
	// When built, the main bundle is a single JS file with all
	// dependencies inlined. As such, we mark `willLoadMainBundle`
	// as the start of the main bundle loading process.
	startTime: Math.floor(performance.timeOrigin)
});
perf.mark('code/didLoadMainBundle');

// Enable portable support
const portable = configurePortable(product);

const args = parseCLIArgs();
// Configure static command line arguments
const argvConfig = configureCommandlineSwitchesSync(args);
// Enable sandbox globally unless
// 1) disabled via command line using either
//    `--no-sandbox` or `--disable-chromium-sandbox` argument.
// 2) argv.json contains `disable-chromium-sandbox: true`.
if (args['sandbox'] &&
	!args['disable-chromium-sandbox'] &&
	!argvConfig['disable-chromium-sandbox']) {
	app.enableSandbox();
} else if (app.commandLine.hasSwitch('no-sandbox') &&
	!app.commandLine.hasSwitch('disable-gpu-sandbox')) {
	// Disable GPU sandbox whenever --no-sandbox is used.
	app.commandLine.appendSwitch('disable-gpu-sandbox');
} else {
	app.commandLine.appendSwitch('no-sandbox');
	app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// Set userData path before app 'ready' event
const userDataPath = getUserDataPath(args, product.nameShort ?? 'code-oss-dev');
if (process.platform === 'win32') {
	const userDataUNCHost = getUNCHost(userDataPath);
	if (userDataUNCHost) {
		addUNCHostToAllowlist(userDataUNCHost); // enables to use UNC paths in userDataPath
	}
}
app.setPath('userData', userDataPath);

// Resolve code cache path
const codeCachePath = getCodeCachePath();

// Disable default menu (https://github.com/electron/electron/issues/35512)
Menu.setApplicationMenu(null);

// Configure crash reporter
perf.mark('code/willStartCrashReporter');
// If a crash-reporter-directory is specified we store the crash reports
// in the specified directory and don't upload them to the crash server.
//
// Appcenter crash reporting is enabled if
// * enable-crash-reporter runtime argument is set to 'true'
// * --disable-crash-reporter command line parameter is not set
//
// Disable crash reporting in all other cases.
if (args['crash-reporter-directory'] || (argvConfig['enable-crash-reporter'] && !args['disable-crash-reporter'])) {
	configureCrashReporter();
}
perf.mark('code/didStartCrashReporter');

// Set logs path before app 'ready' event if running portable
// to ensure that no 'logs' folder is created on disk at a
// location outside of the portable directory
// (https://github.com/microsoft/vscode/issues/56651)
if (portable && portable.isPortable) {
	app.setAppLogsPath(path.join(userDataPath, 'logs'));
}

// Register custom schemes with privileges
protocol.registerSchemesAsPrivileged([
	{
		scheme: 'vscode-webview',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, allowServiceWorkers: true, codeCache: true }
	},
	{
		scheme: 'vscode-file',
		privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, codeCache: true }
	}
]);

// Global app listeners
registerListeners();

/**
 * We can resolve the NLS configuration early if it is defined
 * in argv.json before `app.ready` event. Otherwise we can only
 * resolve NLS after `app.ready` event to resolve the OS locale.
 */
let nlsConfigurationPromise: Promise<INLSConfiguration> | undefined = undefined;

// Use the most preferred OS language for language recommendation.
// The API might return an empty array on Linux, such as when
// the 'C' locale is the user's only configured locale.
// No matter the OS, if the array is empty, default back to 'en'.
const osLocale = processZhLocale((app.getPreferredSystemLanguages()?.[0] ?? 'en').toLowerCase());
const userLocale = getUserDefinedLocale(argvConfig);
if (userLocale) {
	nlsConfigurationPromise = resolveNLSConfiguration({
		userLocale,
		osLocale,
		commit: product.commit,
		userDataPath,
		nlsMetadataPath: __dirname
	});
}

// Pass in the locale to Electron so that the
// Windows Control Overlay is rendered correctly on Windows.
// For now, don't pass in the locale on macOS due to
// https://github.com/microsoft/vscode/issues/167543.
// If the locale is `qps-ploc`, the Microsoft
// Pseudo Language Language Pack is being used.
// In that case, use `en` as the Electron locale.

if (process.platform === 'win32' || process.platform === 'linux') {
	const electronLocale = (!userLocale || userLocale === 'qps-ploc') ? 'en' : userLocale;
	app.commandLine.appendSwitch('lang', electronLocale);
}

// Load our code once ready
app.once('ready', function () {
	if (args['trace']) {
		let traceOptions: Electron.TraceConfig | Electron.TraceCategoriesAndOptions;
		if (args['trace-memory-infra']) {
			const customCategories = args['trace-category-filter']?.split(',') || [];
			customCategories.push('disabled-by-default-memory-infra', 'disabled-by-default-memory-infra.v8.code_stats');
			traceOptions = {
				included_categories: customCategories,
				excluded_categories: ['*'],
				memory_dump_config: {
					allowed_dump_modes: ['light', 'detailed'],
					triggers: [
						{
							type: 'periodic_interval',
							mode: 'detailed',
							min_time_between_dumps_ms: 10000
						},
						{
							type: 'periodic_interval',
							mode: 'light',
							min_time_between_dumps_ms: 1000
						}
					]
				}
			};
		} else {
			traceOptions = {
				categoryFilter: args['trace-category-filter'] || '*',
				traceOptions: args['trace-options'] || 'record-until-full,enable-sampling'
			};
		}

		contentTracing.startRecording(traceOptions).finally(() => onReady());
	} else {
		onReady();
	}
});

async function onReady() {
	perf.mark('code/mainAppReady');

	try {
		const [, nlsConfig] = await Promise.all([
			mkdirpIgnoreError(codeCachePath),
			resolveNlsConfiguration()
		]);

		await startup(codeCachePath, nlsConfig);
	} catch (error) {
		console.error(error);
	}
}

/**
 * Main startup routine
 */
async function startup(codeCachePath: string | undefined, nlsConfig: INLSConfiguration): Promise<void> {
	process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);
	process.env['VSCODE_CODE_CACHE_PATH'] = codeCachePath || '';

	// Bootstrap ESM
	await bootstrapESM();

	// Load Main
	await import('./vs/code/electron-main/main.js');
	perf.mark('code/didRunMainBundle');
}

function configureCommandlineSwitchesSync(cliArgs: NativeParsedArgs) {
	const SUPPORTED_ELECTRON_SWITCHES = [

		// alias from us for --disable-gpu
		'disable-hardware-acceleration',

		// override for the color profile to use
		'force-color-profile',

		// disable LCD font rendering, a Chromium flag
		'disable-lcd-text',

		// bypass any specified proxy for the given semi-colon-separated list of hosts
		'proxy-bypass-list'
	];

	if (process.platform === 'linux') {

		// Force enable screen readers on Linux via this flag
		SUPPORTED_ELECTRON_SWITCHES.push('force-renderer-accessibility');

		// override which password-store is used on Linux
		SUPPORTED_ELECTRON_SWITCHES.push('password-store');
	}

	const SUPPORTED_MAIN_PROCESS_SWITCHES = [

		// Persistently enable proposed api via argv.json: https://github.com/microsoft/vscode/issues/99775
		'enable-proposed-api',

		// Log level to use. Default is 'info'. Allowed values are 'error', 'warn', 'info', 'debug', 'trace', 'off'.
		'log-level',

		// Use an in-memory storage for secrets
		'use-inmemory-secretstorage'
	];

	// Read argv config
	const argvConfig = readArgvConfigSync();

	Object.keys(argvConfig).forEach(argvKey => {
		const argvValue = argvConfig[argvKey];

		// Append Electron flags to Electron
		if (SUPPORTED_ELECTRON_SWITCHES.indexOf(argvKey) !== -1) {
			if (argvValue === true || argvValue === 'true') {
				if (argvKey === 'disable-hardware-acceleration') {
					app.disableHardwareAcceleration(); // needs to be called explicitly
				} else {
					app.commandLine.appendSwitch(argvKey);
				}
			} else if (typeof argvValue === 'string' && argvValue) {
				if (argvKey === 'password-store') {
					// Password store
					// TODO@TylerLeonhardt: Remove this migration in 3 months
					let migratedArgvValue = argvValue;
					if (argvValue === 'gnome' || argvValue === 'gnome-keyring') {
						migratedArgvValue = 'gnome-libsecret';
					}
					app.commandLine.appendSwitch(argvKey, migratedArgvValue);
				} else {
					app.commandLine.appendSwitch(argvKey, argvValue);
				}
			}
		}

		// Append main process flags to process.argv
		else if (SUPPORTED_MAIN_PROCESS_SWITCHES.indexOf(argvKey) !== -1) {
			switch (argvKey) {
				case 'enable-proposed-api':
					if (Array.isArray(argvValue)) {
						argvValue.forEach(id => id && typeof id === 'string' && process.argv.push('--enable-proposed-api', id));
					} else {
						console.error(`Unexpected value for \`enable-proposed-api\` in argv.json. Expected array of extension ids.`);
					}
					break;

				case 'log-level':
					if (typeof argvValue === 'string') {
						process.argv.push('--log', argvValue);
					} else if (Array.isArray(argvValue)) {
						for (const value of argvValue) {
							process.argv.push('--log', value);
						}
					}
					break;

				case 'use-inmemory-secretstorage':
					if (argvValue) {
						process.argv.push('--use-inmemory-secretstorage');
					}
					break;
			}
		}
	});

	// Following features are disabled from the runtime:
	// `CalculateNativeWinOcclusion` - Disable native window occlusion tracker (https://groups.google.com/a/chromium.org/g/embedder-dev/c/ZF3uHHyWLKw/m/VDN2hDXMAAAJ)
	// `PlzDedicatedWorker` - Refs https://github.com/microsoft/vscode/issues/233060#issuecomment-2523212427
	const featuresToDisable =
		`CalculateNativeWinOcclusion,PlzDedicatedWorker,${app.commandLine.getSwitchValue('disable-features')}`;
	app.commandLine.appendSwitch('disable-features', featuresToDisable);

	// Blink features to configure.
	// `FontMatchingCTMigration` - Siwtch font matching on macOS to Appkit (Refs https://github.com/microsoft/vscode/issues/224496#issuecomment-2270418470).
	// `StandardizedBrowserZoom` - Disable zoom adjustment for bounding box (https://github.com/microsoft/vscode/issues/232750#issuecomment-2459495394)
	const blinkFeaturesToDisable =
		`FontMatchingCTMigration,StandardizedBrowserZoom,${app.commandLine.getSwitchValue('disable-blink-features')}`;
	app.commandLine.appendSwitch('disable-blink-features', blinkFeaturesToDisable);

	// Support JS Flags
	const jsFlags = getJSFlags(cliArgs);
	if (jsFlags) {
		app.commandLine.appendSwitch('js-flags', jsFlags);
	}

	// Use portal version 4 that supports current_folder option
	// to address https://github.com/microsoft/vscode/issues/213780
	// Runtime sets the default version to 3, refs https://github.com/electron/electron/pull/44426
	app.commandLine.appendSwitch('xdg-portal-required-version', '4');

	return argvConfig;
}

interface IArgvConfig {
	[key: string]: string | string[] | boolean | undefined;
	readonly locale?: string;
	readonly 'disable-lcd-text'?: boolean;
	readonly 'proxy-bypass-list'?: string;
	readonly 'disable-hardware-acceleration'?: boolean;
	readonly 'force-color-profile'?: string;
	readonly 'enable-crash-reporter'?: boolean;
	readonly 'crash-reporter-id'?: string;
	readonly 'enable-proposed-api'?: string[];
	readonly 'log-level'?: string | string[];
	readonly 'disable-chromium-sandbox'?: boolean;
	readonly 'use-inmemory-secretstorage'?: boolean;
}

function readArgvConfigSync(): IArgvConfig {

	// Read or create the argv.json config file sync before app('ready')
	const argvConfigPath = getArgvConfigPath();
	let argvConfig: IArgvConfig | undefined = undefined;
	try {
		argvConfig = parse(fs.readFileSync(argvConfigPath).toString());
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			createDefaultArgvConfigSync(argvConfigPath);
		} else {
			console.warn(`Unable to read argv.json configuration file in ${argvConfigPath}, falling back to defaults (${error})`);
		}
	}

	// Fallback to default
	if (!argvConfig) {
		argvConfig = {};
	}

	return argvConfig;
}

function createDefaultArgvConfigSync(argvConfigPath: string): void {
	try {

		// Ensure argv config parent exists
		const argvConfigPathDirname = path.dirname(argvConfigPath);
		if (!fs.existsSync(argvConfigPathDirname)) {
			fs.mkdirSync(argvConfigPathDirname);
		}

		// Default argv content
		const defaultArgvConfigContent = [
			'// This configuration file allows you to pass permanent command line arguments to VS Code.',
			'// Only a subset of arguments is currently supported to reduce the likelihood of breaking',
			'// the installation.',
			'//',
			'// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT',
			'//',
			'// NOTE: Changing this file requires a restart of VS Code.',
			'{',
			'	// Use software rendering instead of hardware accelerated rendering.',
			'	// This can help in cases where you see rendering issues in VS Code.',
			'	// "disable-hardware-acceleration": true',
			'}'
		];

		// Create initial argv.json with default content
		fs.writeFileSync(argvConfigPath, defaultArgvConfigContent.join('\n'));
	} catch (error) {
		console.error(`Unable to create argv.json configuration file in ${argvConfigPath}, falling back to defaults (${error})`);
	}
}

function getArgvConfigPath(): string {
	const vscodePortable = process.env['VSCODE_PORTABLE'];
	if (vscodePortable) {
		return path.join(vscodePortable, 'argv.json');
	}

	let dataFolderName = product.dataFolderName;
	if (process.env['VSCODE_DEV']) {
		dataFolderName = `${dataFolderName}-dev`;
	}

	return path.join(os.homedir(), dataFolderName!, 'argv.json');
}

function configureCrashReporter(): void {
	let crashReporterDirectory = args['crash-reporter-directory'];
	let submitURL = '';
	if (crashReporterDirectory) {
		crashReporterDirectory = path.normalize(crashReporterDirectory);

		if (!path.isAbsolute(crashReporterDirectory)) {
			console.error(`The path '${crashReporterDirectory}' specified for --crash-reporter-directory must be absolute.`);
			app.exit(1);
		}

		if (!fs.existsSync(crashReporterDirectory)) {
			try {
				fs.mkdirSync(crashReporterDirectory, { recursive: true });
			} catch (error) {
				console.error(`The path '${crashReporterDirectory}' specified for --crash-reporter-directory does not seem to exist or cannot be created.`);
				app.exit(1);
			}
		}

		// Crashes are stored in the crashDumps directory by default, so we
		// need to change that directory to the provided one
		console.log(`Found --crash-reporter-directory argument. Setting crashDumps directory to be '${crashReporterDirectory}'`);
		app.setPath('crashDumps', crashReporterDirectory);
	}

	// Otherwise we configure the crash reporter from product.json
	else {
		const appCenter = product.appCenter;
		if (appCenter) {
			const isWindows = (process.platform === 'win32');
			const isLinux = (process.platform === 'linux');
			const isDarwin = (process.platform === 'darwin');
			const crashReporterId = argvConfig['crash-reporter-id'];
			const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
			if (crashReporterId && uuidPattern.test(crashReporterId)) {
				if (isWindows) {
					switch (process.arch) {
						case 'x64':
							submitURL = appCenter['win32-x64'];
							break;
						case 'arm64':
							submitURL = appCenter['win32-arm64'];
							break;
					}
				} else if (isDarwin) {
					if (product.darwinUniversalAssetId) {
						submitURL = appCenter['darwin-universal'];
					} else {
						switch (process.arch) {
							case 'x64':
								submitURL = appCenter['darwin'];
								break;
							case 'arm64':
								submitURL = appCenter['darwin-arm64'];
								break;
						}
					}
				} else if (isLinux) {
					submitURL = appCenter['linux-x64'];
				}
				submitURL = submitURL.concat('&uid=', crashReporterId, '&iid=', crashReporterId, '&sid=', crashReporterId);
				// Send the id for child node process that are explicitly starting crash reporter.
				// For vscode this is ExtensionHost process currently.
				const argv = process.argv;
				const endOfArgsMarkerIndex = argv.indexOf('--');
				if (endOfArgsMarkerIndex === -1) {
					argv.push('--crash-reporter-id', crashReporterId);
				} else {
					// if the we have an argument "--" (end of argument marker)
					// we cannot add arguments at the end. rather, we add
					// arguments before the "--" marker.
					argv.splice(endOfArgsMarkerIndex, 0, '--crash-reporter-id', crashReporterId);
				}
			}
		}
	}

	// Start crash reporter for all processes
	const productName = (product.crashReporter ? product.crashReporter.productName : undefined) || product.nameShort;
	const companyName = (product.crashReporter ? product.crashReporter.companyName : undefined) || 'Microsoft';
	const uploadToServer = Boolean(!process.env['VSCODE_DEV'] && submitURL && !crashReporterDirectory);
	crashReporter.start({
		companyName,
		productName: process.env['VSCODE_DEV'] ? `${productName} Dev` : productName,
		submitURL,
		uploadToServer,
		compress: true
	});
}

function getJSFlags(cliArgs: NativeParsedArgs): string | null {
	const jsFlags: string[] = [];

	// Add any existing JS flags we already got from the command line
	if (cliArgs['js-flags']) {
		jsFlags.push(cliArgs['js-flags']);
	}

	return jsFlags.length > 0 ? jsFlags.join(' ') : null;
}

function parseCLIArgs(): NativeParsedArgs {
	return minimist(process.argv, {
		string: [
			'user-data-dir',
			'locale',
			'js-flags',
			'crash-reporter-directory'
		],
		boolean: [
			'disable-chromium-sandbox',
		],
		default: {
			'sandbox': true
		},
		alias: {
			'no-sandbox': 'sandbox'
		}
	});
}

function registerListeners(): void {

	/**
	 * macOS: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
	 * the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
	 */
	const macOpenFiles: string[] = [];
	(globalThis as any)['macOpenFiles'] = macOpenFiles;
	app.on('open-file', function (event, path) {
		macOpenFiles.push(path);
	});

	/**
	 * macOS: react to open-url requests.
	 */
	const openUrls: string[] = [];
	const onOpenUrl =
		function (event: { preventDefault: () => void }, url: string) {
			event.preventDefault();

			openUrls.push(url);
		};

	app.on('will-finish-launching', function () {
		app.on('open-url', onOpenUrl);
	});

	(globalThis as any)['getOpenUrls'] = function () {
		app.removeListener('open-url', onOpenUrl);

		return openUrls;
	};
}

function getCodeCachePath(): string | undefined {

	// explicitly disabled via CLI args
	if (process.argv.indexOf('--no-cached-data') > 0) {
		return undefined;
	}

	// running out of sources
	if (process.env['VSCODE_DEV']) {
		return undefined;
	}

	// require commit id
	const commit = product.commit;
	if (!commit) {
		return undefined;
	}

	return path.join(userDataPath, 'CachedData', commit);
}

async function mkdirpIgnoreError(dir: string | undefined): Promise<string | undefined> {
	if (typeof dir === 'string') {
		try {
			await fs.promises.mkdir(dir, { recursive: true });

			return dir;
		} catch (error) {
			// ignore
		}
	}

	return undefined;
}

//#region NLS Support

function processZhLocale(appLocale: string): string {
	if (appLocale.startsWith('zh')) {
		const region = appLocale.split('-')[1];

		// On Windows and macOS, Chinese languages returned by
		// app.getPreferredSystemLanguages() start with zh-hans
		// for Simplified Chinese or zh-hant for Traditional Chinese,
		// so we can easily determine whether to use Simplified or Traditional.
		// However, on Linux, Chinese languages returned by that same API
		// are of the form zh-XY, where XY is a country code.
		// For China (CN), Singapore (SG), and Malaysia (MY)
		// country codes, assume they use Simplified Chinese.
		// For other cases, assume they use Traditional.
		if (['hans', 'cn', 'sg', 'my'].includes(region)) {
			return 'zh-cn';
		}

		return 'zh-tw';
	}

	return appLocale;
}

/**
 * Resolve the NLS configuration
 */
async function resolveNlsConfiguration(): Promise<INLSConfiguration> {

	// First, we need to test a user defined locale.
	// If it fails we try the app locale.
	// If that fails we fall back to English.

	const nlsConfiguration = nlsConfigurationPromise ? await nlsConfigurationPromise : undefined;
	if (nlsConfiguration) {
		return nlsConfiguration;
	}

	// Try to use the app locale which is only valid
	// after the app ready event has been fired.

	let userLocale = app.getLocale();
	if (!userLocale) {
		return {
			userLocale: 'en',
			osLocale,
			resolvedLanguage: 'en',
			defaultMessagesFile: path.join(__dirname, 'nls.messages.json'),

			// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
			locale: 'en',
			availableLanguages: {}
		};
	}

	// See above the comment about the loader and case sensitiveness
	userLocale = processZhLocale(userLocale.toLowerCase());

	return resolveNLSConfiguration({
		userLocale,
		osLocale,
		commit: product.commit,
		userDataPath,
		nlsMetadataPath: __dirname
	});
}

/**
 * Language tags are case insensitive however an ESM loader is case sensitive
 * To make this work on case preserving & insensitive FS we do the following:
 * the language bundles have lower case language tags and we always lower case
 * the locale we receive from the user or OS.
 */
function getUserDefinedLocale(argvConfig: IArgvConfig): string | undefined {
	const locale = args['locale'];
	if (locale) {
		return locale.toLowerCase(); // a directly provided --locale always wins
	}

	return typeof argvConfig?.locale === 'string' ? argvConfig.locale.toLowerCase() : undefined;
}

//#endregion
