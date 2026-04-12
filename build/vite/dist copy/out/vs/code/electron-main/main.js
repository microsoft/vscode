/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../../platform/update/common/update.config.contribution.js';
import { app, dialog } from 'electron';
import { unlinkSync, promises } from 'fs';
import { URI } from '../../base/common/uri.js';
import { coalesce, distinct } from '../../base/common/arrays.js';
import { Promises } from '../../base/common/async.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { ExpectedError, setUnexpectedErrorHandler } from '../../base/common/errors.js';
import { isValidBasename, parseLineAndColumnAware, sanitizeFilePath } from '../../base/common/extpath.js';
import { Event } from '../../base/common/event.js';
import { getPathLabel } from '../../base/common/labels.js';
import { Schemas } from '../../base/common/network.js';
import { basename, resolve } from '../../base/common/path.js';
import { mark } from '../../base/common/performance.js';
import { isLinux, isMacintosh, isWindows, OS } from '../../base/common/platform.js';
import { cwd } from '../../base/common/process.js';
import { rtrim, trim } from '../../base/common/strings.js';
import { Promises as FSPromises } from '../../base/node/pfs.js';
import { ProxyChannel } from '../../base/parts/ipc/common/ipc.js';
import { connect as nodeIPCConnect, serve as nodeIPCServe, XDG_RUNTIME_DIR } from '../../base/parts/ipc/node/ipc.net.js';
import { CodeApplication } from './app.js';
import { localize } from '../../nls.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ConfigurationService } from '../../platform/configuration/common/configurationService.js';
import { DiagnosticsService } from '../../platform/diagnostics/node/diagnosticsService.js';
import { EnvironmentMainService, IEnvironmentMainService } from '../../platform/environment/electron-main/environmentMainService.js';
import { addArg, parseMainProcessArgv } from '../../platform/environment/node/argvHelper.js';
import { createWaitMarkerFileSync } from '../../platform/environment/node/wait.js';
import { IFileService } from '../../platform/files/common/files.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILifecycleMainService, LifecycleMainService } from '../../platform/lifecycle/electron-main/lifecycleMainService.js';
import { BufferLogger } from '../../platform/log/common/bufferLog.js';
import { ConsoleMainLogger, getLogLevel, ILoggerService, ILogService } from '../../platform/log/common/log.js';
import product from '../../platform/product/common/product.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IProtocolMainService } from '../../platform/protocol/electron-main/protocol.js';
import { ProtocolMainService } from '../../platform/protocol/electron-main/protocolMainService.js';
import { ITunnelService } from '../../platform/tunnel/common/tunnel.js';
import { TunnelService } from '../../platform/tunnel/node/tunnelService.js';
import { IRequestService } from '../../platform/request/common/request.js';
import { RequestService } from '../../platform/request/electron-utility/requestService.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { SignService } from '../../platform/sign/node/signService.js';
import { IStateReadService, IStateService } from '../../platform/state/node/state.js';
import { NullTelemetryService } from '../../platform/telemetry/common/telemetryUtils.js';
import { IThemeMainService } from '../../platform/theme/electron-main/themeMainService.js';
import { IUserDataProfilesMainService, UserDataProfilesMainService } from '../../platform/userDataProfile/electron-main/userDataProfile.js';
import { IPolicyService, NullPolicyService } from '../../platform/policy/common/policy.js';
import { NativePolicyService } from '../../platform/policy/node/nativePolicyService.js';
import { FilePolicyService } from '../../platform/policy/common/filePolicyService.js';
import { DisposableStore } from '../../base/common/lifecycle.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { ILoggerMainService, LoggerMainService } from '../../platform/log/electron-main/loggerService.js';
import { LogService } from '../../platform/log/common/logService.js';
import { massageMessageBoxOptions } from '../../platform/dialogs/common/dialogs.js';
import { StateService } from '../../platform/state/node/stateService.js';
import { FileUserDataProvider } from '../../platform/userData/common/fileUserDataProvider.js';
import { addUNCHostToAllowlist, getUNCHost } from '../../base/node/unc.js';
import { ThemeMainService } from '../../platform/theme/electron-main/themeMainServiceImpl.js';
import { LINUX_SYSTEM_POLICY_FILE_PATH } from '../../base/common/policy.js';
/**
 * The main VS Code entry point.
 *
 * Note: This class can exist more than once for example when VS Code is already
 * running and a second instance is started from the command line. It will always
 * try to communicate with an existing instance to prevent that 2 VS Code instances
 * are running at the same time.
 */
class CodeMain {
    main() {
        try {
            this.startup();
        }
        catch (error) {
            console.error(error.message);
            app.exit(1);
        }
    }
    async startup() {
        // Set the error handler early enough so that we are not getting the
        // default electron error dialog popping up
        setUnexpectedErrorHandler(err => console.error(err));
        // Create services
        const [instantiationService, instanceEnvironment, environmentMainService, configurationService, stateMainService, bufferLogger, productService, userDataProfilesMainService] = this.createServices();
        try {
            // Init services
            try {
                await this.initServices(environmentMainService, userDataProfilesMainService, configurationService, stateMainService, productService);
            }
            catch (error) {
                // Show a dialog for errors that can be resolved by the user
                this.handleStartupDataDirError(environmentMainService, productService, error);
                throw error;
            }
            // Startup
            await instantiationService.invokeFunction(async (accessor) => {
                const logService = accessor.get(ILogService);
                const lifecycleMainService = accessor.get(ILifecycleMainService);
                const fileService = accessor.get(IFileService);
                const loggerService = accessor.get(ILoggerService);
                // Create the main IPC server by trying to be the server
                // If this throws an error it means we are not the first
                // instance of VS Code running and so we would quit.
                const mainProcessNodeIpcServer = await this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, true);
                // Write a lockfile to indicate an instance is running
                // (https://github.com/microsoft/vscode/issues/127861#issuecomment-877417451)
                FSPromises.writeFile(environmentMainService.mainLockfile, String(process.pid)).catch(err => {
                    logService.warn(`app#startup(): Error writing main lockfile: ${err.stack}`);
                });
                // Delay creation of spdlog for perf reasons (https://github.com/microsoft/vscode/issues/72906)
                bufferLogger.logger = loggerService.createLogger('main', { name: localize('mainLog', "Main") });
                // Lifecycle
                Event.once(lifecycleMainService.onWillShutdown)(evt => {
                    fileService.dispose();
                    configurationService.dispose();
                    evt.join('instanceLockfile', promises.unlink(environmentMainService.mainLockfile).catch(() => { }));
                });
                // Check if Inno Setup is running
                const innoSetupActive = await this.checkInnoSetupMutex(productService);
                if (innoSetupActive) {
                    const message = `${productService.nameShort} is currently being updated. Please wait for the update to complete before launching.`;
                    instantiationService.invokeFunction(this.quit, new Error(message));
                    return;
                }
                return instantiationService.createInstance(CodeApplication, mainProcessNodeIpcServer, instanceEnvironment).startup();
            });
        }
        catch (error) {
            instantiationService.invokeFunction(this.quit, error);
        }
    }
    createServices() {
        const services = new ServiceCollection();
        const disposables = new DisposableStore();
        process.once('exit', () => disposables.dispose());
        // Product
        const productService = { _serviceBrand: undefined, ...product };
        services.set(IProductService, productService);
        // Environment
        const environmentMainService = new EnvironmentMainService(this.resolveArgs(), productService);
        const instanceEnvironment = this.patchEnvironment(environmentMainService); // Patch `process.env` with the instance's environment
        services.set(IEnvironmentMainService, environmentMainService);
        // Logger
        const loggerService = new LoggerMainService(getLogLevel(environmentMainService), environmentMainService.logsHome);
        services.set(ILoggerMainService, loggerService);
        // Log: We need to buffer the spdlog logs until we are sure
        // we are the only instance running, otherwise we'll have concurrent
        // log file access on Windows (https://github.com/microsoft/vscode/issues/41218)
        const bufferLogger = new BufferLogger(loggerService.getLogLevel());
        const logService = disposables.add(new LogService(bufferLogger, [new ConsoleMainLogger(loggerService.getLogLevel())]));
        services.set(ILogService, logService);
        // Files
        const fileService = new FileService(logService);
        services.set(IFileService, fileService);
        const diskFileSystemProvider = new DiskFileSystemProvider(logService);
        fileService.registerProvider(Schemas.file, diskFileSystemProvider);
        // URI Identity
        const uriIdentityService = new UriIdentityService(fileService);
        services.set(IUriIdentityService, uriIdentityService);
        // State
        const stateService = new StateService(1 /* SaveStrategy.DELAYED */, environmentMainService, logService, fileService);
        services.set(IStateReadService, stateService);
        services.set(IStateService, stateService);
        // User Data Profiles
        const userDataProfilesMainService = new UserDataProfilesMainService(stateService, uriIdentityService, environmentMainService, fileService, logService);
        services.set(IUserDataProfilesMainService, userDataProfilesMainService);
        // Use FileUserDataProvider for user data to
        // enable atomic read / write operations.
        fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesMainService, uriIdentityService, logService));
        // Policy
        let policyService;
        if (isWindows && productService.win32RegValueName) {
            policyService = disposables.add(new NativePolicyService(logService, productService.win32RegValueName));
        }
        else if (isMacintosh && productService.darwinBundleIdentifier) {
            policyService = disposables.add(new NativePolicyService(logService, productService.darwinBundleIdentifier));
        }
        else if (isLinux) {
            policyService = disposables.add(new FilePolicyService(URI.file(LINUX_SYSTEM_POLICY_FILE_PATH), fileService, logService));
        }
        else if (environmentMainService.policyFile) {
            policyService = disposables.add(new FilePolicyService(environmentMainService.policyFile, fileService, logService));
        }
        else {
            policyService = new NullPolicyService();
        }
        services.set(IPolicyService, policyService);
        // Configuration
        const configurationService = new ConfigurationService(userDataProfilesMainService.defaultProfile.settingsResource, fileService, policyService, logService);
        services.set(IConfigurationService, configurationService);
        // Lifecycle
        services.set(ILifecycleMainService, new SyncDescriptor(LifecycleMainService, undefined, false));
        // Request
        services.set(IRequestService, new SyncDescriptor(RequestService, undefined, true));
        // Themes
        services.set(IThemeMainService, new SyncDescriptor(ThemeMainService));
        // Signing
        services.set(ISignService, new SyncDescriptor(SignService, undefined, false /* proxied to other processes */));
        // Tunnel
        services.set(ITunnelService, new SyncDescriptor(TunnelService));
        // Protocol (instantiated early and not using sync descriptor for security reasons)
        services.set(IProtocolMainService, new ProtocolMainService(environmentMainService, userDataProfilesMainService, logService));
        return [new InstantiationService(services, true), instanceEnvironment, environmentMainService, configurationService, stateService, bufferLogger, productService, userDataProfilesMainService];
    }
    patchEnvironment(environmentMainService) {
        const instanceEnvironment = {
            VSCODE_IPC_HOOK: environmentMainService.mainIPCHandle
        };
        ['VSCODE_NLS_CONFIG', 'VSCODE_PORTABLE'].forEach(key => {
            const value = process.env[key];
            if (typeof value === 'string') {
                instanceEnvironment[key] = value;
            }
        });
        Object.assign(process.env, instanceEnvironment);
        return instanceEnvironment;
    }
    async initServices(environmentMainService, userDataProfilesMainService, configurationService, stateService, productService) {
        await Promises.settled([
            // Environment service (paths)
            Promise.all([
                this.allowWindowsUNCPath(environmentMainService.extensionsPath), // enable extension paths on UNC drives...
                environmentMainService.codeCachePath, // ...other user-data-derived paths should already be enlisted from `main.js`
                environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
                userDataProfilesMainService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath,
                environmentMainService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath,
                environmentMainService.localHistoryHome.with({ scheme: Schemas.file }).fsPath,
                environmentMainService.backupHome
            ].map(path => path ? promises.mkdir(path, { recursive: true }) : undefined)),
            // State service
            stateService.init(),
            // Configuration service
            configurationService.initialize()
        ]);
        // Initialize user data profiles after initializing the state
        userDataProfilesMainService.init();
    }
    allowWindowsUNCPath(path) {
        if (isWindows) {
            const host = getUNCHost(path);
            if (host) {
                addUNCHostToAllowlist(host);
            }
        }
        return path;
    }
    async claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, retry) {
        // Try to setup a server for running. If that succeeds it means
        // we are the first instance to startup. Otherwise it is likely
        // that another instance is already running.
        let mainProcessNodeIpcServer;
        try {
            mark('code/willStartMainServer');
            mainProcessNodeIpcServer = await nodeIPCServe(environmentMainService.mainIPCHandle);
            mark('code/didStartMainServer');
            Event.once(lifecycleMainService.onWillShutdown)(() => mainProcessNodeIpcServer.dispose());
        }
        catch (error) {
            // Handle unexpected errors (the only expected error is EADDRINUSE that
            // indicates another instance of VS Code is running)
            if (error.code !== 'EADDRINUSE') {
                // Show a dialog for errors that can be resolved by the user
                this.handleStartupDataDirError(environmentMainService, productService, error);
                // Any other runtime error is just printed to the console
                throw error;
            }
            // there's a running instance, let's connect to it
            let client;
            try {
                client = await nodeIPCConnect(environmentMainService.mainIPCHandle, 'main');
            }
            catch (error) {
                // Handle unexpected connection errors by showing a dialog to the user
                if (!retry || isWindows || error.code !== 'ECONNREFUSED') {
                    if (error.code === 'EPERM') {
                        this.showStartupWarningDialog(localize('secondInstanceAdmin', "Another instance of {0} is already running as administrator.", productService.nameShort), localize('secondInstanceAdminDetail', "Please close the other instance and try again."), productService);
                    }
                    throw error;
                }
                // it happens on Linux and OS X that the pipe is left behind
                // let's delete it, since we can't connect to it and then
                // retry the whole thing
                try {
                    unlinkSync(environmentMainService.mainIPCHandle);
                }
                catch (error) {
                    logService.warn('Could not delete obsolete instance handle', error);
                    throw error;
                }
                return this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, false);
            }
            // Tests from CLI require to be the only instance currently
            if (environmentMainService.extensionTestsLocationURI && !environmentMainService.debugExtensionHost.break) {
                const msg = `Running extension tests from the command line is currently only supported if no other instance of ${productService.nameShort} is running.`;
                logService.error(msg);
                client.dispose();
                throw new Error(msg);
            }
            // Show a warning dialog after some timeout if it takes long to talk to the other instance
            // Skip this if we are running with --wait where it is expected that we wait for a while.
            // Also skip when gathering diagnostics (--status) which can take a longer time.
            let startupWarningDialogHandle = undefined;
            if (!environmentMainService.args.wait && !environmentMainService.args.status) {
                startupWarningDialogHandle = setTimeout(() => {
                    this.showStartupWarningDialog(localize('secondInstanceNoResponse', "Another instance of {0} is running but not responding", productService.nameShort), localize('secondInstanceNoResponseDetail', "Please close all other instances and try again."), productService);
                }, 10000);
            }
            const otherInstanceLaunchMainService = ProxyChannel.toService(client.getChannel('launch'), { disableMarshalling: true });
            const otherInstanceDiagnosticsMainService = ProxyChannel.toService(client.getChannel('diagnostics'), { disableMarshalling: true });
            // Process Info
            if (environmentMainService.args.status) {
                return instantiationService.invokeFunction(async () => {
                    const diagnosticsService = new DiagnosticsService(NullTelemetryService, productService);
                    const mainDiagnostics = await otherInstanceDiagnosticsMainService.getMainDiagnostics();
                    const remoteDiagnostics = await otherInstanceDiagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true });
                    const diagnostics = await diagnosticsService.getDiagnostics(mainDiagnostics, remoteDiagnostics);
                    console.log(diagnostics);
                    throw new ExpectedError();
                });
            }
            // Windows: allow to set foreground
            if (isWindows) {
                await this.windowsAllowSetForegroundWindow(otherInstanceLaunchMainService, logService);
            }
            // Send environment over...
            logService.trace('Sending env to running instance...');
            await otherInstanceLaunchMainService.start(environmentMainService.args, process.env);
            // Cleanup
            client.dispose();
            // Now that we started, make sure the warning dialog is prevented
            if (startupWarningDialogHandle) {
                clearTimeout(startupWarningDialogHandle);
            }
            throw new ExpectedError('Sent env to running instance. Terminating...');
        }
        // Print --status usage info
        if (environmentMainService.args.status) {
            console.log(localize('statusWarning', "Warning: The --status argument can only be used if {0} is already running. Please run it again after {0} has started.", productService.nameShort));
            throw new ExpectedError('Terminating...');
        }
        // Set the VSCODE_PID variable here when we are sure we are the first
        // instance to startup. Otherwise we would wrongly overwrite the PID
        process.env['VSCODE_PID'] = String(process.pid);
        return mainProcessNodeIpcServer;
    }
    handleStartupDataDirError(environmentMainService, productService, error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
            const directories = coalesce([environmentMainService.userDataPath, environmentMainService.extensionsPath, XDG_RUNTIME_DIR]).map(folder => getPathLabel(URI.file(folder), { os: OS, tildify: environmentMainService }));
            this.showStartupWarningDialog(localize('startupDataDirError', "Unable to write program user data."), localize('startupUserDataAndExtensionsDirErrorDetail', "{0}\n\nPlease make sure the following directories are writeable:\n\n{1}", toErrorMessage(error), directories.join('\n')), productService);
        }
    }
    showStartupWarningDialog(message, detail, productService) {
        // use sync variant here because we likely exit after this method
        // due to startup issues and otherwise the dialog seems to disappear
        // https://github.com/microsoft/vscode/issues/104493
        dialog.showMessageBoxSync(massageMessageBoxOptions({
            type: 'warning',
            buttons: [localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close")],
            message,
            detail
        }, productService).options);
    }
    async windowsAllowSetForegroundWindow(launchMainService, logService) {
        if (isWindows) {
            const processId = await launchMainService.getMainProcessId();
            logService.trace('Sending some foreground love to the running instance:', processId);
            try {
                (await import('windows-foreground-love')).allowSetForegroundWindow(processId);
            }
            catch (error) {
                logService.error(error);
            }
        }
    }
    quit(accessor, reason) {
        const logService = accessor.get(ILogService);
        const lifecycleMainService = accessor.get(ILifecycleMainService);
        let exitCode = 0;
        if (reason) {
            if (reason.isExpected) {
                if (reason.message) {
                    logService.trace(reason.message);
                }
            }
            else {
                exitCode = 1; // signal error to the outside
                if (reason.stack) {
                    logService.error(reason.stack);
                }
                else {
                    logService.error(`Startup error: ${reason.toString()}`);
                }
            }
        }
        lifecycleMainService.kill(exitCode);
    }
    async checkInnoSetupMutex(productService) {
        if (!(isWindows && productService.win32MutexName && productService.win32VersionedUpdate)) {
            return false;
        }
        try {
            const updatingMutexName = `${productService.win32MutexName}-updating`;
            const mutex = await import('@vscode/windows-mutex');
            return mutex.isActive(updatingMutexName);
        }
        catch (error) {
            console.error('Failed to check Inno Setup mutex:', error);
            return false;
        }
    }
    //#region Command line arguments utilities
    resolveArgs() {
        // Parse arguments
        const args = this.validatePaths(parseMainProcessArgv(process.argv));
        if (args.wait && !args.waitMarkerFilePath) {
            // If we are started with --wait create a random temporary file
            // and pass it over to the starting instance. We can use this file
            // to wait for it to be deleted to monitor that the edited file
            // is closed and then exit the waiting process.
            //
            // Note: we are not doing this if the wait marker has been already
            // added as argument. This can happen if VS Code was started from CLI.
            const waitMarkerFilePath = createWaitMarkerFileSync(args.verbose);
            if (waitMarkerFilePath) {
                addArg(process.argv, '--waitMarkerFilePath', waitMarkerFilePath);
                args.waitMarkerFilePath = waitMarkerFilePath;
            }
        }
        if (args.chat) {
            if (args.chat['new-window']) {
                // Apply `--new-window` flag to the main arguments
                args['new-window'] = true;
            }
            else if (args.chat['reuse-window']) {
                // Apply `--reuse-window` flag to the main arguments
                args['reuse-window'] = true;
            }
            else if (args.chat['profile']) {
                // Apply `--profile` flag to the main arguments
                args['profile'] = args.chat['profile'];
            }
            else {
                // Unless we are started with specific instructions about
                // new windows or reusing existing ones, always take the
                // current working directory as workspace to open.
                args._ = [cwd()];
            }
        }
        return args;
    }
    validatePaths(args) {
        // Track URLs if they're going to be used
        if (args['open-url']) {
            args._urls = args._;
            args._ = [];
        }
        // Normalize paths and watch out for goto line mode
        if (!args['remote']) {
            const paths = this.doValidatePaths(args._, args.goto);
            args._ = paths;
        }
        return args;
    }
    doValidatePaths(args, gotoLineMode) {
        const currentWorkingDir = cwd();
        const result = args.map(arg => {
            let pathCandidate = String(arg);
            let parsedPath = undefined;
            if (gotoLineMode) {
                parsedPath = parseLineAndColumnAware(pathCandidate);
                pathCandidate = parsedPath.path;
            }
            if (pathCandidate) {
                pathCandidate = this.preparePath(currentWorkingDir, pathCandidate);
            }
            const sanitizedFilePath = sanitizeFilePath(pathCandidate, currentWorkingDir);
            const filePathBasename = basename(sanitizedFilePath);
            if (filePathBasename /* can be empty if code is opened on root */ && !isValidBasename(filePathBasename)) {
                return null; // do not allow invalid file names
            }
            if (gotoLineMode && parsedPath) {
                parsedPath.path = sanitizedFilePath;
                return this.toPath(parsedPath);
            }
            return sanitizedFilePath;
        });
        const caseInsensitive = isWindows || isMacintosh;
        const distinctPaths = distinct(result, path => path && caseInsensitive ? path.toLowerCase() : (path || ''));
        return coalesce(distinctPaths);
    }
    preparePath(cwd, path) {
        // Trim trailing quotes
        if (isWindows) {
            path = rtrim(path, '"'); // https://github.com/microsoft/vscode/issues/1498
        }
        // Trim whitespaces
        path = trim(trim(path, ' '), '\t');
        if (isWindows) {
            // Resolve the path against cwd if it is relative
            path = resolve(cwd, path);
            // Trim trailing '.' chars on Windows to prevent invalid file names
            path = rtrim(path, '.');
        }
        return path;
    }
    toPath(pathWithLineAndCol) {
        const segments = [pathWithLineAndCol.path];
        if (typeof pathWithLineAndCol.line === 'number') {
            segments.push(String(pathWithLineAndCol.line));
        }
        if (typeof pathWithLineAndCol.column === 'number') {
            segments.push(String(pathWithLineAndCol.column));
        }
        return segments.join(':');
    }
}
// Main Startup
const code = new CodeMain();
code.main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2NvZGUvZWxlY3Ryb24tbWFpbi9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sNERBQTRELENBQUM7QUFFcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDdkMsT0FBTyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDMUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsYUFBYSxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkYsT0FBTyxFQUEwQixlQUFlLEVBQUUsdUJBQXVCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNsSSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbkQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzlELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQXVCLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLElBQUksVUFBVSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDaEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxPQUFPLElBQUksY0FBYyxFQUFFLEtBQUssSUFBSSxZQUFZLEVBQTJCLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDM0MsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUUzRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUNySSxPQUFPLEVBQUUsTUFBTSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFcEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDN0gsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9HLE9BQU8sT0FBTyxNQUFNLDBDQUEwQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDM0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDekYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDM0YsT0FBTyxFQUFFLDRCQUE0QixFQUFFLDJCQUEyQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDNUksT0FBTyxFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDcEYsT0FBTyxFQUFnQixZQUFZLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDM0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDOUYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFNUU7Ozs7Ozs7R0FPRztBQUNILE1BQU0sUUFBUTtJQUViLElBQUk7UUFDSCxJQUFJLENBQUM7WUFDSixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0IsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLE9BQU87UUFFcEIsb0VBQW9FO1FBQ3BFLDJDQUEyQztRQUMzQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVyRCxrQkFBa0I7UUFDbEIsTUFBTSxDQUFDLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLG9CQUFvQixFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsMkJBQTJCLENBQUMsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFFck0sSUFBSSxDQUFDO1lBRUosZ0JBQWdCO1lBQ2hCLElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsc0JBQXNCLEVBQUUsMkJBQTJCLEVBQUUsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDdEksQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBRWhCLDREQUE0RDtnQkFDNUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLHNCQUFzQixFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFFOUUsTUFBTSxLQUFLLENBQUM7WUFDYixDQUFDO1lBRUQsVUFBVTtZQUNWLE1BQU0sb0JBQW9CLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBQyxRQUFRLEVBQUMsRUFBRTtnQkFDMUQsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztnQkFDN0MsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQy9DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBRW5ELHdEQUF3RDtnQkFDeEQsd0RBQXdEO2dCQUN4RCxvREFBb0Q7Z0JBQ3BELE1BQU0sd0JBQXdCLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRSxzQkFBc0IsRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBRWhLLHNEQUFzRDtnQkFDdEQsNkVBQTZFO2dCQUM3RSxVQUFVLENBQUMsU0FBUyxDQUFDLHNCQUFzQixDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO29CQUMxRixVQUFVLENBQUMsSUFBSSxDQUFDLCtDQUErQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDN0UsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsK0ZBQStGO2dCQUMvRixZQUFZLENBQUMsTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUVoRyxZQUFZO2dCQUNaLEtBQUssQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUU7b0JBQ3JELFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDdEIsb0JBQW9CLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQy9CLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ILENBQUMsQ0FBQyxDQUFDO2dCQUVILGlDQUFpQztnQkFDakMsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ3ZFLElBQUksZUFBZSxFQUFFLENBQUM7b0JBQ3JCLE1BQU0sT0FBTyxHQUFHLEdBQUcsY0FBYyxDQUFDLFNBQVMsdUZBQXVGLENBQUM7b0JBQ25JLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ25FLE9BQU87Z0JBQ1IsQ0FBQztnQkFFRCxPQUFPLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsd0JBQXdCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0SCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELENBQUM7SUFDRixDQUFDO0lBRU8sY0FBYztRQUNyQixNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUVsRCxVQUFVO1FBQ1YsTUFBTSxjQUFjLEdBQUcsRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLEdBQUcsT0FBTyxFQUFFLENBQUM7UUFDaEUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFOUMsY0FBYztRQUNkLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDOUYsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLHNEQUFzRDtRQUNqSSxRQUFRLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFFOUQsU0FBUztRQUNULE1BQU0sYUFBYSxHQUFHLElBQUksaUJBQWlCLENBQUMsV0FBVyxDQUFDLHNCQUFzQixDQUFDLEVBQUUsc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbEgsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUVoRCwyREFBMkQ7UUFDM0Qsb0VBQW9FO1FBQ3BFLGdGQUFnRjtRQUNoRixNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNuRSxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksVUFBVSxDQUFDLFlBQVksRUFBRSxDQUFDLElBQUksaUJBQWlCLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkgsUUFBUSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFdEMsUUFBUTtRQUNSLE1BQU0sV0FBVyxHQUFHLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2hELFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0RSxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBRW5FLGVBQWU7UUFDZixNQUFNLGtCQUFrQixHQUFHLElBQUksa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDL0QsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRXRELFFBQVE7UUFDUixNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksK0JBQXVCLHNCQUFzQixFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUM3RyxRQUFRLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzlDLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRTFDLHFCQUFxQjtRQUNyQixNQUFNLDJCQUEyQixHQUFHLElBQUksMkJBQTJCLENBQUMsWUFBWSxFQUFFLGtCQUFrQixFQUFFLHNCQUFzQixFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN2SixRQUFRLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLDJCQUEyQixDQUFDLENBQUM7UUFFeEUsNENBQTRDO1FBQzVDLHlDQUF5QztRQUN6QyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxJQUFJLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsT0FBTyxDQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRTFNLFNBQVM7UUFDVCxJQUFJLGFBQXlDLENBQUM7UUFDOUMsSUFBSSxTQUFTLElBQUksY0FBYyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDbkQsYUFBYSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUN4RyxDQUFDO2FBQU0sSUFBSSxXQUFXLElBQUksY0FBYyxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDakUsYUFBYSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztRQUM3RyxDQUFDO2FBQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNwQixhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUMxSCxDQUFDO2FBQU0sSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUM5QyxhQUFhLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLHNCQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNwSCxDQUFDO2FBQU0sQ0FBQztZQUNQLGFBQWEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDekMsQ0FBQztRQUNELFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRTVDLGdCQUFnQjtRQUNoQixNQUFNLG9CQUFvQixHQUFHLElBQUksb0JBQW9CLENBQUMsMkJBQTJCLENBQUMsY0FBYyxDQUFDLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxhQUFhLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0osUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRTFELFlBQVk7UUFDWixRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLElBQUksY0FBYyxDQUFDLG9CQUFvQixFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRWhHLFVBQVU7UUFDVixRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxJQUFJLGNBQWMsQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFbkYsU0FBUztRQUNULFFBQVEsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBRXRFLFVBQVU7UUFDVixRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxJQUFJLGNBQWMsQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7UUFFL0csU0FBUztRQUNULFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLElBQUksY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFFaEUsbUZBQW1GO1FBQ25GLFFBQVEsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxtQkFBbUIsQ0FBQyxzQkFBc0IsRUFBRSwyQkFBMkIsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRTdILE9BQU8sQ0FBQyxJQUFJLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxzQkFBc0IsRUFBRSxvQkFBb0IsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO0lBQy9MLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxzQkFBK0M7UUFDdkUsTUFBTSxtQkFBbUIsR0FBd0I7WUFDaEQsZUFBZSxFQUFFLHNCQUFzQixDQUFDLGFBQWE7U0FDckQsQ0FBQztRQUVGLENBQUMsbUJBQW1CLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDdEQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMvQixJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUMvQixtQkFBbUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDbEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFaEQsT0FBTyxtQkFBbUIsQ0FBQztJQUM1QixDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxzQkFBK0MsRUFBRSwyQkFBd0QsRUFBRSxvQkFBMEMsRUFBRSxZQUEwQixFQUFFLGNBQStCO1FBQzVPLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBVTtZQUUvQiw4QkFBOEI7WUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBcUI7Z0JBQy9CLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsRUFBRSwwQ0FBMEM7Z0JBQzNHLHNCQUFzQixDQUFDLGFBQWEsRUFBUyw2RUFBNkU7Z0JBQzFILHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTTtnQkFDckUsMkJBQTJCLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNO2dCQUNsRyxzQkFBc0IsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTTtnQkFDakYsc0JBQXNCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU07Z0JBQzdFLHNCQUFzQixDQUFDLFVBQVU7YUFDakMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRTVFLGdCQUFnQjtZQUNoQixZQUFZLENBQUMsSUFBSSxFQUFFO1lBRW5CLHdCQUF3QjtZQUN4QixvQkFBb0IsQ0FBQyxVQUFVLEVBQUU7U0FDakMsQ0FBQyxDQUFDO1FBRUgsNkRBQTZEO1FBQzdELDJCQUEyQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3BDLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxJQUFZO1FBQ3ZDLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVixxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3QixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhLENBQUMsVUFBdUIsRUFBRSxzQkFBK0MsRUFBRSxvQkFBMkMsRUFBRSxvQkFBMkMsRUFBRSxjQUErQixFQUFFLEtBQWM7UUFFOU8sK0RBQStEO1FBQy9ELCtEQUErRDtRQUMvRCw0Q0FBNEM7UUFDNUMsSUFBSSx3QkFBdUMsQ0FBQztRQUM1QyxJQUFJLENBQUM7WUFDSixJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUNqQyx3QkFBd0IsR0FBRyxNQUFNLFlBQVksQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUNwRixJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLHdCQUF3QixDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDM0YsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFFaEIsdUVBQXVFO1lBQ3ZFLG9EQUFvRDtZQUNwRCxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBRWpDLDREQUE0RDtnQkFDNUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLHNCQUFzQixFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFFOUUseURBQXlEO2dCQUN6RCxNQUFNLEtBQUssQ0FBQztZQUNiLENBQUM7WUFFRCxrREFBa0Q7WUFDbEQsSUFBSSxNQUE2QixDQUFDO1lBQ2xDLElBQUksQ0FBQztnQkFDSixNQUFNLEdBQUcsTUFBTSxjQUFjLENBQUMsc0JBQXNCLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzdFLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUVoQixzRUFBc0U7Z0JBQ3RFLElBQUksQ0FBQyxLQUFLLElBQUksU0FBUyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssY0FBYyxFQUFFLENBQUM7b0JBQzFELElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQzt3QkFDNUIsSUFBSSxDQUFDLHdCQUF3QixDQUM1QixRQUFRLENBQUMscUJBQXFCLEVBQUUsOERBQThELEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQyxFQUN6SCxRQUFRLENBQUMsMkJBQTJCLEVBQUUsZ0RBQWdELENBQUMsRUFDdkYsY0FBYyxDQUNkLENBQUM7b0JBQ0gsQ0FBQztvQkFFRCxNQUFNLEtBQUssQ0FBQztnQkFDYixDQUFDO2dCQUVELDREQUE0RDtnQkFDNUQseURBQXlEO2dCQUN6RCx3QkFBd0I7Z0JBQ3hCLElBQUksQ0FBQztvQkFDSixVQUFVLENBQUMsc0JBQXNCLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ2xELENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDaEIsVUFBVSxDQUFDLElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFFcEUsTUFBTSxLQUFLLENBQUM7Z0JBQ2IsQ0FBQztnQkFFRCxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLHNCQUFzQixFQUFFLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsSSxDQUFDO1lBRUQsMkRBQTJEO1lBQzNELElBQUksc0JBQXNCLENBQUMseUJBQXlCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDMUcsTUFBTSxHQUFHLEdBQUcscUdBQXFHLGNBQWMsQ0FBQyxTQUFTLGNBQWMsQ0FBQztnQkFDeEosVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEIsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUVqQixNQUFNLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RCLENBQUM7WUFFRCwwRkFBMEY7WUFDMUYseUZBQXlGO1lBQ3pGLGdGQUFnRjtZQUNoRixJQUFJLDBCQUEwQixHQUF3QixTQUFTLENBQUM7WUFDaEUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzlFLDBCQUEwQixHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7b0JBQzVDLElBQUksQ0FBQyx3QkFBd0IsQ0FDNUIsUUFBUSxDQUFDLDBCQUEwQixFQUFFLHVEQUF1RCxFQUFFLGNBQWMsQ0FBQyxTQUFTLENBQUMsRUFDdkgsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLGlEQUFpRCxDQUFDLEVBQzdGLGNBQWMsQ0FDZCxDQUFDO2dCQUNILENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNYLENBQUM7WUFFRCxNQUFNLDhCQUE4QixHQUFHLFlBQVksQ0FBQyxTQUFTLENBQXFCLE1BQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzdJLE1BQU0sbUNBQW1DLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBMEIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFFNUosZUFBZTtZQUNmLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUN4QyxPQUFPLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxLQUFLLElBQUksRUFBRTtvQkFDckQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLGNBQWMsQ0FBQyxDQUFDO29CQUN4RixNQUFNLGVBQWUsR0FBRyxNQUFNLG1DQUFtQyxDQUFDLGtCQUFrQixFQUFFLENBQUM7b0JBQ3ZGLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxtQ0FBbUMsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSx3QkFBd0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUNySixNQUFNLFdBQVcsR0FBRyxNQUFNLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztvQkFDaEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztvQkFFekIsTUFBTSxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUMzQixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7WUFFRCxtQ0FBbUM7WUFDbkMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixNQUFNLElBQUksQ0FBQywrQkFBK0IsQ0FBQyw4QkFBOEIsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUN4RixDQUFDO1lBRUQsMkJBQTJCO1lBQzNCLFVBQVUsQ0FBQyxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUN2RCxNQUFNLDhCQUE4QixDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQTBCLENBQUMsQ0FBQztZQUU1RyxVQUFVO1lBQ1YsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRWpCLGlFQUFpRTtZQUNqRSxJQUFJLDBCQUEwQixFQUFFLENBQUM7Z0JBQ2hDLFlBQVksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQzFDLENBQUM7WUFFRCxNQUFNLElBQUksYUFBYSxDQUFDLDhDQUE4QyxDQUFDLENBQUM7UUFDekUsQ0FBQztRQUVELDRCQUE0QjtRQUM1QixJQUFJLHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsdUhBQXVILEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFFMUwsTUFBTSxJQUFJLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFFRCxxRUFBcUU7UUFDckUsb0VBQW9FO1FBQ3BFLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVoRCxPQUFPLHdCQUF3QixDQUFDO0lBQ2pDLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxzQkFBK0MsRUFBRSxjQUErQixFQUFFLEtBQTRCO1FBQy9JLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUN2RCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxZQUFZLEVBQUUsc0JBQXNCLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV2TixJQUFJLENBQUMsd0JBQXdCLENBQzVCLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxvQ0FBb0MsQ0FBQyxFQUNyRSxRQUFRLENBQUMsNENBQTRDLEVBQUUseUVBQXlFLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDaEwsY0FBYyxDQUNkLENBQUM7UUFDSCxDQUFDO0lBQ0YsQ0FBQztJQUVPLHdCQUF3QixDQUFDLE9BQWUsRUFBRSxNQUFjLEVBQUUsY0FBK0I7UUFFaEcsaUVBQWlFO1FBQ2pFLG9FQUFvRTtRQUNwRSxvREFBb0Q7UUFFcEQsTUFBTSxDQUFDLGtCQUFrQixDQUFDLHdCQUF3QixDQUFDO1lBQ2xELElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDcEYsT0FBTztZQUNQLE1BQU07U0FDTixFQUFFLGNBQWMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFTyxLQUFLLENBQUMsK0JBQStCLENBQUMsaUJBQXFDLEVBQUUsVUFBdUI7UUFDM0csSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLE1BQU0sU0FBUyxHQUFHLE1BQU0saUJBQWlCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUU3RCxVQUFVLENBQUMsS0FBSyxDQUFDLHVEQUF1RCxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRXJGLElBQUksQ0FBQztnQkFDSixDQUFDLE1BQU0sTUFBTSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMvRSxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxJQUFJLENBQUMsUUFBMEIsRUFBRSxNQUE4QjtRQUN0RSxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdDLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRWpFLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztRQUVqQixJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSyxNQUF3QixDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUMxQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDcEIsVUFBVSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2xDLENBQUM7WUFDRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDLDhCQUE4QjtnQkFFNUMsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQ2xCLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNoQyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsVUFBVSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDekQsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFTyxLQUFLLENBQUMsbUJBQW1CLENBQUMsY0FBK0I7UUFDaEUsSUFBSSxDQUFDLENBQUMsU0FBUyxJQUFJLGNBQWMsQ0FBQyxjQUFjLElBQUksY0FBYyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQztZQUMxRixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSixNQUFNLGlCQUFpQixHQUFHLEdBQUcsY0FBYyxDQUFDLGNBQWMsV0FBVyxDQUFDO1lBQ3RFLE1BQU0sS0FBSyxHQUFHLE1BQU0sTUFBTSxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDcEQsT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxRCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDRixDQUFDO0lBRUQsMENBQTBDO0lBRWxDLFdBQVc7UUFFbEIsa0JBQWtCO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFcEUsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDM0MsK0RBQStEO1lBQy9ELGtFQUFrRTtZQUNsRSwrREFBK0Q7WUFDL0QsK0NBQStDO1lBQy9DLEVBQUU7WUFDRixrRUFBa0U7WUFDbEUsc0VBQXNFO1lBQ3RFLE1BQU0sa0JBQWtCLEdBQUcsd0JBQXdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xFLElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztnQkFDakUsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDO1lBQzlDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDZixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztnQkFDN0Isa0RBQWtEO2dCQUNsRCxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQzNCLENBQUM7aUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLG9EQUFvRDtnQkFDcEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUM3QixDQUFDO2lCQUFNLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUNqQywrQ0FBK0M7Z0JBQy9DLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCx5REFBeUQ7Z0JBQ3pELHdEQUF3RDtnQkFDeEQsa0RBQWtEO2dCQUNsRCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUNsQixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLGFBQWEsQ0FBQyxJQUFzQjtRQUUzQyx5Q0FBeUM7UUFDekMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDYixDQUFDO1FBRUQsbURBQW1EO1FBQ25ELElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNyQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ2hCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxlQUFlLENBQUMsSUFBYyxFQUFFLFlBQXNCO1FBQzdELE1BQU0saUJBQWlCLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDaEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUM3QixJQUFJLGFBQWEsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFaEMsSUFBSSxVQUFVLEdBQXVDLFNBQVMsQ0FBQztZQUMvRCxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNsQixVQUFVLEdBQUcsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ3BELGFBQWEsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDO1lBQ2pDLENBQUM7WUFFRCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixhQUFhLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNwRSxDQUFDO1lBRUQsTUFBTSxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztZQUU3RSxNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3JELElBQUksZ0JBQWdCLENBQUMsNENBQTRDLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO2dCQUN6RyxPQUFPLElBQUksQ0FBQyxDQUFDLGtDQUFrQztZQUNoRCxDQUFDO1lBRUQsSUFBSSxZQUFZLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hDLFVBQVUsQ0FBQyxJQUFJLEdBQUcsaUJBQWlCLENBQUM7Z0JBRXBDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNoQyxDQUFDO1lBRUQsT0FBTyxpQkFBaUIsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sZUFBZSxHQUFHLFNBQVMsSUFBSSxXQUFXLENBQUM7UUFDakQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU1RyxPQUFPLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBRU8sV0FBVyxDQUFDLEdBQVcsRUFBRSxJQUFZO1FBRTVDLHVCQUF1QjtRQUN2QixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxrREFBa0Q7UUFDNUUsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFbkMsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUVmLGlEQUFpRDtZQUNqRCxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUUxQixtRUFBbUU7WUFDbkUsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDekIsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLE1BQU0sQ0FBQyxrQkFBMEM7UUFDeEQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUzQyxJQUFJLE9BQU8sa0JBQWtCLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2pELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELElBQUksT0FBTyxrQkFBa0IsQ0FBQyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDbkQsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzNCLENBQUM7Q0FHRDtBQUVELGVBQWU7QUFDZixNQUFNLElBQUksR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO0FBQzVCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyJ9