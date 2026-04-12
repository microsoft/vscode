/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as url from 'url';
import * as cp from 'child_process';
import { cwd } from '../../base/common/process.js';
import { dirname, extname, resolve, join } from '../../base/common/path.js';
import { parseArgs, buildHelpMessage, buildVersionMessage, OPTIONS } from '../../platform/environment/node/argv.js';
import { createWaitMarkerFileSync } from '../../platform/environment/node/wait.js';
import { hasStdinWithoutTty, getStdinFilePath, readFromStdin } from '../../platform/environment/node/stdin.js';
import { DeferredPromise } from '../../base/common/async.js';
import { FileAccess } from '../../base/common/network.js';
const isSupportedForCmd = (optionId) => {
    switch (optionId) {
        case 'user-data-dir':
        case 'extensions-dir':
        case 'export-default-configuration':
        case 'install-source':
        case 'enable-smoke-test-driver':
        case 'extensions-download-dir':
        case 'builtin-extensions-dir':
        case 'telemetry':
            return false;
        default:
            return true;
    }
};
const isSupportedForPipe = (optionId) => {
    switch (optionId) {
        case 'version':
        case 'help':
        case 'folder-uri':
        case 'file-uri':
        case 'add':
        case 'diff':
        case 'merge':
        case 'wait':
        case 'goto':
        case 'reuse-window':
        case 'new-window':
        case 'status':
        case 'install-extension':
        case 'uninstall-extension':
        case 'update-extensions':
        case 'list-extensions':
        case 'force':
        case 'do-not-include-pack-dependencies':
        case 'show-versions':
        case 'category':
        case 'verbose':
        case 'remote':
        case 'locate-shell-integration-path':
            return true;
        default:
            return false;
    }
};
const cliPipe = process.env['VSCODE_IPC_HOOK_CLI'];
const cliCommand = process.env['VSCODE_CLIENT_COMMAND'];
const cliCommandCwd = process.env['VSCODE_CLIENT_COMMAND_CWD'];
const cliRemoteAuthority = process.env['VSCODE_CLI_AUTHORITY'];
const cliStdInFilePath = process.env['VSCODE_STDIN_FILE_PATH'];
export async function main(desc, args) {
    if (!cliPipe && !cliCommand) {
        console.log('Command is only available in WSL or inside a Visual Studio Code terminal.');
        return;
    }
    // take the local options and remove the ones that don't apply
    const options = { ...OPTIONS, gitCredential: { type: 'string' }, openExternal: { type: 'boolean' } };
    const isSupported = cliCommand ? isSupportedForCmd : isSupportedForPipe;
    for (const optionId in OPTIONS) {
        const optId = optionId;
        if (!isSupported(optId)) {
            delete options[optId];
        }
    }
    if (cliPipe) {
        options['openExternal'] = { type: 'boolean' };
    }
    const errorReporter = {
        onMultipleValues: (id, usedValue) => {
            console.error(`Option '${id}' can only be defined once. Using value ${usedValue}.`);
        },
        onEmptyValue: (id) => {
            console.error(`Ignoring option '${id}': Value must not be empty.`);
        },
        onUnknownOption: (id) => {
            console.error(`Ignoring option '${id}': not supported for ${desc.executableName}.`);
        },
        onDeprecatedOption: (deprecatedOption, message) => {
            console.warn(`Option '${deprecatedOption}' is deprecated: ${message}`);
        }
    };
    const parsedArgs = parseArgs(args, options, errorReporter);
    const mapFileUri = cliRemoteAuthority ? mapFileToRemoteUri : (uri) => uri;
    const verbose = !!parsedArgs['verbose'];
    if (parsedArgs.help) {
        console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, options));
        return;
    }
    if (parsedArgs.version) {
        console.log(buildVersionMessage(desc.version, desc.commit));
        return;
    }
    if (parsedArgs['locate-shell-integration-path']) {
        let file;
        switch (parsedArgs['locate-shell-integration-path']) {
            // Usage: `[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path bash)"`
            case 'bash':
                file = 'shellIntegration-bash.sh';
                break;
            // Usage: `if ($env:TERM_PROGRAM -eq "vscode") { . "$(code --locate-shell-integration-path pwsh)" }`
            case 'pwsh':
                file = 'shellIntegration.ps1';
                break;
            // Usage: `[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path zsh)"`
            case 'zsh':
                file = 'shellIntegration-rc.zsh';
                break;
            // Usage: `string match -q "$TERM_PROGRAM" "vscode"; and . (code --locate-shell-integration-path fish)`
            case 'fish':
                file = 'shellIntegration.fish';
                break;
            default: throw new Error('Error using --locate-shell-integration-path: Invalid shell type');
        }
        console.log(join(getAppRoot(), 'out', 'vs', 'workbench', 'contrib', 'terminal', 'common', 'scripts', file));
        return;
    }
    if (cliPipe) {
        if (parsedArgs['openExternal']) {
            await openInBrowser(parsedArgs['_'], verbose);
            return;
        }
    }
    let remote = parsedArgs.remote;
    if (remote === 'local' || remote === 'false' || remote === '') {
        remote = null; // null represent a local window
    }
    const folderURIs = (parsedArgs['folder-uri'] || []).map(mapFileUri);
    parsedArgs['folder-uri'] = folderURIs;
    const fileURIs = (parsedArgs['file-uri'] || []).map(mapFileUri);
    parsedArgs['file-uri'] = fileURIs;
    const inputPaths = parsedArgs['_'];
    let hasReadStdinArg = false;
    for (const input of inputPaths) {
        if (input === '-') {
            hasReadStdinArg = true;
        }
        else {
            translatePath(input, mapFileUri, folderURIs, fileURIs);
        }
    }
    parsedArgs['_'] = [];
    let readFromStdinPromise;
    let stdinFilePath;
    if (hasReadStdinArg && hasStdinWithoutTty()) {
        try {
            stdinFilePath = cliStdInFilePath;
            if (!stdinFilePath) {
                stdinFilePath = getStdinFilePath();
                const readFromStdinDone = new DeferredPromise();
                await readFromStdin(stdinFilePath, verbose, () => readFromStdinDone.complete()); // throws error if file can not be written
                if (!parsedArgs.wait) {
                    // if `--wait` is not provided, we keep this process alive
                    // for at least as long as the stdin stream is open to
                    // ensure that we read all the data.
                    readFromStdinPromise = readFromStdinDone.p;
                }
            }
            // Make sure to open tmp file
            translatePath(stdinFilePath, mapFileUri, folderURIs, fileURIs);
            // Ignore adding this to history
            parsedArgs['skip-add-to-recently-opened'] = true;
            console.log(`Reading from stdin via: ${stdinFilePath}`);
        }
        catch (e) {
            console.log(`Failed to create file to read via stdin: ${e.toString()}`);
        }
    }
    if (parsedArgs.extensionDevelopmentPath) {
        parsedArgs.extensionDevelopmentPath = parsedArgs.extensionDevelopmentPath.map(p => mapFileUri(pathToURI(p).href));
    }
    if (parsedArgs.extensionTestsPath) {
        parsedArgs.extensionTestsPath = mapFileUri(pathToURI(parsedArgs['extensionTestsPath']).href);
    }
    const crashReporterDirectory = parsedArgs['crash-reporter-directory'];
    if (crashReporterDirectory !== undefined && !crashReporterDirectory.match(/^([a-zA-Z]:[\\\/])/)) {
        console.log(`The crash reporter directory '${crashReporterDirectory}' must be an absolute Windows path (e.g. c:/crashes)`);
        return;
    }
    if (cliCommand) {
        if (parsedArgs['install-extension'] !== undefined || parsedArgs['uninstall-extension'] !== undefined || parsedArgs['list-extensions'] || parsedArgs['update-extensions']) {
            const cmdLine = [];
            parsedArgs['install-extension']?.forEach(id => cmdLine.push('--install-extension', id));
            parsedArgs['uninstall-extension']?.forEach(id => cmdLine.push('--uninstall-extension', id));
            ['list-extensions', 'force', 'show-versions', 'category'].forEach(opt => {
                const value = parsedArgs[opt];
                if (value !== undefined) {
                    cmdLine.push(`--${opt}=${value}`);
                }
            });
            if (parsedArgs['update-extensions']) {
                cmdLine.push('--update-extensions');
            }
            const childProcess = cp.fork(FileAccess.asFileUri('server-main').fsPath, cmdLine, { stdio: 'inherit' });
            childProcess.on('error', err => console.log(err));
            return;
        }
        const newCommandline = [];
        for (const key in parsedArgs) {
            const val = parsedArgs[key];
            if (typeof val === 'boolean') {
                if (val) {
                    newCommandline.push('--' + key);
                }
            }
            else if (Array.isArray(val)) {
                for (const entry of val) {
                    newCommandline.push(`--${key}=${entry.toString()}`);
                }
            }
            else if (val) {
                newCommandline.push(`--${key}=${val.toString()}`);
            }
        }
        if (remote !== null) {
            newCommandline.push(`--remote=${remote || cliRemoteAuthority}`);
        }
        const ext = extname(cliCommand);
        if (ext === '.bat' || ext === '.cmd') {
            const processCwd = cliCommandCwd || cwd();
            if (verbose) {
                console.log(`Invoking: cmd.exe /C ${cliCommand} ${newCommandline.join(' ')} in ${processCwd}`);
            }
            cp.spawn('cmd.exe', ['/C', cliCommand, ...newCommandline], {
                stdio: 'inherit',
                cwd: processCwd
            });
        }
        else {
            const cliCwd = dirname(cliCommand);
            const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
            const versionFolder = desc.commit.substring(0, 10);
            if (fs.existsSync(join(cliCwd, versionFolder))) {
                newCommandline.unshift(`${versionFolder}/resources/app/out/cli.js`);
            }
            else {
                newCommandline.unshift('resources/app/out/cli.js');
            }
            if (verbose) {
                console.log(`Invoking: cd "${cliCwd}" && ELECTRON_RUN_AS_NODE=1 "${cliCommand}" "${newCommandline.join('" "')}"`);
            }
            if (runningInWSL2()) {
                if (verbose) {
                    console.log(`Using pipes for output.`);
                }
                const childProcess = cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: ['inherit', 'pipe', 'pipe'] });
                childProcess.stdout.on('data', data => process.stdout.write(data));
                childProcess.stderr.on('data', data => process.stderr.write(data));
            }
            else {
                cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: 'inherit' });
            }
        }
    }
    else {
        if (parsedArgs.status) {
            await sendToPipe({
                type: 'status'
            }, verbose).then((res) => {
                console.log(res);
            }).catch(e => {
                console.error('Error when requesting status:', e);
            });
            return;
        }
        if (parsedArgs['install-extension'] !== undefined || parsedArgs['uninstall-extension'] !== undefined || parsedArgs['list-extensions'] || parsedArgs['update-extensions']) {
            await sendToPipe({
                type: 'extensionManagement',
                list: parsedArgs['list-extensions'] ? { showVersions: parsedArgs['show-versions'], category: parsedArgs['category'] } : undefined,
                install: asExtensionIdOrVSIX(parsedArgs['install-extension']),
                uninstall: asExtensionIdOrVSIX(parsedArgs['uninstall-extension']),
                force: parsedArgs['force']
            }, verbose).then((res) => {
                console.log(res);
            }).catch(e => {
                console.error('Error when invoking the extension management command:', e);
            });
            return;
        }
        let waitMarkerFilePath = undefined;
        if (parsedArgs['wait']) {
            if (!fileURIs.length) {
                console.log('At least one file must be provided to wait for.');
                return;
            }
            waitMarkerFilePath = createWaitMarkerFileSync(verbose);
        }
        await sendToPipe({
            type: 'open',
            fileURIs,
            folderURIs,
            diffMode: parsedArgs.diff,
            mergeMode: parsedArgs.merge,
            addMode: parsedArgs.add,
            removeMode: parsedArgs.remove,
            gotoLineMode: parsedArgs.goto,
            forceReuseWindow: parsedArgs['reuse-window'],
            forceNewWindow: parsedArgs['new-window'],
            waitMarkerFilePath,
            remoteAuthority: remote
        }, verbose).catch(e => {
            console.error('Error when invoking the open command:', e);
        });
        if (waitMarkerFilePath) {
            await waitForFileDeleted(waitMarkerFilePath);
        }
        if (readFromStdinPromise) {
            await readFromStdinPromise;
        }
        if (waitMarkerFilePath && stdinFilePath) {
            try {
                fs.unlinkSync(stdinFilePath);
            }
            catch (e) {
                //ignore
            }
        }
    }
}
function runningInWSL2() {
    if (!!process.env['WSL_DISTRO_NAME']) {
        try {
            return cp.execSync('uname -r', { encoding: 'utf8' }).includes('-microsoft-');
        }
        catch (_e) {
            // Ignore
        }
    }
    return false;
}
async function waitForFileDeleted(path) {
    while (fs.existsSync(path)) {
        await new Promise(res => setTimeout(res, 1000));
    }
}
async function openInBrowser(args, verbose) {
    const uris = [];
    for (const location of args) {
        try {
            if (/^[a-z-]+:\/\/.+/.test(location)) {
                uris.push(url.parse(location).href);
            }
            else {
                uris.push(pathToURI(location).href);
            }
        }
        catch (e) {
            console.log(`Invalid url: ${location}`);
        }
    }
    if (uris.length) {
        await sendToPipe({
            type: 'openExternal',
            uris
        }, verbose).catch(e => {
            console.error('Error when invoking the open external command:', e);
        });
    }
}
async function sendToPipe(args, verbose) {
    const http = await import('http');
    if (verbose) {
        console.log(JSON.stringify(args, null, '  '));
    }
    return new Promise((resolve, reject) => {
        const message = JSON.stringify(args);
        if (!cliPipe) {
            console.log('Message ' + message);
            resolve('');
            return;
        }
        const opts = {
            socketPath: cliPipe,
            path: '/',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'accept': 'application/json'
            }
        };
        const req = http.request(opts, res => {
            if (res.headers['content-type'] !== 'application/json') {
                reject('Error in response: Invalid content type: Expected \'application/json\', is: ' + res.headers['content-type']);
                return;
            }
            const chunks = [];
            res.setEncoding('utf8');
            res.on('data', chunk => {
                chunks.push(chunk);
            });
            res.on('error', (err) => fatal('Error in response.', err));
            res.on('end', () => {
                const content = chunks.join('');
                try {
                    const obj = JSON.parse(content);
                    if (res.statusCode === 200) {
                        resolve(obj);
                    }
                    else {
                        reject(obj);
                    }
                }
                catch (e) {
                    reject('Error in response: Unable to parse response as JSON: ' + content);
                }
            });
        });
        req.on('error', (err) => fatal('Error in request.', err));
        req.write(message);
        req.end();
    });
}
function asExtensionIdOrVSIX(inputs) {
    return inputs?.map(input => /\.vsix$/i.test(input) ? pathToURI(input).href : input);
}
function fatal(message, err) {
    console.error('Unable to connect to VS Code server: ' + message);
    console.error(err);
    process.exit(1);
}
const preferredCwd = process.env.PWD || cwd(); // prefer process.env.PWD as it does not follow symlinks
function pathToURI(input) {
    input = input.trim();
    input = resolve(preferredCwd, input);
    return url.pathToFileURL(input);
}
function translatePath(input, mapFileUri, folderURIS, fileURIS) {
    const url = pathToURI(input);
    const mappedUri = mapFileUri(url.href);
    try {
        const stat = fs.lstatSync(fs.realpathSync(input));
        if (stat.isFile()) {
            fileURIS.push(mappedUri);
        }
        else if (stat.isDirectory()) {
            folderURIS.push(mappedUri);
        }
        else if (input === '/dev/null') {
            // handle /dev/null passed to us by external tools such as `git difftool`
            fileURIS.push(mappedUri);
        }
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            fileURIS.push(mappedUri);
        }
        else {
            console.log(`Problem accessing file ${input}. Ignoring file`, e);
        }
    }
}
function mapFileToRemoteUri(uri) {
    return uri.replace(/^file:\/\//, 'vscode-remote://' + cliRemoteAuthority);
}
function getAppRoot() {
    return dirname(FileAccess.asFileUri('').fsPath);
}
const [, , productName, version, commit, executableName, ...remainingArgs] = process.argv;
main({ productName, version, commit, executableName }, remainingArgs).then(null, err => {
    console.error(err.message || err.stack || err);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmNsaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3NlcnZlci9ub2RlL3NlcnZlci5jbGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxLQUFLLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFDM0IsT0FBTyxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFcEMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ25ELE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBcUMsTUFBTSx5Q0FBeUMsQ0FBQztBQUV2SixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzdELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQXFCMUQsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFFBQWdDLEVBQUUsRUFBRTtJQUM5RCxRQUFRLFFBQVEsRUFBRSxDQUFDO1FBQ2xCLEtBQUssZUFBZSxDQUFDO1FBQ3JCLEtBQUssZ0JBQWdCLENBQUM7UUFDdEIsS0FBSyw4QkFBOEIsQ0FBQztRQUNwQyxLQUFLLGdCQUFnQixDQUFDO1FBQ3RCLEtBQUssMEJBQTBCLENBQUM7UUFDaEMsS0FBSyx5QkFBeUIsQ0FBQztRQUMvQixLQUFLLHdCQUF3QixDQUFD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