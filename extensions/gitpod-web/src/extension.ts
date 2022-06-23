/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/// <reference path='../../../src/vscode-dts/vscode.d.ts'/>
/// <reference path='../../../src/vscode-dts/vscode.proposed.resolvers.d.ts'/>

import * as workspaceInstance from '@gitpod/gitpod-protocol/lib/workspace-instance';
import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs';
import * as os from 'os';
import * as uuid from 'uuid';
import { GitpodPluginModel, GitpodExtensionContext, setupGitpodContext, registerTasks, registerIpcHookCli } from 'gitpod-shared';
import { GetTokenRequest } from '@gitpod/supervisor-api-grpc/lib/token_pb';
import { PortsStatus, ExposedPortInfo, PortsStatusRequest, PortsStatusResponse, PortAutoExposure, PortVisibility, OnPortExposedAction } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { TunnelVisiblity, TunnelPortRequest, RetryAutoExposeRequest, CloseTunnelRequest } from '@gitpod/supervisor-api-grpc/lib/port_pb';
import { ExposePortRequest } from '@gitpod/supervisor-api-grpc/lib/control_pb';
import type * as keytarType from 'keytar';
import fetch from 'node-fetch';
import * as path from 'path';
import { URL } from 'url';
import * as util from 'util';
import * as vscode from 'vscode';
import { ThrottledDelayer } from './util/async';
import { download } from './util/download';
import { getManifest } from './util/extensionManagmentUtill';

const experimentCfg = vscode.workspace.getConfiguration('gitpod.experiment');
const isExperimentMode = vscode.version.includes('insider') || experimentCfg.get<boolean>('enable') === true;

let gitpodContext: GitpodExtensionContext | undefined;
export async function activate(context: vscode.ExtensionContext) {
	gitpodContext = await setupGitpodContext(context);
	if (!gitpodContext) {
		return;
	}

	registerDesktop();
	registerAuth(gitpodContext);
	registerPorts(gitpodContext);
	registerTasks(gitpodContext).then(() => {
		if (vscode.window.terminals.length === 0) {
			// Always show a terminal if no task terminals are created
			vscode.window.createTerminal();
		}
	});

	const versionKey = 'walkthrough.version';
	context.globalState.setKeysForSync([versionKey]);

	registerWelcomeWalkthroughCommands(gitpodContext);
	startWelcomeWalkthrough(context, versionKey);

	registerIpcHookCli(gitpodContext);
	registerExtensionManagement(gitpodContext);
	await gitpodContext.active;
}

export function deactivate() {
	if (!gitpodContext) {
		return;
	}
	return gitpodContext.dispose();
}

export function registerAuth(context: GitpodExtensionContext): void {
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
		};
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
	function hasScopes(session: vscode.AuthenticationSession, scopes?: readonly string[]): boolean {
		return !scopes || scopes.every(scope => session.scopes.indexOf(scope) !== -1);
	}
	//#endregion

	//#region gitpod auth
	context.pendingActivate.push((async () => {
		const sessions: vscode.AuthenticationSession[] = [];
		const onDidChangeSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		try {
			const resolveGitpodUser = async () => {
				const owser = await context.owner;
				return {
					id: owser.id,
					accountName: owser.name!
				};
			};
			if (vscode.env.uiKind === vscode.UIKind.Web) {
				const keytar: Keytar = require('keytar');
				const value = await keytar.getPassword(`${vscode.env.uriScheme}-gitpod.login`, 'account');
				if (value) {
					await keytar.deletePassword(`${vscode.env.uriScheme}-gitpod.login`, 'account');
					const sessionData: SessionData[] = JSON.parse(value);
					if (sessionData.length) {
						const session = await resolveAuthenticationSession(sessionData[0], resolveGitpodUser);
						sessions.push(session);
					}
				}
			} else {
				const getTokenRequest = new GetTokenRequest();
				getTokenRequest.setKind('gitpod');
				getTokenRequest.setHost(context.info.getGitpodApi()!.getHost());
				const scopes = [
					'function:accessCodeSyncStorage'
				];
				for (const scope of scopes) {
					getTokenRequest.addScope(scope);
				}
				const getTokenResponse = await util.promisify(context.supervisor.token.getToken.bind(context.supervisor.token, getTokenRequest, context.supervisor.metadata, {
					deadline: Date.now() + context.supervisor.deadlines.long
				}))();
				const accessToken = getTokenResponse.getToken();
				const session = await resolveAuthenticationSession({
					// current session ID should remain stable between window reloads
					// otherwise setting sync will log out
					id: 'gitpod-current-session',
					accessToken,
					scopes
				}, resolveGitpodUser);
				sessions.push(session);
				onDidChangeSessionsEmitter.fire({ added: [session], changed: [], removed: [] });
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
	context.pendingActivate.push((async () => {
		const onDidChangeGitHubSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		const gitHubSessionID = 'github-session';
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
			const user = await (userResponse.json() as Promise<{ id: string; login: string }>);
			return {
				id: user.id,
				accountName: user.login
			};
		}

		async function loginGitHub(scopes?: readonly string[]): Promise<vscode.AuthenticationSession> {
			const getTokenRequest = new GetTokenRequest();
			getTokenRequest.setKind('git');
			getTokenRequest.setHost('github.com');
			if (scopes) {
				for (const scope of scopes) {
					getTokenRequest.addScope(scope);
				}
			}
			const getTokenResponse = await util.promisify(context.supervisor.token.getToken.bind(context.supervisor.token, getTokenRequest, context.supervisor.metadata, {
				deadline: Date.now() + context.supervisor.deadlines.long
			}))();
			const accessToken = getTokenResponse.getToken();
			gitHubSession = await resolveAuthenticationSession({
				id: gitHubSessionID,
				accessToken,
				scopes: getTokenResponse.getScopeList()
			}, resolveGitHubUser);
			onDidChangeGitHubSessionsEmitter.fire({ added: [gitHubSession], changed: [], removed: [] });
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
					console.error('GitHub sign in failed: ', e);
					throw e;
				}
			},
			removeSession: async id => {
				if (id === gitHubSession?.id) {
					const session = gitHubSession;
					gitHubSession = undefined;
					onDidChangeGitHubSessionsEmitter.fire({ removed: [session], added: [], changed: [] });
				}
			},
		}, { supportsMultipleAccounts: false }));
	})());
}

export class GitpodWorkspacePort {
	public info: PortInfo;
	public status: PortsStatus.AsObject;
	public localUrl: string;
	constructor(
		readonly portNumber: number,
		private readonly context: GitpodExtensionContext,
		private portStatus: PortsStatus,
		private tunnel?: vscode.TunnelDescription,
	) {
		this.status = portStatus.toObject();
		this.portStatus = portStatus;
		this.tunnel = tunnel;
		this.info = this.parsePortInfo(portStatus, tunnel);
		this.localUrl = 'http://localhost:' + portStatus.getLocalPort();
	}

	update(portStatus: PortsStatus, tunnel?: vscode.TunnelDescription) {
		this.status = portStatus.toObject();
		this.portStatus = portStatus;
		this.tunnel = tunnel;
		this.info = this.parsePortInfo(portStatus, tunnel);
	}

	private parsePortInfo(portStatus: PortsStatus, tunnel?: vscode.TunnelDescription) {
		const currentStatus = portStatus.toObject();
		const { name, localPort, description, exposed, served } = currentStatus;
		// const prevStatus = port.status;
		const port: PortInfo = {
			label: '',
			tooltip: '',
			description: '',
			contextValue: '',
			iconStatus: 'NotServed',
			localUrl: 'http://localhost:' + localPort,
		};
		port.label = name ? `${name}: ${localPort}` : `${localPort}`;
		if (description) {
			port.tooltip = name ? `${name} - ${description}` : description;
		}

		if (this.remotePort && this.remotePort !== localPort) {
			port.label += ':' + this.remotePort;
		}

		const accessible = exposed || tunnel;

		// We use .public here because https://github.com/gitpod-io/openvscode-server/pull/360#discussion_r882953586
		const isPortTunnelPublic = !!tunnel?.public;
		if (!served) {
			port.description = 'not served';
			port.iconPath = new vscode.ThemeIcon('circle-outline');
			port.iconStatus = 'NotServed';
		} else if (!accessible) {
			if (portStatus.getAutoExposure() === PortAutoExposure.FAILED) {
				port.description = 'failed to expose';
				port.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
				port.iconStatus = 'ExposureFailed';
			} else {
				port.description = 'detecting...';
				port.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('editorWarning.foreground'));
				port.iconStatus = 'Detecting';
			}
		} else {
			port.description = 'open';
			if (tunnel) {
				port.description += ` on ${isPortTunnelPublic ? 'all interfaces' : 'localhost'}`;
			}
			if (exposed) {
				port.description += ` ${exposed.visibility === PortVisibility.PUBLIC ? '(public)' : '(private)'}`;
			}
			port.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('ports.iconRunningProcessForeground'));
			port.iconStatus = 'Served';
		}

		port.contextValue = 'port';
		if (served) {
			port.contextValue = 'served-' + port.contextValue;
		}
		if (exposed) {
			port.contextValue = 'exposed-' + port.contextValue;
			port.contextValue = (exposed.visibility === PortVisibility.PUBLIC ? 'public-' : 'private-') + port.contextValue;
		}
		if (tunnel) {
			port.contextValue = 'tunneled-' + port.contextValue;
			port.contextValue = (isPortTunnelPublic ? 'network-' : 'host-') + port.contextValue;
		}
		if (!accessible && portStatus.getAutoExposure() === PortAutoExposure.FAILED) {
			port.contextValue = 'failed-' + port.contextValue;
		}
		return port;
	}

	toSvelteObject() {
		return {
			info: this.info,
			status: {
				...this.status,
				remotePort: this.remotePort,
			},
		};
	}

	openExternal() {
		return vscode.env.openExternal(vscode.Uri.parse(this.localUrl));
	}
	get externalUrl(): string {
		if (this.tunnel) {
			const localAddress = typeof this.tunnel.localAddress === 'string' ? this.tunnel.localAddress : this.tunnel.localAddress.host + ':' + this.tunnel.localAddress.port;
			return localAddress.startsWith('http') ? localAddress : `http://${localAddress}`;
		}
		return this.status?.exposed?.url || this.localUrl;
	}
	get remotePort(): number | undefined {
		if (this.tunnel) {
			if (typeof this.tunnel.localAddress === 'string') {
				try {
					return Number(new URL(this.tunnel.localAddress).port);
				} catch {
					return undefined;
				}
			}
			return this.tunnel.localAddress.port;
		}
		return undefined;
	}
	async setPortVisibility(visibility: workspaceInstance.PortVisibility): Promise<void> {
		if (this.portStatus) {
			await this.context.gitpod.server.openPort(this.context.info.getWorkspaceId(), {
				port: this.portStatus.getLocalPort(),
				visibility
			});
		}
	}
	async setTunnelVisibility(visibility: TunnelVisiblity): Promise<void> {
		const request = new TunnelPortRequest();
		request.setPort(this.portNumber);
		request.setTargetPort(this.portNumber);
		request.setVisibility(visibility);
		await util.promisify(this.context.supervisor.port.tunnel.bind(this.context.supervisor.port, request, this.context.supervisor.metadata, {
			deadline: Date.now() + this.context.supervisor.deadlines.normal
		}))();
	}
}

export type IconStatus = 'Served' | 'NotServed' | 'Detecting' | 'ExposureFailed';

export interface PortInfo {
	label: string;
	tooltip: string;
	description: string;
	iconStatus: IconStatus;
	contextValue: string;
	localUrl: string;
	iconPath?: vscode.ThemeIcon;
}

interface ExposedPort extends PortsStatus.AsObject {
	exposed: ExposedPortInfo.AsObject;
}
function isExposedPort(port: PortsStatus.AsObject | undefined): port is ExposedPort {
	return !!port?.exposed;
}
interface ExposedServedPort extends ExposedPort {
	served: true;
}
function isExposedServedPort(port: PortsStatus.AsObject | undefined): port is ExposedServedPort {
	return isExposedPort(port) && !!port.served;
}
interface ExposedServedGitpodWorkspacePort extends GitpodWorkspacePort {
	status: ExposedServedPort;
}
function isExposedServedGitpodWorkspacePort(port: GitpodWorkspacePort | undefined): port is ExposedServedGitpodWorkspacePort {
	return port instanceof GitpodWorkspacePort && isExposedServedPort(port.status);
}

class PortTreeItem extends vscode.TreeItem {
	constructor(
		public port: GitpodWorkspacePort,
	) {
		super('' + port.portNumber);
	}
}

class PortsTreeItem extends vscode.TreeItem {
	readonly ports = new Map<number, PortTreeItem>();
}

type GitpodWorkspaceElement = PortsTreeItem | PortTreeItem;

export class GitpodWorkspaceTreeDataProvider implements vscode.TreeDataProvider<GitpodWorkspaceElement> {

	readonly ports = new PortsTreeItem('Ports', vscode.TreeItemCollapsibleState.Expanded);
	readonly portViewNotice = new PortsTreeItem('Please try new Ports view and provide your feedback', vscode.TreeItemCollapsibleState.None);

	protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<GitpodWorkspaceElement | undefined>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	private readonly onDidExposeServedPortEmitter = new vscode.EventEmitter<ExposedServedGitpodWorkspacePort>();
	readonly onDidExposeServedPort = this.onDidExposeServedPortEmitter.event;


	constructor(private readonly context: GitpodExtensionContext, private readonly isPortsViewExperimentEnable?: boolean) {
		this.portViewNotice.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('foreground'));
		this.portViewNotice.command = {
			title: '',
			command: 'gitpod.portsView.focus'
		};
	}

	getTreeItem(element: GitpodWorkspaceElement): vscode.TreeItem {
		return element;
	}

	getChildren(element?: GitpodWorkspaceElement): vscode.ProviderResult<GitpodWorkspaceElement[]> {
		if (!element) {
			return [this.ports];
		}
		if (element === this.ports) {
			const list: GitpodWorkspaceElement[] = [...this.ports.ports.values()];
			if (this.isPortsViewExperimentEnable) {
				list.unshift(this.portViewNotice);
			}
			return list;
		}
		return [];
	}

	getParent(element: GitpodWorkspaceElement): GitpodWorkspaceElement | undefined {
		if (element instanceof PortTreeItem) {
			return this.ports;
		}
		return undefined;
	}

	private tunnelMap = new Map<number, vscode.TunnelDescription>();
	updateTunnels(tunnelMap: Map<number, vscode.TunnelDescription>): void {
		this.tunnelMap = tunnelMap;
		this.update();
	}

	private portStatus: PortsStatusResponse | undefined;
	updatePortsStatus(portsStatus: PortsStatusResponse): void {
		this.portStatus = portsStatus;
		this.update();
	}

	private updating = false;
	private update(): void {
		if (this.updating) {
			return;
		}
		this.updating = true;
		try {
			if (!this.portStatus) {
				return;
			}
			const toClean = new Set<number>(this.ports.ports.keys());
			const portsList = this.portStatus.getPortsList();
			for (const portStatus of portsList) {
				const localPort = portStatus.getLocalPort();
				const tunnel = this.tunnelMap.get(localPort);
				toClean?.delete(localPort);
				const port = this.ports.ports.get(localPort) || new PortTreeItem(new GitpodWorkspacePort(localPort, this.context, portStatus, tunnel));
				const prevStatus = port.port.status;
				this.ports.ports.set(localPort, port);

				port.port.update(portStatus, tunnel);

				port.label = port.port.info.label;
				port.tooltip = port.port.info.tooltip;
				port.description = port.port.info.description;
				port.iconPath = port.port.info.iconPath;
				port.contextValue = port.port.info.contextValue;

				if (!this.isPortsViewExperimentEnable) {
					if (isExposedServedGitpodWorkspacePort(port.port) && !isExposedServedPort(prevStatus)) {
						this.onDidExposeServedPortEmitter.fire(port.port);
					}
				}
			}
			for (const port of toClean) {
				this.ports.ports.delete(port);
			}
			this.onDidChangeTreeDataEmitter.fire(this.ports);
		} finally {
			this.updating = false;
		}
	}
}

export const PortCommands = <const>['tunnelNetwork', 'tunnelHost', 'makePublic', 'makePrivate', 'preview', 'openBrowser', 'retryAutoExpose', 'urlCopy', 'queryPortData'];

export type PortCommand = typeof PortCommands[number];

export class GitpodPortViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitpod.portsView';

	public _view?: vscode.WebviewView;

	readonly portMap = new Map<number, GitpodWorkspacePort>();

	private readonly onDidExposeServedPortEmitter = new vscode.EventEmitter<ExposedServedGitpodWorkspacePort>();
	readonly onDidExposeServedPort = this.onDidExposeServedPortEmitter.event;


	private readonly onDidChangePortsEmitter = new vscode.EventEmitter<Map<number, GitpodWorkspacePort>>();
	readonly onDidChangePorts = this.onDidChangePortsEmitter.event;

	constructor(private readonly context: GitpodExtensionContext) { }

	// @ts-ignore
	resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
		webviewView.onDidChangeVisibility(() => {
			if (!webviewView.visible) {
				return;
			}
			this.updateHtml();
		});
		this.onHtmlCommand();
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'portsview', 'public', 'bundle.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'portsview', 'public', 'bundle.css'));
		const nonce = getNonce();
		// <meta
		// 		csp-nonce
		//         http-equiv="Content-Security-Policy"
		//         content="default-src 'none'; img-src data: ${webview.cspSource}; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
		//         />
		return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />

                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link nonce="${nonce}" href="${styleUri}" rel="stylesheet" />
                <title>Gitpod Port View</title>
            </head>
            <body></body>
            <script nonce="${nonce}" src="${scriptUri}"></script>
            </html>`;
	}

	private tunnelsMap = new Map<number, vscode.TunnelDescription>();
	updateTunnels(tunnelsMap: Map<number, vscode.TunnelDescription>): void {
		this.tunnelsMap = tunnelsMap;
		this.update();
	}

	private portStatus: PortsStatusResponse | undefined;
	updatePortsStatus(portsStatus: PortsStatusResponse): void {
		this.portStatus = portsStatus;
		this.update();
	}

	private updating = false;
	private update(): void {
		if (this.updating) { return; }
		this.updating = true;
		try {
			if (!this.portStatus) { return; }
			this.portStatus.getPortsList().forEach(e => {
				const localPort = e.getLocalPort();
				const gitpodPort = this.portMap.get(localPort);
				const tunnel = this.tunnelsMap.get(localPort);
				if (!gitpodPort) {
					this.portMap.set(localPort, new GitpodWorkspacePort(localPort, this.context, e, tunnel));
					return;
				}
				const prevStatus = gitpodPort.status;
				gitpodPort.update(e, tunnel);
				if (isExposedServedGitpodWorkspacePort(gitpodPort) && !isExposedServedPort(prevStatus)) {
					this.onDidExposeServedPortEmitter.fire(gitpodPort);
				}
			});
			this.onDidChangePortsEmitter.fire(this.portMap);
			this.updateHtml();
		} finally {
			this.updating = false;
		}
	}

	private updateHtml(): void {
		const ports = Array.from(this.portMap.values()).map(e => e.toSvelteObject());
		this._view?.webview.postMessage({ command: 'updatePorts', ports });
	}

	private onHtmlCommand() {
		this._view?.webview.onDidReceiveMessage(async (message: { command: PortCommand; port: { info: PortInfo; status: PortsStatus.AsObject } }) => {
			if (message.command === 'queryPortData') {
				this.updateHtml();
				return;
			}
			const port = this.portMap.get(message.port.status.localPort);
			if (!port) { return; }
			if (message.command === 'urlCopy' && port.status.exposed) {
				await vscode.env.clipboard.writeText(port.status.exposed.url);
				return;
			}
			vscode.commands.executeCommand('gitpod.ports.' + message.command, { port, isWebview: true });
		});
	}
}

export function getNonce() {
	let text = '';
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

interface PortItem { port: GitpodWorkspacePort; isWebview?: boolean }

export function registerPorts(context: GitpodExtensionContext): void {
	const experimentCfg = vscode.workspace.getConfiguration('gitpod.experimental');
	const isPortsViewExperimentEnable = experimentCfg.get<boolean>('portsView.enabled');

	const portMap = new Map<number, GitpodWorkspacePort>();
	const tunnelMap = new Map<number, vscode.TunnelDescription>();

	// register tree view
	const gitpodWorkspaceTreeDataProvider = new GitpodWorkspaceTreeDataProvider(context, isPortsViewExperimentEnable);
	const treeView = vscode.window.createTreeView('gitpod.workspace', { treeDataProvider: gitpodWorkspaceTreeDataProvider });
	context.subscriptions.push(treeView);

	// register webview
	let portViewProvider: GitpodPortViewProvider | undefined;
	if (isPortsViewExperimentEnable) {
		vscode.commands.executeCommand('setContext', 'gitpod.portsView.visible', true);
		portViewProvider = new GitpodPortViewProvider(context);
		context.subscriptions.push(vscode.window.registerWebviewViewProvider(GitpodPortViewProvider.viewType, portViewProvider, { webviewOptions: { retainContextWhenHidden: true } }));
	}

	function observePortsStatus(): vscode.Disposable {
		let run = true;
		let stopUpdates: Function | undefined;
		(async () => {
			while (run) {
				try {
					const req = new PortsStatusRequest();
					req.setObserve(true);
					const evts = context.supervisor.status.portsStatus(req, context.supervisor.metadata);
					stopUpdates = evts.cancel.bind(evts);

					await new Promise((resolve, reject) => {
						evts.on('end', resolve);
						evts.on('error', reject);
						evts.on('data', (update: PortsStatusResponse) => {
							portMap.clear();
							update.getPortsList().forEach(e => {
								const portNumber = e.getLocalPort();
								portMap.set(portNumber, new GitpodWorkspacePort(portNumber, context, e, tunnelMap.get(portNumber)));
							});
							portViewProvider?.updatePortsStatus(update);
							gitpodWorkspaceTreeDataProvider.updatePortsStatus(update);
						});
					});
				} catch (err) {
					if (!('code' in err && err.code === grpc.status.CANCELLED)) {
						context.logger.error('cannot maintain connection to supervisor', err);
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
		// eslint-disable-next-line no-async-promise-executor
		return new Promise<string>(async (resolve, reject) => {
			try {
				const tryResolve = () => {
					const port = portMap.get(portNumber);
					const exposed = port?.status?.exposed;
					if (exposed) {
						resolve(exposed.url);
						return true;
					}
					return false;
				};
				if (!tryResolve()) {
					const listenerWebview = portViewProvider?.onDidChangePorts(element => {
						if (element === portViewProvider?.portMap && tryResolve()) {
							listenerWebview?.dispose();
						}
					});
					const listener = gitpodWorkspaceTreeDataProvider.onDidChangeTreeData(element => {
						if (element === gitpodWorkspaceTreeDataProvider.ports && tryResolve()) {
							listener.dispose();
						}
					});
					const request = new ExposePortRequest();
					request.setPort(portNumber);
					await util.promisify(context.supervisor.control.exposePort.bind(context.supervisor.control, request, context.supervisor.metadata, {
						deadline: Date.now() + context.supervisor.deadlines.normal
					}))();
				}
			} catch (e) {
				reject(e);
			}
		});
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.makePrivate', ({ port, isWebview }: PortItem) => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_ports',
			properties: { action: 'private', isWebview: !!isWebview }
		});
		return port.setPortVisibility('private');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.makePublic', ({ port, isWebview }: PortItem) => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_ports',
			properties: { action: 'public', isWebview: !!isWebview }
		});
		return port.setPortVisibility('public');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.tunnelNetwork', ({ port }: PortItem) => {
		port.setTunnelVisibility(TunnelVisiblity.NETWORK);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.tunnelHost', async ({ port }: PortItem) =>
		port.setTunnelVisibility(TunnelVisiblity.HOST)
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.preview', ({ port, isWebview }: PortItem) => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_ports',
			properties: { action: 'preview', isWebview: !!isWebview }
		});
		return openPreview(port);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.openBrowser', ({ port, isWebview }: PortItem) => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_ports',
			properties: { action: 'openBrowser', isWebview: !!isWebview }
		});
		return port.openExternal();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.retryAutoExpose', async ({ port }: PortItem) => {
		const request = new RetryAutoExposeRequest();
		request.setPort(port.portNumber);
		await util.promisify(context.supervisor.port.retryAutoExpose.bind(context.supervisor.port, request, context.supervisor.metadata, {
			deadline: Date.now() + context.supervisor.deadlines.normal
		}))();
	}));

	const portsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	context.subscriptions.push(portsStatusBarItem);
	function updateStatusBar(): void {
		const exposedPorts: number[] = [];

		for (const port of portMap.values()) {
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
		portsStatusBarItem.command = isPortsViewExperimentEnable ? 'gitpod.portsView.focus' : 'gitpod.ports.reveal';
		portsStatusBarItem.show();
	}
	updateStatusBar();
	if (isPortsViewExperimentEnable && !!portViewProvider) {
		context.subscriptions.push(portViewProvider.onDidChangePorts(() => updateStatusBar()));
	} else {
		context.subscriptions.push(gitpodWorkspaceTreeDataProvider.onDidChangeTreeData(() => updateStatusBar()));
	}
	context.subscriptions.push(gitpodWorkspaceTreeDataProvider.onDidChangeTreeData(() => updateStatusBar()));

	context.subscriptions.push(vscode.commands.registerCommand('gitpod.ports.reveal', () => {
		treeView.reveal(gitpodWorkspaceTreeDataProvider.ports, {
			focus: true,
			expand: true
		});
	}));

	const currentNotifications = new Set<number>();
	async function showOpenServiceNotification(port: GitpodWorkspacePort, offerMakePublic = false): Promise<void> {
		const localPort = port.portNumber;
		if (currentNotifications.has(localPort)) {
			return;
		}

		const makePublic = 'Make Public';
		const openAction = 'Open Preview';
		const openExternalAction = 'Open Browser';
		const actions = offerMakePublic ? [makePublic, openAction, openExternalAction] : [openAction, openExternalAction];

		currentNotifications.add(localPort);
		const result = await vscode.window.showInformationMessage('A service is available on port ' + localPort, ...actions);
		currentNotifications.delete(localPort);

		if (result === makePublic) {
			await port.setPortVisibility('public');
		} else if (result === openAction) {
			await openPreview(port);
		} else if (result === openExternalAction) {
			await port.openExternal();
		}
	}
	async function openPreview(port: GitpodWorkspacePort): Promise<void> {
		await previewUrl(port.externalUrl.toString());
	}
	async function previewUrl(url: string): Promise<void> {
		await vscode.commands.executeCommand('simpleBrowser.api.open', url, {
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true
		});
	}
	let provider: GitpodWorkspaceTreeDataProvider | GitpodPortViewProvider = gitpodWorkspaceTreeDataProvider;
	if (isPortsViewExperimentEnable && !!portViewProvider) {
		provider = portViewProvider;
	}
	context.subscriptions.push(provider.onDidExposeServedPort(port => {
		if (port.status.exposed.onExposed === OnPortExposedAction.IGNORE) {
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.OPEN_BROWSER) {
			port.openExternal();
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.OPEN_PREVIEW) {
			openPreview(port);
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.NOTIFY) {
			showOpenServiceNotification(port);
			return;
		}

		if (port.status.exposed.onExposed === OnPortExposedAction.NOTIFY_PRIVATE) {
			showOpenServiceNotification(port, port.status.exposed.visibility !== PortVisibility.PUBLIC);
			return;
		}
	}));

	let updateTunnelsTokenSource: vscode.CancellationTokenSource | undefined;
	async function updateTunnels(): Promise<void> {
		if (updateTunnelsTokenSource) {
			updateTunnelsTokenSource.cancel();
		}
		updateTunnelsTokenSource = new vscode.CancellationTokenSource();
		const token = updateTunnelsTokenSource.token;
		// not vscode.workspace.tunnels because of https://github.com/microsoft/vscode/issues/124334
		const currentTunnels = (await vscode.commands.executeCommand('gitpod.getTunnels')) as vscode.TunnelDescription[];
		if (token.isCancellationRequested) {
			return;
		}
		tunnelMap.clear();
		currentTunnels.forEach(tunnel => {
			tunnelMap.set(tunnel.remoteAddress.port, tunnel);
		});
		portViewProvider?.updateTunnels(tunnelMap);
		gitpodWorkspaceTreeDataProvider.updateTunnels(tunnelMap);
	}
	updateTunnels();
	context.subscriptions.push(vscode.workspace.onDidChangeTunnels(() => updateTunnels()));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.vscode.workspace.openTunnel', (tunnelOptions: vscode.TunnelOptions) => {
		return vscode.workspace.openTunnel(tunnelOptions);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.api.openTunnel', async (tunnelOptions: vscode.TunnelOptions, _tunnelCreationOptions: vscode.TunnelCreationOptions) => {
		const request = new TunnelPortRequest();
		request.setPort(tunnelOptions.remoteAddress.port);
		request.setTargetPort(tunnelOptions.localAddressPort || tunnelOptions.remoteAddress.port);
		request.setVisibility(!!tunnelOptions?.public ? TunnelVisiblity.NETWORK : TunnelVisiblity.HOST);
		await util.promisify(context.supervisor.port.tunnel.bind(context.supervisor.port, request, context.supervisor.metadata, {
			deadline: Date.now() + context.supervisor.deadlines.normal
		}))();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.api.closeTunnel', async (port: number) => {
		const request = new CloseTunnelRequest();
		request.setPort(port);
		await util.promisify(context.supervisor.port.closeTunnel.bind(context.supervisor.port, request, context.supervisor.metadata, {
			deadline: Date.now() + context.supervisor.deadlines.normal
		}))();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.dev.enableForwardedPortsView', () =>
		vscode.commands.executeCommand('setContext', 'forwardedPortsViewEnabled', true)
	));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.dev.connectLocalApp', async () => {
		const apiPortInput = await vscode.window.showInputBox({
			title: 'Connect to Local App',
			prompt: 'Enter Local App API port',
			value: '63100',
			validateInput: value => {
				const port = Number(value);
				if (port <= 0) {
					return 'port should be greater than 0';
				}
				if (port >= 65535) {
					return 'port should be less than 65535';
				}
				return undefined;
			}
		});
		if (apiPortInput) {
			const apiPort = Number(apiPortInput);
			vscode.commands.executeCommand('gitpod.api.connectLocalApp', apiPort);
		}
	}));
}

export function registerWelcomeWalkthroughCommands(context: GitpodExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.welcome.createTerminalAndRunDockerCommand', () => {
		const terminal = vscode.window.createTerminal('Welcome');
		terminal.show();
		terminal.sendText('docker run hello-world');
	}));
}

export function startWelcomeWalkthrough(context: vscode.ExtensionContext, versionKey: string): void {
	type WalkthroughVersion = number;
	const currentVersion: WalkthroughVersion = 0.1;
	const lastVersionShown = context.globalState.get<number>(versionKey);

	if (typeof lastVersionShown === 'number' || vscode.window.visibleTextEditors.length !== 0) {
		return;
	}

	context.globalState.update(versionKey, currentVersion);
	vscode.commands.executeCommand('workbench.action.openWalkthrough', 'gitpod.gitpod-web#gitpod-getstarted', false);
}
interface IOpenVSXExtensionsMetadata {
	name: string;
	namespace: string;
	version: string;
	allVersions?: { [version: string]: string };
}

interface IOpenVSXQueryResult {
	extensions: IOpenVSXExtensionsMetadata[];
}

async function validateExtensions(extensionsToValidate: { id: string; version?: string }[], linkToValidate: string[], token: vscode.CancellationToken) {
	const allUserExtensions = vscode.extensions.all.filter(ext => !ext.packageJSON['isBuiltin'] && !ext.packageJSON['isUserBuiltin']);

	const lookup = new Set<string>(extensionsToValidate.map(({ id }) => id));
	const uninstalled = new Set<string>([...lookup]);
	lookup.add('github.vscode-pull-request-github');
	const missingMachined = new Set<string>();
	for (const extension of allUserExtensions) {
		const id = extension.id.toLowerCase();
		const packageBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, 'package.json'));
		const rawPackage = JSON.parse(packageBytes.toString());
		const isMachineScoped = !!rawPackage['__metadata']?.['isMachineScoped'];
		uninstalled.delete(id);
		if (isMachineScoped && !lookup.has(id)) {
			missingMachined.add(id);
		}

		if (token.isCancellationRequested) {
			return {
				extensions: [],
				missingMachined: [],
				uninstalled: [],
				links: []
			};
		}
	}

	const validatedExtensions = new Set<string>();
	for (const { id, version } of extensionsToValidate) {
		const queryResult: IOpenVSXQueryResult | undefined = await fetch(
			`${process.env.VSX_REGISTRY_URL || 'https://open-vsx.org'}/api/-/query`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify({
					extensionId: id
				}),
				timeout: 2000
			}
		).then(resp => {
			if (!resp.ok) {
				console.error('Failed to query open-vsx while validating gitpod.yml');
				return undefined;
			}
			return resp.json() as Promise<IOpenVSXQueryResult>;
		}, e => {
			console.error('Fetch failed while querying open-vsx', e);
			return undefined;
		});

		const openvsxExtensionMetadata = queryResult?.extensions?.[0];
		if (openvsxExtensionMetadata) {
			if (!version || (openvsxExtensionMetadata.version === version || !!openvsxExtensionMetadata.allVersions?.[version])) {
				validatedExtensions.add(id);
			}
		}

		if (token.isCancellationRequested) {
			return {
				extensions: [],
				missingMachined: [],
				uninstalled: [],
				links: []
			};
		}
	}

	const links = new Set<string>();
	for (const link of linkToValidate) {
		const downloadPath = path.join(os.tmpdir(), uuid.v4());
		try {
			await download(link, downloadPath, token, 10000);
			const manifest = await getManifest(downloadPath);
			if (manifest.engines?.vscode) {
				links.add(link);
			}
		} catch (error) {
			console.error('Failed to validate vsix url', error);
		}

		if (token.isCancellationRequested) {
			return {
				extensions: [],
				missingMachined: [],
				uninstalled: [],
				links: []
			};
		}
	}

	return {
		extensions: [...validatedExtensions],
		missingMachined: [...missingMachined],
		uninstalled: [...uninstalled],
		links: [...links]
	};
}

export function registerExtensionManagement(context: GitpodExtensionContext): void {
	const { GitpodPluginModel, isYamlSeq, isYamlScalar } = context.config;
	const gitpodFileUri = vscode.Uri.file(path.join(context.info.getCheckoutLocation(), '.gitpod.yml'));
	async function modifyGipodPluginModel(unitOfWork: (model: GitpodPluginModel) => void): Promise<void> {
		let document: vscode.TextDocument | undefined;
		let content = '';
		try {
			await util.promisify(fs.access.bind(fs))(gitpodFileUri.fsPath, fs.constants.F_OK);
			document = await vscode.workspace.openTextDocument(gitpodFileUri);
			content = document.getText();
		} catch { /* no-op */ }
		const model = new GitpodPluginModel(content);
		unitOfWork(model);
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
	}
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.extensions.addToConfig', (id: string) => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_config',
			properties: { action: 'add' }
		});
		return modifyGipodPluginModel(model => model.add(id));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.extensions.removeFromConfig', (id: string) => {
		context.fireAnalyticsEvent({
			eventName: 'vscode_execute_command_gitpod_config',
			properties: { action: 'remove' }
		});
		return modifyGipodPluginModel(model => model.remove(id));
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gitpod.extensions.installFromConfig', (id: string) => vscode.commands.executeCommand('workbench.extensions.installExtension', id, { donotSync: true })));
	const deprecatedUserExtensionMessage = 'user uploaded extensions are deprecated';
	const extensionNotFoundMessageSuffix = ' extension is not found in Open VSX';
	const invalidVSIXLinkMessageSuffix = ' does not point to a valid VSIX file';
	const missingExtensionMessageSuffix = ' extension is not synced, but not added in .gitpod.yml';
	const uninstalledExtensionMessageSuffix = ' extension is not installed, but not removed from .gitpod.yml';
	const gitpodDiagnostics = vscode.languages.createDiagnosticCollection('gitpod');
	const validateGitpodFileDelayer = new ThrottledDelayer(150);
	const validateExtensionseDelayer = new ThrottledDelayer(1000); /** it can be very expensive for links to big extensions */
	let validateGitpodFileTokenSource: vscode.CancellationTokenSource | undefined;
	let resolveAllDeprecated: vscode.CodeAction | undefined;
	function validateGitpodFile(): void {
		resolveAllDeprecated = undefined;
		if (validateGitpodFileTokenSource) {
			validateGitpodFileTokenSource.cancel();
		}
		validateGitpodFileTokenSource = new vscode.CancellationTokenSource();
		const token = validateGitpodFileTokenSource.token;
		validateGitpodFileDelayer.trigger(async () => {
			if (token.isCancellationRequested) {
				return;
			}
			let diagnostics: vscode.Diagnostic[] | undefined;
			function pushDiagnostic(diagnostic: vscode.Diagnostic): void {
				if (!diagnostics) {
					diagnostics = [];
				}
				diagnostics.push(diagnostic);
			}
			function publishDiagnostics(): void {
				if (!token.isCancellationRequested) {
					gitpodDiagnostics.set(gitpodFileUri, diagnostics);
				}
			}
			try {
				const toLink = new Map<string, vscode.Range>();
				const toFind = new Map<string, { version?: string; range: vscode.Range }>();
				let document: vscode.TextDocument | undefined;
				try {
					document = await vscode.workspace.openTextDocument(gitpodFileUri);
				} catch { }
				if (token.isCancellationRequested) {
					return;
				}
				const model = document && new GitpodPluginModel(document.getText());
				const extensions = model && model.document.getIn(['vscode', 'extensions'], true);
				if (document && extensions && isYamlSeq(extensions)) {
					resolveAllDeprecated = new vscode.CodeAction('Resolve all against Open VSX.', vscode.CodeActionKind.QuickFix);
					resolveAllDeprecated.diagnostics = [];
					resolveAllDeprecated.isPreferred = true;
					for (let i = 0; i < extensions.items.length; i++) {
						const item = extensions.items[i];
						if (!isYamlScalar(item) || !item.range) {
							continue;
						}
						const extension = item.value;
						if (!(typeof extension === 'string')) {
							continue;
						}
						let link: vscode.Uri | undefined;
						try {
							link = vscode.Uri.parse(extension.trim(), true);
							if (link.scheme !== 'http' && link.scheme !== 'https') {
								link = undefined;
							}
						} catch { }
						if (link) {
							toLink.set(link.toString(), new vscode.Range(document.positionAt(item.range[0]), document.positionAt(item.range[1])));
						} else {
							const [idAndVersion, hash] = extension.trim().split(':', 2);
							if (hash) {
								const hashOffset = item.range[0] + extension.indexOf(':');
								const range = new vscode.Range(document.positionAt(hashOffset), document.positionAt(item.range[1]));

								const diagnostic = new vscode.Diagnostic(range, deprecatedUserExtensionMessage, vscode.DiagnosticSeverity.Warning);
								diagnostic.source = 'gitpod';
								diagnostic.tags = [vscode.DiagnosticTag.Deprecated];
								pushDiagnostic(diagnostic);
								resolveAllDeprecated.diagnostics.unshift(diagnostic);
							}
							const [id, version] = idAndVersion.split('@', 2);
							toFind.set(id.toLowerCase(), { version, range: new vscode.Range(document.positionAt(item.range[0]), document.positionAt(item.range[1])) });
						}
					}
					if (resolveAllDeprecated.diagnostics.length) {
						resolveAllDeprecated.edit = new vscode.WorkspaceEdit();
						for (const diagnostic of resolveAllDeprecated.diagnostics) {
							resolveAllDeprecated.edit.delete(gitpodFileUri, diagnostic.range);
						}
					} else {
						resolveAllDeprecated = undefined;
					}
					publishDiagnostics();
				}

				await validateExtensionseDelayer.trigger(async () => {
					if (token.isCancellationRequested) {
						return;
					}

					const extensionsToValidate = [...toFind.entries()].map(([id, { version }]) => ({ id, version }));
					const linksToValidate = [...toLink.keys()];
					const result = await validateExtensions(extensionsToValidate, linksToValidate, token);

					if (token.isCancellationRequested) {
						return;
					}

					const notFound = new Set([...toFind.keys()]);
					for (const id of result.extensions) {
						notFound.delete(id.toLowerCase());
					}
					for (const id of notFound) {
						const { range, version } = toFind.get(id)!;
						let message = id;
						if (version) {
							message += '@' + version;
						}
						message += extensionNotFoundMessageSuffix;
						const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
						diagnostic.source = 'gitpod';
						pushDiagnostic(diagnostic);
					}

					for (const link of result.links) {
						toLink.delete(link);
					}
					for (const [link, range] of toLink) {
						const diagnostic = new vscode.Diagnostic(range, link + invalidVSIXLinkMessageSuffix, vscode.DiagnosticSeverity.Error);
						diagnostic.source = 'gitpod';
						pushDiagnostic(diagnostic);
					}

					for (const id of result.missingMachined) {
						const diagnostic = new vscode.Diagnostic(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)), id + missingExtensionMessageSuffix, vscode.DiagnosticSeverity.Warning);
						diagnostic.source = 'gitpod';
						pushDiagnostic(diagnostic);
					}

					for (const id of result.uninstalled) {
						if (notFound.has(id)) {
							continue;
						}
						const extension = toFind.get(id);
						if (extension) {
							let message = id;
							if (extension.version) {
								message += '@' + extension.version;
							}
							message += uninstalledExtensionMessageSuffix;
							const diagnostic = new vscode.Diagnostic(extension.range, message, vscode.DiagnosticSeverity.Warning);
							diagnostic.source = 'gitpod';
							pushDiagnostic(diagnostic);
						}
					}
				});
			} finally {
				publishDiagnostics();
			}
		});
	}
	function createSearchExtensionCodeAction(id: string, diagnostic: vscode.Diagnostic) {
		const title = `Search for ${id} in Open VSX.`;
		const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		codeAction.diagnostics = [diagnostic];
		codeAction.isPreferred = true;
		codeAction.command = {
			title: title,
			command: 'workbench.extensions.search',
			arguments: ['@id:' + id]
		};
		return codeAction;
	}
	function createAddToConfigCodeAction(id: string, diagnostic: vscode.Diagnostic) {
		const title = `Add ${id} extension to .gitpod.yml.`;
		const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		codeAction.diagnostics = [diagnostic];
		codeAction.isPreferred = true;
		codeAction.command = {
			title: title,
			command: 'gitpod.extensions.addToConfig',
			arguments: [id]
		};
		return codeAction;
	}
	function createRemoveFromConfigCodeAction(id: string, diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.CodeAction {
		const title = `Remove ${id} extension from .gitpod.yml.`;
		const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		codeAction.diagnostics = [diagnostic];
		codeAction.isPreferred = true;
		codeAction.command = {
			title: title,
			command: 'gitpod.extensions.removeFromConfig',
			arguments: [document.getText(diagnostic.range)]
		};
		return codeAction;
	}
	function createInstallFromConfigCodeAction(id: string, diagnostic: vscode.Diagnostic) {
		const title = `Install ${id} extension from .gitpod.yml.`;
		const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		codeAction.diagnostics = [diagnostic];
		codeAction.isPreferred = false;
		codeAction.command = {
			title: title,
			command: 'gitpod.extensions.installFromConfig',
			arguments: [id]
		};
		return codeAction;
	}
	function createUninstallExtensionCodeAction(id: string, diagnostic: vscode.Diagnostic) {
		const title = `Uninstall ${id} extension.`;
		const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		codeAction.diagnostics = [diagnostic];
		codeAction.isPreferred = false;
		codeAction.command = {
			title: title,
			command: 'workbench.extensions.uninstallExtension',
			arguments: [id]
		};
		return codeAction;
	}
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider({
		pattern: gitpodFileUri.fsPath
	}, {
		provideCodeActions: (document, _, context) => {
			const codeActions: vscode.CodeAction[] = [];
			for (const diagnostic of context.diagnostics) {
				if (diagnostic.message === deprecatedUserExtensionMessage) {
					if (resolveAllDeprecated) {
						codeActions.push(resolveAllDeprecated);
					}
					const codeAction = new vscode.CodeAction('Resolve against Open VSX.', vscode.CodeActionKind.QuickFix);
					codeAction.diagnostics = [diagnostic];
					codeAction.isPreferred = false;
					const singleEdit = new vscode.WorkspaceEdit();
					singleEdit.delete(document.uri, diagnostic.range);
					codeAction.edit = singleEdit;
					codeActions.push(codeAction);
				}
				const notFoundIndex = diagnostic.message.indexOf(extensionNotFoundMessageSuffix);
				if (notFoundIndex !== -1) {
					const id = diagnostic.message.substr(0, notFoundIndex);
					codeActions.push(createRemoveFromConfigCodeAction(id, diagnostic, document));
					codeActions.push(createSearchExtensionCodeAction(id, diagnostic));
				}
				const missingIndex = diagnostic.message.indexOf(missingExtensionMessageSuffix);
				if (missingIndex !== -1) {
					const id = diagnostic.message.substr(0, missingIndex);
					codeActions.push(createAddToConfigCodeAction(id, diagnostic));
					codeActions.push(createUninstallExtensionCodeAction(id, diagnostic));
				}
				const uninstalledIndex = diagnostic.message.indexOf(uninstalledExtensionMessageSuffix);
				if (uninstalledIndex !== -1) {
					const id = diagnostic.message.substr(0, uninstalledIndex);
					codeActions.push(createRemoveFromConfigCodeAction(id, diagnostic, document));
					codeActions.push(createInstallFromConfigCodeAction(id, diagnostic));
				}
				const invalidVSIXIndex = diagnostic.message.indexOf(invalidVSIXLinkMessageSuffix);
				if (invalidVSIXIndex !== -1) {
					const link = diagnostic.message.substr(0, invalidVSIXIndex);
					codeActions.push(createRemoveFromConfigCodeAction(link, diagnostic, document));
				}
			}
			return codeActions;
		}
	}));

	validateGitpodFile();
	context.subscriptions.push(gitpodDiagnostics);
	const gitpodFileWatcher = vscode.workspace.createFileSystemWatcher(gitpodFileUri.fsPath);
	context.subscriptions.push(gitpodFileWatcher);
	context.subscriptions.push(gitpodFileWatcher.onDidCreate(() => validateGitpodFile()));
	context.subscriptions.push(gitpodFileWatcher.onDidChange(() => validateGitpodFile()));
	context.subscriptions.push(gitpodFileWatcher.onDidDelete(() => validateGitpodFile()));
	context.subscriptions.push(vscode.extensions.onDidChange(() => validateGitpodFile()));
}

async function registerDesktop(): Promise<void> {
	const config = vscode.workspace.getConfiguration('gitpod.openInStable');
	if (config.get<boolean>('neverPrompt') === true) {
		return;
	}
	const openAction = 'Open';
	const neverAgain = 'Don\'t Show Again';
	const action = await vscode.window.showInformationMessage('Do you want to open this workspace in VS Code Desktop?', openAction, neverAgain);
	if (action === openAction) {
		vscode.commands.executeCommand('gitpod.openInStable');
	} else if (action === neverAgain) {
		config.update('neverPrompt', true, true);
	}
}
