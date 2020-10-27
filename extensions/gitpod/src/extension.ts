/// <reference path='../../../src/vs/vscode.d.ts'/>

// TODO get rid of loading inversify and reflect-metadata
require('reflect-metadata');
import psTree = require('ps-tree');
import WebSocket = require('ws');
import ReconnectingWebSocket from 'reconnecting-websocket';
import { GitpodClient, GitpodServer, GitpodServiceImpl } from '@gitpod/gitpod-protocol/lib/gitpod-service';
import { JsonRpcProxyFactory } from '@gitpod/gitpod-protocol/lib/messaging/proxy-factory';
import { InfoServiceClient } from '@gitpod/supervisor-api-grpc/lib/info_grpc_pb';
import { WorkspaceInfoRequest, WorkspaceInfoResponse } from '@gitpod/supervisor-api-grpc/lib/info_pb';
import { StatusServiceClient } from '@gitpod/supervisor-api-grpc/lib/status_grpc_pb';
import { ControlServiceClient } from '@gitpod/supervisor-api-grpc/lib/control_grpc_pb';
import { PortsStatus, PortsStatusRequest, PortsStatusResponse, TasksStatusRequest, TasksStatusResponse, TaskState, TaskStatus, PortVisibility, OnPortExposedAction } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { TerminalServiceClient } from '@gitpod/supervisor-api-grpc/lib/terminal_grpc_pb';
import { CloseTerminalRequest, CloseTerminalResponse } from '@gitpod/supervisor-api-grpc/lib/terminal_pb';
import { TokenServiceClient } from '@gitpod/supervisor-api-grpc/lib/token_grpc_pb';
import { GetTokenRequest, GetTokenResponse } from '@gitpod/supervisor-api-grpc/lib/token_pb';
import { ExposePortRequest, ExposePortResponse } from '@gitpod/supervisor-api-grpc/lib/control_pb';
import * as workspaceInstance from '@gitpod/gitpod-protocol/lib/workspace-instance';
import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import * as util from 'util';
import * as vscode from 'vscode';
import { ConsoleLogger, listen as doListen } from 'vscode-ws-jsonrpc';

const devMode = !!process.env['VSCODE_DEV'];

export async function activate(context: vscode.ExtensionContext) {
	const supervisorAddr = process.env.SUPERVISOR_ADDR || 'localhost:22999';
	const statusServiceClient = new StatusServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const controlServiceClient = new ControlServiceClient(supervisorAddr, grpc.credentials.createInsecure());

	const infoServiceClient = new InfoServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const workspaceInfoResponse = await util.promisify<WorkspaceInfoRequest, WorkspaceInfoResponse>(infoServiceClient.workspaceInfo.bind(infoServiceClient))(new WorkspaceInfoRequest());
	const workspaceId = workspaceInfoResponse.getWorkspaceId();

	//#region server connection
	const factory = new JsonRpcProxyFactory<GitpodServer>();
	const gitpodService = new GitpodServiceImpl<GitpodClient, GitpodServer>(factory.createProxy());
	(async () => {
		const tokenServiceClient = new TokenServiceClient(supervisorAddr, grpc.credentials.createInsecure());
		const gitpodApi = workspaceInfoResponse.getGitpodApi()!;

		const getTokenRequest = new GetTokenRequest();
		getTokenRequest.setHost(gitpodApi.getHost());
		getTokenRequest.addScope('function:openPort');
		getTokenRequest.addScope('function:stopWorkspace');
		getTokenRequest.addScope('resource:workspace::' + workspaceId + '::get/update');
		const getTokenResponse = await util.promisify<GetTokenRequest, GetTokenResponse>(tokenServiceClient.getToken.bind(tokenServiceClient))(getTokenRequest);
		const serverToken = getTokenResponse.getToken();

		class GitpodServerWebSocket extends WebSocket {
			constructor(address: string, protocols?: string | string[]) {
				super(address, protocols, {
					headers: {
						'Origin': new URL(gitpodApi.getEndpoint()).origin,
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
		exposed: PortsStatus.ExposedPortInfo.AsObject
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

		updatePortsStatus(portsStatus: PortsStatusResponse, initial: boolean): void {
			const toClean = initial ? new Set<number>(this.ports.ports.keys()) : undefined;
			for (const ports of [portsStatus.getAddedList(), portsStatus.getUpdatedList()]) {
				for (const portStatus of ports) {
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
			}
			for (const ports of [portsStatus.getRemovedList(), toClean]) {
				if (ports === undefined) {
					return;
				}
				for (const portNumber of ports) {
					this.ports.ports.delete(portNumber);
				}
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
				let initial = true;
				try {
					const req = new PortsStatusRequest();
					req.setObserve(true);
					const evts = statusServiceClient.portsStatus(req);
					stopUpdates = evts.cancel;

					await new Promise((resolve, reject) => {
						evts.on('close', resolve);
						evts.on('error', reject);
						evts.on('data', (update: PortsStatusResponse) => {
							gitpodWorkspaceTreeDataProvider.updatePortsStatus(update, initial);
							initial = false;
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
	const tasks = new Map<string, TaskStatus>();
	const onDidChangeTasks = new vscode.EventEmitter<TaskStatus[]>();
	context.subscriptions.push(onDidChangeTasks);
	const initialTasks = new Promise<TaskStatus[]>(resolve => {
		const listener = onDidChangeTasks.event(tasks => {
			listener.dispose();
			resolve(tasks);
		});
	});

	function getTaskId(terminal: vscode.Terminal): string | undefined {
		return 'env' in terminal.creationOptions && !!terminal.creationOptions.env && terminal.creationOptions.env['GITPOD_TASK_ID'] || undefined;
	}
	const terminalServiceClient = new TerminalServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	context.subscriptions.push(vscode.window.onDidCloseTerminal(async terminal => {
		const taskId = getTaskId(terminal);
		const task = taskId && tasks.get(taskId);
		if (task && task.getState() === TaskState.RUNNING) {
			const request = new CloseTerminalRequest();
			request.setAlias(task.getTerminal());
			try {
				await util.promisify<CloseTerminalRequest, CloseTerminalResponse>(terminalServiceClient.close.bind(terminalServiceClient))(request);
			} catch (e) {
				console.error(`Failed to close the remote terminal "${task.getTerminal()}" for "${taskId}" task:`, e);
			}
		}
	}));
	const pendingSupervisorBin = (async () => {
		let supervisor = '/.supervisor/supervisor';
		if (devMode) {
			try {
				await util.promisify(fs.stat)(supervisor);
			} catch (e) {
				supervisor = '/theia/supervisor';
				try {
					await util.promisify(fs.stat)(supervisor);
				} catch {
					throw e;
				}
			}
		}
		return supervisor;
	})();
	async function updateTerminals(tasks: TaskStatus[]): Promise<void> {
		for (const task of tasks) {
			try {
				const terminal = vscode.window.terminals.find(terminal => getTaskId(terminal) === task.getId());
				if (!terminal) {
					continue;
				}
				if (task.getState() === TaskState.CLOSED) {
					terminal.dispose();
					continue;
				}
				if (task.getState() !== TaskState.RUNNING) {
					continue;
				}
				const processId = await terminal.processId;
				if (!processId) {
					continue;
				}
				const [supervisorBin, children] = await Promise.all([
					pendingSupervisorBin,
					util.promisify(psTree)(processId)
				]);
				const supervisorCommand = path.basename(supervisorBin);
				if (children.some(child => child.COMMAND === supervisorCommand)) {
					continue;
				}
				terminal.sendText(`${supervisorBin} terminal attach -ir ${task.getTerminal()}`, true);
			} catch (e) {
				console.error('Failed to update Gitpod task terminal:', e);
			}
		}
	}
	initialTasks.then(tasks => {
		for (const task of tasks) {
			try {
				if (task.getState() === TaskState.CLOSED) {
					continue;
				}
				let terminal = vscode.window.terminals.find(terminal => getTaskId(terminal) === task.getId());
				if (!terminal) {
					terminal = vscode.window.createTerminal({
						name: task.getPresentation()?.getName(),
						env: {
							'GITPOD_TASK_ID': task.getId()
						}
					});
					// TODO layout
					terminal.show(false);
				}
			} catch (e) {
				console.error('Failed to initialize the Gitpod task terminal:', e);
			}
		}
		updateTerminals(tasks);
		onDidChangeTasks.event(tasks => updateTerminals(tasks));
	});

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
							for (const task of response.getTasksList()) {
								tasks.set(task.getId(), task);
							}
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
	context.subscriptions.push(observeTaskStatus());
	//#endregion


}

export function deactivate() { }
