/// <reference path='../../../src/vs/vscode.d.ts'/>
/// <reference path='../../../src/vs/vscode.proposed.d.ts'/>

// TODO get rid of loading inversify and reflect-metadata
require('reflect-metadata');
import { GitpodClient, GitpodServer, GitpodServiceImpl } from '@gitpod/gitpod-protocol/lib/gitpod-service';
import { JsonRpcProxyFactory } from '@gitpod/gitpod-protocol/lib/messaging/proxy-factory';
import { GitpodHostUrl } from '@gitpod/gitpod-protocol/lib/util/gitpod-host-url';
import * as workspaceInstance from '@gitpod/gitpod-protocol/lib/workspace-instance';
import { ControlServiceClient } from '@gitpod/supervisor-api-grpc/lib/control_grpc_pb';
import { ExposePortRequest, ExposePortResponse } from '@gitpod/supervisor-api-grpc/lib/control_pb';
import { InfoServiceClient } from '@gitpod/supervisor-api-grpc/lib/info_grpc_pb';
import { WorkspaceInfoRequest, WorkspaceInfoResponse } from '@gitpod/supervisor-api-grpc/lib/info_pb';
import { NotificationServiceClient } from '@gitpod/supervisor-api-grpc/lib/notification_grpc_pb';
import { NotifyRequest, NotifyResponse, RespondRequest, SubscribeRequest, SubscribeResponse } from '@gitpod/supervisor-api-grpc/lib/notification_pb';
import { StatusServiceClient } from '@gitpod/supervisor-api-grpc/lib/status_grpc_pb';
import { ExposedPortInfo, OnPortExposedAction, PortsStatus, PortsStatusRequest, PortsStatusResponse, PortVisibility } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { TokenServiceClient } from '@gitpod/supervisor-api-grpc/lib/token_grpc_pb';
import { GetTokenRequest, GetTokenResponse } from '@gitpod/supervisor-api-grpc/lib/token_pb';
import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs';
import type * as keytarType from 'keytar';
import fetch from 'node-fetch';
import * as path from 'path';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { URL } from 'url';
import * as util from 'util';
import * as vscode from 'vscode';
import { ConsoleLogger, listen as doListen } from 'vscode-ws-jsonrpc';
import { GitpodPluginModel } from './gitpod-plugin-model';
import WebSocket = require('ws');

export async function activate(context: vscode.ExtensionContext) {
	const pendingActivate: Promise<void>[] = [];
	const supervisorAddr = process.env.SUPERVISOR_ADDR || 'localhost:22999';
	const statusServiceClient = new StatusServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const controlServiceClient = new ControlServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const notificationServiceClient = new NotificationServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const tokenServiceClient = new TokenServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const infoServiceClient = new InfoServiceClient(supervisorAddr, grpc.credentials.createInsecure());
	const workspaceInfoResponse = await util.promisify<WorkspaceInfoRequest, WorkspaceInfoResponse>(infoServiceClient.workspaceInfo.bind(infoServiceClient))(new WorkspaceInfoRequest());
	const checkoutLocation = workspaceInfoResponse.getCheckoutLocation();
	const workspaceId = workspaceInfoResponse.getWorkspaceId();
	const gitpodHost = workspaceInfoResponse.getGitpodHost();
	const gitpodApi = workspaceInfoResponse.getGitpodApi()!;
	const workspaceContextUrl = workspaceInfoResponse.getWorkspaceContextUrl();

	//#region server connection
	const factory = new JsonRpcProxyFactory<GitpodServer>();
	const gitpodService = new GitpodServiceImpl<GitpodClient, GitpodServer>(factory.createProxy());
	const gitpodScopes = new Set<string>([
		'function:getWorkspace',
		'function:openPort',
		'function:stopWorkspace',
		'function:setWorkspaceTimeout',
		'function:getWorkspaceTimeout',
		'resource:workspace::' + workspaceId + '::get/update',
		'function:accessCodeSyncStorage',
		'function:getLoggedInUser'
	]);
	const pendingServerToken = (async () => {
		const getTokenRequest = new GetTokenRequest();
		getTokenRequest.setKind('gitpod');
		getTokenRequest.setHost(gitpodApi.getHost());
		for (const scope of gitpodScopes) {
			getTokenRequest.addScope(scope);
		}
		const getTokenResponse = await util.promisify<GetTokenRequest, GetTokenResponse>(tokenServiceClient.getToken.bind(tokenServiceClient))(getTokenRequest);
		return getTokenResponse.getToken();
	})();
	(async () => {
		const serverToken = await pendingServerToken;

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

	const pendingGetLoggedInUser = gitpodService.server.getLoggedInUser();
	const pendingInstanceListener = gitpodService.listenToInstance(workspaceId);
	//#endregion

	//#region workspace commands
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.dashboard', () =>
		vscode.env.openExternal(vscode.Uri.parse(gitpodHost))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.accessControl', () =>
		vscode.env.openExternal(vscode.Uri.parse(new GitpodHostUrl(gitpodHost).asAccessControl().toString()))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.settings', () =>
		vscode.env.openExternal(vscode.Uri.parse(new GitpodHostUrl(gitpodHost).asSettings().toString()))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.context', () =>
		vscode.env.openExternal(vscode.Uri.parse(workspaceContextUrl))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.documentation', () =>
		vscode.env.openExternal(vscode.Uri.parse('https://www.gitpod.io/docs'))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.community', () =>
		vscode.env.openExternal(vscode.Uri.parse('https://community.gitpod.io'))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.follow', () =>
		vscode.env.openExternal(vscode.Uri.parse('https://twitter.com/gitpod'))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.reportIssue', () =>
		vscode.env.openExternal(vscode.Uri.parse('https://github.com/gitpod-io/gitpod/issues/new/choose'))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.stop.ws', () =>
		gitpodService.server.stopWorkspace(workspaceId)
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.upgradeSubscription', () =>
		vscode.env.openExternal(vscode.Uri.parse(new GitpodHostUrl(gitpodHost).asUpgradeSubscription().toString()))
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ExtendTimeout', async () => {
		try {
			const result = await gitpodService.server.setWorkspaceTimeout(workspaceId, '180m');
			if (result.resetTimeoutOnWorkspaces?.length > 0) {
				vscode.window.showWarningMessage('Workspace timeout has been extended to three hours. This reset the workspace timeout for other workspaces.');
			} else {
				vscode.window.showInformationMessage('Workspace timeout has been extended to three hours.');
			}
		} catch (err) {
			vscode.window.showErrorMessage(`Cannot extend workspace timeout: ${err.toString()}`);
		}
	}));

	const communityStatusBarItem = vscode.window.createStatusBarItem({
		id: 'gitpod.community',
		name: 'Chat with us on Discourse',
		alignment: vscode.StatusBarAlignment.Right,
		priority: -100
	});
	context.subscriptions.push(communityStatusBarItem);
	communityStatusBarItem.text = '$(comment-discussion)';
	communityStatusBarItem.tooltip = 'Chat with us on Discourse';
	communityStatusBarItem.command = 'gitpod.open.community';
	communityStatusBarItem.show();

	(async () => {
		const workspaceTimeout = await gitpodService.server.getWorkspaceTimeout(workspaceId);
		if (!workspaceTimeout.canChange) {
			return;
		}

		const listener = await pendingInstanceListener;
		const extendTimeoutStatusBarItem = vscode.window.createStatusBarItem({
			id: 'gitpod.extendTimeout',
			name: 'Click to extend the workspace timeout.',
			alignment: vscode.StatusBarAlignment.Right,
			priority: -100
		});
		context.subscriptions.push(extendTimeoutStatusBarItem);
		extendTimeoutStatusBarItem.text = '$(watch)';
		extendTimeoutStatusBarItem.command = 'gitpod.ExtendTimeout';
		const update = () => {
			const instance = listener.info.latestInstance;
			if (!instance) {
				extendTimeoutStatusBarItem.hide();
				return;
			}
			extendTimeoutStatusBarItem.tooltip = `Workspace Timeout: ${instance.status.timeout}. Click to extend.`;
			extendTimeoutStatusBarItem.color = instance.status.timeout === '180m' ? new vscode.ThemeColor('notificationsWarningIcon.foreground') : undefined;
			extendTimeoutStatusBarItem.show();
		};
		update();
		context.subscriptions.push(listener.onDidChange(update));
	})();
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
					stopUpdates = evts.cancel.bind(evts);

					await new Promise((resolve, reject) => {
						evts.on('end', resolve);
						evts.on('error', reject);
						evts.on('data', (update: PortsStatusResponse) => {
							gitpodWorkspaceTreeDataProvider.updatePortsStatus(update);
						});
					});
				} catch (err) {
					if (!('code' in err && err.code === grpc.status.CANCELLED)) {
						console.error('cannot maintain connection to supervisor', err);
					}
				} finally {
					stopUpdates = undefined;
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
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
			vscode.env.openExternal(vscode.Uri.parse(publicUrl));
		}
	}));

	const portsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	context.subscriptions.push(portsStatusBarItem);
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

		portsStatusBarItem.text = text;
		portsStatusBarItem.tooltip = tooltip;
		portsStatusBarItem.command = 'gitpod.ports.reveal';
		portsStatusBarItem.show();
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

	//#region auth util
	type Keytar = {
		getPassword: typeof keytarType['getPassword'];
		setPassword: typeof keytarType['setPassword'];
		deletePassword: typeof keytarType['deletePassword'];
	};
	interface SessionData {
		id: string;
		account?: {
			label?: string;
			displayName?: string;
			id: string;
		}
		scopes: string[];
		accessToken: string;
	}
	interface UserInfo {
		id: string;
		accountName: string;
	}
	async function resolveAuthenticationSession(data: SessionData, resolveUser: (data: SessionData) => Promise<UserInfo>): Promise<vscode.AuthenticationSession> {
		const needsUserInfo = !data.account;
		const userInfo = needsUserInfo ? await resolveUser(data) : undefined;
		return {
			id: data.id,
			account: {
				label: data.account
					? data.account.label || data.account.displayName!
					: userInfo!.accountName,
				id: data.account?.id ?? userInfo!.id
			},
			scopes: data.scopes,
			accessToken: data.accessToken
		};
	}
	function hasScopes(session: vscode.AuthenticationSession, scopes?: string[]): boolean {
		return !scopes || scopes.every(scope => session.scopes.indexOf(scope) !== -1);
	}
	//#endregion

	//#region gitpod auth
	pendingActivate.push((async () => {
		const sessions: vscode.AuthenticationSession[] = [];
		const onDidChangeSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		try {
			const keytar: Keytar = require('keytar');
			const value = await keytar.getPassword(`${vscode.env.uriScheme}-gitpod.login`, 'account');
			if (value) {
				await keytar.deletePassword(`${vscode.env.uriScheme}-gitpod.login`, 'account');
				const sessionData: SessionData[] = JSON.parse(value);
				if (sessionData.length) {
					const session = await resolveAuthenticationSession(sessionData[0], async () => {
						const user = await pendingGetLoggedInUser;
						return {
							id: user.id,
							accountName: user.name!
						};
					});
					sessions.push(session);
				}
			}
		} catch (e) {
			console.error('Failed to restore Gitpod session:', e);
		}
		context.subscriptions.push(onDidChangeSessionsEmitter);
		context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('gitpod', 'Gitpod', {
			onDidChangeSessions: onDidChangeSessionsEmitter.event,
			getSessions: scopes => {
				if (!scopes) {
					return Promise.resolve(sessions);
				}
				return Promise.resolve(sessions.filter(session => hasScopes(session, scopes)));
			},
			createSession: async () => {
				throw new Error('not supported');
			},
			removeSession: async () => {
				throw new Error('not supported');
			},
		}, { supportsMultipleAccounts: false }));
	})());
	//#endregion gitpod auth

	//#region github auth
	pendingActivate.push((async () => {
		const onDidChangeGitHubSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		let gitHubSessionID = 'github-session';
		let gitHubSession: vscode.AuthenticationSession | undefined;

		async function resolveGitHubUser(data: SessionData): Promise<UserInfo> {
			const userResponse = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: `token ${data.accessToken}`,
					'User-Agent': 'Gitpod-Code'
				}
			});
			if (!userResponse.ok) {
				throw new Error(`Getting GitHub account info failed: ${userResponse.statusText}`);
			}
			const user: { id: string, login: string } = await userResponse.json();
			return {
				id: user.id,
				accountName: user.login
			};
		}

		async function loginGitHub(scopes?: string[]): Promise<vscode.AuthenticationSession> {
			const getTokenRequest = new GetTokenRequest();
			getTokenRequest.setKind('git');
			getTokenRequest.setHost('github.com');
			if (scopes) {
				for (const scope of scopes) {
					getTokenRequest.addScope(scope);
				}
			}
			const getTokenResponse = await util.promisify<GetTokenRequest, GetTokenResponse>(tokenServiceClient.getToken.bind(tokenServiceClient))(getTokenRequest);
			const accessToken = getTokenResponse.getToken();
			gitHubSession = await resolveAuthenticationSession({
				id: gitHubSessionID,
				accessToken,
				scopes: getTokenResponse.getScopeList()
			}, resolveGitHubUser);
			onDidChangeGitHubSessionsEmitter.fire({ added: [gitHubSession] });
			return gitHubSession;
		}

		try {
			await loginGitHub();
		} catch (e) {
			console.error('Failed an initial GitHub login:', e);
		}

		context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('github', 'GitHub', {
			onDidChangeSessions: onDidChangeGitHubSessionsEmitter.event,
			getSessions: scopes => {
				const sessions = [];
				if (gitHubSession && hasScopes(gitHubSession, scopes)) {
					sessions.push(gitHubSession);
				}
				return Promise.resolve(sessions);
			},
			createSession: async scopes => {
				try {
					const session = await loginGitHub(scopes);
					return session;
				} catch (e) {
					vscode.window.showErrorMessage(`Sign in failed: ${e}`);
					console.error(e);
					throw e;
				}
			},
			removeSession: async id => {
				if (id === gitHubSession?.id) {
					const session = gitHubSession;
					gitHubSession = undefined;
					onDidChangeGitHubSessionsEmitter.fire({ removed: [session] });
				}
			},
		}, { supportsMultipleAccounts: false }));
	})());
	//#endregion

	//#region cli
	const cliServerSocketsPath = process.env['GITPOD_CLI_SERVER_SOCKETS_PATH'];
	const vscodeIpcHookCli = process.env['VSCODE_IPC_HOOK_CLI'];
	if (cliServerSocketsPath && vscodeIpcHookCli) {
		const cliServerSocketLink = path.join(cliServerSocketsPath, process.pid + '.socket');
		(async () => {
			try {
				await util.promisify(fs.symlink)(vscodeIpcHookCli, cliServerSocketLink);
			} catch (e) {
				console.error('Failed to symlink cli server socket:', e);
			}
		})();
	} else {
		console.error(`cannot create a symlink to the cli server socket, GITPOD_CLI_SERVER_SOCKETS_PATH="${vscodeIpcHookCli}", GITPOD_CLI_SERVER_SOCKETS_PATH="${cliServerSocketsPath}"`);
	}
	//#endregion

	//#region extension managemnet
	const gitpodFileUri = vscode.Uri.file(path.join(checkoutLocation, '.gitpod.yml'));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.extensions.addToConfig', async (id: string) => {
		let document: vscode.TextDocument | undefined;
		let content = '';
		try {
			await util.promisify(fs.access.bind(fs))(gitpodFileUri.fsPath, fs.constants.F_OK);
			document = await vscode.workspace.openTextDocument(gitpodFileUri);
			content = document.getText();
		} catch { /* no-op */ }
		const model = new GitpodPluginModel(content);
		model.add(id);
		const edit = new vscode.WorkspaceEdit();
		if (document) {
			edit.replace(gitpodFileUri, document.validateRange(new vscode.Range(
				document.positionAt(0),
				document.positionAt(content.length)
			)), String(model));
		} else {
			edit.createFile(gitpodFileUri, { overwrite: true });
			edit.insert(gitpodFileUri, new vscode.Position(0, 0), String(model));
		}
		await vscode.workspace.applyEdit(edit);
	}));
	//#endregion

	//#region notifications
	function observeNotifications(): vscode.Disposable {
		let run = true;
		let stopUpdates: Function | undefined;
		(async () => {
			while (run) {
				try {
					console.info('connecting to notification service');
					const evts = notificationServiceClient.subscribe(new SubscribeRequest());
					stopUpdates = evts.cancel.bind(evts);

					await new Promise((resolve, reject) => {
						evts.on('end', resolve);
						evts.on('error', reject);
						evts.on('data', async (result: SubscribeResponse) => {
							const request = result.getRequest();
							if (request) {
								console.info('received notification request', request);
								const level = request.getLevel();
								const message = request.getMessage();
								const actions = request.getActionsList();
								let choice: string | undefined;
								switch (level) {
									case NotifyRequest.Level.ERROR:
										choice = await vscode.window.showErrorMessage(message, ...actions);
										break;
									case NotifyRequest.Level.WARNING:
										choice = await vscode.window.showWarningMessage(message, ...actions);
										break;
									case NotifyRequest.Level.INFO:
									default:
										choice = await vscode.window.showInformationMessage(message, ...actions);
								}
								const respondRequest = new RespondRequest();
								const notifyResponse = new NotifyResponse();
								notifyResponse.setAction(choice || '');
								respondRequest.setResponse(notifyResponse);
								respondRequest.setRequestid(result.getRequestid());
								console.info('sending notification response', request);
								notificationServiceClient.respond(respondRequest, (error, _) => {
									if (error?.code !== grpc.status.DEADLINE_EXCEEDED) {
										reject(error);
									}
								});
							}
						});
					});
				} catch (err) {
					if (!('code' in err && err.code === grpc.status.CANCELLED)) {
						console.error('cannot maintain connection to supervisor', err);
					}
				} finally {
					stopUpdates = undefined;
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		})();
		return new vscode.Disposable(() => {
			run = false;
			if (stopUpdates) {
				stopUpdates();
			}
		});
	}
	context.subscriptions.push(observeNotifications());
	//#endregion

	await Promise.all(pendingActivate.map(p => p.catch(console.error)));
}

export function deactivate() { }
