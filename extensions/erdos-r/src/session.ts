import * as erdos from 'erdos';
import * as vscode from 'vscode';
import PQueue from 'p-queue';

import { ErdosSupervisorApi, JupyterKernelSpec, JupyterLanguageRuntimeSession, JupyterKernelExtra } from './erdos-supervisor';
import { ArkLsp, LspState } from './lsp';
import { delay, whenTimeout, timeout } from './util';
import { ArkAttachOnStartup, ArkDelayStartup } from './startup';
import { RHtmlWidget, getResourceRoots } from './htmlwidgets';
import { randomUUID } from 'crypto';
import { handleRCode } from './hyperlink';
import { RSessionManager } from './session-manager';
import { LOGGER } from './extension.js';

interface RPackageInstallation {
	packageName: string;
	packageVersion: string;
	minimumVersion: string;
	compatible: boolean;
}

export interface EnvVar {
	[key: string]: string;
}

interface Locale {
	LANG: string;
	[key: string]: string;
}

export class RSession implements erdos.LanguageRuntimeSession, vscode.Disposable {

	private _lsp: ArkLsp;
	private _lspQueue: PQueue;
	private _lspStartingPromise: Promise<number> = Promise.resolve(0);
	private _lspClientId?: string;
	private _kernel?: JupyterLanguageRuntimeSession;
	private _messageEmitter =
		new vscode.EventEmitter<erdos.LanguageRuntimeMessage>();
	private _stateEmitter =
		new vscode.EventEmitter<erdos.RuntimeState>();
	private _exitEmitter =
		new vscode.EventEmitter<erdos.LanguageRuntimeExit>();
	private adapterApi?: ErdosSupervisorApi;
	private _consoleWidthDisposable?: vscode.Disposable;
	private _state: erdos.RuntimeState = erdos.RuntimeState.Uninitialized;
	private _created: number;
	private _packageCache: Map<string, RPackageInstallation> = new Map();
	public dynState: erdos.LanguageRuntimeDynState;

	constructor(
		readonly runtimeMetadata: erdos.LanguageRuntimeMetadata,
		readonly metadata: erdos.RuntimeSessionMetadata,
		readonly kernelSpec?: JupyterKernelSpec,
		readonly extra?: JupyterKernelExtra,
		sessionName?: string,
	) {
		this.dynState = {
			sessionName: sessionName || runtimeMetadata.runtimeName,
			continuationPrompt: '+',
			inputPrompt: '>',
		};

		this._lsp = new ArkLsp(runtimeMetadata.languageVersion, metadata, this.dynState);
		this._lspQueue = new PQueue({ concurrency: 1 });
		this.onDidReceiveRuntimeMessage = this._messageEmitter.event;
		this.onDidChangeRuntimeState = this._stateEmitter.event;
		this.onDidEndSession = this._exitEmitter.event;

		this._created = Date.now();

		RSessionManager.instance.setSession(metadata.sessionId, this);

		this.onDidChangeRuntimeState(async (state) => {
			await this.onStateChange(state);
		});
	}

	onDidEndSession: vscode.Event<erdos.LanguageRuntimeExit>;
	onDidReceiveRuntimeMessage: vscode.Event<erdos.LanguageRuntimeMessage>;
	onDidChangeRuntimeState: vscode.Event<erdos.RuntimeState>;

	get state(): erdos.RuntimeState {
		return this._state;
	}

	get created(): number {
		return this._created;
	}

	openResource(resource: vscode.Uri | string): Thenable<boolean> {
		if (typeof resource === 'string') {
			resource = vscode.Uri.parse(resource);
		}

		switch (resource.scheme) {
			case 'x-r-help':
				this.showHelpTopic(resource.path);
				return Promise.resolve(true);

			case 'x-r-vignette':
				this.showVignetteTopic(resource.path);
				return Promise.resolve(true);

			case 'x-r-run':
				handleRCode(this, resource.path);
				return Promise.resolve(true);

			default:
				return Promise.resolve(false);
		}
	}

	execute(code: string, id: string, mode: erdos.RuntimeCodeExecutionMode, errorBehavior: erdos.RuntimeErrorBehavior): void {
		console.log(`ERDOS_R_DEBUG: execute called with code: "${code}", id: ${id}, mode: ${mode}`);
		if (this._kernel) {
			this._kernel.execute(code, id, mode, errorBehavior);
		} else {
			console.log(`ERDOS_R_DEBUG: Cannot execute '${code}'; kernel not started`);
			throw new Error(`Cannot execute '${code}'; kernel not started`);
		}
	}

	callMethod(method: string, ...args: any[]): Thenable<any> {
		console.log(`ERDOS_R_DEBUG: R session callMethod('${method}', ${JSON.stringify(args)})`);
		if (this._kernel) {
			const result = this._kernel.callMethod(method, ...args);
			result.then((res: any) => {
				console.log(`ERDOS_R_DEBUG: R session method '${method}' returned:`, JSON.stringify(res, null, 2));
			}).catch((err: any) => {
				console.log(`ERDOS_R_DEBUG: R session method '${method}' failed:`, JSON.stringify(err, null, 2));
			});
			return result;
		} else {
			console.log(`ERDOS_R_DEBUG: Cannot call method '${method}'; kernel not started`);
			throw new Error(`Cannot call method '${method}'; kernel not started`);
		}
	}

	isCodeFragmentComplete(code: string): Thenable<erdos.RuntimeCodeFragmentStatus> {
		if (this._kernel) {
			return this._kernel.isCodeFragmentComplete(code);
		} else {
			throw new Error(`Cannot check code fragment '${code}'; kernel not started`);
		}
	}

	createClient(id: string, type: erdos.RuntimeClientType, params: any, metadata?: any): Thenable<void> {
		if (this._kernel) {
			return this._kernel.createClient(id, type, params, metadata);
		} else {
			throw new Error(`Cannot create client of type '${type}'; kernel not started`);
		}
	}

	listClients(type?: erdos.RuntimeClientType | undefined): Thenable<Record<string, string>> {
		if (this._kernel) {
			return this._kernel.listClients(type);
		} else {
			throw new Error(`Cannot list clients; kernel not started`);
		}
	}

	removeClient(id: string): void {
		if (this._kernel) {
			this._kernel.removeClient(id);
		} else {
			throw new Error(`Cannot remove client ${id}; kernel not started`);
		}
	}

	sendClientMessage(clientId: string, messageId: string, message: any): void {
		if (this._kernel) {
			this._kernel.sendClientMessage(clientId, messageId, message);
		} else {
			throw new Error(`Cannot send message to client ${clientId}; kernel not started`);
		}
	}

	replyToPrompt(id: string, reply: string): void {
		if (this._kernel) {
			this._kernel.replyToPrompt(id, reply);
		} else {
			throw new Error(`Cannot reply to prompt ${id}; kernel not started`);
		}
	}

	async setWorkingDirectory(dir: string): Promise<void> {
		console.log(`ERDOS_R_DEBUG: setWorkingDirectory called with: ${dir}`);
		if (this._kernel) {
			dir = dir.replace(/\\/g, '\\\\');
			dir = dir.replace(/"/g, '\\"');

			console.log(`ERDOS_R_DEBUG: executing setwd("${dir}") command`);
			this._kernel.execute(`setwd("${dir}")`,
				randomUUID(),
				erdos.RuntimeCodeExecutionMode.Interactive,
				erdos.RuntimeErrorBehavior.Continue);
		} else {
			throw new Error(`Cannot change to ${dir}; kernel not started`);
		}
	}

	async start(): Promise<erdos.LanguageRuntimeInfo> {
		console.log(`ERDOS_R_DEBUG: Starting R session`);
		if (!this._kernel) {
			this._kernel = await this.createKernel();
			console.log(`ERDOS_R_DEBUG: Created kernel`);
		}
		RSessionManager.instance.setLastBinpath(this._kernel.runtimeMetadata.runtimePath);

		if (!this._consoleWidthDisposable) {
			this._consoleWidthDisposable =
				erdos.window.onDidChangeConsoleWidth((newWidth) => {
					this.onConsoleWidthChange(newWidth);
				});
		}
		console.log(`ERDOS_R_DEBUG: About to call kernel.start()`);
		const result = await this._kernel.start();
		console.log(`ERDOS_R_DEBUG: Kernel started, result:`, JSON.stringify(result, null, 2));
		return result;
	}

	private async onConsoleWidthChange(newWidth: number): Promise<void> {
		if (!this._kernel) {
			return;
		}

		if (this._state === erdos.RuntimeState.Exited) {
			return;
		}

		try {
			const oldWidth = await this.callMethod('setConsoleWidth', newWidth);
			this._kernel!.emitJupyterLog(`Set console width from ${oldWidth} to ${newWidth}`);
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			this._kernel!.emitJupyterLog(
				`Error setting console width: ${runtimeError.message} ${runtimeError.code})`,
				vscode.LogLevel.Error);
		}
	}

	async interrupt(): Promise<void> {
		if (this._kernel) {
			return this._kernel.interrupt();
		} else {
			throw new Error('Cannot interrupt; kernel not started');
		}
	}

	async restart(workingDirectory: string | undefined): Promise<void> {
		if (this._kernel) {
			this._kernel.emitJupyterLog('Restarting');
			const timedOut = await Promise.race([
				this._lspStartingPromise.catch(() => { }),
				whenTimeout(400, () => true),
			]);
			if (timedOut) {
				this._kernel.emitJupyterLog(
					'LSP startup timed out during interpreter restart',
					vscode.LogLevel.Warning,
				);
			}
			await this.deactivateLsp('restarting session');
			return this._kernel.restart(workingDirectory);
		} else {
			throw new Error('Cannot restart; kernel not started');
		}
	}

	async shutdown(exitReason = erdos.RuntimeExitReason.Shutdown): Promise<void> {
		if (this._kernel) {
			this._kernel.emitJupyterLog('Shutting down');
			await this.deactivateLsp('shutting down session');
			return this._kernel.shutdown(exitReason);
		} else {
			throw new Error('Cannot shutdown; kernel not started');
		}
	}

	async forceQuit(): Promise<void> {
		if (this._kernel) {
			this._kernel.emitJupyterLog('Force quitting');
			await Promise.race([
				this.deactivateLsp('force quitting session'),
				delay(250)
			]);
			return this._kernel.forceQuit();
		} else {
			throw new Error('Cannot force quit; kernel not started');
		}
	}

	async dispose() {
		this._consoleWidthDisposable?.dispose();
		this._consoleWidthDisposable = undefined;

		await this._lsp.dispose();
		if (this._kernel) {
			await this._kernel.dispose();
		}
	}

	showOutput(channel?: erdos.LanguageRuntimeSessionChannel) {
		if (channel === erdos.LanguageRuntimeSessionChannel.LSP) {
			this._lsp.showOutput();
		} else {
			this._kernel?.showOutput(channel);
		}
	}

	listOutputChannels(): erdos.LanguageRuntimeSessionChannel[] {
		const channels = this._kernel?.listOutputChannels?.() ?? [];
		return [...channels, erdos.LanguageRuntimeSessionChannel.LSP];
	}

	async showProfile() {
		await this._kernel?.showProfile?.();
	}

	updateSessionName(sessionName: string): void {
		this.dynState.sessionName = sessionName;
		this._kernel?.updateSessionName(sessionName);
	}

	async getLocale(): Promise<Locale> {
		try {
			const locale: Locale = await this.callMethod('get_locale');
			return locale;
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			throw new Error(`Error getting locale information: ${runtimeError.message} ` +
				`(${runtimeError.code})`);
		}
	}

	async getEnvVars(envVarNames: string[]): Promise<EnvVar[]> {
		try {
			const envVars: EnvVar[] = await this.callMethod('get_env_vars', envVarNames);
			return envVars;
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			throw new Error(`Error getting environment variable(s) ${envVarNames}: ${runtimeError.message} ` +
				`(${runtimeError.code})`);
		}
	}

	public async packageVersion(
		pkgName: string,
		minimumVersion: string | null = null,
		refresh: boolean = false
	): Promise<RPackageInstallation | null> {
		const cacheKey = `${pkgName}>=${minimumVersion ?? '0.0.0'}`;

		if (!refresh) {
			if (this._packageCache.has(cacheKey)) {
				return this._packageCache.get(cacheKey)!;
			}

			if (minimumVersion === null) {
				for (const key of this._packageCache.keys()) {
					if (key.startsWith(pkgName)) {
						return this._packageCache.get(key)!;
					}
				}
			}
		}

		for (const key of this._packageCache.keys()) {
			if (key.startsWith(pkgName)) {
				this._packageCache.delete(key);
			}
		}

		const pkgInst = await this._getPackageVersion(pkgName, minimumVersion);

		if (pkgInst) {
			this._packageCache.set(cacheKey, pkgInst);
		}

		return pkgInst;
	}

	private async _getPackageVersion(
		pkgName: string,
		minimumVersion: string | null = null
	): Promise<RPackageInstallation | null> {
		let pkg: any;
		try {
			pkg = await this.callMethod('packageVersion', pkgName, minimumVersion);
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			throw new Error(`Error getting version of package ${pkgName}: ${runtimeError.message} (${runtimeError.code})`);
		}

		if (pkg.version === null) {
			return null;
		}

		const pkgInst: RPackageInstallation = {
			packageName: pkgName,
			packageVersion: pkg.version,
			minimumVersion: minimumVersion ?? '0.0.0',
			compatible: pkg.compatible
		};

		return pkgInst;
	}

	async checkInstalled(pkgName: string, minimumVersion: string | null = null): Promise<boolean> {
		let pkgInst = await this.packageVersion(pkgName, minimumVersion);
		const installed = pkgInst !== null;
		let compatible = pkgInst?.compatible ?? false;
		if (compatible) {
			return true;
		}

		const title = installed
			? vscode.l10n.t('Insufficient package version')
			: vscode.l10n.t('Missing R package');
		const message = installed
			? vscode.l10n.t(
				'The {0} package is installed at version {1}, but version {2} is required.',
				pkgName, pkgInst!.packageVersion, minimumVersion as string
			)
			: vscode.l10n.t('The {0} package is required, but not installed.', pkgName);
		const okButtonTitle = installed
			? vscode.l10n.t('Update now')
			: vscode.l10n.t('Install now');

		const install = await erdos.window.showSimpleModalDialogPrompt(
			title,
			message,
			okButtonTitle
		);
		if (!install) {
			return false;
		}

		const id = randomUUID();

		const promise = new Promise<void>(resolve => {
			const disp = this.onDidReceiveRuntimeMessage(runtimeMessage => {
				if (runtimeMessage.parent_id === id &&
					runtimeMessage.type === erdos.LanguageRuntimeMessageType.State) {
					const runtimeMessageState = runtimeMessage as erdos.LanguageRuntimeState;
					if (runtimeMessageState.state === erdos.RuntimeOnlineState.Idle) {
						resolve();
						disp.dispose();
					}
				}
			});
		});

		this.execute(`install.packages("${pkgName}")`,
			id,
			erdos.RuntimeCodeExecutionMode.Interactive,
			erdos.RuntimeErrorBehavior.Continue);

		await Promise.race([promise, timeout(2e4, 'waiting for package installation')]);

		pkgInst = await this.packageVersion(pkgName, minimumVersion, true);
		compatible = pkgInst?.compatible ?? false;
		return compatible;
	}

	async isPackageAttached(packageName: string): Promise<boolean> {
		let attached = false;

		try {
			attached = await this.callMethod('isPackageAttached', packageName);
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			vscode.window.showErrorMessage(vscode.l10n.t(
				`Error checking if '${packageName}' is attached: ${runtimeError.message} ` +
				`(${runtimeError.code})`
			));
		}

		return attached;
	}

	private async createKernel(): Promise<JupyterLanguageRuntimeSession> {
		const ext = vscode.extensions.getExtension('erdos.erdos-supervisor');
		if (!ext) {
			throw new Error('Erdos Supervisor extension not found');
		}
		if (!ext.isActive) {
			await ext.activate();
		}
		this.adapterApi = ext?.exports as ErdosSupervisorApi;

		const kernel = this.kernelSpec ?
			await this.adapterApi.createSession(
				this.runtimeMetadata,
				this.metadata,
				this.kernelSpec,
				this.dynState,
				this.extra) :

			await this.adapterApi.restoreSession(
				this.runtimeMetadata,
				this.metadata,
				this.dynState);

		kernel.onDidChangeRuntimeState((state) => {
			this._stateEmitter.fire(state);
		});
		kernel.onDidReceiveRuntimeMessage((message) => {
			this.onMessage(message);
		});
		kernel.onDidEndSession((exit) => {
			this._exitEmitter.fire(exit);
		});

		return kernel;
	}

	private onMessage(message: erdos.LanguageRuntimeMessage): void {
		console.log(`ERDOS_R_DEBUG: Received message - type: ${message.type}, id: ${message.id}`);
		let delivered = false;

		if (message.type === erdos.LanguageRuntimeMessageType.Output) {

			const msg = message as erdos.LanguageRuntimeOutput;
			if (Object.keys(msg.data).includes('application/vnd.r.htmlwidget')) {

				const widget = msg.data['application/vnd.r.htmlwidget'] as any as RHtmlWidget;
				const webMsg = msg as erdos.LanguageRuntimeWebOutput;

				webMsg.resource_roots = getResourceRoots(widget);

				const sizing = widget.sizing_policy;
				webMsg.output_location = sizing?.knitr?.figure ?
					erdos.ErdosOutputLocation.Plot :
					erdos.ErdosOutputLocation.Viewer;

				this._messageEmitter.fire(message);
				delivered = true;
			}
		}

		if (!delivered) {
			this._messageEmitter.fire(message);
		}
	}

	public async activateLsp(reason: string): Promise<void> {
		this._kernel?.emitJupyterLog(
			`Queuing LSP activation. Reason: ${reason}. ` +
			`Queue size: ${this._lspQueue.size}, ` +
			`pending: ${this._lspQueue.pending}`,
			vscode.LogLevel.Debug,
		);
		return this._lspQueue.add(async () => {
			if (!this._kernel) {
				LOGGER.warn('Cannot activate LSP; kernel not started');
				return;
			}

			this._kernel.emitJupyterLog(
				`LSP activation started. Reason: ${reason}. ` +
				`Queue size: ${this._lspQueue.size}, ` +
				`pending: ${this._lspQueue.pending}`,
				vscode.LogLevel.Debug,
			);

			if (this._lsp.state !== LspState.stopped && this._lsp.state !== LspState.uninitialized) {
				this._kernel.emitJupyterLog('LSP already active', vscode.LogLevel.Debug);
				return;
			}

			this._kernel.emitJupyterLog('Starting Erdos LSP server');

			this._lspClientId = this._kernel.createErdosLspClientId();
			this._lspStartingPromise = this._kernel.startErdosLsp(this._lspClientId, '127.0.0.1');
			let port: number;
			try {
				port = await this._lspStartingPromise;
			} catch (err) {
				this._kernel.emitJupyterLog(`Error starting Erdos LSP: ${err}`, vscode.LogLevel.Error);
				return;
			}

			this._kernel.emitJupyterLog(`Starting Erdos LSP client on port ${port}`);

			await this._lsp.activate(port);
		});
	}

	public async deactivateLsp(reason: string): Promise<void> {
		this._kernel?.emitJupyterLog(
			`Queuing LSP deactivation. Reason: ${reason}. ` +
			`Queue size: ${this._lspQueue.size}, ` +
			`pending: ${this._lspQueue.pending}`,
			vscode.LogLevel.Debug,
		);
		return this._lspQueue.add(async () => {
			this._kernel?.emitJupyterLog(
				`LSP deactivation started. Reason: ${reason}. ` +
				`Queue size: ${this._lspQueue.size}, ` +
				`pending: ${this._lspQueue.pending}`,
				vscode.LogLevel.Debug,
			);
			if (this._lsp.state !== LspState.running) {
				this._kernel?.emitJupyterLog('LSP already deactivated', vscode.LogLevel.Debug);
				return;
			}
			this._kernel?.emitJupyterLog(`Stopping Erdos LSP server`);
			await this._lsp.deactivate();
			if (this._lspClientId) {
				this._kernel?.removeClient(this._lspClientId);
				this._lspClientId = undefined;
			}
			this._kernel?.emitJupyterLog(`Erdos LSP server stopped`, vscode.LogLevel.Debug);
		});
	}

	async waitLsp(): Promise<boolean> {
		return await this._lsp.wait();
	}

	private async startDap(): Promise<void> {
		if (this._kernel) {
			try {
				let clientId = this._kernel.createErdosDapClientId();
				await this._kernel.startErdosDap(clientId, 'ark', 'Ark Erdos R');
			} catch (err) {
				this._kernel.emitJupyterLog(`Error starting DAP: ${err}`, vscode.LogLevel.Error);
			}
		}
	}

	private async onStateChange(state: erdos.RuntimeState): Promise<void> {
		this._state = state;
		if (state === erdos.RuntimeState.Ready) {
			await this.startDap();
			await this.setConsoleWidth();
		} else if (state === erdos.RuntimeState.Exited) {
			await this.deactivateLsp('session exited');
		}
	}

	private async setConsoleWidth(): Promise<void> {
		try {
			const width = await erdos.window.getConsoleWidth();
			this.callMethod('setConsoleWidth', width);
			this._kernel?.emitJupyterLog(`Set initial console width to ${width}`);
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			this._kernel?.emitJupyterLog(
				`Error setting initial console width: ${runtimeError.message} (${runtimeError.code})`,
				vscode.LogLevel.Error,
			);
		}
	}

	private async showHelpTopic(topic: string): Promise<void> {
		try {
			const result = await this.callMethod('showHelpTopic', topic);
			if (!result) {
				vscode.window.showWarningMessage(
					`The requested help topic '${topic}' was not found.`);
			}
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			vscode.window.showErrorMessage(
				`Error showing help topic '${topic}': ${runtimeError.message} ` +
				`(${runtimeError.code})`);
		}
	}

	private async showVignetteTopic(topic: string): Promise<void> {
		try {
			const result = await this.callMethod('showVignetteTopic', topic);
			if (!result) {
				vscode.window.showWarningMessage(
					`The requested vignette topic '${topic}' was not found.`);
			}
		} catch (err) {
			const runtimeError = err as erdos.RuntimeMethodError;
			vscode.window.showErrorMessage(
				`Error showing vignette topic '${topic}': ${runtimeError.message} ` +
				`(${runtimeError.code})`);
		}
	}
}

export function createJupyterKernelExtra(): JupyterKernelExtra {
	return {
		attachOnStartup: new ArkAttachOnStartup(),
		sleepOnStartup: new ArkDelayStartup(),
	};
}

export async function checkInstalled(pkgName: string,
	pkgVersion?: string,
	session?: RSession): Promise<boolean> {
	session = session || RSessionManager.instance.getConsoleSession();
	if (session) {
		return session.checkInstalled(pkgName, pkgVersion);
	}
	throw new Error(`Cannot check install status of ${pkgName}; no R session available`);
}

export async function getLocale(session?: RSession): Promise<Locale> {
	session = session || RSessionManager.instance.getConsoleSession();
	if (session) {
		return session.getLocale();
	}
	throw new Error(`Cannot get locale information; no R session available`);
}

export async function getEnvVars(envVars: string[], session?: RSession): Promise<EnvVar[]> {
	session = session || RSessionManager.instance.getConsoleSession();
	if (session) {
		return session.getEnvVars(envVars);
	}
	throw new Error(`Cannot get env var information; no R session available`);
}