/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { DeferredPromise } from './deferredPromise';
import { splitNewLines } from './split';

export const enum TunnelPrivacyId {
	Private = 'private',
	Public = 'public',
}

/**
 * Timeout after the last port forwarding is disposed before we'll tear down
 * the CLI. This is primarily used since privacy changes to port will appear
 * as a dispose+re-create call, and we don't want to have to restart the CLI.
 */
const CLEANUP_TIMEOUT = 10_000;

const cliPath = process.env.VSCODE_FORWARDING_IS_DEV
	? path.join(__dirname, '../../../cli/target/debug/code')
	: path.join(
		vscode.env.appRoot,
		process.platform === 'darwin' ? 'bin' : '../../bin',
		vscode.env.appQuality === 'stable' ? 'code-tunnel' : 'code-tunnel-insiders',
	) + (process.platform === 'win32' ? '.exe' : '');

class Tunnel implements vscode.Tunnel {
	private readonly disposeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidDispose = this.disposeEmitter.event;
	public localAddress!: string;

	constructor(
		public readonly remoteAddress: { port: number; host: string },
		public readonly privacy: TunnelPrivacyId,
		public readonly protocol: 'http' | 'https',
	) { }

	public setPortFormat(formatString: string) {
		this.localAddress = formatString.replace('{port}', String(this.remoteAddress.port));
	}

	dispose() {
		this.disposeEmitter.fire();
	}
}

const enum State {
	Starting,
	Active,
	Inactive,
	Error,
}

type StateT =
	| { state: State.Inactive }
	| { state: State.Starting; process: ChildProcessWithoutNullStreams; cleanupTimeout?: NodeJS.Timeout }
	| { state: State.Active; portFormat: string; process: ChildProcessWithoutNullStreams; cleanupTimeout?: NodeJS.Timeout }
	| { state: State.Error; error: string };

export async function activate(context: vscode.ExtensionContext) {
	if (vscode.env.remoteAuthority) {
		return; // forwarding is local-only at the moment
	}

	const logger = new Logger(vscode.l10n.t('Port Forwarding'));
	const provider = new TunnelProvider(logger, context);

	context.subscriptions.push(
		vscode.commands.registerCommand('tunnel-forwarding.showLog', () => logger.show()),
		vscode.commands.registerCommand('tunnel-forwarding.restart', () => provider.restart()),

		provider.onDidStateChange(s => {
			vscode.commands.executeCommand('setContext', 'tunnelForwardingIsRunning', s.state !== State.Inactive);
		}),

		await vscode.workspace.registerTunnelProvider(
			provider,
			{
				tunnelFeatures: {
					elevation: false,
					protocol: true,
					privacyOptions: [
						{ themeIcon: 'globe', id: TunnelPrivacyId.Public, label: vscode.l10n.t('Public') },
						{ themeIcon: 'lock', id: TunnelPrivacyId.Private, label: vscode.l10n.t('Private') },
					],
				},
			},
		),
	);
}

export function deactivate() { }

class Logger {
	private outputChannel?: vscode.LogOutputChannel;

	constructor(private readonly label: string) { }

	public show(): void {
		return this.outputChannel?.show();
	}

	public clear() {
		this.outputChannel?.clear();
	}

	public log(
		logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error',
		message: string,
		...args: unknown[]
	) {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel(this.label, { log: true });
			vscode.commands.executeCommand('setContext', 'tunnelForwardingHasLog', true);
		}
		this.outputChannel[logLevel](message, ...args);
	}
}

const didWarnPublicKey = 'didWarnPublic';

class TunnelProvider implements vscode.TunnelProvider {
	private readonly tunnels = new Set<Tunnel>();
	private readonly stateChange = new vscode.EventEmitter<StateT>();
	private _state: StateT = { state: State.Inactive };

	private get state(): StateT {
		return this._state;
	}

	private set state(state: StateT) {
		this._state = state;
		this.stateChange.fire(state);
	}

	public readonly onDidStateChange = this.stateChange.event;

	constructor(private readonly logger: Logger, private readonly context: vscode.ExtensionContext) { }

	/** @inheritdoc */
	public async provideTunnel(tunnelOptions: vscode.TunnelOptions): Promise<vscode.Tunnel | undefined> {
		if (tunnelOptions.privacy === TunnelPrivacyId.Public) {
			if (!(await this.consentPublicPort(tunnelOptions.remoteAddress.port))) {
				return;
			}
		}

		const tunnel = new Tunnel(
			tunnelOptions.remoteAddress,
			(tunnelOptions.privacy as TunnelPrivacyId) || TunnelPrivacyId.Private,
			tunnelOptions.protocol === 'https' ? 'https' : 'http',
		);

		this.tunnels.add(tunnel);
		tunnel.onDidDispose(() => {
			this.tunnels.delete(tunnel);
			this.updateActivePortsIfRunning();
		});

		switch (this.state.state) {
			case State.Error:
			case State.Inactive:
				await this.setupPortForwardingProcess();
			// fall through since state is now starting
			case State.Starting:
				this.updateActivePortsIfRunning();
				return new Promise<Tunnel>((resolve, reject) => {
					const l = this.stateChange.event(state => {
						if (state.state === State.Active) {
							tunnel.setPortFormat(state.portFormat);
							l.dispose();
							resolve(tunnel);
						} else if (state.state === State.Error) {
							l.dispose();
							reject(new Error(state.error));
						}
					});
				});
			case State.Active:
				tunnel.setPortFormat(this.state.portFormat);
				this.updateActivePortsIfRunning();
				return tunnel;
		}
	}

	/** Re/starts the port forwarding system. */
	public async restart() {
		this.killRunningProcess();
		await this.setupPortForwardingProcess(); // will show progress
		this.updateActivePortsIfRunning();
	}

	private async consentPublicPort(portNumber: number) {
		const didWarn = this.context.globalState.get(didWarnPublicKey, false);
		if (didWarn) {
			return true;
		}

		const continueOpt = vscode.l10n.t('Continue');
		const dontShowAgain = vscode.l10n.t("Don't show again");
		const r = await vscode.window.showWarningMessage(
			vscode.l10n.t("You're about to create a publicly forwarded port. Anyone on the internet will be able to connect to the service listening on port {0}. You should only proceed if this service is secure and non-sensitive.", portNumber),
			{ modal: true },
			continueOpt,
			dontShowAgain,
		);
		if (r === continueOpt) {
			// continue
		} else if (r === dontShowAgain) {
			await this.context.globalState.update(didWarnPublicKey, true);
		} else {
			return false;
		}

		return true;
	}

	private isInStateWithProcess(process: ChildProcessWithoutNullStreams) {
		return (
			(this.state.state === State.Starting || this.state.state === State.Active) &&
			this.state.process === process
		);
	}

	private killRunningProcess() {
		if (this.state.state === State.Starting || this.state.state === State.Active) {
			this.logger.log('info', '[forwarding] no more ports, stopping forwarding CLI');
			this.state.process.kill();
			this.state = { state: State.Inactive };
		}
	}

	private updateActivePortsIfRunning() {
		if (this.state.state !== State.Starting && this.state.state !== State.Active) {
			return;
		}

		const ports = [...this.tunnels].map(t => ({ number: t.remoteAddress.port, privacy: t.privacy, protocol: t.protocol }));
		this.state.process.stdin.write(`${JSON.stringify(ports)}\n`);

		if (ports.length === 0 && !this.state.cleanupTimeout) {
			this.state.cleanupTimeout = setTimeout(() => this.killRunningProcess(), CLEANUP_TIMEOUT);
		} else if (ports.length > 0 && this.state.cleanupTimeout) {
			clearTimeout(this.state.cleanupTimeout);
			this.state.cleanupTimeout = undefined;
		}
	}

	private async setupPortForwardingProcess() {
		const session = await vscode.authentication.getSession('github', ['user:email', 'read:org'], {
			createIfNone: true,
		});

		const args = [
			'--verbose',
			'tunnel',
			'forward-internal',
			'--provider',
			'github',
		];

		this.logger.log('info', '[forwarding] starting CLI');
		const child = spawn(cliPath, args, { stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', VSCODE_CLI_ACCESS_TOKEN: session.accessToken } });
		this.state = { state: State.Starting, process: child };

		const progressP = new DeferredPromise<void>();
		vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: vscode.l10n.t({
					comment: ['do not change link format [Show Log](command), only change the text "Show Log"'],
					message: 'Starting port forwarding system ([Show Log]({0}))',
					args: ['command:tunnel-forwarding.showLog']
				}),
			},
			() => progressP.p,
		);

		let lastPortFormat: string | undefined;
		child.on('exit', status => {
			const msg = `[forwarding] exited with code ${status}`;
			this.logger.log('info', msg);
			progressP.complete(); // make sure to clear progress on unexpected exit
			if (this.isInStateWithProcess(child)) {
				this.state = { state: State.Error, error: msg };
			}
		});

		child.on('error', err => {
			this.logger.log('error', `[forwarding] ${err}`);
			progressP.complete(); // make sure to clear progress on unexpected exit
			if (this.isInStateWithProcess(child)) {
				this.state = { state: State.Error, error: String(err) };
			}
		});

		child.stdout
			.pipe(splitNewLines())
			.on('data', line => this.logger.log('info', `[forwarding] ${line}`))
			.resume();

		child.stderr
			.pipe(splitNewLines())
			.on('data', line => {
				try {
					const l: { port_format: string } = JSON.parse(line);
					if (l.port_format && l.port_format !== lastPortFormat) {
						this.state = {
							state: State.Active,
							portFormat: l.port_format, process: child,
							cleanupTimeout: 'cleanupTimeout' in this.state ? this.state.cleanupTimeout : undefined,
						};
						progressP.complete();
					}
				} catch (e) {
					this.logger.log('error', `[forwarding] ${line}`);
				}
			})
			.resume();

		await new Promise((resolve, reject) => {
			child.on('spawn', resolve);
			child.on('error', reject);
		});
	}
}
