/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/// <reference path='../../../src/vscode-dts/vscode.d.ts'/>

// TODO get rid of loading inversify and reflect-metadata
require('reflect-metadata');
import { GitpodClient, GitpodServer, GitpodServiceImpl, WorkspaceInstanceUpdateListener } from '@gitpod/gitpod-protocol/lib/gitpod-service';
import { JsonRpcProxyFactory } from '@gitpod/gitpod-protocol/lib/messaging/proxy-factory';
import { NavigatorContext, User } from '@gitpod/gitpod-protocol/lib/protocol';
import { ErrorCodes } from '@gitpod/gitpod-protocol/lib/messaging/error';
import { GitpodHostUrl } from '@gitpod/gitpod-protocol/lib/util/gitpod-host-url';
import { ControlServiceClient } from '@gitpod/supervisor-api-grpc/lib/control_grpc_pb';
import { InfoServiceClient } from '@gitpod/supervisor-api-grpc/lib/info_grpc_pb';
import { WorkspaceInfoRequest, WorkspaceInfoResponse } from '@gitpod/supervisor-api-grpc/lib/info_pb';
import { NotificationServiceClient } from '@gitpod/supervisor-api-grpc/lib/notification_grpc_pb';
import { NotifyRequest, NotifyResponse, RespondRequest, SubscribeRequest, SubscribeResponse } from '@gitpod/supervisor-api-grpc/lib/notification_pb';
import { PortServiceClient } from '@gitpod/supervisor-api-grpc/lib/port_grpc_pb';
import { StatusServiceClient } from '@gitpod/supervisor-api-grpc/lib/status_grpc_pb';
import { ContentStatusRequest, TasksStatusRequest, TasksStatusResponse, TaskState, TaskStatus } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { TerminalServiceClient } from '@gitpod/supervisor-api-grpc/lib/terminal_grpc_pb';
import { ListenTerminalRequest, ListenTerminalResponse, ListTerminalsRequest, SetTerminalSizeRequest, ShutdownTerminalRequest, Terminal as SupervisorTerminal, TerminalSize as SupervisorTerminalSize, WriteTerminalRequest } from '@gitpod/supervisor-api-grpc/lib/terminal_pb';
import { TokenServiceClient } from '@gitpod/supervisor-api-grpc/lib/token_grpc_pb';
import { GetTokenRequest } from '@gitpod/supervisor-api-grpc/lib/token_pb';
import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { URL } from 'url';
import * as util from 'util';
import * as vscode from 'vscode';
import { CancellationToken, ConsoleLogger, listen as doListen } from 'vscode-ws-jsonrpc';
import WebSocket = require('ws');
import { BaseGitpodAnalyticsEventPropeties, GitpodAnalyticsEvent } from './analytics';
import * as uuid from 'uuid';
import { RemoteTrackMessage } from '@gitpod/gitpod-protocol/lib/analytics';
import Log from './common/logger';

export class SupervisorConnection {
	readonly deadlines = {
		long: 30 * 1000,
		normal: 15 * 1000,
		short: 5 * 1000
	};
	private readonly addr = process.env.SUPERVISOR_ADDR || 'localhost:22999';
	private readonly clientOptions: Partial<grpc.ClientOptions>;
	readonly metadata = new grpc.Metadata();
	readonly status: StatusServiceClient;
	readonly control: ControlServiceClient;
	readonly notification: NotificationServiceClient;
	readonly token: TokenServiceClient;
	readonly info: InfoServiceClient;
	readonly port: PortServiceClient;
	readonly terminal: TerminalServiceClient;

	constructor(
		context: vscode.ExtensionContext
	) {
		this.clientOptions = {
			'grpc.primary_user_agent': `${vscode.env.appName}/${vscode.version} ${context.extension.id}/${context.extension.packageJSON.version}`,
		};
		this.status = new StatusServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
		this.control = new ControlServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
		this.notification = new NotificationServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
		this.token = new TokenServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
		this.info = new InfoServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
		this.port = new PortServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
		this.terminal = new TerminalServiceClient(this.addr, grpc.credentials.createInsecure(), this.clientOptions);
	}
}

type UsedGitpodFunction = ['getWorkspace', 'openPort', 'stopWorkspace', 'setWorkspaceTimeout', 'getWorkspaceTimeout', 'getLoggedInUser', 'takeSnapshot', 'waitForSnapshot', 'controlAdmission', 'sendHeartBeat', 'trackEvent'];
type Union<Tuple extends any[], Union = never> = Tuple[number] | Union;
export type GitpodConnection = Omit<GitpodServiceImpl<GitpodClient, GitpodServer>, 'server'> & {
	server: Pick<GitpodServer, Union<UsedGitpodFunction>>;
};

export class GitpodExtensionContext implements vscode.ExtensionContext {

	readonly sessionId = uuid.v4();
	readonly pendingActivate: Promise<void>[] = [];
	readonly workspaceContextUrl: vscode.Uri;

	constructor(
		private readonly context: vscode.ExtensionContext,
		readonly devMode: boolean,
		readonly config: typeof import('./gitpod-plugin-model'),
		readonly supervisor: SupervisorConnection,
		readonly gitpod: GitpodConnection,
		private readonly webSocket: Promise<ReconnectingWebSocket> | undefined,
		readonly pendingWillCloseSocket: (() => Promise<void>)[],
		readonly info: WorkspaceInfoResponse,
		readonly owner: Promise<User>,
		readonly user: Promise<User>,
		readonly instanceListener: Promise<WorkspaceInstanceUpdateListener>,
		readonly workspaceOwned: Promise<boolean>,
		readonly logger: Log,
		readonly ipcHookCli: string | undefined
	) {
		this.workspaceContextUrl = vscode.Uri.parse(info.getWorkspaceContextUrl());
	}

	get active() {
		Object.freeze(this.pendingActivate);
		return Promise.all(this.pendingActivate.map(p => p.catch(console.error)));
	}

	get subscriptions() {
		return this.context.subscriptions;
	}
	get globalState() {
		return this.context.globalState;
	}
	get workspaceState() {
		return this.context.workspaceState;
	}
	get secrets() {
		return this.context.secrets;
	}
	get extensionUri() {
		return this.context.extensionUri;
	}
	get extensionPath() {
		return this.context.extensionPath;
	}
	get environmentVariableCollection() {
		return this.context.environmentVariableCollection;
	}
	asAbsolutePath(relativePath: string): string {
		return this.context.asAbsolutePath(relativePath);
	}
	get storageUri() {
		return this.context.storageUri;
	}
	get storagePath() {
		return this.context.storagePath;
	}
	get globalStorageUri() {
		return this.context.globalStorageUri;
	}
	get globalStoragePath() {
		return this.context.globalStoragePath;
	}
	get logUri() {
		return this.context.logUri;
	}
	get logPath() {
		return this.context.logPath;
	}
	get extensionMode() {
		return this.context.extensionMode;
	}
	get extension() {
		return this.context.extension;
	}
	get extensionRuntime() {
		return (this.context as any).extensionRuntime;
	}

	dispose() {
		const pendingWebSocket = this.webSocket;
		if (!pendingWebSocket) {
			return;
		}
		return (async () => {
			try {
				const webSocket = await pendingWebSocket;
				await Promise.allSettled(this.pendingWillCloseSocket.map(f => f()));
				webSocket.close();
			} catch (e) {
				this.logger.error('failed to dispose context:', e);
				console.error('failed to dispose context:', e);
			}
		})();
	}

	async fireAnalyticsEvent({ eventName, properties }: GitpodAnalyticsEvent): Promise<void> {
		const baseProperties: BaseGitpodAnalyticsEventPropeties = {
			sessionId: this.sessionId,
			workspaceId: this.info.getWorkspaceId(),
			instanceId: this.info.getInstanceId(),
			appName: vscode.env.appName,
			uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop',
			devMode: this.devMode,
			version: vscode.version,
			timestamp: Date.now(),
		};
		const msg: RemoteTrackMessage = {
			event: eventName,
			properties: {
				...baseProperties,
				...properties,
			}
		};
		if (this.devMode && vscode.env.uiKind === vscode.UIKind.Web) {
			this.logger.trace(`ANALYTICS: ${JSON.stringify(msg)} `);
			return Promise.resolve();
		}
		try {
			await this.gitpod.server.trackEvent(msg);
		} catch (e) {
			this.logger.error('failed to track event:', e);
			console.error('failed to track event:', e);
		}
	}
}

export async function createGitpodExtensionContext(context: vscode.ExtensionContext): Promise<GitpodExtensionContext | undefined> {
	const logger = new Log('Gitpod Workspace');
	const devMode = context.extensionMode === vscode.ExtensionMode.Development || !!process.env['VSCODE_DEV'];

	const supervisor = new SupervisorConnection(context);

	let contentAvailable = false;
	while (!contentAvailable) {
		try {
			const contentStatusRequest = new ContentStatusRequest();
			contentStatusRequest.setWait(true);
			const result = await util.promisify(supervisor.status.contentStatus.bind(supervisor.status, contentStatusRequest, supervisor.metadata, {
				deadline: Date.now() + supervisor.deadlines.long
			}))();
			contentAvailable = result.getAvailable();
		} catch (e) {
			if (e.code === grpc.status.UNAVAILABLE) {
				logger.info('It does not look like we are running in a Gitpod workspace, supervisor is not available.');
				return undefined;
			}
			console.error('cannot maintain connection to supervisor', e);
		}
	}

	const workspaceInfo = await util.promisify(supervisor.info.workspaceInfo.bind(supervisor.info, new WorkspaceInfoRequest(), supervisor.metadata, {
		deadline: Date.now() + supervisor.deadlines.long
	}))();

	const workspaceId = workspaceInfo.getWorkspaceId();
	const gitpodHost = workspaceInfo.getGitpodHost();
	const gitpodApi = workspaceInfo.getGitpodApi()!;

	const factory = new JsonRpcProxyFactory<GitpodServer>();
	const gitpodFunctions: UsedGitpodFunction = ['getWorkspace', 'openPort', 'stopWorkspace', 'setWorkspaceTimeout', 'getWorkspaceTimeout', 'getLoggedInUser', 'takeSnapshot', 'waitForSnapshot', 'controlAdmission', 'sendHeartBeat', 'trackEvent'];
	const gitpodService: GitpodConnection = new GitpodServiceImpl<GitpodClient, GitpodServer>(factory.createProxy()) as any;
	const gitpodScopes = new Set<string>([
		'resource:workspace::' + workspaceId + '::get/update',
		'function:accessCodeSyncStorage',
	]);
	for (const gitpodFunction of gitpodFunctions) {
		gitpodScopes.add('function:' + gitpodFunction);
	}
	const pendingServerToken = (async () => {
		const getTokenRequest = new GetTokenRequest();
		getTokenRequest.setKind('gitpod');
		getTokenRequest.setHost(gitpodApi.getHost());
		for (const scope of gitpodScopes) {
			getTokenRequest.addScope(scope);
		}
		const getTokenResponse = await util.promisify(supervisor.token.getToken.bind(supervisor.token, getTokenRequest, supervisor.metadata, {
			deadline: Date.now() + supervisor.deadlines.long
		}))();
		return getTokenResponse.getToken();
	})();
	const pendingWillCloseSocket: (() => Promise<void>)[] = [];
	const pendignWebSocket = (async () => {
		const serverToken = await pendingServerToken;
		class GitpodServerWebSocket extends WebSocket {
			constructor(address: string, protocols?: string | string[]) {
				super(address, protocols, {
					headers: {
						'Origin': new URL(gitpodHost).origin,
						'Authorization': `Bearer ${serverToken}`,
						'User-Agent': `${vscode.env.appName}/${vscode.version} ${context.extension.id}/${context.extension.packageJSON.version}`,
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
		webSocket.onerror = console.error;
		doListen({
			webSocket,
			onConnection: connection => factory.listen(connection),
			logger: new ConsoleLogger()
		});
		return webSocket;
	})();

	const pendingGetOwner = gitpodService.server.getLoggedInUser();
	const pendingGetUser = (async () => {
		if (devMode || vscode.env.uiKind !== vscode.UIKind.Web) {
			return pendingGetOwner;
		}
		return vscode.commands.executeCommand('gitpod.api.getLoggedInUser') as typeof pendingGetOwner;
	})();
	const pendingInstanceListener = gitpodService.listenToInstance(workspaceId);
	const pendingWorkspaceOwned = (async () => {
		const owner = await pendingGetOwner;
		const user = await pendingGetUser;
		const workspaceOwned = owner.id === user.id;
		vscode.commands.executeCommand('setContext', 'gitpod.workspaceOwned', workspaceOwned);
		return workspaceOwned;
	})();

	const ipcHookCli = installCLIProxy(context, logger);

	const config = await import('./gitpod-plugin-model');
	return new GitpodExtensionContext(
		context,
		devMode,
		config,
		supervisor,
		gitpodService,
		pendignWebSocket,
		pendingWillCloseSocket,
		workspaceInfo,
		pendingGetOwner,
		pendingGetUser,
		pendingInstanceListener,
		pendingWorkspaceOwned,
		logger,
		ipcHookCli
	);
}

export async function registerWorkspaceCommands(context: GitpodExtensionContext): Promise<void> {
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.dashboard', () => {
		const url = context.info.getGitpodHost();
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.accessControl', () => {
		const url = new GitpodHostUrl(context.info.getGitpodHost()).asAccessControl().toString();
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.settings', () => {
		const url = new GitpodHostUrl(context.info.getGitpodHost()).asSettings().toString();
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.context', () => {
		const url = context.workspaceContextUrl.toString();
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.documentation', () => {
		const url = 'https://www.gitpod.io/docs';
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.twitter', () => {
		const url = 'https://twitter.com/gitpod';
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.open.discord', () => {
		const url = 'https://www.gitpod.io/chat';
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.reportIssue', () => {
		const url = 'https://github.com/gitpod-io/gitpod/issues/new/choose';
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));

	if (vscode.env.uiKind === vscode.UIKind.Web) {
		function openDesktop(scheme: 'vscode' | 'vscode-insiders'): void {
			const uri = vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.[0]?.uri;
			vscode.env.openExternal(vscode.Uri.from({
				scheme,
				authority: 'gitpod.gitpod-desktop',
				path: uri?.path || context.info.getWorkspaceLocationFile() || context.info.getWorkspaceLocationFolder() || context.info.getCheckoutLocation(),
				query: JSON.stringify({
					instanceId: context.info.getInstanceId(),
					workspaceId: context.info.getWorkspaceId(),
					gitpodHost: context.info.getGitpodHost()
				})
			}));
		}
		context.subscriptions.push(vscode.commands.registerCommand('gitpod.openInStable', () => {
			context.fireAnalyticsEvent({
				eventName: 'vscode_execute_command_gitpod_change_vscode_type',
				properties: { targetUiKind: 'desktop', targetQualifier: 'stable' }
			});
			return openDesktop('vscode');
		}));
		context.subscriptions.push(vscode.commands.registerCommand('gitpod.openInInsiders', () => {
			context.fireAnalyticsEvent({
				eventName: 'vscode_execute_command_gitpod_change_vscode_type',
				properties: { targetUiKind: 'desktop', targetQualifier: 'insiders' }
			});
			return openDesktop('vscode-insiders');
		}));
	}
	if (vscode.env.uiKind === vscode.UIKind.Desktop) {
		context.subscriptions.push(vscode.commands.registerCommand('gitpod.openInBrowser', () => {
			const url = context.info.getWorkspaceUrl();
			context.fireAnalyticsEvent({
				eventName: 'vscode_execute_command_gitpod_change_vscode_type',
				properties: { targetUiKind: 'web' }
			});
			return vscode.env.openExternal(vscode.Uri.parse(url));
		}));
	}

	const workspaceOwned = await context.workspaceOwned;
	if (!workspaceOwned) {
		return;
	}
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.stop.ws', () => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_workspace',
			properties: { action: 'stop' }
		});
		return context.gitpod.server.stopWorkspace(context.info.getWorkspaceId());
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.upgradeSubscription', () => {
		const url = new GitpodHostUrl(context.info.getGitpodHost()).asUpgradeSubscription().toString();
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_open_link',
			properties: { url }
		});
		return vscode.env.openExternal(vscode.Uri.parse(url));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.takeSnapshot', async () => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_workspace',
			properties: { action: 'snapshot' }
		});
		try {
			let snapshotId: string | undefined = undefined;
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				cancellable: true,
				title: 'Capturing workspace snapshot'
			}, async (_, cancelToken: CancellationToken) => {
				snapshotId = await context.gitpod.server.takeSnapshot({ workspaceId: context.info.getWorkspaceId() /*, layoutData?*/, dontWait: true });

				while (!cancelToken.isCancellationRequested) {
					try {
						await context.gitpod.server.waitForSnapshot(snapshotId);
						return;
					} catch (err) {
						if (err.code === ErrorCodes.SNAPSHOT_ERROR || err.code === ErrorCodes.NOT_FOUND) {
							// this is indeed an error with snapshot creation itself, break here!
							throw err;
						}

						// other errors (like connection errors): retry
						await new Promise((resolve) => setTimeout(resolve, 3000));
					}
				}
			});
			if (!snapshotId) {
				throw new Error('error taking snapshot');
			}

			const hostname = context.info.getGitpodApi()!.getHost();
			const uri = `https://${hostname}#snapshot/${snapshotId}`;
			const copyAction = await vscode.window.showInformationMessage(`The current state is captured in a snapshot. Using [this link](${uri}) anybody can create their own copy of this workspace.`,
				'Copy URL to Clipboard');
			if (copyAction === 'Copy URL to Clipboard') {
				await vscode.env.clipboard.writeText(uri);
			}
		} catch (err) {
			console.error('cannot capture workspace snapshot', err);
			await vscode.window.showErrorMessage(`Cannot capture workspace snapshot: ${err.toString()}`);
		}
	}));
}

export async function registerWorkspaceSharing(context: GitpodExtensionContext): Promise<void> {
	const owner = await context.owner;
	const workspaceOwned = await context.workspaceOwned;
	const workspaceSharingStatusBarItem = vscode.window.createStatusBarItem('gitpod.workspaceSharing', vscode.StatusBarAlignment.Left);
	workspaceSharingStatusBarItem.name = 'Workspace Sharing';
	context.subscriptions.push(workspaceSharingStatusBarItem);
	function setWorkspaceShared(workspaceShared: boolean): void {
		if (workspaceOwned) {
			vscode.commands.executeCommand('setContext', 'gitpod.workspaceShared', workspaceShared);
			if (workspaceShared) {
				workspaceSharingStatusBarItem.text = '$(broadcast) Shared';
				workspaceSharingStatusBarItem.tooltip = 'Your workspace is currently shared. Anyone with the link can access this workspace.';
				workspaceSharingStatusBarItem.command = 'gitpod.stopSharingWorkspace';
			} else {
				workspaceSharingStatusBarItem.text = '$(live-share) Share';
				workspaceSharingStatusBarItem.tooltip = 'Your workspace is currently not shared. Only you can access it.';
				workspaceSharingStatusBarItem.command = 'gitpod.shareWorkspace';
			}
		} else {
			workspaceSharingStatusBarItem.text = '$(broadcast) Shared by ' + owner.name;
			workspaceSharingStatusBarItem.tooltip = `You are currently accessing the workspace shared by ${owner.name}.`;
		}
		workspaceSharingStatusBarItem.show();
	}
	const listener = await context.instanceListener;
	setWorkspaceShared(listener.info.workspace.shareable || false);
	if (!workspaceOwned) {
		return;
	}
	async function controlAdmission(level: GitpodServer.AdmissionLevel): Promise<void> {
		try {
			if (level === 'everyone') {
				const confirm = await vscode.window.showWarningMessage('Sharing your workspace with others also means sharing your access to your repository. Everyone with access to the workspace you share can commit in your name.', { modal: true }, 'Share');
				if (confirm !== 'Share') {
					return;
				}
			}
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				cancellable: true,
				title: level === 'everyone' ? 'Sharing workspace...' : 'Stopping workspace sharing...'
			}, _ => {
				return context.gitpod.server.controlAdmission(context.info.getWorkspaceId(), level);
			});
			setWorkspaceShared(level === 'everyone');
			if (level === 'everyone') {
				const uri = context.info.getWorkspaceUrl();
				const copyToClipboard = 'Copy URL to Clipboard';
				const res = await vscode.window.showInformationMessage(`Your workspace is currently shared. Anyone with [the link](${uri}) can access this workspace.`, copyToClipboard);
				if (res === copyToClipboard) {
					await vscode.env.clipboard.writeText(uri);
				}
			} else {
				await vscode.window.showInformationMessage(`Your workspace is currently not shared. Only you can access it.`);
			}
		} catch (err) {
			console.error('cannot controlAdmission', err);
			if (level === 'everyone') {
				await vscode.window.showErrorMessage(`Cannot share workspace: ${err.toString()}`);
			} else {
				await vscode.window.showInformationMessage(`Cannot stop workspace sharing: ${err.toString()}`);
			}
		}
	}
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.shareWorkspace', () => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_workspace',
			properties: { action: 'share' }
		});
		return controlAdmission('everyone');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.stopSharingWorkspace', () => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_workspace',
			properties: { action: 'stop-sharing' }
		});
		return controlAdmission('owner');
	}));
}

export async function registerWorkspaceTimeout(context: GitpodExtensionContext): Promise<void> {
	const workspaceOwned = await context.workspaceOwned;
	if (!workspaceOwned) {
		return;
	}

	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ExtendTimeout', async () => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_workspace',
			properties: {
				action: 'extend-timeout'
			}
		});
		try {
			const result = await context.gitpod.server.setWorkspaceTimeout(context.info.getWorkspaceId(), '180m');
			if (result.resetTimeoutOnWorkspaces?.length > 0) {
				vscode.window.showWarningMessage('Workspace timeout has been extended to three hours. This reset the workspace timeout for other workspaces.');
			} else {
				vscode.window.showInformationMessage('Workspace timeout has been extended to three hours.');
			}
		} catch (err) {
			vscode.window.showErrorMessage(`Cannot extend workspace timeout: ${err.toString()}`);
		}
	}));

	const workspaceTimeout = await context.gitpod.server.getWorkspaceTimeout(context.info.getWorkspaceId());
	if (!workspaceTimeout.canChange) {
		return;
	}

	const listener = await context.instanceListener;
	const extendTimeoutStatusBarItem = vscode.window.createStatusBarItem('gitpod.extendTimeout', vscode.StatusBarAlignment.Right, -100);
	extendTimeoutStatusBarItem.name = 'Click to extend the workspace timeout.';
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
}

export function registerNotifications(context: GitpodExtensionContext): void {
	function observeNotifications(): vscode.Disposable {
		let run = true;
		let stopUpdates: Function | undefined;
		(async () => {
			while (run) {
				try {
					const evts = context.supervisor.notification.subscribe(new SubscribeRequest(), context.supervisor.metadata);
					stopUpdates = evts.cancel.bind(evts);

					await new Promise((resolve, reject) => {
						evts.on('end', resolve);
						evts.on('error', reject);
						evts.on('data', async (result: SubscribeResponse) => {
							const request = result.getRequest();
							if (request) {
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
								context.supervisor.notification.respond(respondRequest, context.supervisor.metadata, {
									deadline: Date.now() + context.supervisor.deadlines.normal
								}, (error, _) => {
									if (error?.code !== grpc.status.DEADLINE_EXCEEDED) {
										reject(error);
									}
								});
							}
						});
					});
				} catch (err) {
					if ('code' in err && err.code === grpc.status.UNIMPLEMENTED) {
						console.warn('supervisor does not implement the notification server');
						run = false;
					} else if (!('code' in err && err.code === grpc.status.CANCELLED)) {
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
}

export function registerDefaultLayout(context: GitpodExtensionContext): void {
	const layoutInitializedKey = 'gitpod:layoutInitialized';
	const layoutInitialized = Boolean(context.globalState.get(layoutInitializedKey));
	if (!layoutInitialized) {
		context.globalState.update(layoutInitializedKey, true);

		(async () => {
			const listener = await context.instanceListener;
			const workspaceContext = listener.info.workspace.context;

			if (NavigatorContext.is(workspaceContext)) {
				const location = vscode.Uri.file(path.join(context.info.getCheckoutLocation(), workspaceContext.path));
				if (workspaceContext.isFile) {
					vscode.window.showTextDocument(location);
				} else {
					vscode.commands.executeCommand('revealInExplorer', location);
				}
			}
		})();
	}
}

function installCLIProxy(context: vscode.ExtensionContext, logger: Log): string | undefined {
	const vscodeIpcHookCli = process.env['VSCODE_IPC_HOOK_CLI'];
	if (!vscodeIpcHookCli) {
		return undefined;
	}
	const { dir, base } = path.parse(vscodeIpcHookCli);
	const ipcHookCli = path.join(dir, 'gitpod-' + base);
	const ipcProxy = http.createServer((req, res) => {
		const chunks: string[] = [];
		req.setEncoding('utf8');
		req.on('data', (d: string) => chunks.push(d));
		req.pipe(http.request({
			socketPath: vscodeIpcHookCli,
			method: req.method,
			headers: req.headers
		}, async res2 => {
			if (res2.statusCode === 404) {
				const data: { type: 'preview'; url: string } | any = JSON.parse(chunks.join(''));
				if (data.type === 'preview') {
					// should be aligned with https://github.com/gitpod-io/vscode/blob/4d36a5dbf36870beda891e5dd94ccf087fdc7eb5/src/vs/workbench/api/node/extHostCLIServer.ts#L207-L207
					try {
						const { url } = data;
						await vscode.commands.executeCommand('simpleBrowser.api.open', url, {
							viewColumn: vscode.ViewColumn.Beside,
							preserveFocus: true
						});
						res.writeHead(200, { 'content-type': 'application/json' });
						res.end(JSON.stringify(''));
					} catch (e) {
						console.error(e);
						const message = e instanceof Error ? e.message : JSON.stringify(e);
						res.writeHead(500, { 'content-type': 'application/json' });
						res.end(JSON.stringify(message));
					}
					return;
				}
			}
			res.setHeader('Content-Type', 'application/json');
			res2.pipe(res);
		}));
	});
	context.subscriptions.push(new vscode.Disposable(() => ipcProxy.close()));

	new Promise((_, reject) => {
		ipcProxy.on('error', err => reject(err));
		ipcProxy.listen(ipcHookCli);
		context.subscriptions.push(new vscode.Disposable(() =>
			fs.promises.unlink(ipcHookCli)
		));
	}).catch(e => {
		logger.error('failed to start cli proxy: ' + e);
		console.error('failed to start cli proxy:' + e);
	});

	return ipcHookCli;
}

type TerminalOpenMode = 'tab-before' | 'tab-after' | 'split-left' | 'split-right' | 'split-top' | 'split-bottom';

export async function registerTasks(context: GitpodExtensionContext): Promise<void> {
	const tokenSource = new vscode.CancellationTokenSource();
	const token = tokenSource.token;
	context.subscriptions.push({
		dispose: () => tokenSource.cancel()
	});

	const tasks = new Map<string, TaskStatus>();
	let synched = false;
	while (!synched) {
		let listener: vscode.Disposable | undefined;
		try {
			const req = new TasksStatusRequest();
			req.setObserve(true);
			const stream = context.supervisor.status.tasksStatus(req, context.supervisor.metadata);
			const done = () => {
				synched = true;
				stream.cancel();
			};
			listener = token.onCancellationRequested(() => done());
			await new Promise((resolve, reject) => {
				stream.on('end', resolve);
				stream.on('error', reject);
				stream.on('data', (response: TasksStatusResponse) => {
					if (response.getTasksList().every(status => {
						tasks.set(status.getTerminal(), status);
						return status.getState() !== TaskState.OPENING;
					})) {
						done();
					}
				});
			});
		} catch (err) {
			if (!('code' in err && err.code === grpc.status.CANCELLED)) {
				context.logger.error('code server: listening task updates failed:', err);
				console.error('code server: listening task updates failed:', err);
			}
		} finally {
			listener?.dispose();
		}
		if (!synched) {
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}
	context.logger.trace('Task status:', [...tasks.values()].map(status => {
		const stateMap = { [TaskState.OPENING]: 'CLOSED', [TaskState.RUNNING]: 'RUNNING', [TaskState.CLOSED]: 'CLOSED' };
		return `\t${status.getTerminal()} => ${stateMap[status.getState()]}`;
	}).join('\n'));

	if (token.isCancellationRequested) {
		return;
	}

	const taskTerminals = new Map<string, SupervisorTerminal>();
	try {
		const response = await util.promisify(context.supervisor.terminal.list.bind(context.supervisor.terminal, new ListTerminalsRequest(), context.supervisor.metadata, {
			deadline: Date.now() + context.supervisor.deadlines.long
		}))();
		for (const term of response.getTerminalsList()) {
			taskTerminals.set(term.getAlias(), term);
		}
	} catch (e) {
		context.logger.error('failed to list task terminals:', e);
		console.error('failed to list task terminals:', e);
	}

	let prevTerminal: vscode.Terminal | undefined;
	for (const [alias, taskStatus] of tasks.entries()) {
		const taskTerminal = taskTerminals.get(alias);
		if (taskTerminal) {
			const openMode: TerminalOpenMode | undefined = taskStatus.getPresentation()?.getOpenMode() as TerminalOpenMode;
			const parentTerminal = (openMode && openMode !== 'tab-before' && openMode !== 'tab-after') ? prevTerminal : undefined;
			const pty = createTaskPty(alias, context, token);

			const terminal = vscode.window.createTerminal({
				name: taskTerminal.getTitle(),
				pty,
				iconPath: new vscode.ThemeIcon('terminal'),
				location: parentTerminal ? { parentTerminal } : vscode.TerminalLocation.Panel
			});
			terminal.show();
			prevTerminal = terminal;
		}
	}
}

function createTaskPty(alias: string, context: GitpodExtensionContext, contextToken: vscode.CancellationToken): vscode.Pseudoterminal {
	const tokenSource = new vscode.CancellationTokenSource();
	contextToken.onCancellationRequested(() => tokenSource.cancel());
	const token = tokenSource.token;

	const onDidWriteEmitter = new vscode.EventEmitter<string>();
	const onDidCloseEmitter = new vscode.EventEmitter<number | void>();
	const onDidChangeNameEmitter = new vscode.EventEmitter<string>();
	const toDispose = vscode.Disposable.from(onDidWriteEmitter, onDidCloseEmitter, onDidChangeNameEmitter);
	token.onCancellationRequested(() => toDispose.dispose());

	let pendingWrite = Promise.resolve();
	let pendingResize = Promise.resolve();
	const pty: vscode.Pseudoterminal = {
		onDidWrite: onDidWriteEmitter.event,
		onDidClose: onDidCloseEmitter.event,
		onDidChangeName: onDidChangeNameEmitter.event,
		open: async (dimensions: vscode.TerminalDimensions | undefined) => {
			if (dimensions) {
				pty.setDimensions!(dimensions);
			}
			while (!token.isCancellationRequested) {
				let notFound = false;
				let exitCode: number | undefined;
				let listener: vscode.Disposable | undefined;
				try {
					await new Promise((resolve, reject) => {
						const request = new ListenTerminalRequest();
						request.setAlias(alias);
						const stream = context.supervisor.terminal.listen(request, context.supervisor.metadata);
						listener = token.onCancellationRequested(() => stream.cancel());
						stream.on('end', resolve);
						stream.on('error', reject);
						stream.on('data', (response: ListenTerminalResponse) => {
							if (response.hasTitle()) {
								const title = response.getTitle();
								if (title) {
									onDidChangeNameEmitter.fire(title);
								}
							} else if (response.hasData()) {
								let data = '';
								const buffer = response.getData();
								if (typeof buffer === 'string') {
									data += buffer;
								} else {
									data += Buffer.from(buffer).toString();
								}
								if (data) {
									onDidWriteEmitter.fire(data);
								}
							} else if (response.hasExitCode()) {
								exitCode = response.getExitCode();
							}
						});
					});
				} catch (e) {
					notFound = 'code' in e && e.code === grpc.status.NOT_FOUND;
					if (!token.isCancellationRequested && !notFound && !('code' in e && e.code === grpc.status.CANCELLED)) {
						context.logger.error(`${alias} terminal: listening failed:`, e);
						console.error(`${alias} terminal: listening failed:`, e);
					}
				} finally {
					listener?.dispose();
				}
				if (token.isCancellationRequested) {
					return;
				}
				if (notFound) {
					context.logger.trace(`${alias} terminal not found`);
					onDidCloseEmitter.fire();
					tokenSource.cancel();
					return;
				}
				if (typeof exitCode === 'number') {
					context.logger.trace(`${alias} terminal exited with ${exitCode}`);
					onDidCloseEmitter.fire(exitCode);
					tokenSource.cancel();
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		},
		close: async () => {
			if (token.isCancellationRequested) {
				return;
			}
			tokenSource.cancel();

			// await to make sure that close is not cause by the extension host process termination
			// in such case we don't want to stop supervisor terminals
			setTimeout(async () => {
				if (contextToken.isCancellationRequested) {
					return;
				}
				// Attempt to kill the pty, it may have already been killed at this
				// point but we want to make sure
				try {
					const request = new ShutdownTerminalRequest();
					request.setAlias(alias);
					await util.promisify(context.supervisor.terminal.shutdown.bind(context.supervisor.terminal, request, context.supervisor.metadata, {
						deadline: Date.now() + context.supervisor.deadlines.short
					}))();
					context.logger.trace(`${alias} terminal closed`);
				} catch (e) {
					if (e && e.code === grpc.status.NOT_FOUND) {
						// Swallow, the pty has already been killed
					} else {
						context.logger.error(`${alias} terminal: shutdown failed:`, e);
						console.error(`${alias} terminal: shutdown failed:`, e);
					}
				}
			}, 1000);

		},
		handleInput: async (data: string) => {
			if (token.isCancellationRequested) {
				return;
			}
			pendingWrite = pendingWrite.then(async () => {
				if (token.isCancellationRequested) {
					return;
				}
				try {
					const request = new WriteTerminalRequest();
					request.setAlias(alias);
					request.setStdin(Buffer.from(data, 'utf8'));
					await util.promisify(context.supervisor.terminal.write.bind(context.supervisor.terminal, request, context.supervisor.metadata, {
						deadline: Date.now() + context.supervisor.deadlines.short
					}))();
				} catch (e) {
					if (e && e.code !== grpc.status.NOT_FOUND) {
						context.logger.error(`${alias} terminal: write failed:`, e);
						console.error(`${alias} terminal: write failed:`, e);
					}
				}
			});
		},
		setDimensions: (dimensions: vscode.TerminalDimensions) => {
			if (token.isCancellationRequested) {
				return;
			}
			pendingResize = pendingResize.then(async () => {
				if (token.isCancellationRequested) {
					return;
				}
				try {
					const size = new SupervisorTerminalSize();
					size.setCols(dimensions.columns);
					size.setRows(dimensions.rows);

					const request = new SetTerminalSizeRequest();
					request.setAlias(alias);
					request.setSize(size);
					request.setForce(true);
					await util.promisify(context.supervisor.terminal.setSize.bind(context.supervisor.terminal, request, context.supervisor.metadata, {
						deadline: Date.now() + context.supervisor.deadlines.short
					}))();
				} catch (e) {
					if (e && e.code !== grpc.status.NOT_FOUND) {
						context.logger.error(`${alias} terminal: resize failed:`, e);
						console.error(`${alias} terminal: resize failed:`, e);
					}
				}
			});
		}
	};

	return pty;
}

/**
 * configure CLI in task terminals
 */
export function registerIpcHookCli(context: GitpodExtensionContext): void {
	const ipcHookCli = context.ipcHookCli;
	if (!ipcHookCli) {
		return;
	}

	updateIpcHookCli(context);
	context.subscriptions.push(vscode.window.onDidChangeWindowState(() => updateIpcHookCli(context)));
}


async function updateIpcHookCli(context: GitpodExtensionContext): Promise<void> {
	if (!context.ipcHookCli) {
		return;
	}

	try {
		await new Promise<void>((resolve, reject) => {
			const req = http.request({
				hostname: 'localhost',
				port: context.devMode ? 9888 /* From code-web.js */ : context.info.getIdePort(),
				protocol: 'http:',
				path: `/cli/ipcHookCli/${encodeURIComponent(context.ipcHookCli!)}`,
				method: vscode.window.state.focused ? 'PUT' : 'DELETE'
			}, res => {
				const chunks: string[] = [];
				res.setEncoding('utf8');
				res.on('data', d => chunks.push(d));
				res.on('end', () => {
					const result = chunks.join('');
					if (res.statusCode !== 200) {
						reject(new Error(`Bad status code: ${res.statusCode}: ${result}`));
					} else {
						resolve(undefined);
					}
				});
			});
			req.on('error', err => reject(err));
			req.end();
		});
	} catch (e) {
		context.logger.error('Failed to update gitpod ipc hook cli:', e);
		console.error('Failed to update gitpod ipc hook cli:', e);
	}
}
