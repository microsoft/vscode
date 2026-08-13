/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { LogLevel, LogLevelToString } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, normalizeTunnelName, tunnelNameFromHostname, TunnelMode, TunnelStatus } from '../common/remoteTunnel.js';
import { parseTunnelMachineStatus, TunnelMachineStatus } from '../common/tunnelMachineStatus.js';
import { CodeTunnelCli, CodeTunnelCliOutput, ICodeTunnelCliRun } from './codeTunnelCliProcess.js';
import { hostname } from 'os';

type TunnelCliFactory = (onLog: (message: string) => void) => CodeTunnelCli;

/** The process mode selected from the combined tunnel intents. */
export type TunnelProcessMode = 'none' | 'agentHost' | 'remoteAccess' | 'service';
/** The connection lifecycle state reported by the coordinator. */
export type TunnelProcessConnectionState = 'disconnected' | 'connecting' | 'connected';

/** The requested agent-host-only sharing session. */
export interface IAgentHostSharingRequest {
	readonly token: string;
	readonly authProvider: 'github' | 'microsoft';
	readonly logLevel: LogLevel;
}

/** Credentials passed to `tunnel user login`. */
interface ITunnelLoginCredentials {
	readonly providerId: string;
	readonly token: string;
}

/** A line emitted by a CLI invocation owned by the coordinator. */
export interface ITunnelProcessOutput {
	readonly mode: TunnelProcessMode;
	readonly message: string;
	readonly isError: boolean;
}

/** A machine-status event emitted by a CLI invocation owned by the coordinator. */
export interface ITunnelProcessMachineStatus {
	readonly mode: TunnelProcessMode;
	readonly status: TunnelMachineStatus;
	cancel(): void;
}

/** The single, resolved tunnel state shared by Remote Tunnel Access and agent host sharing. */
export interface ITunnelProcessStatus {
	readonly mode: TunnelProcessMode;
	readonly tunnelName: string | undefined;
	readonly connectionState: TunnelProcessConnectionState;
	readonly serviceInstallFailed: boolean;
}

/** Service identifier for the shared-process tunnel coordinator. */
export const ITunnelProcessCoordinator = createDecorator<ITunnelProcessCoordinator>('tunnelProcessCoordinator');

/** Coordinates the one `code tunnel` process used by both shared-process tunnel consumers. */
export interface ITunnelProcessCoordinator {
	readonly _serviceBrand: undefined;
	readonly onDidChangeStatus: Event<ITunnelProcessStatus>;
	readonly onDidOutput: Event<ITunnelProcessOutput>;
	readonly onDidMachineStatus: Event<ITunnelProcessMachineStatus>;
	getStatus(): ITunnelProcessStatus;
	getIntendedTunnelName(): string;
	setRemoteAccess(mode: TunnelMode, logLevel: LogLevel): Promise<void>;
	setAgentHostSharing(request: IAgentHostSharingRequest | undefined): Promise<void>;
	restart(): Promise<void>;
	setRemoteAccessStatus(status: TunnelStatus): void;
}

/** Resolves the process mode from the two independent tunnel intents. */
export function resolveTunnelProcessMode(agentHostSharing: boolean, remoteAccess: TunnelMode): TunnelProcessMode {
	if (remoteAccess.active) {
		return remoteAccess.asService ? 'service' : 'remoteAccess';
	}
	return agentHostSharing ? 'agentHost' : 'none';
}

/**
 * Owns the only tunnel process in the shared process.
 *
 * The serial queue always waits for the previous child process to exit before
 * spawning its replacement. This makes a mode transition release `--name`
 * before another mode can claim it.
 */
export class TunnelProcessCoordinator extends Disposable implements ITunnelProcessCoordinator {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<ITunnelProcessStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly _onDidOutput = this._register(new Emitter<ITunnelProcessOutput>());
	readonly onDidOutput = this._onDidOutput.event;

	private readonly _onDidMachineStatus = this._register(new Emitter<ITunnelProcessMachineStatus>());
	readonly onDidMachineStatus = this._onDidMachineStatus.event;

	private readonly _tunnelCli: CodeTunnelCli;
	private _remoteAccess: { mode: TunnelMode; logLevel: LogLevel } = { mode: { active: false }, logLevel: LogLevel.Info };
	private _agentHostSharing: IAgentHostSharingRequest | undefined;
	private _currentProcess: ICodeTunnelCliRun | undefined;
	private _queue: Promise<void> = Promise.resolve();
	private _generation = 0;
	/**
	 * Survives across generations: a newer request can preempt the reconcile
	 * that was going to uninstall the service, and that newer request has no
	 * idea an uninstall was owed. Cleared only once an uninstall succeeds.
	 */
	private _uninstallServicePending = false;
	private _status: ITunnelProcessStatus = { mode: 'none', tunnelName: undefined, connectionState: 'disconnected', serviceInstallFailed: false };

	constructor(
		tunnelCliFactory: TunnelCliFactory | undefined,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
	) {
		super();
		this._tunnelCli = tunnelCliFactory?.(() => { }) ?? new CodeTunnelCli({
			appRoot: environmentService.appRoot,
			isBuilt: environmentService.isBuilt,
			tunnelApplicationName: productService.tunnelApplicationName,
			win32VersionedUpdate: !!productService.win32VersionedUpdate,
		});
	}

	getStatus(): ITunnelProcessStatus {
		return this._status;
	}

	/**
	 * The name a tunnel would be given right now, from configuration or the
	 * hostname. Unlike {@link getStatus}'s `tunnelName` this is defined even
	 * when no tunnel process is running, so callers can compare the intended
	 * name against a previously used one.
	 */
	getIntendedTunnelName(): string {
		return this._getTunnelName();
	}

	setRemoteAccess(mode: TunnelMode, logLevel: LogLevel): Promise<void> {
		const wasService = this._remoteAccess.mode.active && this._remoteAccess.mode.asService;
		this._remoteAccess = { mode, logLevel };
		return this._schedule(wasService && (!mode.active || !mode.asService));
	}

	setAgentHostSharing(request: IAgentHostSharingRequest | undefined): Promise<void> {
		this._agentHostSharing = request;
		return this._schedule(false);
	}

	restart(): Promise<void> {
		return this._schedule(false, true);
	}

	setRemoteAccessStatus(status: TunnelStatus): void {
		if (this._status.mode !== 'remoteAccess' && this._status.mode !== 'service') {
			return;
		}
		const connectionState = status.type === 'connected' ? 'connected' : status.type === 'connecting' ? 'connecting' : 'disconnected';
		this._setStatus({ ...this._status, connectionState });
	}

	private _schedule(uninstallService: boolean, forceRestart = false): Promise<void> {
		this._uninstallServicePending ||= uninstallService;

		// Checked before stopping anything: `_reconcile` can only observe a
		// process this method already stopped, so a no-op update would
		// otherwise tear down a perfectly healthy tunnel.
		if (!forceRestart && !this._uninstallServicePending && this._isTargetSatisfied()) {
			return Promise.resolve();
		}

		const generation = ++this._generation;
		void this._currentProcess?.stop();
		const operation = this._queue.then(() => this._reconcile(generation));
		this._queue = operation.catch(() => { });
		return operation;
	}

	/** Whether what is running already matches the resolved intent. */
	private _isTargetSatisfied(): boolean {
		const target = this._getTarget();
		const tunnelName = target.mode === 'none' ? undefined : this._getTunnelName();
		if (this._status.mode !== target.mode || this._status.tunnelName !== tunnelName) {
			return false;
		}
		// Only the modes that own a child process can be confirmed from here;
		// `service` is hosted outside this process, so it always reconciles.
		return target.mode === 'none' || !!this._currentProcess;
	}

	private async _reconcile(generation: number): Promise<void> {
		await this._stopCurrentProcess();
		if (generation !== this._generation) {
			return;
		}

		if (this._uninstallServicePending) {
			const exitCode = await this._runTransient('serviceUninstall', ['tunnel', 'service', 'uninstall'], 'none', generation);
			if (exitCode === 0) {
				this._uninstallServicePending = false;
			}
			if (generation !== this._generation) {
				return;
			}
		}

		const target = this._getTarget();
		const tunnelName = target.mode === 'none' ? undefined : this._getTunnelName();

		if (target.mode === 'none') {
			await this._runTransient('kill', ['tunnel', 'kill'], 'none', generation);
			if (generation === this._generation) {
				this._setStatus({ mode: 'none', tunnelName: undefined, connectionState: 'disconnected', serviceInstallFailed: false });
			}
			return;
		}

		this._setStatus({ mode: target.mode, tunnelName, connectionState: 'connecting', serviceInstallFailed: false });
		const isServiceInstalled = target.mode === 'service' || target.mode === 'remoteAccess'
			? await this._isServiceInstalled(generation)
			: false;
		if (generation !== this._generation) {
			return;
		}
		if (target.mode === 'service') {
			let serviceInstallFailed = false;
			if (!isServiceInstalled) {
				serviceInstallFailed = await this._installService(target.logLevel, tunnelName!, generation) === false;
			}
			if (generation === this._generation) {
				this._setStatus({ ...this._status, serviceInstallFailed });
			}
			return;
		}

		if (target.login) {
			const loginExitCode = await this._runTransient(
				'login',
				['tunnel', 'user', 'login', '--provider', target.login.providerId, '--log', LogLevelToString(target.logLevel)],
				target.mode,
				generation,
				{ VSCODE_CLI_ACCESS_TOKEN: target.login.token },
			);
			if (generation !== this._generation || loginExitCode !== 0) {
				if (generation === this._generation) {
					this._setStatus({ ...this._status, connectionState: 'disconnected' });
				}
				return;
			}
		}

		const args = ['tunnel'];
		if (target.mode === 'agentHost') {
			args.push('--agent-host-only', '--name', tunnelName!, '--user-data-dir', this.environmentService.userDataPath);
			args.push('--delegate-to-editor', '--parent-process-id', String(process.pid));
		} else {
			args.push('--accept-server-license-terms', '--log', LogLevelToString(target.logLevel));
			args.push('--user-data-dir', this.environmentService.userDataPath, '--delegate-to-editor', '--name', tunnelName!, '--parent-process-id', String(process.pid));
		}
		if (target.mode === 'remoteAccess' && this._preventSleep()) {
			args.push('--no-sleep');
		}
		this._startTunnel(args, target.mode, generation);
	}

	/**
	 * The credentials the CLI needs for `tunnel user login`. Deliberately not an
	 * {@link IRemoteTunnelSession}: agent host sharing has no session, only a
	 * token, and fabricating one with empty ids would misrepresent that.
	 */
	private _getTarget(): { mode: TunnelProcessMode; login: ITunnelLoginCredentials | undefined; logLevel: LogLevel } {
		if (this._remoteAccess.mode.active) {
			const session = this._remoteAccess.mode.session;
			return {
				mode: resolveTunnelProcessMode(!!this._agentHostSharing, this._remoteAccess.mode),
				login: session.token ? { providerId: session.providerId, token: session.token } : undefined,
				logLevel: this._remoteAccess.logLevel,
			};
		}
		if (this._agentHostSharing) {
			return {
				mode: resolveTunnelProcessMode(true, this._remoteAccess.mode),
				login: { providerId: this._agentHostSharing.authProvider, token: this._agentHostSharing.token },
				logLevel: this._agentHostSharing.logLevel,
			};
		}
		return { mode: 'none', login: undefined, logLevel: LogLevel.Info };
	}

	private async _isServiceInstalled(generation: number): Promise<boolean> {
		let output = '';
		const exitCode = await this._runTransient('status', ['tunnel', 'status'], 'service', generation, undefined, (message, isError) => {
			if (!isError) {
				output += message;
			}
		});
		if (exitCode !== 0) {
			return false;
		}
		try {
			const status = JSON.parse(output.trim().split('\n').find(line => line.startsWith('{'))!) as { service_installed: boolean };
			return status.service_installed;
		} catch {
			return false;
		}
	}

	private async _installService(logLevel: LogLevel, tunnelName: string, generation: number): Promise<boolean> {
		const args = ['tunnel', 'service', 'install', '--accept-server-license-terms', '--log', LogLevelToString(logLevel), '--user-data-dir', this.environmentService.userDataPath, '--name', tunnelName];
		return (await this._runTransient('serviceInstall', args, 'service', generation)) === 0;
	}

	private _startTunnel(args: readonly string[], mode: TunnelProcessMode, generation: number): void {
		const tunnelRun = this._tunnelCli.run('tunnel', args, (message, isError) => this._fireOutput(mode, message, isError, true, () => tunnelRun.result.cancel(), generation), { VSCODE_CLI_MACHINE_STATUS: '1' });
		this._currentProcess = tunnelRun;
		void tunnelRun.result.then(
			() => {
				if (this._currentProcess === tunnelRun) {
					this._currentProcess = undefined;
					if (generation === this._generation) {
						this._setStatus({ ...this._status, connectionState: 'disconnected' });
					}
				}
			},
			() => {
				if (this._currentProcess === tunnelRun) {
					this._currentProcess = undefined;
					if (generation === this._generation) {
						this._setStatus({ ...this._status, connectionState: 'disconnected' });
					}
				}
			},
		);
	}

	private async _runTransient(logLabel: string, args: readonly string[], mode: TunnelProcessMode, generation: number, env?: Record<string, string>, onOutput?: CodeTunnelCliOutput): Promise<number> {
		const run = this._tunnelCli.run(logLabel, args, (message, isError) => {
			onOutput?.(message, isError);
			this._fireOutput(mode, message, isError, false, () => run.result.cancel());
		}, env);
		this._currentProcess = run;
		try {
			return await run.result;
		} catch {
			return 1;
		} finally {
			if (this._currentProcess === run) {
				this._currentProcess = undefined;
			}
		}
	}

	private async _stopCurrentProcess(): Promise<void> {
		const run = this._currentProcess;
		if (!run) {
			return;
		}
		await run.stop();
		if (this._currentProcess === run) {
			this._currentProcess = undefined;
		}
	}

	private _fireOutput(mode: TunnelProcessMode, message: string, isError: boolean, isTunnelProcess: boolean, cancel: () => void, generation?: number): void {
		this._onDidOutput.fire({ mode, message, isError });
		if (!isError && isTunnelProcess && generation === this._generation) {
			const status = parseTunnelMachineStatus(message);
			if (status) {
				if (status.type === 'connected' && this._status.mode === mode) {
					this._setStatus({ ...this._status, connectionState: 'connected' });
				}
				this._onDidMachineStatus.fire({ mode, status, cancel });
			}
		}
	}

	private _setStatus(status: ITunnelProcessStatus): void {
		if (this._status.mode === status.mode
			&& this._status.tunnelName === status.tunnelName
			&& this._status.connectionState === status.connectionState
			&& this._status.serviceInstallFailed === status.serviceInstallFailed) {
			return;
		}
		this._status = status;
		this._onDidChangeStatus.fire(status);
	}

	private _getTunnelName(): string {
		const configured = this.configurationService.getValue<string>(CONFIGURATION_KEY_HOST_NAME);
		return (configured ? normalizeTunnelName(configured) : tunnelNameFromHostname(hostname())) || 'vscode';
	}

	private _preventSleep(): boolean {
		return !!this.configurationService.getValue<boolean>(CONFIGURATION_KEY_PREVENT_SLEEP);
	}

	override dispose(): void {
		this._generation++;
		void this._currentProcess?.stop();
		super.dispose();
	}
}
