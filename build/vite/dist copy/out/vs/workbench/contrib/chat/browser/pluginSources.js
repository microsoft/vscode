/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Action } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function sanitizeCacheSegment(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
}
function gitRevisionCacheSuffix(ref, sha) {
    if (sha) {
        return [`sha_${sanitizeCacheSegment(sha)}`];
    }
    if (ref) {
        return [`ref_${sanitizeCacheSegment(ref)}`];
    }
    return [];
}
function showGitOutputAction(commandService) {
    return new Action('showGitOutput', localize('showGitOutput', "Show Git Output"), undefined, true, () => {
        commandService.executeCommand('git.showOutput');
    });
}
function shellEscapeArg(value) {
    if (isWindows) {
        return `"${value.replace(/[`$"]/g, '`$&')}"`;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function formatShellCommand(args) {
    const [command, ...rest] = args;
    return [command, ...rest.map(arg => shellEscapeArg(arg))].join(' ');
}
// ---------------------------------------------------------------------------
// Base for git-based sources (GitHub shorthand & arbitrary Git URL)
// ---------------------------------------------------------------------------
let AbstractGitPluginSource = class AbstractGitPluginSource {
    constructor(_commandService, _fileService, _logService, _notificationService, _progressService) {
        this._commandService = _commandService;
        this._fileService = _fileService;
        this._logService = _logService;
        this._notificationService = _notificationService;
        this._progressService = _progressService;
    }
    getCleanupTarget(cacheRoot, descriptor) {
        return this._getRepoDir(cacheRoot, descriptor);
    }
    /**
     * Returns the on-disk directory of the cloned repository. Subclasses that
     * support a sub-path within a repository should override this to return the
     * repository root, while {@link getInstallUri} returns root + sub-path.
     */
    _getRepoDir(cacheRoot, descriptor) {
        return this.getInstallUri(cacheRoot, descriptor);
    }
    async ensure(cacheRoot, plugin, options) {
        const descriptor = plugin.sourceDescriptor;
        const repoDir = this._getRepoDir(cacheRoot, descriptor);
        const repoExists = await this._fileService.exists(repoDir);
        const label = this._displayLabel(descriptor);
        if (repoExists) {
            await this._checkoutRevision(repoDir, descriptor, options?.failureLabel ?? label);
            return this.getInstallUri(cacheRoot, descriptor);
        }
        const progressTitle = options?.progressTitle ?? localize('cloningPluginSource', "Cloning plugin source '{0}'...", label);
        const failureLabel = options?.failureLabel ?? label;
        const ref = descriptor.ref;
        await this._cloneRepository(repoDir, this._cloneUrl(descriptor), progressTitle, failureLabel, ref);
        await this._checkoutRevision(repoDir, descriptor, failureLabel);
        return this.getInstallUri(cacheRoot, descriptor);
    }
    async update(cacheRoot, plugin, options) {
        const descriptor = plugin.sourceDescriptor;
        const repoDir = this._getRepoDir(cacheRoot, descriptor);
        const repoExists = await this._fileService.exists(repoDir);
        if (!repoExists) {
            this._logService.warn(`[${this.kind}] Cannot update plugin '${options?.pluginName ?? plugin.name}': source repository not cloned`);
            return false;
        }
        const updateLabel = options?.pluginName ?? plugin.name;
        const failureLabel = options?.failureLabel ?? updateLabel;
        try {
            const doUpdate = async () => {
                await this._commandService.executeCommand('git.openRepository', repoDir.fsPath);
                const git = descriptor;
                let changed;
                if (git.sha) {
                    const headBefore = await this._commandService.executeCommand('_git.revParse', repoDir.fsPath, 'HEAD').catch(() => undefined);
                    await this._commandService.executeCommand('git.fetch', repoDir.fsPath);
                    await this._checkoutRevision(repoDir, descriptor, failureLabel);
                    const headAfter = await this._commandService.executeCommand('_git.revParse', repoDir.fsPath, 'HEAD').catch(() => undefined);
                    changed = headBefore !== headAfter;
                }
                else {
                    changed = !!(await this._commandService.executeCommand('_git.pull', repoDir.fsPath));
                    await this._checkoutRevision(repoDir, descriptor, failureLabel);
                }
                return changed;
            };
            if (options?.silent) {
                return await doUpdate();
            }
            return await this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: localize('updatingPluginSource', "Updating plugin '{0}'...", updateLabel),
                cancellable: false,
            }, doUpdate);
        }
        catch (err) {
            this._logService.error(`[${this.kind}] Failed to update plugin source '${updateLabel}':`, err);
            if (!options?.silent) {
                this._notificationService.notify({
                    severity: Severity.Error,
                    message: localize('pullPluginSourceFailed', "Failed to update plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
                    actions: { primary: [showGitOutputAction(this._commandService)] },
                });
            }
            throw err;
        }
    }
    // -- internal helpers ---
    async _cloneRepository(repoDir, cloneUrl, progressTitle, failureLabel, ref) {
        try {
            await this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: progressTitle,
                cancellable: false,
            }, async () => {
                await this._fileService.createFolder(dirname(repoDir));
                await this._commandService.executeCommand('_git.cloneRepository', cloneUrl, repoDir.fsPath, ref);
            });
        }
        catch (err) {
            this._logService.error(`[${this.kind}] Failed to clone ${cloneUrl}:`, err);
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('cloneFailed', "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
                actions: { primary: [showGitOutputAction(this._commandService)] },
            });
            throw err;
        }
    }
    async _checkoutRevision(repoDir, descriptor, failureLabel) {
        const git = descriptor;
        if (!git.sha && !git.ref) {
            return;
        }
        try {
            if (git.sha) {
                await this._commandService.executeCommand('_git.checkout', repoDir.fsPath, git.sha, true);
                return;
            }
            await this._commandService.executeCommand('_git.checkout', repoDir.fsPath, git.ref);
        }
        catch (err) {
            this._logService.error(`[${this.kind}] Failed to checkout revision for '${failureLabel}':`, err);
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('checkoutPluginSourceFailed', "Failed to checkout plugin '{0}' to requested revision: {1}", failureLabel, err?.message ?? String(err)),
                actions: { primary: [showGitOutputAction(this._commandService)] },
            });
            throw err;
        }
    }
};
AbstractGitPluginSource = __decorate([
    __param(0, ICommandService),
    __param(1, IFileService),
    __param(2, ILogService),
    __param(3, INotificationService),
    __param(4, IProgressService)
], AbstractGitPluginSource);
// ---------------------------------------------------------------------------
// RelativePath — plugin lives inside a shared marketplace repository
// ---------------------------------------------------------------------------
export class RelativePathPluginSource {
    constructor() {
        this.kind = "relativePath" /* PluginSourceKind.RelativePath */;
    }
    getInstallUri(_cacheRoot, _descriptor) {
        throw new Error('Use getPluginInstallUri() for relative-path sources');
    }
    async ensure(_cacheRoot, _plugin, _options) {
        throw new Error('Use ensureRepository() for relative-path sources');
    }
    async update(_cacheRoot, _plugin, _options) {
        throw new Error('Use pullRepository() for relative-path sources');
    }
    getCleanupTarget(_cacheRoot, _descriptor) {
        return undefined;
    }
    getLabel(descriptor) {
        return descriptor.path || '.';
    }
}
// ---------------------------------------------------------------------------
// GitHub — `{ source: "github", repo: "owner/repo" }`
// ---------------------------------------------------------------------------
export class GitHubPluginSource extends AbstractGitPluginSource {
    constructor() {
        super(...arguments);
        this.kind = "github" /* PluginSourceKind.GitHub */;
    }
    /** Returns the URI where the plugin content lives (repo root + optional sub-path). */
    getInstallUri(cacheRoot, descriptor) {
        const repoDir = this._getRepoDir(cacheRoot, descriptor);
        const gh = descriptor;
        if (gh.path) {
            const normalizedPath = gh.path.trim().replace(/^\.?\/+|\/+$/g, '');
            if (normalizedPath) {
                const target = joinPath(repoDir, normalizedPath);
                if (isEqualOrParent(target, repoDir)) {
                    return target;
                }
            }
        }
        return repoDir;
    }
    /** Returns the cloned repository root (without sub-path). */
    _getRepoDir(cacheRoot, descriptor) {
        const gh = descriptor;
        const [owner, repo] = gh.repo.split('/');
        return joinPath(cacheRoot, 'github.com', owner, repo, ...gitRevisionCacheSuffix(gh.ref, gh.sha));
    }
    getLabel(descriptor) {
        const gh = descriptor;
        return gh.path ? `${gh.repo}/${gh.path}` : gh.repo;
    }
    _cloneUrl(descriptor) {
        return `https://github.com/${descriptor.repo}.git`;
    }
    _displayLabel(descriptor) {
        return descriptor.repo;
    }
}
// ---------------------------------------------------------------------------
// GitUrl — `{ source: "url", url: "https://…/repo.git" }`
// ---------------------------------------------------------------------------
export class GitUrlPluginSource extends AbstractGitPluginSource {
    constructor() {
        super(...arguments);
        this.kind = "url" /* PluginSourceKind.GitUrl */;
    }
    getInstallUri(cacheRoot, descriptor) {
        const git = descriptor;
        const segments = this._gitUrlCacheSegments(git.url, git.ref, git.sha);
        return joinPath(cacheRoot, ...segments);
    }
    getLabel(descriptor) {
        return descriptor.url;
    }
    _cloneUrl(descriptor) {
        return descriptor.url;
    }
    _displayLabel(descriptor) {
        return descriptor.url;
    }
    _gitUrlCacheSegments(url, ref, sha) {
        try {
            const parsed = URI.parse(url);
            const authority = (parsed.authority || 'unknown').replace(/[\\/:*?"<>|]/g, '_').toLowerCase();
            const pathPart = parsed.path.replace(/^\/+/, '').replace(/\.git$/i, '').replace(/\/+$/g, '');
            const segments = pathPart.split('/').map(s => s.replace(/[\\/:*?"<>|]/g, '_'));
            return [authority, ...segments, ...gitRevisionCacheSuffix(ref, sha)];
        }
        catch {
            return ['git', url.replace(/[\\/:*?"<>|]/g, '_'), ...gitRevisionCacheSuffix(ref, sha)];
        }
    }
}
// ---------------------------------------------------------------------------
// Base for package-manager-based sources (npm, pip)
// ---------------------------------------------------------------------------
let AbstractPackagePluginSource = class AbstractPackagePluginSource {
    constructor(_dialogService, _fileService, _logService, _notificationService, _progressService, _terminalService) {
        this._dialogService = _dialogService;
        this._fileService = _fileService;
        this._logService = _logService;
        this._notificationService = _notificationService;
        this._progressService = _progressService;
        this._terminalService = _terminalService;
    }
    getCleanupTarget(cacheRoot, descriptor) {
        return this._getCacheDir(cacheRoot, descriptor);
    }
    async ensure(cacheRoot, plugin, _options) {
        const cacheDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
        await this._fileService.createFolder(cacheDir);
        return cacheDir;
    }
    async update(cacheRoot, plugin, _options) {
        // For package-manager sources, "update" re-runs install.
        const installDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
        const pluginDir = this.getInstallUri(cacheRoot, plugin.sourceDescriptor);
        await this.runInstall(installDir, pluginDir, plugin, { silent: _options?.silent });
        return true;
    }
    async runInstall(installDir, pluginDir, plugin, options) {
        const args = this._buildInstallArgs(installDir, plugin);
        const command = formatShellCommand(args);
        const confirmed = await this._confirmTerminalCommand(plugin.name, command, options?.silent);
        if (!confirmed) {
            return undefined;
        }
        const progressTitle = localize('installingPackagePlugin', "Installing {0} plugin '{1}'...", this._managerName, plugin.name);
        const { success, terminal } = await this._runTerminalCommand(command, progressTitle);
        if (!success) {
            return undefined;
        }
        const exists = await this._fileService.exists(pluginDir);
        if (!exists) {
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('packagePluginNotFound', "{0} package '{1}' was not found after installation.", this._managerName, this.getLabel(plugin.sourceDescriptor)),
            });
            return undefined;
        }
        terminal?.dispose();
        return { pluginDir };
    }
    // -- terminal helpers (moved from PluginInstallService) ---
    async _confirmTerminalCommand(pluginName, command, silent) {
        if (silent) {
            return new Promise(resolve => {
                const n = this._notificationService.notify({
                    severity: Severity.Info,
                    message: localize('confirmPluginInstallNotification', "Plugin '{0}' wants to run: {1}", pluginName, command),
                    actions: {
                        primary: [
                            new Action('installPlugin', localize('install', "Install"), undefined, true, async () => resolve(true)),
                        ],
                    },
                });
                Event.once(n.onDidClose)(() => resolve(false));
            });
        }
        const { confirmed } = await this._dialogService.confirm({
            type: 'question',
            message: localize('confirmPluginInstall', "Install Plugin '{0}'?", pluginName),
            detail: localize('confirmPluginInstallDetail', "This will run the following command in a terminal:\n\n{0}", command),
            primaryButton: localize({ key: 'confirmInstall', comment: ['&& denotes a mnemonic'] }, "&&Install"),
        });
        return confirmed;
    }
    async _runTerminalCommand(command, progressTitle) {
        let terminal;
        try {
            await this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: progressTitle,
                cancellable: false,
            }, async () => {
                terminal = await this._terminalService.createTerminal({
                    config: {
                        name: localize('pluginInstallTerminal', "Plugin Install"),
                        forceShellIntegration: true,
                        isTransient: true,
                        isFeatureTerminal: true,
                    },
                });
                await terminal.processReady;
                this._terminalService.setActiveInstance(terminal);
                const commandResultPromise = this._waitForTerminalCommandCompletion(terminal);
                await terminal.runCommand(command, true);
                const exitCode = await commandResultPromise;
                if (exitCode !== 0) {
                    throw new Error(localize('terminalCommandExitCode', "Command exited with code {0}", exitCode));
                }
            });
            return { success: true, terminal };
        }
        catch (err) {
            this._logService.error(`[${this.kind}] Terminal command failed:`, err);
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('terminalCommandFailed', "Plugin installation command failed: {0}", err?.message ?? String(err)),
            });
            return { success: false, terminal };
        }
    }
    _waitForTerminalCommandCompletion(terminal) {
        return new Promise(resolve => {
            const disposables = new DisposableStore();
            let isResolved = false;
            const resolveAndDispose = (exitCode) => {
                if (isResolved) {
                    return;
                }
                isResolved = true;
                disposables.dispose();
                resolve(exitCode);
            };
            const attachCommandFinishedListener = () => {
                const commandDetection = terminal.capabilities.get(2 /* TerminalCapability.CommandDetection */);
                if (!commandDetection) {
                    return;
                }
                disposables.add(commandDetection.onCommandFinished((command) => {
                    resolveAndDispose(command.exitCode ?? 0);
                }));
            };
            attachCommandFinishedListener();
            disposables.add(terminal.capabilities.onDidAddCommandDetectionCapability(() => attachCommandFinishedListener()));
            const timeoutHandle = timeout(120_000);
            disposables.add(toDisposable(() => timeoutHandle.cancel()));
            void timeoutHandle.then(() => {
                if (isResolved) {
                    return;
                }
                this._logService.warn(`[${this.kind}] Terminal command completion timed out`);
                resolveAndDispose(undefined);
            });
        });
    }
};
AbstractPackagePluginSource = __decorate([
    __param(0, IDialogService),
    __param(1, IFileService),
    __param(2, ILogService),
    __param(3, INotificationService),
    __param(4, IProgressService),
    __param(5, ITerminalService)
], AbstractPackagePluginSource);
export { AbstractPackagePluginSource };
// ---------------------------------------------------------------------------
// npm — `{ source: "npm", package: "@org/plugin" }`
// ---------------------------------------------------------------------------
export class NpmPluginSource extends AbstractPackagePluginSource {
    constructor() {
        super(...arguments);
        this.kind = "npm" /* PluginSourceKind.Npm */;
        this._managerName = 'npm';
    }
    getInstallUri(cacheRoot, descriptor) {
        const npm = descriptor;
        return joinPath(cacheRoot, 'npm', sanitizeCacheSegment(npm.package), 'node_modules', npm.package);
    }
    getLabel(descriptor) {
        const npm = descriptor;
        return npm.version ? `${npm.package}@${npm.version}` : npm.package;
    }
    _getCacheDir(cacheRoot, descriptor) {
        const npm = descriptor;
        return joinPath(cacheRoot, 'npm', sanitizeCacheSegment(npm.package));
    }
    _buildInstallArgs(installDir, plugin) {
        const npm = plugin.sourceDescriptor;
        const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
        const args = ['npm', 'install', '--prefix', installDir.fsPath, packageSpec];
        if (npm.registry) {
            args.push('--registry', npm.registry);
        }
        return args;
    }
}
// ---------------------------------------------------------------------------
// pip — `{ source: "pip", package: "my-plugin" }`
// ---------------------------------------------------------------------------
export class PipPluginSource extends AbstractPackagePluginSource {
    constructor() {
        super(...arguments);
        this.kind = "pip" /* PluginSourceKind.Pip */;
        this._managerName = 'pip';
    }
    getInstallUri(cacheRoot, descriptor) {
        const pip = descriptor;
        return joinPath(cacheRoot, 'pip', sanitizeCacheSegment(pip.package));
    }
    getLabel(descriptor) {
        const pip = descriptor;
        return pip.version ? `${pip.package}==${pip.version}` : pip.package;
    }
    _getCacheDir(cacheRoot, descriptor) {
        const pip = descriptor;
        return joinPath(cacheRoot, 'pip', sanitizeCacheSegment(pip.package));
    }
    _buildInstallArgs(installDir, plugin) {
        const pip = plugin.sourceDescriptor;
        const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
        const args = ['pip', 'install', '--target', installDir.fsPath, packageSpec];
        if (pip.registry) {
            args.push('--index-url', pip.registry);
        }
        return args;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luU291cmNlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wbHVnaW5Tb3VyY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQXFCLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLGtEQUFrRCxDQUFDO0FBRXRHLE9BQU8sRUFBcUIsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztB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