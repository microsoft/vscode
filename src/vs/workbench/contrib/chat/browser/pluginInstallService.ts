/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, timeout } from '../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { TerminalCapability, type ITerminalCommand } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { getPluginSourceLabel, IMarketplacePlugin, INpmPluginSource, IPipPluginSource, IPluginMarketplaceService, PluginSourceKind } from '../common/plugins/pluginMarketplaceService.js';

export class PluginInstallService implements IPluginInstallService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IProgressService private readonly _progressService: IProgressService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async installPlugin(plugin: IMarketplacePlugin): Promise<void> {
		switch (plugin.sourceDescriptor.kind) {
			case PluginSourceKind.RelativePath:
				return this._installRelativePathPlugin(plugin);
			case PluginSourceKind.GitHub:
			case PluginSourceKind.GitUrl:
				return this._installGitPlugin(plugin);
			case PluginSourceKind.Npm:
				return this._installNpmPlugin(plugin, plugin.sourceDescriptor);
			case PluginSourceKind.Pip:
				return this._installPipPlugin(plugin, plugin.sourceDescriptor);
		}
	}

	async updatePlugin(plugin: IMarketplacePlugin): Promise<void> {
		switch (plugin.sourceDescriptor.kind) {
			case PluginSourceKind.RelativePath:
				return this._pluginRepositoryService.pullRepository(plugin.marketplaceReference, {
					pluginName: plugin.name,
					failureLabel: plugin.name,
					marketplaceType: plugin.marketplaceType,
				});
			case PluginSourceKind.GitHub:
			case PluginSourceKind.GitUrl:
				return this._pluginRepositoryService.updatePluginSource(plugin, {
					pluginName: plugin.name,
					failureLabel: plugin.name,
					marketplaceType: plugin.marketplaceType,
				});
			case PluginSourceKind.Npm:
				return this._installNpmPlugin(plugin, plugin.sourceDescriptor);
			case PluginSourceKind.Pip:
				return this._installPipPlugin(plugin, plugin.sourceDescriptor);
		}
	}

	getPluginInstallUri(plugin: IMarketplacePlugin): URI {
		if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
			return this._pluginRepositoryService.getPluginInstallUri(plugin);
		}
		return this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);
	}

	// --- Relative-path source (existing git-based flow) -----------------------

	private async _installRelativePathPlugin(plugin: IMarketplacePlugin): Promise<void> {
		try {
			await this._pluginRepositoryService.ensureRepository(plugin.marketplaceReference, {
				progressTitle: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
				failureLabel: plugin.name,
				marketplaceType: plugin.marketplaceType,
			});
		} catch {
			return;
		}

		let pluginDir: URI;
		try {
			pluginDir = this._pluginRepositoryService.getPluginInstallUri(plugin);
		} catch {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pluginDirInvalid', "Plugin source directory '{0}' is invalid for repository '{1}'.", plugin.source, plugin.marketplace),
			});
			return;
		}

		const pluginExists = await this._fileService.exists(pluginDir);
		if (!pluginExists) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pluginDirNotFound', "Plugin source directory '{0}' not found in repository '{1}'.", plugin.source, plugin.marketplace),
			});
			return;
		}

		this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
	}

	// --- GitHub / Git URL source (independent clone) --------------------------

	private async _installGitPlugin(plugin: IMarketplacePlugin): Promise<void> {
		let pluginDir: URI;
		try {
			pluginDir = await this._pluginRepositoryService.ensurePluginSource(plugin, {
				progressTitle: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
				failureLabel: plugin.name,
				marketplaceType: plugin.marketplaceType,
			});
		} catch {
			return;
		}

		const pluginExists = await this._fileService.exists(pluginDir);
		if (!pluginExists) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pluginSourceNotFound', "Plugin source '{0}' not found after cloning.", getPluginSourceLabel(plugin.sourceDescriptor)),
			});
			return;
		}

		this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
	}

	// --- npm source -----------------------------------------------------------

	private async _installNpmPlugin(plugin: IMarketplacePlugin, source: INpmPluginSource): Promise<void> {
		const packageSpec = source.version ? `${source.package}@${source.version}` : source.package;
		const installDir = await this._pluginRepositoryService.ensurePluginSource(plugin);
		const args = ['npm', 'install', '--prefix', installDir.fsPath, packageSpec];
		if (source.registry) {
			args.push('--registry', source.registry);
		}
		const command = this._formatShellCommand(args);

		const confirmed = await this._confirmTerminalCommand(plugin.name, command);
		if (!confirmed) {
			return;
		}

		const { success, terminal } = await this._runTerminalCommand(
			command,
			localize('installingNpmPlugin', "Installing npm plugin '{0}'...", plugin.name),
		);
		if (!success) {
			return;
		}

		const pluginDir = this._pluginRepositoryService.getPluginSourceInstallUri(source);
		const pluginExists = await this._fileService.exists(pluginDir);
		if (!pluginExists) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('npmPluginNotFound', "npm package '{0}' was not found after installation.", source.package),
			});
			return;
		}

		terminal?.dispose();
		this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
	}

	// --- pip source -----------------------------------------------------------

	private async _installPipPlugin(plugin: IMarketplacePlugin, source: IPipPluginSource): Promise<void> {
		const packageSpec = source.version ? `${source.package}==${source.version}` : source.package;
		const installDir = await this._pluginRepositoryService.ensurePluginSource(plugin);
		const args = ['pip', 'install', '--target', installDir.fsPath, packageSpec];
		if (source.registry) {
			args.push('--index-url', source.registry);
		}
		const command = this._formatShellCommand(args);

		const confirmed = await this._confirmTerminalCommand(plugin.name, command);
		if (!confirmed) {
			return;
		}

		const { success, terminal } = await this._runTerminalCommand(
			command,
			localize('installingPipPlugin', "Installing pip plugin '{0}'...", plugin.name),
		);
		if (!success) {
			return;
		}

		const pluginDir = this._pluginRepositoryService.getPluginSourceInstallUri(source);
		const pluginExists = await this._fileService.exists(pluginDir);
		if (!pluginExists) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pipPluginNotFound', "pip package '{0}' was not found after installation.", source.package),
			});
			return;
		}

		terminal?.dispose();
		this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
	}

	// --- Helpers --------------------------------------------------------------

	private async _confirmTerminalCommand(pluginName: string, command: string): Promise<boolean> {
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
			this._logService.error('[PluginInstallService] Terminal command failed:', err);
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
				this._logService.warn('[PluginInstallService] Terminal command completion timed out');
				resolveAndDispose(undefined);
			});
		});
	}

	private _formatShellCommand(args: readonly string[]): string {
		const [command, ...rest] = args;
		return [command, ...rest.map(arg => this._shellEscapeArg(arg))].join(' ');
	}

	private _shellEscapeArg(value: string): string {
		if (isWindows) {
			// PowerShell: use double quotes, escape backticks, dollar signs, and double quotes
			return `"${value.replace(/[`$"]/g, '`$&')}"`;
		}
		// POSIX shells: use single quotes, escape by ending quote, adding escaped quote, reopening
		return `'${value.replace(/'/g, `'\\''`)}'`;
	}
}
