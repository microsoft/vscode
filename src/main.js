/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// Import ESM modules
import path from 'path';
import fs from 'original-fs';
import os from 'os';
import { fileURLToPath } from 'url';
import * as bootstrapNode from './bootstrap-node.js';
import * as bootstrapAmd from './bootstrap-amd.js';
import { getUserDataPath } from './vs/platform/environment/node/userDataPath.js';
import { parse } from './vs/base/common/jsonc.js';
import * as perf from './vs/base/common/performance.js';
import { resolveNLSConfiguration } from './vs/base/node/nls.js';
import { getUNCHost, addUNCHostToAllowlist } from './vs/base/node/unc.js';
import { app, protocol, crashReporter, Menu, contentTracing } from 'electron';
import minimist from 'minimist';
import { product } from './bootstrap-meta.js';

// Resolve directory name from ES module URL
const __dirname = path.dirname(fileURLToPath(import.meta.url));

perf.mark('code/didStartMain');

// Enable portable support
const portable = bootstrapNode.configurePortable(product);

// Enable ASAR support
bootstrapNode.enableASARSupport();

// Configure static command line arguments
const args = parseCLIArgs();
const argvConfig = configureCommandlineSwitchesSync(args);

// Enable sandbox globally unless
if (args['sandbox'] &&
    !args['disable-chromium-sandbox'] &&
    !argvConfig['disable-chromium-sandbox']) {
    app.enableSandbox();
} else if (app.commandLine.hasSwitch('no-sandbox') &&
    !app.commandLine.hasSwitch('disable-gpu-sandbox')) {
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
        addUNCHostToAllowlist(userDataUNCHost);
    }
}
app.setPath('userData', userDataPath);

// Resolve code cache path
const codeCachePath = getCodeCachePath();

// Disable default menu
Menu.setApplicationMenu(null);

// Configure crash reporter
perf.mark('code/willStartCrashReporter');
if (args['crash-reporter-directory'] || (argvConfig['enable-crash-reporter'] && !args['disable-crash-reporter'])) {
    configureCrashReporter();
}
perf.mark('code/didStartCrashReporter');

// Set logs path before app 'ready' event if running portable
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

let nlsConfigurationPromise = undefined;

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

if (process.platform === 'win32' || process.platform === 'linux') {
    const electronLocale = (!userLocale || userLocale === 'qps-ploc') ? 'en' : userLocale;
    app.commandLine.appendSwitch('lang', electronLocale);
}

app.once('ready', function () {
    if (args['trace']) {
        const traceOptions = {
            categoryFilter: args['trace-category-filter'] || '*',
            traceOptions: args['trace-options'] || 'record-until-full,enable-sampling'
        };

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

        startup(codeCachePath, nlsConfig);
    } catch (error) {
        console.error(error);
    }
}

function startup(codeCachePath, nlsConfig) {
    process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);
    process.env['VSCODE_CODE_CACHE_PATH'] = codeCachePath || '';

    perf.mark('code/willLoadMainBundle');
    bootstrapAmd.load('vs/code/electron-main/main', () => {
        perf.mark('code/didLoadMainBundle');
    });
}

function configureCommandlineSwitchesSync(cliArgs) {
    const SUPPORTED_ELECTRON_SWITCHES = [
        'disable-hardware-acceleration',
        'force-color-profile',
        'disable-lcd-text',
        'proxy-bypass-list'
    ];

    if (process.platform === 'linux') {
        SUPPORTED_ELECTRON_SWITCHES.push('force-renderer-accessibility');
        SUPPORTED_ELECTRON_SWITCHES.push('password-store');
    }

    const SUPPORTED_MAIN_PROCESS_SWITCHES = [
        'enable-proposed-api',
        'log-level',
        'use-inmemory-secretstorage'
    ];

    const argvConfig = readArgvConfigSync();

    Object.keys(argvConfig).forEach(argvKey => {
        const argvValue = argvConfig[argvKey];

        if (SUPPORTED_ELECTRON_SWITCHES.includes(argvKey)) {
            if (argvValue === true || argvValue === 'true') {
                if (argvKey === 'disable-hardware-acceleration') {
                    app.disableHardwareAcceleration();
                } else {
                    app.commandLine.appendSwitch(argvKey);
                }
            } else if (argvValue) {
                if (argvKey === 'password-store') {
                    let migratedArgvValue = argvValue;
                    if (argvValue === 'gnome' || argvValue === 'gnome-keyring') {
                        migratedArgvValue = 'gnome-libsecret';
                    }
                    app.commandLine.appendSwitch(argvKey, migratedArgvValue);
                } else {
                    app.commandLine.appendSwitch(argvKey, argvValue);
                }
            }
        } else if (SUPPORTED_MAIN_PROCESS_SWITCHES.includes(argvKey)) {
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
                        argvValue.forEach(value => process.argv.push('--log', value));
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

    const featuresToDisable =
        `CalculateNativeWinOcclusion,${app.commandLine.getSwitchValue('disable-features')}`;
    app.commandLine.appendSwitch('disable-features', featuresToDisable);

    const blinkFeaturesToDisable =
        `FontMatchingCTMigration,${app.commandLine.getSwitchValue('disable-blink-features')}`;
    app.commandLine.appendSwitch('disable-blink-features', blinkFeaturesToDisable);

    const jsFlags = getJSFlags(cliArgs);
    if (jsFlags) {
        app.commandLine.appendSwitch('js-flags', jsFlags);
    }

    return argvConfig;
}

function readArgvConfigSync() {
    const argvConfigPath = getArgvConfigPath();
    let argvConfig;
    try {
        argvConfig = parse(fs.readFileSync(argvConfigPath).toString());
    } catch (error) {
        console.error('Failed to read or parse argv config file:', argvConfigPath, error);
        argvConfig = {};
    }
    return argvConfig;
}

function configureCrashReporter() {
    crashReporter.start({
        companyName: product.company,
        submitURL: product.crashReporterUrl,
        uploadToServer: true
    });
}

function registerListeners() {
    // Example of app listeners registration
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
    app.on('activate', () => {
        // Handle app reactivation logic here
    });
}

function processZhLocale(locale) {
    return locale.includes('zh') ? locale : 'en';
}

function getUserDefinedLocale(config) {
    return config['locale'] || undefined;
}
                
function getCodeCachePath() {
    return path.join(os.homedir(), '.vscode', 'cache');
}

function mkdirpIgnoreError(directory) {
    return fs.promises.mkdir(directory, { recursive: true }).catch(() => {});
}

function getArgvConfigPath() {
    return path.join(__dirname, 'argv.json');
}
