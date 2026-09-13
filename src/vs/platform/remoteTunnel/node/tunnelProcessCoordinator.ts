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

/** The process mode selected from the Remote Tunnel Access intent. */
export type TunnelProcessMode = 'none' | 'remoteAccess' | 'service';
/** The connection lifecycle state reported by the coordinator. */
export type TunnelProcessConnectionState = 'disconnected' | 'connecting' | 'connected';

/** Credentials passed to `tunnel user login`. */
interface ITunnelLoginCredentials {
	readonly providerId: string;
	readonly token: string;
}

/** The tunnel the current intents resolve to. */
interface ITunnelTarget {
	readonly mode: TunnelProcessMode;
	readonly login: ITunnelLoginCredentials | undefined;
	readonly logLevel: LogLevel;
}

/**
 * A launched process's inputs, kept so a later intent update can tell whether
 * it would produce the same process or genuinely needs a new one.
 */
interface ILaunchDescription {
	readonly mode: TunnelProcessMode;
	readonly tunnelName: string;
	readonly providerId: string | undefined;
	readonly token: string | undefined;
	readonly logLevel: LogLevel;
	readonly preventSleep: boolean;
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

/** The tunnel process state shared by Remote Tunnel Access consumers. */
export interface ITunnelProcessStatus {
	readonly mode: TunnelProcessMode;
	readonly tunnelName: string | undefined;
	readonly tunnelId?: string;
	readonly connectionState: TunnelProcessConnectionState;
	readonly serviceInstallFailed: boolean;
}

/** Service identifier for the shared-process tunnel coordinator. */
export const ITunnelProcessCoordinator = createDecorator<ITunnelProcessCoordinator>('tunnelProcessCoordinator');

/** Coordinates the `code tunnel` process used by Remote Tunnel Access. */
export interface ITunnelProcessCoordinator {
	readonly _serviceBrand: undefined;
	readonly onDidChangeStatus: Event<ITunnelProcessStatus>;
	readonly onDidOutput: Event<ITunnelProcessOutput>;
	readonly onDidMachineStatus: Event<ITunnelProcessMachineStatus>;
	getStatus(): ITunnelProcessStatus;
	getIntendedTunnelName(): string;
	setRemoteAccess(mode: TunnelMode, logLevel: LogLevel): Promise<void>;
	restart(): Promise<void>;
	setRemoteAccessStatus(status: TunnelStatus): void;
}

/** Resolves the process mode from the Remote Tunnel Access intent. */
export function resolveTunnelProcessMode(remoteAccess: TunnelMode): TunnelProcessMode {
	return remoteAccess.active ? (remoteAccess.asService ? 'service' : 'remoteAccess') : 'none';
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
	private _currentProcess: ICodeTunnelCliRun | undefined;
	private _queue: Promise<void> = Promise.resolve();
	private _generation = 0;
	/**
	 * Survives across generations: a newer request can preempt the reconcile
	 * that was going to uninstall the service, and that newer request has no
	 * idea an uninstall was owed. Cleared only once an uninstall succeeds.
	 */
	private _uninstallServicePending = false;
	/** Inputs of the currently running process, or undefined when none runs. */
	private _launched: ILaunchDescription | undefined;
	private _status: ITunnelProcessStatus = { mode: 'none', tunnelName: undefined, tunnelId: undefined, connectionState: 'disconnected', serviceInstallFailed: false };

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

	/**
	 * Whether the running process was launched from exactly the inputs the
	 * current intent resolves to. Compares the full launch description, not
	 * just mode and name: callers also update the session token, log level and
	 * sleep prevention, and each of those has to reach a new process.
	 */
	private _isTargetSatisfied(): boolean {
		const target = this._getTarget();
		if (target.mode === 'none') {
			return this._status.mode === 'none';
		}
		// A run that already reported failure cannot satisfy anything: a token
		// error cancels the child and marks us disconnected before it exits, so
		// treating it as healthy would skip the reconcile and leave nothing
		// running once the cancelled child finally goes away.
		if (!this._currentProcess || this._status.connectionState === 'disconnected') {
			return false;
		}
		const launched = this._launched;
		const wanted = this._describeLaunch(target);
		return !!launched
			&& launched.mode === wanted.mode
			&& launched.tunnelName === wanted.tunnelName
			&& launched.providerId === wanted.providerId
			&& launched.token === wanted.token
			&& launched.logLevel === wanted.logLevel
			&& launched.preventSleep === wanted.preventSleep;
	}

	/** Everything that changes what a launched tunnel process actually does. */
	private _describeLaunch(target: ITunnelTarget): ILaunchDescription {
		return {
			mode: target.mode,
			tunnelName: this._getTunnelName(),
			providerId: target.login?.providerId,
			token: target.login?.token,
			logLevel: target.logLevel,
			preventSleep: this._preventSleep(),
		};
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
				this._setStatus({ mode: 'none', tunnelName: undefined, tunnelId: undefined, connectionState: 'disconnected', serviceInstallFailed: false });
			}
			return;
		}

		this._setStatus({ mode: target.mode, tunnelName, tunnelId: undefined, connectionState: 'connecting', serviceInstallFailed: false });
		const isServiceInstalled = await this._isServiceInstalled(generation);
		if (generation !== this._generation) {
			return;
		}
		if (target.mode === 'service' && !isServiceInstalled) {
			const serviceInstallFailed = await this._installService(target.logLevel, tunnelName!, generation) === false;
			if (generation !== this._generation) {
				return;
			}
			// A failed install is not fatal: the session tunnel below still
			// runs, matching the pre-CLI behaviour of falling back to hosting
			// in-session and reporting the failure alongside it.
			this._setStatus({ ...this._status, serviceInstallFailed });
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
		args.push('--accept-server-license-terms', '--log', LogLevelToString(target.logLevel));
		args.push('--user-data-dir', this.environmentService.userDataPath, '--delegate-to-editor', '--name', tunnelName!, '--parent-process-id', String(process.pid));
		if (this._preventSleep()) {
			args.push('--no-sleep');
		}
		this._launched = this._describeLaunch(target);
		this._startTunnel(args, target.mode, generation);
	}

	/**
	 * The credentials the CLI needs for `tunnel user login`.
	 */
	private _getTarget(): ITunnelTarget {
		if (this._remoteAccess.mode.active) {
			const session = this._remoteAccess.mode.session;
			return {
				mode: resolveTunnelProcessMode(this._remoteAccess.mode),
				login: session.token ? { providerId: session.providerId, token: session.token } : undefined,
				logLevel: this._remoteAccess.logLevel,
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
		const onSettled = () => {
			if (this._currentProcess === tunnelRun) {
				this._currentProcess = undefined;
				this._launched = undefined;
				if (generation === this._generation) {
					this._setStatus({ ...this._status, connectionState: 'disconnected' });
				}
			}
		};
		void tunnelRun.result.then(onSettled, onSettled);
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
			this._launched = undefined;
		}
	}

	private _fireOutput(mode: TunnelProcessMode, message: string, isError: boolean, isTunnelProcess: boolean, cancel: () => void, generation?: number): void {
		this._onDidOutput.fire({ mode, message, isError });
		if (!isError && isTunnelProcess && generation === this._generation) {
			const status = parseTunnelMachineStatus(message);
			if (status) {
				if (status.type === 'connected' && this._status.mode === mode) {
					this._setStatus({ ...this._status, tunnelId: status.tunnelId, connectionState: 'connected' });
				}
				this._onDidMachineStatus.fire({ mode, status, cancel });
			}
		}
	}

	private _setStatus(status: ITunnelProcessStatus): void {
		if (this._status.mode === status.mode
			&& this._status.tunnelName === status.tunnelName
			&& this._status.tunnelId === status.tunnelId
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
