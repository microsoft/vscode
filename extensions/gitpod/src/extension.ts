/// <reference path='../../../src/vs/vscode.d.ts'/>
/// <reference path='../../../src/vs/vscode.proposed.d.ts'/>

// TODO get rid of loading inversify and reflect-metadata
require('reflect-metadata');
import * as uuid from 'uuid';
import WebSocket = require('ws');
import { GitpodHostUrl } from '@gitpod/gitpod-protocol/lib/util/gitpod-host-url';
import { GitpodClient, GitpodServer, GitpodServiceImpl } from '@gitpod/gitpod-protocol/lib/gitpod-service';
import { JsonRpcProxyFactory } from '@gitpod/gitpod-protocol/lib/messaging/proxy-factory';
import * as workspaceInstance from '@gitpod/gitpod-protocol/lib/workspace-instance';
import { ControlServiceClient } from '@gitpod/supervisor-api-grpc/lib/control_grpc_pb';
import { ExposePortRequest, ExposePortResponse } from '@gitpod/supervisor-api-grpc/lib/control_pb';
import { InfoServiceClient } from '@gitpod/supervisor-api-grpc/lib/info_grpc_pb';
import { WorkspaceInfoRequest, WorkspaceInfoResponse } from '@gitpod/supervisor-api-grpc/lib/info_pb';
import { StatusServiceClient } from '@gitpod/supervisor-api-grpc/lib/status_grpc_pb';
import { OnPortExposedAction, PortsStatus, PortsStatusRequest, PortsStatusResponse, PortVisibility, TasksStatusRequest, TasksStatusResponse, TaskState, TaskStatus, ExposedPortInfo } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { TerminalServiceClient } from '@gitpod/supervisor-api-grpc/lib/terminal_grpc_pb';
import { CloseTerminalRequest, ListenTerminalRequest, ListenTerminalResponse, SetTerminalSizeRequest, WriteTerminalRequest } from '@gitpod/supervisor-api-grpc/lib/terminal_pb';
import { TokenServiceClient } from '@gitpod/supervisor-api-grpc/lib/token_grpc_pb';
import { GetTokenRequest, GetTokenResponse } from '@gitpod/supervisor-api-grpc/lib/token_pb';
import * as grpc from '@grpc/grpc-js';
import ReconnectingWebSocket from 'reconnecting-websocket';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { URL } from 'url';
import * as util from 'util';
import * as vscode from 'vscode';
import { ConsoleLogger, listen as doListen } from 'vscode-ws-jsonrpc';

export async function activate(context: vscode.ExtensionContext) {
	const supervisorAddr = process.env.SUPERVISOR_ADDR || 'localhost:22999';
	const statusServiceClient = new StatusServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const controlServiceClient = new ControlServiceClient(supervisorAddr, grpc.credentials.createInsecure());

	const infoServiceClient = new InfoServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const workspaceInfoResponse = await util.promisify<WorkspaceInfoRequest, WorkspaceInfoResponse>(infoServiceClient.workspaceInfo.bind(infoServiceClient))(new WorkspaceInfoRequest());
	const workspaceId = workspaceInfoResponse.getWorkspaceId();
	const gitpodHost = workspaceInfoResponse.getGitpodHost();

	//#region server connection
	const factory = new JsonRpcProxyFactory<GitpodServer>();
	const gitpodService = new GitpodServiceImpl<GitpodClient, GitpodServer>(factory.createProxy());
	(async () => {
		const tokenServiceClient = new TokenServiceClient(supervisorAddr, grpc.credentials.createInsecure());
		const gitpodApi = workspaceInfoResponse.getGitpodApi()!;

		const getTokenRequest = new GetTokenRequest();
		getTokenRequest.setKind('gitpod');
		getTokenRequest.setHost(gitpodApi.getHost());
		getTokenRequest.addScope('function:getToken');
		getTokenRequest.addScope('function:openPort');
		getTokenRequest.addScope('function:stopWorkspace');
		getTokenRequest.addScope('resource:workspace::' + workspaceId + '::get/update');
		const getTokenResponse = await util.promisify<GetTokenRequest, GetTokenResponse>(tokenServiceClient.getToken.bind(tokenServiceClient))(getTokenRequest);
		const serverToken = getTokenResponse.getToken();

		class GitpodServerWebSocket extends WebSocket {
			constructor(address: string, protocols?: string | string[]) {
				super(address, protocols, {
					headers: {
						'Origin': new URL(gitpodHost).origin,
						'Authorization': `Bearer ${serverToken}`
					}
				});
			}
		}
		const webSocket = new ReconnectingWebSocket(gitpodApi.getEndpoint(), undefined, {
			maxReconnectionDelay: 10000,
			minReconnectionDelay: 1000,
			reconnectionDelayGrowFactor: 1.3,
			connectionTimeout: 10000,
			maxRetries: Infinity,
			debug: false,
			startClosed: false,
			WebSocket: GitpodServerWebSocket
		});
		context.subscriptions.push(new vscode.Disposable(() => {
			webSocket.close();
		}));
		webSocket.onerror = console.error;
		doListen({
			webSocket,
			onConnection: connection => factory.listen(connection),
			logger: new ConsoleLogger()
		});
	})();
	//#endregion

	//#region workspace commands
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.openWorkspaces', () =>
		vscode.env.openExternal(vscode.Uri.parse(gitpodHost))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.openAccessControl', () =>
		vscode.env.openExternal(vscode.Uri.parse(new GitpodHostUrl(gitpodHost).asAccessControl().toString()))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.stopWorkspace', () =>
		gitpodService.server.stopWorkspace(workspaceId)
	));
	//#endregion

	//#region workspace view
	class GitpodWorkspacePort extends vscode.TreeItem {
		status?: PortsStatus.AsObject;
		constructor(readonly portNumber: number) {
			super('' + portNumber);
		}
		async setVisibility(visibility: workspaceInstance.PortVisibility): Promise<void> {
			if (this.status) {
				await gitpodService.server.openPort(workspaceId, {
					port: this.status.localPort,
					targetPort: this.status.globalPort,
					visibility
				});
			}
		}
	}

	interface ExposedServedPort extends PortsStatus.AsObject {
		served: true
		exposed: ExposedPortInfo.AsObject
	}
	function isExposedServedPort(port: PortsStatus.AsObject | undefined): port is ExposedServedPort {
		return !!port?.exposed && !!port.served;
	}
	interface ExposedServedGitpodWorkspacePort extends GitpodWorkspacePort {
		status: ExposedServedPort
	}
	function isExposedServedGitpodWorkspacePort(port: GitpodWorkspacePort | undefined): port is ExposedServedGitpodWorkspacePort {
		return port instanceof GitpodWorkspacePort && isExposedServedPort(port.status);
	}

	class GitpodWorksapcePorts extends vscode.TreeItem {
		readonly ports = new Map<number, GitpodWorkspacePort>();
		constructor() {
			super('Ports', vscode.TreeItemCollapsibleState.Expanded);
		}
	}

	type GitpodWorkspaceElement = GitpodWorksapcePorts | GitpodWorkspacePort;

	class GitpodWorkspaceTreeDataProvider implements vscode.TreeDataProvider<GitpodWorkspaceElement> {

		readonly ports = new GitpodWorksapcePorts();

		protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<GitpodWorkspaceElement | undefined>();
		readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

		private readonly onDidExposeServedPortEmitter = new vscode.EventEmitter<ExposedServedGitpodWorkspacePort>();
		readonly onDidExposeServedPort = this.onDidExposeServedPortEmitter.event;

		constructor() {
		}

		getTreeItem(element: GitpodWorkspaceElement): vscode.TreeItem {
			return element;
		}

		getChildren(element?: GitpodWorkspaceElement): vscode.ProviderResult<GitpodWorkspaceElement[]> {
			if (!element) {
				return [this.ports];
			}
			if (element === this.ports) {
				return [...this.ports.ports.values()];
			}
			return [];
		}

		getParent(element: GitpodWorkspaceElement): GitpodWorkspaceElement | undefined {
			if (element instanceof GitpodWorkspacePort) {
				return this.ports;
			}
			return undefined;
		}

		updatePortsStatus(portsStatus: PortsStatusResponse): void {
			const toClean = new Set<number>(this.ports.ports.keys());
			for (const portStatus of portsStatus.getPortsList()) {
				const portNumber = portStatus.getLocalPort();
				toClean?.delete(portNumber);
				const port = this.ports.ports.get(portNumber) || new GitpodWorkspacePort(portNumber);
				this.ports.ports.set(portNumber, port);
				const currentStatus = port.status;
				port.status = portStatus.toObject();

				const exposed = portStatus.getExposed();
				if (!portStatus.getServed()) {
					port.description = 'not served';
					port.iconPath = new vscode.ThemeIcon('circle-slash');
				} else if (!exposed) {
					port.description = 'detecting...';
					port.iconPath = new vscode.ThemeIcon('circle-outline');
				} else {
					port.description = `open ${exposed.getVisibility() === PortVisibility.PUBLIC ? '(public)' : '(private)'}`;
					port.iconPath = new vscode.ThemeIcon('circle-filled');
				}

				port.contextValue = 'port';
				if (portStatus.getServed()) {
					port.contextValue = 'served-' + port.contextValue;
				}
				if (exposed) {
					port.contextValue = 'exposed-' + port.contextValue;
					if (exposed.getVisibility() === PortVisibility.PUBLIC) {
						port.contextValue = 'public-' + port.contextValue;
					} else {
						port.contextValue = 'private-' + port.contextValue;
					}
				}
				if (isExposedServedGitpodWorkspacePort(port) && !isExposedServedPort(currentStatus)) {
					this.onDidExposeServedPortEmitter.fire(port);
				}
			}

			for (const portNumber of toClean) {
				this.ports.ports.delete(portNumber);
			}

			this.onDidChangeTreeDataEmitter.fire(this.ports);
		}

	}

	const gitpodWorkspaceTreeDataProvider = new GitpodWorkspaceTreeDataProvider();
	const workspaceView = vscode.window.createTreeView('gitpod.workspace', {
		treeDataProvider: gitpodWorkspaceTreeDataProvider,
	});
	context.subscriptions.push(workspaceView);
	//#endregion

	//#region port
	function observePortsStatus(): vscode.Disposable {
		let run = true;
		let stopUpdates: Function | undefined;
		(async () => {
			while (run) {
				try {
					const req = new PortsStatusRequest();
					req.setObserve(true);
					const evts = statusServiceClient.portsStatus(req);
					stopUpdates = evts.cancel;

					await new Promise((resolve, reject) => {
						evts.on('close', resolve);
						evts.on('error', reject);
						evts.on('data', (update: PortsStatusResponse) => {
							gitpodWorkspaceTreeDataProvider.updatePortsStatus(update);
						});
					});
				} catch (err) {
					console.error('cannot maintain connection to supervisor', err);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		})();
		return new vscode.Disposable(() => {
			run = false;
			if (stopUpdates) {
				stopUpdates();
			}
		});
	}
	context.subscriptions.push(observePortsStatus());
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.resolveExternalPort', (portNumber: number) => {
		return new Promise<string>(async (resolve, reject) => {
			try {
				const tryResolve = () => {
					const port = gitpodWorkspaceTreeDataProvider.ports.ports.get(portNumber);
					const exposed = port?.status?.exposed;
					if (exposed) {
						resolve(exposed.url);
						return true;
					}
					return false;
				};
				if (!tryResolve()) {
					const listener = gitpodWorkspaceTreeDataProvider.onDidChangeTreeData(element => {
						if (element === gitpodWorkspaceTreeDataProvider.ports && tryResolve()) {
							listener.dispose();
						}
					});
					const request = new ExposePortRequest();
					request.setPort(portNumber);
					request.setTargetPort(portNumber);
					await util.promisify<ExposePortRequest, ExposePortResponse>(controlServiceClient.exposePort).bind(controlServiceClient)(request);
				}
			} catch (e) {
				reject(e);
			}
		});
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.makePrivate', (port: GitpodWorkspacePort) =>
		port.setVisibility('private')
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.makePublic', (port: GitpodWorkspacePort) =>
		port.setVisibility('public')
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.openBrowser', (port: GitpodWorkspacePort) => {
		const publicUrl = port.status?.exposed?.url;
		if (publicUrl) {
			// TODO(ak) add gitpod server subdomains as trusted to linkProtectionTrustedDomains during the build
			vscode.env.openExternal(vscode.Uri.parse(publicUrl));
		}
	}));

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	context.subscriptions.push(statusBarItem);
	function updateStatusBar(): void {
		const exposedPorts: number[] = [];

		for (const port of gitpodWorkspaceTreeDataProvider.ports.ports.values()) {
			if (isExposedServedGitpodWorkspacePort(port)) {
				exposedPorts.push(port.status.localPort);
			}
		}

		let text: string;
		let tooltip = 'Click to open "Ports View"';
		if (exposedPorts.length) {
			text = 'Ports:';
			tooltip += '\n\nPorts';
			text += ` ${exposedPorts.join(', ')}`;
			tooltip += `\nPublic: ${exposedPorts.join(', ')}`;
		} else {
			text = '$(circle-slash) No open ports';
		}

		statusBarItem.text = text;
		statusBarItem.tooltip = tooltip;
		statusBarItem.command = 'gitpod.ports.reveal';
		statusBarItem.show();
	}
	updateStatusBar();
	context.subscriptions.push(gitpodWorkspaceTreeDataProvider.onDidChangeTreeData(() => updateStatusBar()));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.reveal', () => {
		workspaceView.reveal(gitpodWorkspaceTreeDataProvider.ports, {
			focus: true,
			expand: true
		});
	}));

	const currentNotifications = new Set<number>();
	async function showOpenServiceNotification(port: ExposedServedGitpodWorkspacePort, offerMakePublic = false): Promise<void> {
		const localPort = port.status.localPort;
		if (currentNotifications.has(localPort)) {
			return;
		}

		const makePublic = 'Make Public';
		const openExternalAction = 'Open Browser';
		const actions = offerMakePublic ? [makePublic, openExternalAction] : [openExternalAction];

		currentNotifications.add(localPort);
		const result = await vscode.window.showInformationMessage('A service is available on port ' + localPort, ...actions);
		currentNotifications.delete(localPort);

		if (result === makePublic) {
			await port.setVisibility('public');
		} else if (result === openExternalAction) {
			await vscode.env.openExternal(vscode.Uri.parse(port.status.exposed.url));
		}
	}
	context.subscriptions.push(gitpodWorkspaceTreeDataProvider.onDidExposeServedPort(port => {
		if (port.status.exposed.onExposed === OnPortExposedAction.IGNORE) {
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.OPEN_BROWSER) {
			vscode.env.openExternal(vscode.Uri.parse(port.status.exposed.url));
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.OPEN_PREVIEW ||
			port.status.exposed.onExposed === OnPortExposedAction.NOTIFY) {
			showOpenServiceNotification(port);
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.NOTIFY_PRIVATE) {
			showOpenServiceNotification(port, port.status.exposed.visibility !== PortVisibility.PUBLIC);
			return;
		}
	}));
	//#endregion

	//#region terminal tasks
	const terminalServiceClient = new TerminalServiceClient(supervisorAddr, grpc.credentials.createInsecure());

	const onDidChangeTasks = new vscode.EventEmitter<TaskStatus[]>();
	context.subscriptions.push(onDidChangeTasks);

	class GitpodPty implements vscode.Pseudoterminal {
		private readonly onDidWriteEmitter = new vscode.EventEmitter<string>();
		readonly onDidWrite = this.onDidWriteEmitter.event;

		private resolveOpen: undefined | ((initialDimensions: vscode.TerminalDimensions | undefined) => void);
		private rejectOpen: undefined | ((reason: Error) => void);
		private readonly pendingOpen = new Promise<vscode.TerminalDimensions | undefined>((resolve, reject) => {
			this.resolveOpen = resolve;
			this.rejectOpen = reject;
		});

		private closed = false;

		/** means dispose */
		close(): void {
			if (this.closed) {
				return;
			}
			this.closed = true;
			this.rejectOpen!(new Error('closed'));
			this.onDidWriteEmitter.dispose();
			if (this.stopListen) {
				this.stopListen();
			}
		}

		private alias?: string;
		private stopListen?: Function;
		async listen(alias: string): Promise<void> {
			if (this.alias || this.closed) {
				return;
			}
			this.alias = alias;
			try {
				const initialDimensions = await this.pendingOpen;
				if (initialDimensions) {
					this.setDimensions(initialDimensions);
				}
			} catch {
				/* no-op closed */
			}
			let run = true;
			while (run) {
				await new Promise(resolve => {
					try {
						const request = new ListenTerminalRequest();
						request.setAlias(alias);
						const stream = terminalServiceClient.listen(request);
						this.stopListen = stream.cancel;

						stream.on('close', resolve);
						stream.on('end', () => {
							run = false;
							resolve(undefined);
						});
						stream.on('error', () => {
							run = false;
							resolve(undefined);
						});
						stream.on('data', (response: ListenTerminalResponse) => {
							let data = '';
							for (const buffer of [response.getStdout(), response.getStderr()]) {
								if (typeof buffer === 'string') {
									data += buffer;
								} else {
									data += Buffer.from(buffer).toString();
								}
							}
							if (data !== '') {
								this.onDidWriteEmitter.fire(data);
							}
						});
					} catch (e) {
						resolve(undefined);
					}
				});
				if (this.closed) {
					run = false;
				} else {
					await new Promise(resolve => setTimeout(resolve, 2000));
				}
			}
		}

		open(initialDimensions: vscode.TerminalDimensions | undefined): void {
			this.resolveOpen!(initialDimensions);
		}

		/* it it called after close to kill the underlying terminal */
		kill(): void {
			if (!this.alias) {
				return;
			}
			const request = new CloseTerminalRequest();
			request.setAlias(this.alias);
			terminalServiceClient.close(request, e => {
				if (e) {
					console.error(`[${this.alias}] failed to kill the gitpod task terminal:`, e);
				}
			});
		}

		setDimensions(dimensions: vscode.TerminalDimensions): void {
			if (!this.alias) {
				return;
			}
			const request = new SetTerminalSizeRequest();
			request.setAlias(this.alias);
			request.setCols(dimensions.columns);
			request.setRows(dimensions.rows);
			request.setForce(true);
			terminalServiceClient.setSize(request, e => {
				if (e) {
					console.error(`[${this.alias}] failed to resize the gitpod task terminal:`, e);
				}
			});
		}

		handleInput(data: string): void {
			if (!this.alias) {
				return;
			}
			const request = new WriteTerminalRequest();
			request.setAlias(this.alias);
			request.setStdin(Buffer.from(data));
			terminalServiceClient.write(request, e => {
				if (e) {
					console.error(`[${this.alias}] failed to write to the gitpod task terminal:`, e);
				}
			});
		}

	}
	interface GitpodTerminalOptions extends vscode.ExtensionTerminalOptions {
		pty: GitpodPty
	}
	interface GitpodTerminal extends vscode.Terminal {
		readonly creationOptions: Readonly<GitpodTerminalOptions>;
	}
	const terminals = new Map<string, GitpodTerminal>();
	context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
		if ('pty' in terminal.creationOptions && terminal.creationOptions.pty instanceof GitpodPty) {
			terminal.creationOptions.pty.kill();
		}
	}));
	function updateTerminals(tasks: TaskStatus[]): void {
		for (const task of tasks) {
			try {
				let terminal = terminals.get(task.getId());
				if (task.getState() === TaskState.CLOSED) {
					if (terminal) {
						terminal.dispose();
					}
					continue;
				}

				if (!terminal) {
					terminal = vscode.window.createTerminal(<GitpodTerminalOptions>{
						name: task.getPresentation()?.getName(),
						pty: new GitpodPty()
					}) as GitpodTerminal;
					terminals.set(task.getId(), terminal);

					// TODO layout
					terminal.show(false);
				}

				if (task.getState() !== TaskState.RUNNING || !task.getTerminal()) {
					continue;
				}
				terminal.creationOptions.pty.listen(task.getTerminal());
			} catch (e) {
				console.error('Failed to update Gitpod task terminal:', e);
			}
		}
	}

	function observeTaskStatus(): vscode.Disposable {
		let run = true;
		let stopUpdates: Function | undefined;
		(async () => {
			while (run) {
				try {
					const req = new TasksStatusRequest();
					req.setObserve(true);
					const evts = statusServiceClient.tasksStatus(req);
					stopUpdates = evts.cancel;

					await new Promise((resolve, reject) => {
						evts.on('close', resolve);
						evts.on('error', reject);
						evts.on('data', (response: TasksStatusResponse) => {
							onDidChangeTasks.fire(response.getTasksList());
						});
					});
				} catch (err) {
					console.error('cannot maintain connection to supervisor', err);
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
		})();
		return new vscode.Disposable(() => {
			run = false;
			if (stopUpdates) {
				stopUpdates();
			}
		});
	}

	context.subscriptions.push(onDidChangeTasks.event(tasks => updateTerminals(tasks)));
	context.subscriptions.push(observeTaskStatus());
	//#endregion

	//#region git auth
	const currentAuthService = `${vscode.env.uriScheme}.login`;
	const githubAuthService = `${vscode.env.uriScheme}-github.login`;
	const sessionId = uuid.v4();
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.getPassword', async (service: string, account: string) => {
		if (account !== 'account') {
			return undefined;
		}
		if (service !== githubAuthService && service !== currentAuthService) {
			return undefined;
		}
		try {
			const token = await gitpodService.server.getToken({
				host: 'github.com'
			});
			if (!token) {
				return undefined;
			}
			if (service === currentAuthService) {
				// see https://github.com/gitpod-io/vscode/blob/gp-code/src/vs/workbench/services/authentication/browser/authenticationService.ts#L34
				type AuthenticationSessionInfo = { readonly id: string, readonly accessToken: string, readonly providerId: string, readonly canSignOut?: boolean };
				const currentSession: AuthenticationSessionInfo = {
					id: sessionId,
					accessToken: token.value,
					providerId: 'github',
					canSignOut: false
				};
				return JSON.stringify(currentSession);
			}
			// see https://github.com/gitpod-io/vscode/blob/gp-code/extensions/github-authentication/src/github.ts#L88
			// TODO server should provide proper username and id, right now it is always ouath2
			// luckily GH extension is smart enough to fetch it if missing
			const session: Omit<vscode.AuthenticationSession, 'account'> = {
				id: sessionId,
				accessToken: token.value,
				scopes: token.scopes
			};
			return JSON.stringify([session]);
		} catch (e) {
			console.error('Failed to fetch password', e);
			return undefined;
		}
	}));
	vscode.extensions.getExtension('vscode.github-authentication')?.activate();
	//#endregion

	//#region cli
	const vscodeIpcHookCli = process.env['VSCODE_IPC_HOOK_CLI'];
	if (vscodeIpcHookCli) {
		const cliServerSocketLink = path.join(os.tmpdir(), 'gitpod-cli-server-sockets', process.pid + '.socket');
		(async () => {
			try {
				await util.promisify(fs.symlink)(vscodeIpcHookCli, cliServerSocketLink);
			} catch (e) {
				console.error('Failed to symlink cli server socket:', e);
			}
		})();
	} else {
		console.error('VSCODE_IPC_HOOK_CLI is not defined, cannot create a symlink to the cli server socket');
	}
	//#endregion
}

export function deactivate() { }
