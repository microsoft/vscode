/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { CancelablePromise, timeout } from '../../../../base/common/async.js';
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
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { TerminalCapability, type ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { IEnsureRepositoryOptions, IPullRepositoryOptions } from '../common/plugins/agentPluginRepositoryService.js';
import { IGitHubPluginSource, IGitUrlPluginSource, IMarketplacePlugin, INpmPluginSource, IPipPluginSource, IPluginSourceDescriptor, PluginSourceKind } from '../common/plugins/pluginMarketplaceService.js';
import { IPluginSource } from '../common/plugins/pluginSource.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sanitizeCacheSegment(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, '_');
}

function gitRevisionCacheSuffix(ref?: string, sha?: string): string[] {
	if (sha) {
		return [`sha_${sanitizeCacheSegment(sha)}`];
	}
	if (ref) {
		return [`ref_${sanitizeCacheSegment(ref)}`];
	}
	return [];
}

function showGitOutputAction(commandService: ICommandService): Action {
	return new Action('showGitOutput', localize('showGitOutput', "Show Git Output"), undefined, true, () => {
		commandService.executeCommand('git.showOutput');
	});
}

function shellEscapeArg(value: string): string {
	if (isWindows) {
		return `"${value.replace(/[`$"]/g, '`$&')}"`;
	}
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatShellCommand(args: readonly string[]): string {
	const [command, ...rest] = args;
	return [command, ...rest.map(arg => shellEscapeArg(arg))].join(' ');
}

// ---------------------------------------------------------------------------
// Base for git-based sources (GitHub shorthand & arbitrary Git URL)
// ---------------------------------------------------------------------------

abstract class AbstractGitPluginSource implements IPluginSource {
	abstract readonly kind: PluginSourceKind;
	constructor(
		@ICommandService protected readonly _commandService: ICommandService,
		@IFileService protected readonly _fileService: IFileService,
		@ILogService protected readonly _logService: ILogService,
		@INotificationService protected readonly _notificationService: INotificationService,
		@IProgressService protected readonly _progressService: IProgressService,
	) { }

	abstract getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI;
	abstract getLabel(descriptor: IPluginSourceDescriptor): string;
	protected abstract _cloneUrl(descriptor: IPluginSourceDescriptor): string;
	protected abstract _displayLabel(descriptor: IPluginSourceDescriptor): string;

	getCleanupTarget(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI | undefined {
		return this._getRepoDir(cacheRoot, descriptor);
	}

	/**
	 * Returns the on-disk directory of the cloned repository. Subclasses that
	 * support a sub-path within a repository should override this to return the
	 * repository root, while {@link getInstallUri} returns root + sub-path.
	 */
	protected _getRepoDir(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		return this.getInstallUri(cacheRoot, descriptor);
	}

	async ensure(cacheRoot: URI, plugin: IMarketplacePlugin, options?: IEnsureRepositoryOptions): Promise<URI> {
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
		const ref = (descriptor as IGitHubPluginSource | IGitUrlPluginSource).ref;

		await this._cloneRepository(repoDir, this._cloneUrl(descriptor), progressTitle, failureLabel, ref);
		await this._checkoutRevision(repoDir, descriptor, failureLabel);
		return this.getInstallUri(cacheRoot, descriptor);
	}

	async update(cacheRoot: URI, plugin: IMarketplacePlugin, options?: IPullRepositoryOptions): Promise<boolean> {
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
				const git = descriptor as IGitHubPluginSource | IGitUrlPluginSource;
				let changed: boolean;
				if (git.sha) {
					const headBefore = await this._commandService.executeCommand<string>('_git.revParse', repoDir.fsPath, 'HEAD').catch(() => undefined);
					await this._commandService.executeCommand('git.fetch', repoDir.fsPath);
					await this._checkoutRevision(repoDir, descriptor, failureLabel);
					const headAfter = await this._commandService.executeCommand<string>('_git.revParse', repoDir.fsPath, 'HEAD').catch(() => undefined);
					changed = headBefore !== headAfter;
				} else {
					changed = !!(await this._commandService.executeCommand<boolean>('_git.pull', repoDir.fsPath));
					await this._checkoutRevision(repoDir, descriptor, failureLabel);
				}
				return changed;
			};

			if (options?.silent) {
				return await doUpdate();
			}

			return await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: localize('updatingPluginSource', "Updating plugin '{0}'...", updateLabel),
					cancellable: false,
				},
				doUpdate,
			);
		} catch (err) {
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

	private async _cloneRepository(repoDir: URI, cloneUrl: string, progressTitle: string, failureLabel: string, ref?: string): Promise<void> {
		try {
			await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: progressTitle,
					cancellable: false,
				},
				async () => {
					await this._fileService.createFolder(dirname(repoDir));
					await this._commandService.executeCommand('_git.cloneRepository', cloneUrl, repoDir.fsPath, ref);
				}
			);
		} catch (err) {
			this._logService.error(`[${this.kind}] Failed to clone ${cloneUrl}:`, err);
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('cloneFailed', "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
				actions: { primary: [showGitOutputAction(this._commandService)] },
			});
			throw err;
		}
	}

	private async _checkoutRevision(repoDir: URI, descriptor: IPluginSourceDescriptor, failureLabel: string): Promise<void> {
		const git = descriptor as IGitHubPluginSource | IGitUrlPluginSource;
		if (!git.sha && !git.ref) {
			return;
		}

		try {
			if (git.sha) {
				await this._commandService.executeCommand('_git.checkout', repoDir.fsPath, git.sha, true);
				return;
			}
			await this._commandService.executeCommand('_git.checkout', repoDir.fsPath, git.ref);
		} catch (err) {
			this._logService.error(`[${this.kind}] Failed to checkout revision for '${failureLabel}':`, err);
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('checkoutPluginSourceFailed', "Failed to checkout plugin '{0}' to requested revision: {1}", failureLabel, err?.message ?? String(err)),
				actions: { primary: [showGitOutputAction(this._commandService)] },
			});
			throw err;
		}
	}
}

// ---------------------------------------------------------------------------
// RelativePath — plugin lives inside a shared marketplace repository
// ---------------------------------------------------------------------------

export class RelativePathPluginSource implements IPluginSource {
	readonly kind = PluginSourceKind.RelativePath;

	getInstallUri(_cacheRoot: URI, _descriptor: IPluginSourceDescriptor): URI {
		throw new Error('Use getPluginInstallUri() for relative-path sources');
	}

	async ensure(_cacheRoot: URI, _plugin: IMarketplacePlugin, _options?: IEnsureRepositoryOptions): Promise<URI> {
		throw new Error('Use ensureRepository() for relative-path sources');
	}

	async update(_cacheRoot: URI, _plugin: IMarketplacePlugin, _options?: IPullRepositoryOptions): Promise<boolean> {
		throw new Error('Use pullRepository() for relative-path sources');
	}

	getCleanupTarget(_cacheRoot: URI, _descriptor: IPluginSourceDescriptor): URI | undefined {
		return undefined;
	}

	getLabel(descriptor: IPluginSourceDescriptor): string {
		return (descriptor as { path: string }).path || '.';
	}
}

// ---------------------------------------------------------------------------
// GitHub — `{ source: "github", repo: "owner/repo" }`
// ---------------------------------------------------------------------------

export class GitHubPluginSource extends AbstractGitPluginSource {
	readonly kind = PluginSourceKind.GitHub;

	/** Returns the URI where the plugin content lives (repo root + optional sub-path). */
	getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const repoDir = this._getRepoDir(cacheRoot, descriptor);
		const gh = descriptor as IGitHubPluginSource;
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
	protected override _getRepoDir(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const gh = descriptor as IGitHubPluginSource;
		const [owner, repo] = gh.repo.split('/');
		return joinPath(cacheRoot, 'github.com', owner, repo, ...gitRevisionCacheSuffix(gh.ref, gh.sha));
	}

	getLabel(descriptor: IPluginSourceDescriptor): string {
		const gh = descriptor as IGitHubPluginSource;
		return gh.path ? `${gh.repo}/${gh.path}` : gh.repo;
	}

	protected _cloneUrl(descriptor: IPluginSourceDescriptor): string {
		return `https://github.com/${(descriptor as IGitHubPluginSource).repo}.git`;
	}

	protected _displayLabel(descriptor: IPluginSourceDescriptor): string {
		return (descriptor as IGitHubPluginSource).repo;
	}
}

// ---------------------------------------------------------------------------
// GitUrl — `{ source: "url", url: "https://…/repo.git" }`
// ---------------------------------------------------------------------------

export class GitUrlPluginSource extends AbstractGitPluginSource {
	readonly kind = PluginSourceKind.GitUrl;

	getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const git = descriptor as IGitUrlPluginSource;
		const segments = this._gitUrlCacheSegments(git.url, git.ref, git.sha);
		return joinPath(cacheRoot, ...segments);
	}

	getLabel(descriptor: IPluginSourceDescriptor): string {
		return (descriptor as IGitUrlPluginSource).url;
	}

	protected _cloneUrl(descriptor: IPluginSourceDescriptor): string {
		return (descriptor as IGitUrlPluginSource).url;
	}

	protected _displayLabel(descriptor: IPluginSourceDescriptor): string {
		return (descriptor as IGitUrlPluginSource).url;
	}

	private _gitUrlCacheSegments(url: string, ref?: string, sha?: string): string[] {
		try {
			const parsed = URI.parse(url);
			const authority = (parsed.authority || 'unknown').replace(/[\\/:*?"<>|]/g, '_').toLowerCase();
			const pathPart = parsed.path.replace(/^\/+/, '').replace(/\.git$/i, '').replace(/\/+$/g, '');
			const segments = pathPart.split('/').map(s => s.replace(/[\\/:*?"<>|]/g, '_'));
			return [authority, ...segments, ...gitRevisionCacheSuffix(ref, sha)];
		} catch {
			return ['git', url.replace(/[\\/:*?"<>|]/g, '_'), ...gitRevisionCacheSuffix(ref, sha)];
		}
	}
}

// ---------------------------------------------------------------------------
// Base for package-manager-based sources (npm, pip)
// ---------------------------------------------------------------------------

export abstract class AbstractPackagePluginSource implements IPluginSource {
	abstract readonly kind: PluginSourceKind;
	constructor(
		@IDialogService protected readonly _dialogService: IDialogService,
		@IFileService protected readonly _fileService: IFileService,
		@ILogService protected readonly _logService: ILogService,
		@INotificationService protected readonly _notificationService: INotificationService,
		@IProgressService protected readonly _progressService: IProgressService,
		@ITerminalService protected readonly _terminalService: ITerminalService,
	) { }

	abstract getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI;
	abstract getLabel(descriptor: IPluginSourceDescriptor): string;

	getCleanupTarget(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI | undefined {
		return this._getCacheDir(cacheRoot, descriptor);
	}

	/**
	 * Return the parent directory (prefix / target) where the package
	 * manager installs into. This is above the actual plugin content dir.
	 */
	protected abstract _getCacheDir(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI;

	/** Build the terminal command args for install. */
	protected abstract _buildInstallArgs(installDir: URI, plugin: IMarketplacePlugin): string[];

	/** Human-readable package manager name for messages. */
	protected abstract get _managerName(): string;

	async ensure(cacheRoot: URI, plugin: IMarketplacePlugin, _options?: IEnsureRepositoryOptions): Promise<URI> {
		const cacheDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
		await this._fileService.createFolder(cacheDir);
		return cacheDir;
	}

	async update(cacheRoot: URI, plugin: IMarketplacePlugin, _options?: IPullRepositoryOptions): Promise<boolean> {
		// For package-manager sources, "update" re-runs install.
		const installDir = this._getCacheDir(cacheRoot, plugin.sourceDescriptor);
		const pluginDir = this.getInstallUri(cacheRoot, plugin.sourceDescriptor);
		await this.runInstall(installDir, pluginDir, plugin, { silent: _options?.silent });
		return true;
	}

	async runInstall(installDir: URI, pluginDir: URI, plugin: IMarketplacePlugin, options?: { silent?: boolean }): Promise<{ pluginDir: URI } | undefined> {
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

	private async _confirmTerminalCommand(pluginName: string, command: string, silent?: boolean): Promise<boolean> {
		if (silent) {
			return new Promise<boolean>(resolve => {
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

	private async _runTerminalCommand(command: string, progressTitle: string) {
		let terminal: ITerminalInstance | undefined;
		try {
			await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: progressTitle,
					cancellable: false,
				},
				async () => {
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
				}
			);
			return { success: true, terminal };
		} catch (err) {
			this._logService.error(`[${this.kind}] Terminal command failed:`, err);
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('terminalCommandFailed', "Plugin installation command failed: {0}", err?.message ?? String(err)),
			});
			return { success: false, terminal };
		}
	}

	private _waitForTerminalCommandCompletion(terminal: ITerminalInstance): Promise<number | undefined> {
		return new Promise<number | undefined>(resolve => {
			const disposables = new DisposableStore();
			let isResolved = false;

			const resolveAndDispose = (exitCode: number | undefined): void => {
				if (isResolved) {
					return;
				}
				isResolved = true;
				disposables.dispose();
				resolve(exitCode);
			};

			const attachCommandFinishedListener = (): void => {
				const commandDetection = terminal.capabilities.get(TerminalCapability.CommandDetection);
				if (!commandDetection) {
					return;
				}
				disposables.add(commandDetection.onCommandFinished((command: ITerminalCommand) => {
					resolveAndDispose(command.exitCode ?? 0);
				}));
			};

			attachCommandFinishedListener();
			disposables.add(terminal.capabilities.onDidAddCommandDetectionCapability(() => attachCommandFinishedListener()));

			const timeoutHandle: CancelablePromise<void> = timeout(120_000);
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
}

// ---------------------------------------------------------------------------
// npm — `{ source: "npm", package: "@org/plugin" }`
// ---------------------------------------------------------------------------

export class NpmPluginSource extends AbstractPackagePluginSource {
	readonly kind = PluginSourceKind.Npm;
	protected readonly _managerName = 'npm';

	getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const npm = descriptor as INpmPluginSource;
		return joinPath(cacheRoot, 'npm', sanitizeCacheSegment(npm.package), 'node_modules', npm.package);
	}

	getLabel(descriptor: IPluginSourceDescriptor): string {
		const npm = descriptor as INpmPluginSource;
		return npm.version ? `${npm.package}@${npm.version}` : npm.package;
	}

	protected _getCacheDir(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const npm = descriptor as INpmPluginSource;
		return joinPath(cacheRoot, 'npm', sanitizeCacheSegment(npm.package));
	}

	protected _buildInstallArgs(installDir: URI, plugin: IMarketplacePlugin): string[] {
		const npm = plugin.sourceDescriptor as INpmPluginSource;
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
	readonly kind = PluginSourceKind.Pip;
	protected readonly _managerName = 'pip';

	getInstallUri(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const pip = descriptor as IPipPluginSource;
		return joinPath(cacheRoot, 'pip', sanitizeCacheSegment(pip.package));
	}

	getLabel(descriptor: IPluginSourceDescriptor): string {
		const pip = descriptor as IPipPluginSource;
		return pip.version ? `${pip.package}==${pip.version}` : pip.package;
	}

	protected _getCacheDir(cacheRoot: URI, descriptor: IPluginSourceDescriptor): URI {
		const pip = descriptor as IPipPluginSource;
		return joinPath(cacheRoot, 'pip', sanitizeCacheSegment(pip.package));
	}

	protected _buildInstallArgs(installDir: URI, plugin: IMarketplacePlugin): string[] {
		const pip = plugin.sourceDescriptor as IPipPluginSource;
		const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
		const args = ['pip', 'install', '--target', installDir.fsPath, packageSpec];
		if (pip.registry) {
			args.push('--index-url', pip.registry);
		}
		return args;
	}
}
