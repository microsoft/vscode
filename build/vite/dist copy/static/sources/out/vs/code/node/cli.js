/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'child_process';
import { chmodSync, existsSync, readFileSync, statSync, truncateSync, unlinkSync, promises } from 'fs';
import { homedir, tmpdir } from 'os';
import { Event } from '../../base/common/event.js';
import { isAbsolute, resolve, join, dirname } from '../../base/common/path.js';
import { isMacintosh, isWindows } from '../../base/common/platform.js';
import { randomPort } from '../../base/common/ports.js';
import { whenDeleted, writeFileSync } from '../../base/node/pfs.js';
import { findFreePort } from '../../base/node/ports.js';
import { watchFileContents } from '../../platform/files/node/watcher/nodejs/nodejsWatcherLib.js';
import { buildHelpMessage, buildStdinMessage, buildVersionMessage, NATIVE_CLI_COMMANDS, OPTIONS } from '../../platform/environment/node/argv.js';
import { addArg, parseCLIProcessArgv } from '../../platform/environment/node/argvHelper.js';
import { getStdinFilePath, hasStdinWithoutTty, readFromStdin, stdinDataListener } from '../../platform/environment/node/stdin.js';
import { createWaitMarkerFileSync } from '../../platform/environment/node/wait.js';
import product from '../../platform/product/common/product.js';
import { CancellationTokenSource } from '../../base/common/cancellation.js';
import { isUNC, randomPath } from '../../base/common/extpath.js';
import { Utils } from '../../platform/profiling/common/profiling.js';
import { FileAccess } from '../../base/common/network.js';
import { cwd } from '../../base/common/process.js';
import { addUNCHostToAllowlist } from '../../base/node/unc.js';
import { URI } from '../../base/common/uri.js';
import { DeferredPromise } from '../../base/common/async.js';
function shouldSpawnCliProcess(argv) {
    return !!argv['install-source']
        || !!argv['list-extensions']
        || !!argv['install-extension']
        || !!argv['uninstall-extension']
        || !!argv['update-extensions']
        || !!argv['locate-extension']
        || !!argv['add-mcp']
        || !!argv['telemetry'];
}
export async function main(argv) {
    let args;
    try {
        args = parseCLIProcessArgv(argv);
    }
    catch (err) {
        console.error(err.message);
        return;
    }
    for (const subcommand of NATIVE_CLI_COMMANDS) {
        if (args[subcommand]) {
            if (!product.tunnelApplicationName) {
                console.error(`'${subcommand}' command not supported in ${product.applicationName}`);
                return;
            }
            const env = {
                ...process.env
            };
            // bootstrap-esm.js determines the electron environment based
            // on the following variable. For the server we need to unset
            // it to prevent importing any electron specific modules.
            // Refs https://github.com/microsoft/vscode/issues/221883
            delete env['ELECTRON_RUN_AS_NODE'];
            const tunnelArgs = argv.slice(argv.indexOf(subcommand) + 1); // all arguments behind `tunnel`
            return new Promise((resolve, reject) => {
                let tunnelProcess;
                const stdio = ['ignore', 'pipe', 'pipe'];
                if (process.env['VSCODE_DEV']) {
                    tunnelProcess = spawn('cargo', ['run', '--', subcommand, ...tunnelArgs], { cwd: join(getAppRoot(), 'cli'), stdio, env });
                }
                else {
                    const appPath = process.platform === 'darwin'
                        // ./Contents/MacOS/Code => ./Contents/Resources/app/bin/code-tunnel-insiders
                        ? join(dirname(dirname(process.execPath)), 'Resources', 'app')
                        : dirname(process.execPath);
                    const tunnelCommand = join(appPath, 'bin', `${product.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
                    tunnelProcess = spawn(tunnelCommand, [subcommand, ...tunnelArgs], { cwd: cwd(), stdio, env });
                }
                tunnelProcess.stdout.pipe(process.stdout);
                tunnelProcess.stderr.pipe(process.stderr);
                tunnelProcess.on('exit', resolve);
                tunnelProcess.on('error', reject);
            });
        }
    }
    // Help (general)
    if (args.help) {
        const executable = `${product.applicationName}${isWindows ? '.exe' : ''}`;
        console.log(buildHelpMessage(product.nameLong, executable, product.version, OPTIONS));
    }
    // Help (chat)
    else if (args.chat?.help) {
        const executable = `${product.applicationName}${isWindows ? '.exe' : ''}`;
        console.log(buildHelpMessage(product.nameLong, executable, product.version, OPTIONS.chat.options, { isChat: true }));
    }
    // Version Info
    else if (args.version) {
        console.log(buildVersionMessage(product.version, product.commit));
    }
    // Shell integration
    else if (args['locate-shell-integration-path']) {
        let file;
        switch (args['locate-shell-integration-path']) {
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
    }
    // Extensions Management
    else if (shouldSpawnCliProcess(args)) {
        // We do not bundle `cliProcessMain.js` into this file because
        // it is rather large and only needed for very few CLI operations.
        // This has the downside that we need to know if we run OSS or
        // built, because our location on disk is different if built.
        let cliProcessMain;
        if (process.env['VSCODE_DEV']) {
            cliProcessMain = './cliProcessMain.js';
        }
        else {
            cliProcessMain = './vs/code/node/cliProcessMain.js';
        }
        const cli = await import(cliProcessMain);
        await cli.main(args);
        return;
    }
    // Write File
    else if (args['file-write']) {
        const argsFile = args._[0];
        if (!argsFile || !isAbsolute(argsFile) || !existsSync(argsFile) || !statSync(argsFile).isFile()) {
            throw new Error('Using --file-write with invalid arguments.');
        }
        let source;
        let target;
        try {
            const argsContents = JSON.parse(readFileSync(argsFile, 'utf8'));
            source = argsContents.source;
            target = argsContents.target;
        }
        catch (error) {
            throw new Error('Using --file-write with invalid arguments.');
        }
        // Windows: set the paths as allowed UNC paths given
        // they are explicitly provided by the user as arguments
        if (isWindows) {
            for (const path of [source, target]) {
                if (typeof path === 'string' && isUNC(path)) {
                    addUNCHostToAllowlist(URI.file(path).authority);
                }
            }
        }
        // Validate
        if (!source || !target || source === target || // make sure source and target are provided and are not the same
            !isAbsolute(source) || !isAbsolute(target) || // make sure both source and target are absolute paths
            !existsSync(source) || !statSync(source).isFile() || // make sure source exists as file
            !existsSync(target) || !statSync(target).isFile() // make sure target exists as file
        ) {
            throw new Error('Using --file-write with invalid arguments.');
        }
        try {
            // Check for readonly status and chmod if so if we are told so
            let targetMode = 0;
            let restoreMode = false;
            if (args['file-chmod']) {
                targetMode = statSync(target).mode;
                if (!(targetMode & 0o200 /* File mode indicating writable by owner */)) {
                    chmodSync(target, targetMode | 0o200);
                    restoreMode = true;
                }
            }
            // Write source to target
            const data = readFileSync(source);
            if (isWindows) {
                // On Windows we use a different strategy of saving the file
                // by first truncating the file and then writing with r+ mode.
                // This helps to save hidden files on Windows
                // (see https://github.com/microsoft/vscode/issues/931) and
                // prevent removing alternate data streams
                // (see https://github.com/microsoft/vscode/issues/6363)
                truncateSync(target, 0);
                writeFileSync(target, data, { flag: 'r+' });
            }
            else {
                writeFileSync(target, data);
            }
            // Restore previous mode as needed
            if (restoreMode) {
                chmodSync(target, targetMode);
            }
        }
        catch (error) {
            error.message = `Error using --file-write: ${error.message}`;
            throw error;
        }
    }
    // Just Code
    else {
        const env = {
            ...process.env,
            'ELECTRON_NO_ATTACH_CONSOLE': '1'
        };
        delete env['ELECTRON_RUN_AS_NODE'];
        const processCallbacks = [];
        if (args.verbose) {
            env['ELECTRON_ENABLE_LOGGING'] = '1';
        }
        if (args.verbose || args.status) {
            processCallbacks.push(async (child) => {
                child.stdout?.on('data', (data) => console.log(data.toString('utf8').trim()));
                child.stderr?.on('data', (data) => console.log(data.toString('utf8').trim()));
                await Event.toPromise(Event.fromNodeEventEmitter(child, 'exit'));
            });
        }
        // Handle --transient option
        if (args['transient']) {
            const tempParentDir = randomPath(tmpdir(), 'vscode');
            const tempUserDataDir = join(tempParentDir, 'data');
            const tempExtensionsDir = join(tempParentDir, 'extensions');
            addArg(argv, '--user-data-dir', tempUserDataDir);
            addArg(argv, '--extensions-dir', tempExtensionsDir);
            console.log(`State is temporarily stored. Relaunch this state with: ${product.applicationName} --user-data-dir "${tempUserDataDir}" --extensions-dir "${tempExtensionsDir}"`);
        }
        const hasReadStdinArg = args._.some(arg => arg === '-') || args.chat?._.some(arg => arg === '-');
        if (hasReadStdinArg) {
            // remove the "-" argument when we read from stdin
            args._ = args._.filter(a => a !== '-');
            argv = argv.filter(a => a !== '-');
        }
        let stdinFilePath;
        if (hasStdinWithoutTty()) {
            // Read from stdin: we require a single "-" argument to be passed in order to start reading from
            // stdin. We do this because there is no reliable way to find out if data is piped to stdin. Just
            // checking for stdin being connected to a TTY is not enough (https://github.com/microsoft/vscode/issues/40351)
            if (hasReadStdinArg) {
                stdinFilePath = getStdinFilePath();
                try {
                    const readFromStdinDone = new DeferredPromise();
                    await readFromStdin(stdinFilePath, !!args.verbose, () => readFromStdinDone.complete());
                    if (!args.wait) {
                        // if `--wait` is not provided, we keep this process alive
                        // for at least as long as the stdin stream is open to
                        // ensure that we read all the data.
                        // the downside is that the Code CLI process will then not
                        // terminate until stdin is closed, but users can always
                        // pass `--wait` to prevent that from happening (this is
                        // actually what we enforced until v1.85.x but then was
                        // changed to not enforce it anymore).
                        // a solution in the future would possibly be to exit, when
                        // the Code process exits. this would require some careful
                        // solution though in case Code is already running and this
                        // is a second instance telling the first instance what to
                        // open.
                        processCallbacks.push(() => readFromStdinDone.p);
                    }
                    if (args.chat) {
                        // Make sure to add tmp file as context to chat
                        addArg(argv, '--add-file', stdinFilePath);
                    }
                    else {
                        // Make sure to open tmp file as editor but ignore
                        // it in the "recently open" list
                        addArg(argv, stdinFilePath);
                        addArg(argv, '--skip-add-to-recently-opened');
                    }
                    console.log(`Reading from stdin via: ${stdinFilePath}`);
                }
                catch (e) {
                    console.log(`Failed to create file to read via stdin: ${e.toString()}`);
                    stdinFilePath = undefined;
                }
            }
            else {
                // If the user pipes data via stdin but forgot to add the "-" argument, help by printing a message
                // if we detect that data flows into via stdin after a certain timeout.
                processCallbacks.push(_ => stdinDataListener(1000).then(dataReceived => {
                    if (dataReceived) {
                        console.log(buildStdinMessage(product.applicationName, !!args.chat));
                    }
                }));
            }
        }
        // If we are started with --wait create a random temporary file
        // and pass it over to the starting instance. We can use this file
        // to wait for it to be deleted to monitor that the edited file
        // is closed and then exit the waiting process.
        let waitMarkerFilePath;
        if (args.wait) {
            waitMarkerFilePath = createWaitMarkerFileSync(args.verbose);
            if (waitMarkerFilePath) {
                addArg(argv, '--waitMarkerFilePath', waitMarkerFilePath);
            }
            // When running with --wait, we want to continue running CLI process
            // until either:
            // - the wait marker file has been deleted (e.g. when closing the editor)
            // - the launched process terminates (e.g. due to a crash)
            processCallbacks.push(async (child) => {
                let childExitPromise;
                if (isMacintosh) {
                    // On macOS, we resolve the following promise only when the child,
                    // i.e. the open command, exited with a signal or error. Otherwise, we
                    // wait for the marker file to be deleted or for the child to error.
                    childExitPromise = new Promise(resolve => {
                        // Only resolve this promise if the child (i.e. open) exited with an error
                        child.on('exit', (code, signal) => {
                            if (code !== 0 || signal) {
                                resolve();
                            }
                        });
                    });
                }
                else {
                    // On other platforms, we listen for exit in case the child exits before the
                    // marker file is deleted.
                    childExitPromise = Event.toPromise(Event.fromNodeEventEmitter(child, 'exit'));
                }
                try {
                    await Promise.race([
                        whenDeleted(waitMarkerFilePath),
                        Event.toPromise(Event.fromNodeEventEmitter(child, 'error')),
                        childExitPromise
                    ]);
                }
                finally {
                    if (stdinFilePath) {
                        unlinkSync(stdinFilePath); // Make sure to delete the tmp stdin file if we have any
                    }
                }
            });
        }
        // If we have been started with `--prof-startup` we need to find free ports to profile
        // the main process, the renderer, and the extension host. We also disable v8 cached data
        // to get better profile traces. Last, we listen on stdout for a signal that tells us to
        // stop profiling.
        if (args['prof-startup']) {
            const profileHost = '127.0.0.1';
            const portMain = await findFreePort(randomPort(), 10, 3000);
            const portRenderer = await findFreePort(portMain + 1, 10, 3000);
            const portExthost = await findFreePort(portRenderer + 1, 10, 3000);
            // fail the operation when one of the ports couldn't be acquired.
            if (portMain * portRenderer * portExthost === 0) {
                throw new Error('Failed to find free ports for profiler. Make sure to shutdown all instances of the editor first.');
            }
            const filenamePrefix = randomPath(homedir(), 'prof');
            addArg(argv, `--inspect-brk=${profileHost}:${portMain}`);
            addArg(argv, `--remote-debugging-port=${profileHost}:${portRenderer}`);
            addArg(argv, `--inspect-brk-extensions=${profileHost}:${portExthost}`);
            addArg(argv, `--prof-startup-prefix`, filenamePrefix);
            addArg(argv, `--no-cached-data`);
            writeFileSync(filenamePrefix, argv.slice(-6).join('|'));
            processCallbacks.push(async (_child) => {
                class Profiler {
                    static async start(name, filenamePrefix, opts) {
                        const profiler = await import('v8-inspect-profiler');
                        let session;
                        try {
                            session = await profiler.startProfiling({ ...opts, host: profileHost });
                        }
                        catch (err) {
                            console.error(`FAILED to start profiling for '${name}' on port '${opts.port}'`);
                        }
                        return {
                            async stop() {
                                if (!session) {
                                    return;
                                }
                                let suffix = '';
                                const result = await session.stop();
                                if (!process.env['VSCODE_DEV']) {
                                    // when running from a not-development-build we remove
                                    // absolute filenames because we don't want to reveal anything
                                    // about users. We also append the `.txt` suffix to make it
                                    // easier to attach these files to GH issues
                                    result.profile = Utils.rewriteAbsolutePaths(result.profile, 'piiRemoved');
                                    suffix = '.txt';
                                }
                                writeFileSync(`${filenamePrefix}.${name}.cpuprofile${suffix}`, JSON.stringify(result.profile, undefined, 4));
                            }
                        };
                    }
                }
                try {
                    // load and start profiler
                    const mainProfileRequest = Profiler.start('main', filenamePrefix, { port: portMain });
                    const extHostProfileRequest = Profiler.start('extHost', filenamePrefix, { port: portExthost, tries: 300 });
                    const rendererProfileRequest = Profiler.start('renderer', filenamePrefix, {
                        port: portRenderer,
                        tries: 200,
                        target: function (targets) {
                            return targets.filter(target => {
                                if (!target.webSocketDebuggerUrl) {
                                    return false;
                                }
                                if (target.type === 'page') {
                                    return target.url.indexOf('workbench/workbench.html') > 0 || target.url.indexOf('workbench/workbench-dev.html') > 0;
                                }
                                else {
                                    return true;
                                }
                            })[0];
                        }
                    });
                    const main = await mainProfileRequest;
                    const extHost = await extHostProfileRequest;
                    const renderer = await rendererProfileRequest;
                    // wait for the renderer to delete the marker file
                    await whenDeleted(filenamePrefix);
                    // stop profiling
                    await main.stop();
                    await renderer.stop();
                    await extHost.stop();
                    // re-create the marker file to signal that profiling is done
                    writeFileSync(filenamePrefix, '');
                }
                catch (e) {
                    console.error('Failed to profile startup. Make sure to quit Code first.');
                }
            });
        }
        const options = {
            detached: true,
            env
        };
        if (!args.verbose) {
            options['stdio'] = 'ignore';
        }
        let child;
        if (!isMacintosh) {
            if (!args.verbose && args.status) {
                options['stdio'] = ['ignore', 'pipe', 'ignore']; // restore ability to see output when --status is used
            }
            // We spawn process.execPath directly
            child = spawn(process.execPath, argv.slice(2), options);
        }
        else {
            // On macOS, we spawn using the open command to obtain behavior
            // similar to if the app was launched from the dock
            // https://github.com/microsoft/vscode/issues/102975
            // The following args are for the open command itself, rather than for VS Code:
            // -n creates a new instance.
            //    Without -n, the open command re-opens the existing instance as-is.
            // -g starts the new instance in the background.
            //    Later, Electron brings the instance to the foreground.
            //    This way, Mac does not automatically try to foreground the new instance, which causes
            //    focusing issues when the new instance only sends data to a previous instance and then closes.
            const spawnArgs = ['-n', '-g'];
            // Figure out the app to launch: with --agents we try to launch the embedded app
            let appToLaunch = process.execPath;
            if (args.agents) {
                // process.execPath is e.g. /Applications/Code.app/Contents/MacOS/Electron
                // Embedded app is at /Applications/Code.app/Contents/Applications/<EmbeddedApp>.app
                const contentsPath = dirname(dirname(process.execPath));
                const applicationsPath = join(contentsPath, 'Applications');
                try {
                    const files = await promises.readdir(applicationsPath);
                    const embeddedApp = files.find(file => file.endsWith('.app'));
                    if (embeddedApp) {
                        appToLaunch = join(applicationsPath, embeddedApp);
                        argv = argv.filter(arg => arg !== '--agents');
                    }
                }
                catch (error) {
                    /* may not exist on disk */
                }
            }
            spawnArgs.push('-a', appToLaunch); // -a opens the given application.
            if (args.verbose || args.status) {
                spawnArgs.push('--wait-apps'); // `open --wait-apps`: blocks until the launched app is closed (even if they were already running)
                // The open command only allows for redirecting stderr and stdout to files,
                // so we make it redirect those to temp files, and then use a logger to
                // redirect the file output to the console
                for (const outputType of args.verbose ? ['stdout', 'stderr'] : ['stdout']) {
                    // Tmp file to target output to
                    const tmpName = randomPath(tmpdir(), `code-${outputType}`);
                    writeFileSync(tmpName, '');
                    spawnArgs.push(`--${outputType}`, tmpName);
                    // Listener to redirect content to stdout/stderr
                    processCallbacks.push(async (child) => {
                        try {
                            const stream = outputType === 'stdout' ? process.stdout : process.stderr;
                            const cts = new CancellationTokenSource();
                            child.on('close', () => {
                                // We must dispose the token to stop watching,
                                // but the watcher might still be reading data.
                                setTimeout(() => cts.dispose(true), 200);
                            });
                            await watchFileContents(tmpName, chunk => stream.write(chunk), () => { }, cts.token);
                        }
                        finally {
                            unlinkSync(tmpName);
                        }
                    });
                }
            }
            for (const e in env) {
                // Ignore the _ env var, because the open command
                // ignores it anyway.
                // Pass the rest of the env vars in to fix
                // https://github.com/microsoft/vscode/issues/134696.
                if (e !== '_') {
                    spawnArgs.push('--env');
                    spawnArgs.push(`${e}=${env[e]}`);
                }
            }
            spawnArgs.push('--args', ...argv.slice(2)); // pass on our arguments
            if (env['VSCODE_DEV']) {
                // If we're in development mode, replace the . arg with the
                // vscode source arg. Because the OSS app isn't bundled,
                // it needs the full vscode source arg to launch properly.
                const curdir = '.';
                const launchDirIndex = spawnArgs.indexOf(curdir);
                if (launchDirIndex !== -1) {
                    spawnArgs[launchDirIndex] = resolve(curdir);
                }
            }
            // We already passed over the env variables
            // using the --env flags, so we can leave them out here.
            // Also, we don't need to pass env._, which is different from argv._
            child = spawn('open', spawnArgs, { ...options, env: {} });
        }
        await Promise.all(processCallbacks.map(callback => callback(child)));
    }
}
function getAppRoot() {
    return dirname(FileAccess.asFileUri('').fsPath);
}
function eventuallyExit(code) {
    setTimeout(() => process.exit(code), 0);
}
main(process.argv)
    .then(() => eventuallyExit(0))
    .then(null, err => {
    console.error(err.message || err.stack || err);
    eventuallyExit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvY29kZS9ub2RlL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWdCLEtBQUssRUFBOEIsTUFBTSxlQUFlLENBQUM7QUFDaEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUN2RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUVyQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQy9FLE9BQU8sRUFBdUIsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakosT0FBTyxFQUFFLE1BQU0sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUs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