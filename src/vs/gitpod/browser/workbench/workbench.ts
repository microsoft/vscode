/* eslint-disable code-import-patterns */
/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/// <reference types='@gitpod/gitpod-protocol/lib/typings/globals'/>

import type { IDEFrontendState } from '@gitpod/gitpod-protocol/lib/ide-frontend-service';
import type { Status, TunnelStatus } from '@gitpod/local-app-api-grpcweb';
import { isStandalone } from 'vs/base/browser/browser';
import { CancellationToken } from 'vs/base/common/cancellation';
import { parse } from 'vs/base/common/marshalling';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { request } from 'vs/base/parts/request/browser/request';
import { localize } from 'vs/nls';
import product from 'vs/platform/product/common/product';
import { isFolderToOpen, isWorkspaceToOpen } from 'vs/platform/window/common/window';
import { commands, create, ICommand, ICredentialsProvider, ITunnel, ITunnelProvider, IURLCallbackProvider, IWorkbenchConstructionOptions, IWorkspace, IWorkspaceProvider } from 'vs/workbench/workbench.web.main';
import { posix } from 'vs/base/common/path';
import { ltrim } from 'vs/base/common/strings';
import { defaultWebSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { extractLocalHostUriMetaDataForPortMapping, isLocalhost } from 'vs/platform/tunnel/common/tunnel';
import { ColorScheme } from 'vs/platform/theme/common/theme';

const loadingGrpc = import('@improbable-eng/grpc-web');
const loadingLocalApp = (async () => {
	// load grpc-web before local-app, see https://github.com/gitpod-io/gitpod/issues/4448
	await loadingGrpc;
	return import('@gitpod/local-app-api-grpcweb');
})();

interface ICredential {
	service: string;
	account: string;
	password: string;
}

class LocalStorageCredentialsProvider implements ICredentialsProvider {

	private static readonly CREDENTIALS_STORAGE_KEY = 'credentials.provider';

	private readonly authService: string | undefined;

	constructor() {
		let authSessionInfo: { readonly id: string; readonly accessToken: string; readonly providerId: string; readonly canSignOut?: boolean; readonly scopes: string[][] } | undefined;
		const authSessionElement = document.getElementById('vscode-workbench-auth-session');
		const authSessionElementAttribute = authSessionElement ? authSessionElement.getAttribute('data-settings') : undefined;
		if (authSessionElementAttribute) {
			try {
				authSessionInfo = JSON.parse(authSessionElementAttribute);
			} catch (error) { /* Invalid session is passed. Ignore. */ }
		}

		if (authSessionInfo) {
			// Settings Sync Entry
			this.setPassword(`${product.urlProtocol}.login`, 'account', JSON.stringify(authSessionInfo));

			// Auth extension Entry
			this.authService = `${product.urlProtocol}-${authSessionInfo.providerId}.login`;
			this.setPassword(this.authService, 'account', JSON.stringify(authSessionInfo.scopes.map(scopes => ({
				id: authSessionInfo!.id,
				scopes,
				accessToken: authSessionInfo!.accessToken
			}))));
		}
	}

	private _credentials: ICredential[] | undefined;
	private get credentials(): ICredential[] {
		if (!this._credentials) {
			try {
				const serializedCredentials = window.localStorage.getItem(LocalStorageCredentialsProvider.CREDENTIALS_STORAGE_KEY);
				if (serializedCredentials) {
					this._credentials = JSON.parse(serializedCredentials);
				}
			} catch (error) {
				// ignore
			}

			if (!Array.isArray(this._credentials)) {
				this._credentials = [];
			}
		}

		return this._credentials;
	}

	private save(): void {
		window.localStorage.setItem(LocalStorageCredentialsProvider.CREDENTIALS_STORAGE_KEY, JSON.stringify(this.credentials));
	}

	async getPassword(service: string, account: string): Promise<string | null> {
		return this.doGetPassword(service, account);
	}

	private async doGetPassword(service: string, account?: string): Promise<string | null> {
		for (const credential of this.credentials) {
			if (credential.service === service) {
				if (typeof account !== 'string' || account === credential.account) {
					return credential.password;
				}
			}
		}

		return null;
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		this.doDeletePassword(service, account);

		this.credentials.push({ service, account, password });

		this.save();

		try {
			if (password && service === this.authService) {
				const value = JSON.parse(password);
				if (Array.isArray(value) && value.length === 0) {
					await this.logout(service);
				}
			}
		} catch (error) {
			console.log(error);
		}
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		const result = await this.doDeletePassword(service, account);

		if (result && service === this.authService) {
			try {
				await this.logout(service);
			} catch (error) {
				console.log(error);
			}
		}

		return result;
	}

	private async doDeletePassword(service: string, account: string): Promise<boolean> {
		let found = false;

		this._credentials = this.credentials.filter(credential => {
			if (credential.service === service && credential.account === account) {
				found = true;

				return false;
			}

			return true;
		});

		if (found) {
			this.save();
		}

		return found;
	}

	async findPassword(service: string): Promise<string | null> {
		return this.doGetPassword(service);
	}

	async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
		return this.credentials
			.filter(credential => credential.service === service)
			.map(({ account, password }) => ({ account, password }));
	}

	private async logout(service: string): Promise<void> {
		const queryValues: Map<string, string> = new Map();
		queryValues.set('logout', String(true));
		queryValues.set('service', service);

		await request({
			url: doCreateUri('/auth/logout', queryValues).toString(true)
		}, CancellationToken.None);
	}

	async clear(): Promise<void> {
		window.localStorage.removeItem(LocalStorageCredentialsProvider.CREDENTIALS_STORAGE_KEY);
	}
}

class LocalStorageURLCallbackProvider extends Disposable implements IURLCallbackProvider {

	private static REQUEST_ID = 0;

	private static QUERY_KEYS: ('scheme' | 'authority' | 'path' | 'query' | 'fragment')[] = [
		'scheme',
		'authority',
		'path',
		'query',
		'fragment'
	];

	private readonly _onCallback = this._register(new Emitter<URI>());
	readonly onCallback = this._onCallback.event;

	private pendingCallbacks = new Set<number>();
	private lastTimeChecked = Date.now();
	private checkCallbacksTimeout: unknown | undefined = undefined;
	private onDidChangeLocalStorageDisposable: IDisposable | undefined;

	constructor(private readonly _callbackRoute: string) {
		super();
	}

	create(options: Partial<UriComponents> = {}): URI {
		const id = ++LocalStorageURLCallbackProvider.REQUEST_ID;
		const queryParams: string[] = [`vscode-reqid=${id}`];

		for (const key of LocalStorageURLCallbackProvider.QUERY_KEYS) {
			const value = options[key];

			if (value) {
				queryParams.push(`vscode-${key}=${encodeURIComponent(value)}`);
			}
		}

		// TODO@joao remove eventually
		// https://github.com/microsoft/vscode-dev/issues/62
		// https://github.com/microsoft/vscode/blob/159479eb5ae451a66b5dac3c12d564f32f454796/extensions/github-authentication/src/githubServer.ts#L50-L50
		if (!(options.authority === 'vscode.github-authentication' && options.path === '/dummy')) {
			const key = `vscode-web.url-callbacks[${id}]`;
			window.localStorage.removeItem(key);

			this.pendingCallbacks.add(id);
			this.startListening();
		}

		return URI.parse(window.location.href).with({ path: this._callbackRoute, query: queryParams.join('&') });
	}

	private startListening(): void {
		if (this.onDidChangeLocalStorageDisposable) {
			return;
		}

		const fn = () => this.onDidChangeLocalStorage();
		window.addEventListener('storage', fn);
		this.onDidChangeLocalStorageDisposable = { dispose: () => window.removeEventListener('storage', fn) };
	}

	private stopListening(): void {
		this.onDidChangeLocalStorageDisposable?.dispose();
		this.onDidChangeLocalStorageDisposable = undefined;
	}

	// this fires every time local storage changes, but we
	// don't want to check more often than once a second
	private async onDidChangeLocalStorage(): Promise<void> {
		const ellapsed = Date.now() - this.lastTimeChecked;

		if (ellapsed > 1000) {
			this.checkCallbacks();
		} else if (this.checkCallbacksTimeout === undefined) {
			this.checkCallbacksTimeout = setTimeout(() => {
				this.checkCallbacksTimeout = undefined;
				this.checkCallbacks();
			}, 1000 - ellapsed);
		}
	}

	private checkCallbacks(): void {
		let pendingCallbacks: Set<number> | undefined;

		for (const id of this.pendingCallbacks) {
			const key = `vscode-web.url-callbacks[${id}]`;
			const result = window.localStorage.getItem(key);

			if (result !== null) {
				try {
					this._onCallback.fire(URI.revive(JSON.parse(result)));
				} catch (error) {
					console.error(error);
				}

				pendingCallbacks = pendingCallbacks ?? new Set(this.pendingCallbacks);
				pendingCallbacks.delete(id);
				window.localStorage.removeItem(key);
			}
		}

		if (pendingCallbacks) {
			this.pendingCallbacks = pendingCallbacks;

			if (this.pendingCallbacks.size === 0) {
				this.stopListening();
			}
		}

		this.lastTimeChecked = Date.now();
	}
}

class WorkspaceProvider implements IWorkspaceProvider {

	private static QUERY_PARAM_EMPTY_WINDOW = 'ew';
	private static QUERY_PARAM_FOLDER = 'folder';
	private static QUERY_PARAM_WORKSPACE = 'workspace';

	private static QUERY_PARAM_PAYLOAD = 'payload';

	static create(config: IWorkbenchConstructionOptions & { folderUri?: UriComponents; workspaceUri?: UriComponents }) {
		let foundWorkspace = false;
		let workspace: IWorkspace;
		let payload = Object.create(null);

		const query = new URL(document.location.href).searchParams;
		query.forEach((value, key) => {
			switch (key) {

				// Folder
				case WorkspaceProvider.QUERY_PARAM_FOLDER:
					if (config.remoteAuthority && value.startsWith(posix.sep)) {
						// when connected to a remote and having a value
						// that is a path (begins with a `/`), assume this
						// is a vscode-remote resource as simplified URL.
						workspace = { folderUri: URI.from({ scheme: Schemas.vscodeRemote, path: value, authority: config.remoteAuthority }) };
					} else {
						workspace = { folderUri: URI.parse(value) };
					}
					foundWorkspace = true;
					break;

				// Workspace
				case WorkspaceProvider.QUERY_PARAM_WORKSPACE:
					if (config.remoteAuthority && value.startsWith(posix.sep)) {
						// when connected to a remote and having a value
						// that is a path (begins with a `/`), assume this
						// is a vscode-remote resource as simplified URL.
						workspace = { workspaceUri: URI.from({ scheme: Schemas.vscodeRemote, path: value, authority: config.remoteAuthority }) };
					} else {
						workspace = { workspaceUri: URI.parse(value) };
					}
					foundWorkspace = true;
					break;

				// Empty
				case WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW:
					workspace = undefined;
					foundWorkspace = true;
					break;

				// Payload
				case WorkspaceProvider.QUERY_PARAM_PAYLOAD:
					try {
						payload = parse(value); // use marshalling#parse() to revive potential URIs
					} catch (error) {
						console.error(error); // possible invalid JSON
					}
					break;
			}
		});

		// If no workspace is provided through the URL, check for config
		// attribute from server and fallback to last opened workspace
		// from storage
		if (!foundWorkspace) {
			if (config.folderUri) {
				workspace = { folderUri: URI.revive(config.folderUri) };
			} else if (config.workspaceUri) {
				workspace = { workspaceUri: URI.revive(config.workspaceUri) };
			}
		}

		return new WorkspaceProvider(workspace, payload, config);
	}

	readonly trusted = true;

	private constructor(
		readonly workspace: IWorkspace,
		readonly payload: object,
		private readonly config: IWorkbenchConstructionOptions
	) {
	}

	async open(workspace: IWorkspace, options?: { reuse?: boolean; payload?: object }): Promise<boolean> {
		if (options?.reuse && !options.payload && this.isSame(this.workspace, workspace)) {
			return true; // return early if workspace and environment is not changing and we are reusing window
		}

		const targetHref = this.createTargetUrl(workspace, options);
		if (targetHref) {
			if (options?.reuse) {
				window.location.href = targetHref;
				return true;
			} else {
				let result;
				if (isStandalone()) {
					result = window.open(targetHref, '_blank', 'toolbar=no'); // ensures to open another 'standalone' window!
				} else {
					result = window.open(targetHref);
				}

				return !!result;
			}
		}
		return false;
	}

	private createTargetUrl(workspace: IWorkspace, options?: { reuse?: boolean; payload?: object }): string | undefined {

		// Empty
		let targetHref: string | undefined = undefined;
		if (!workspace) {
			targetHref = `${document.location.origin}${document.location.pathname}?${WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW}=true`;
		}

		// Folder
		else if (isFolderToOpen(workspace)) {
			let queryParamFolder: string;
			if (this.config.remoteAuthority && workspace.folderUri.scheme === Schemas.vscodeRemote) {
				// when connected to a remote and having a folder
				// for that remote, only use the path as query
				// value to form shorter, nicer URLs.
				// ensure paths are absolute (begin with `/`)
				// clipboard: ltrim(workspace.folderUri.path, posix.sep)
				queryParamFolder = `${posix.sep}${ltrim(workspace.folderUri.path, posix.sep)}`;
			} else {
				queryParamFolder = encodeURIComponent(workspace.folderUri.toString(true));
			}

			targetHref = `${document.location.origin}${document.location.pathname}?${WorkspaceProvider.QUERY_PARAM_FOLDER}=${queryParamFolder}`;
		}

		// Workspace
		else if (isWorkspaceToOpen(workspace)) {
			let queryParamWorkspace: string;
			if (this.config.remoteAuthority && workspace.workspaceUri.scheme === Schemas.vscodeRemote) {
				// when connected to a remote and having a workspace
				// for that remote, only use the path as query
				// value to form shorter, nicer URLs.
				// ensure paths are absolute (begin with `/`)
				queryParamWorkspace = `${posix.sep}${ltrim(workspace.workspaceUri.path, posix.sep)}`;
			} else {
				queryParamWorkspace = encodeURIComponent(workspace.workspaceUri.toString(true));
			}

			targetHref = `${document.location.origin}${document.location.pathname}?${WorkspaceProvider.QUERY_PARAM_WORKSPACE}=${queryParamWorkspace}`;
		}

		// Append payload if any
		if (options?.payload) {
			targetHref += `&${WorkspaceProvider.QUERY_PARAM_PAYLOAD}=${encodeURIComponent(JSON.stringify(options.payload))}`;
		}

		return targetHref;
	}

	private isSame(workspaceA: IWorkspace, workspaceB: IWorkspace): boolean {
		if (!workspaceA || !workspaceB) {
			return workspaceA === workspaceB; // both empty
		}

		if (isFolderToOpen(workspaceA) && isFolderToOpen(workspaceB)) {
			return isEqual(workspaceA.folderUri, workspaceB.folderUri); // same workspace
		}

		if (isWorkspaceToOpen(workspaceA) && isWorkspaceToOpen(workspaceB)) {
			return isEqual(workspaceA.workspaceUri, workspaceB.workspaceUri); // same workspace
		}

		return false;
	}

	hasRemote(): boolean {
		if (this.workspace) {
			if (isFolderToOpen(this.workspace)) {
				return this.workspace.folderUri.scheme === Schemas.vscodeRemote;
			}

			if (isWorkspaceToOpen(this.workspace)) {
				return this.workspace.workspaceUri.scheme === Schemas.vscodeRemote;
			}
		}

		return true;
	}
}

function doCreateUri(path: string, queryValues: Map<string, string>): URI {
	let query: string | undefined = undefined;

	if (queryValues) {
		let index = 0;
		queryValues.forEach((value, key) => {
			if (!query) {
				query = '';
			}

			const prefix = (index++ === 0) ? '' : '&';
			query += `${prefix}${key}=${encodeURIComponent(value)}`;
		});
	}

	return URI.parse(window.location.href).with({ path, query });
}

const devMode = product.nameShort.endsWith(' Dev');

let _state: IDEFrontendState = 'init';
let _failureCause: Error | undefined;
const onDidChangeEmitter = new Emitter<void>();
const toStop = new DisposableStore();
toStop.add(onDidChangeEmitter);
toStop.add({
	dispose: () => {
		_state = 'terminated';
		onDidChangeEmitter.fire();
	}
});

function start(): IDisposable {
	doStart().then(toDoStop => {
		toStop.add(toDoStop);
		_state = 'ready';
		onDidChangeEmitter.fire();
	}, e => {
		_failureCause = e;
		_state = 'terminated';
		onDidChangeEmitter.fire();
	});
	return toStop;
}

interface WorkspaceInfoResponse {
	workspaceId: string;
	instanceId: string;
	checkoutLocation: string;
	workspaceLocationFile?: string;
	workspaceLocationFolder?: string;
	userHome: string;
	gitpodHost: string;
	gitpodApi: { host: string };
	workspaceContextUrl: string;
	workspaceClusterHost: string;
	ideAlias: string;
}

async function doStart(): Promise<IDisposable> {
	let supervisorHost = window.location.host;
	// running from sources
	if (devMode) {
		supervisorHost = supervisorHost.substring(supervisorHost.indexOf('-') + 1);
	}
	const infoResponse = await fetch(window.location.protocol + '//' + supervisorHost + '/_supervisor/v1/info/workspace', {
		credentials: 'include'
	});
	if (!infoResponse.ok) {
		throw new Error(`Getting workspace info failed: ${infoResponse.statusText}`);
	}
	if (_state === 'terminated') {
		return Disposable.None;
	}

	const subscriptions = new DisposableStore();

	const info: WorkspaceInfoResponse = await infoResponse.json();
	if (_state as any === 'terminated') {
		return Disposable.None;
	}

	const remoteAuthority = window.location.host;

	// To make webviews work in development, go to file src/vs/workbench/contrib/webview/browser/pre/main.js
	// and update `signalReady` method to bypass hostname check
	const baseUri = FileAccess.asBrowserUri('', require);
	const uuidUri = `${baseUri.scheme}://{{uuid}}.${info.workspaceClusterHost}${baseUri.path.replace(/^\/blobserve/, '').replace(/\/out\/$/, '')}`;
	const webEndpointUrlTemplate = uuidUri;
	const webviewEndpoint = `${uuidUri}/out/vs/workbench/contrib/webview/browser/pre/`;

	const folderUri = info.workspaceLocationFolder
		? URI.from({
			scheme: Schemas.vscodeRemote,
			authority: remoteAuthority,
			path: info.workspaceLocationFolder
		})
		: undefined;
	const workspaceUri = info.workspaceLocationFile
		? URI.from({
			scheme: Schemas.vscodeRemote,
			authority: remoteAuthority,
			path: info.workspaceLocationFile
		})
		: undefined;

	const gitpodHostURL = new URL(info.gitpodHost);
	const gitpodDomain = gitpodHostURL.protocol + '//*.' + gitpodHostURL.host;
	const syncStoreURL = info.gitpodHost + '/code-sync';

	const credentialsProvider = new LocalStorageCredentialsProvider();
	interface GetTokenResponse {
		token: string;
		user?: string;
		scope?: string[];
	}
	const scopes = [
		'function:accessCodeSyncStorage'
	];
	const tokenResponse = await fetch(window.location.protocol + '//' + supervisorHost + '/_supervisor/v1/token/gitpod/' + info.gitpodApi.host + '/' + scopes.join(','), {
		credentials: 'include'
	});
	if (_state as any === 'terminated') {
		return Disposable.None;
	}
	if (!tokenResponse.ok) {
		console.warn(`Getting Gitpod token failed: ${tokenResponse.statusText}`);
	} else {
		const getToken: GetTokenResponse = await tokenResponse.json();
		if (_state as any === 'terminated') {
			return Disposable.None;
		}

		// see https://github.com/gitpod-io/vscode/blob/gp-code/src/vs/workbench/services/authentication/browser/authenticationService.ts#L34
		type AuthenticationSessionInfo = { readonly id: string; readonly accessToken: string; readonly providerId: string; readonly canSignOut?: boolean };
		const currentSession: AuthenticationSessionInfo = {
			// current session ID should remain stable between window reloads
			// otherwise setting sync will log out
			id: 'gitpod-current-session',
			accessToken: getToken.token,
			providerId: 'gitpod',
			canSignOut: false
		};
		// Settings Sync Entry
		await credentialsProvider.setPassword(`${product.urlProtocol}.login`, 'account', JSON.stringify(currentSession));
		// Auth extension Entry
		await credentialsProvider.setPassword(`${product.urlProtocol}-gitpod.login`, 'account', JSON.stringify([{
			id: currentSession.id,
			scopes: getToken.scope || scopes,
			accessToken: currentSession.accessToken
		}]));
	}
	if (_state as any === 'terminated') {
		return Disposable.None;
	}

	const { grpc } = await loadingGrpc;
	const { LocalAppClient, TunnelStatusRequest, TunnelVisiblity } = await loadingLocalApp;

	//#region tunnels
	class Tunnel implements ITunnel {
		localAddress: string;
		remoteAddress: { port: number; host: string };
		public?: boolean;

		private readonly onDidDisposeEmitter = new Emitter<void>();
		readonly onDidDispose = this.onDidDisposeEmitter.event;
		private disposed = false;
		constructor(
			public status: TunnelStatus.AsObject
		) {
			this.remoteAddress = {
				host: 'localhost',
				port: status.remotePort
			};
			this.localAddress = 'http://localhost:' + status.localPort;
			this.public = status.visibility === TunnelVisiblity.NETWORK;
		}
		async dispose(close = true): Promise<void> {
			if (this.disposed) {
				return;
			}
			this.disposed = true;
			if (close) {
				try {
					await commands.executeCommand('gitpod.api.closeTunnel', this.remoteAddress.port);
				} catch (e) {
					console.error('failed to close tunnel', e);
				}
			}
			this.onDidDisposeEmitter.fire(undefined);
			this.onDidDisposeEmitter.dispose();
		}
	}
	const tunnels = new Map<number, Tunnel>();
	const onDidChangeTunnels = new Emitter<void>();
	function observeTunneled(apiPort: number): IDisposable {
		const client = new LocalAppClient('http://localhost:' + apiPort, {
			transport: grpc.WebsocketTransport()
		});
		commands.executeCommand('setContext', 'gitpod.localAppConnected', true);
		let run = true;
		let stopUpdates: Function | undefined;
		let attempts = 0;
		let reconnectDelay = 1000;
		const maxAttempts = 5;
		(async () => {
			while (run) {
				if (attempts === maxAttempts) {
					commands.executeCommand('setContext', 'gitpod.localAppConnected', false);
					console.error(`could not connect to local app ${maxAttempts} times, giving up, use 'Gitpod: Connect to Local App' command to retry`);
					return;
				}
				let err: Error | undefined;
				let status: Status | undefined;
				try {
					const request = new TunnelStatusRequest();
					request.setObserve(true);
					request.setInstanceId(info.instanceId);
					const stream = client.tunnelStatus(request);
					stopUpdates = stream.cancel.bind(stream);
					status = await new Promise<Status | undefined>(resolve => {
						stream.on('end', resolve);
						stream.on('data', response => {
							attempts = 0;
							reconnectDelay = 1000;
							let notify = false;
							const toDispose = new Set(tunnels.keys());
							for (const status of response.getTunnelsList()) {
								toDispose.delete(status.getRemotePort());
								const tunnel = new Tunnel(status.toObject());
								let existing = tunnels.get(status.getRemotePort());
								if (!existing || existing.public !== tunnel.public) {
									existing?.dispose(false);
									tunnels.set(status.getRemotePort(), tunnel);
									commands.executeCommand('gitpod.vscode.workspace.openTunnel', {
										remoteAddress: tunnel.remoteAddress,
										localAddressPort: tunnel.remoteAddress.port,
										public: tunnel.public
									});
									notify = true;
								}
							}
							for (const port of toDispose) {
								const tunnel = tunnels.get(port);
								if (tunnel) {
									tunnel.dispose(false);
									tunnels.delete(port);
									notify = true;
								}
							}
							if (notify) {
								onDidChangeTunnels.fire(undefined);
							}
						});
					});
				} catch (e) {
					err = e;
				} finally {
					stopUpdates = undefined;
				}
				if (tunnels.size) {
					for (const tunnel of tunnels.values()) {
						tunnel.dispose(false);
					}
					tunnels.clear();
					onDidChangeTunnels.fire(undefined);
				}
				if (status?.code !== grpc.Code.Canceled) {
					console.warn('cannot maintain connection to local app', err || status);
				}
				await new Promise(resolve => setTimeout(resolve, reconnectDelay));
				reconnectDelay = reconnectDelay * 1.5;
				attempts++;
			}
		})();
		return {
			dispose: () => {
				run = false;
				if (stopUpdates) {
					stopUpdates();
				}
			}
		};
	}
	const defaultApiPort = 63100;
	let cancelObserveTunneled = observeTunneled(defaultApiPort);
	subscriptions.add(cancelObserveTunneled);
	const connectLocalApp: ICommand = {
		id: 'gitpod.api.connectLocalApp',
		handler: (apiPort: number = defaultApiPort) => {
			cancelObserveTunneled.dispose();
			cancelObserveTunneled = observeTunneled(apiPort);
			subscriptions.add(cancelObserveTunneled);
		}
	};
	const getTunnels: ICommand = {
		id: 'gitpod.getTunnels',
		handler: () => /* vscode.TunnelDescription[] */ {
			const result: {
				remoteAddress: { port: number; host: string };
				//The complete local address(ex. localhost:1234)
				localAddress: { port: number; host: string } | string;
				public?: boolean;
			}[] = [];
			for (const tunnel of tunnels.values()) {
				result.push({
					remoteAddress: tunnel.remoteAddress,
					localAddress: tunnel.localAddress,
					public: tunnel.public
				});
			}
			return result;
		}
	};
	const tunnelProvider: ITunnelProvider = {
		features: {
			privacyOptions: [
				{
					id: 'public',
					label: 'Public',
					themeIcon: 'eye'
				},
				{
					id: 'private',
					label: 'Private',
					themeIcon: 'lock'
				}
			],
			public: true,
			elevation: false
		},
		tunnelFactory: async (tunnelOptions, tunnelCreationOptions) => {
			const remotePort = tunnelOptions.remoteAddress.port;
			try {
				if (!isLocalhost(tunnelOptions.remoteAddress.host)) {
					throw new Error('only tunneling of localhost is supported, but: ' + tunnelOptions.remoteAddress.host);
				}
				let tunnel = tunnels.get(remotePort);
				if (!tunnel) {
					await commands.executeCommand('gitpod.api.openTunnel', tunnelOptions, tunnelCreationOptions);
					tunnel = tunnels.get(remotePort) || await new Promise<Tunnel>(resolve => {
						const toUnsubscribe = onDidChangeTunnels.event(() => {
							const resolved = tunnels.get(remotePort);
							if (resolved) {
								resolve(resolved);
								toUnsubscribe.dispose();
							}
						});
						subscriptions.add(toUnsubscribe);
					});
				}
				return tunnel;
			} catch (e) {
				console.trace(`failed to tunnel to '${tunnelOptions.remoteAddress.host}':'${remotePort}': `, e);
				// actually should be external URL and this method should never throw
				const tunnel = new Tunnel({
					localPort: remotePort,
					remotePort: remotePort,
					visibility: TunnelVisiblity.NONE
				});
				// closed tunnel, invalidate in next tick
				setTimeout(() => tunnel.dispose(false));
				return tunnel;
			}
		}
	};
	//#endregion

	const getLoggedInUser: ICommand = {
		id: 'gitpod.api.getLoggedInUser',
		handler: () => {
			if (devMode) {
				throw new Error('not supported in dev mode');
			}
			return window.gitpod.service.server.getLoggedInUser();
		}
	};

	subscriptions.add(create(document.body, {
		remoteAuthority,
		webviewEndpoint,
		webSocketFactory: {
			create: (url, debugLabel) => {
				if (_state as any === 'terminated') {
					throw new RemoteAuthorityResolverError('workspace stopped', RemoteAuthorityResolverErrorCode.NotAvailable);
				}
				const socket = defaultWebSocketFactory.create(url, debugLabel);
				const onError = new Emitter<RemoteAuthorityResolverError>();
				socket.onError(e => {
					if (_state as any === 'terminated') {
						// if workspace stopped then don't try to reconnect, regardless how websocket was closed
						e = new RemoteAuthorityResolverError('workspace stopped', RemoteAuthorityResolverErrorCode.NotAvailable, e);
					}
					// otherwise reconnect always
					if (!(e instanceof RemoteAuthorityResolverError)) {
						// by default VS Code does not try to reconnect if the web socket is closed clean:
						// https://github.com/gitpod-io/vscode/blob/7bb129c76b6e95b35758e3e3bc5464ed6ec6397c/src/vs/platform/remote/browser/browserSocketFactory.ts#L150-L152
						// override it as a temporary network error
						e = new RemoteAuthorityResolverError('WebSocket closed', RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable, e);
					}
					onError.fire(e);
				});
				return {
					onData: socket.onData,
					onOpen: socket.onOpen,
					onClose: socket.onClose,
					onError: onError.event,
					send: data => socket.send(data),
					close: () => {
						socket.close();
						onError.dispose();
					}
				};
			}
		},
		workspaceProvider: WorkspaceProvider.create({ remoteAuthority, folderUri, workspaceUri }),
		resolveExternalUri: async (uri) => {
			const localhost = extractLocalHostUriMetaDataForPortMapping(uri);
			if (!localhost) {
				return uri;
			}
			let externalEndpoint: URI;
			const tunnel = tunnels.get(localhost.port);
			if (tunnel) {
				externalEndpoint = URI.parse('http://localhost:' + tunnel.status.localPort);
			} else {
				const publicUrl = (await commands.executeCommand('gitpod.resolveExternalPort', localhost.port)) as any as string;
				externalEndpoint = URI.parse(publicUrl);
			}
			return externalEndpoint.with({
				path: uri.path,
				query: uri.query,
				fragment: uri.fragment
			});
		},
		homeIndicator: {
			href: info.gitpodHost,
			icon: 'code',
			title: localize('home', "Home")
		},
		windowIndicator: {
			onDidChange: Event.None,
			label: `$(gitpod) Gitpod`,
			tooltip: 'Editing on Gitpod'
		},
		initialColorTheme: {
			themeType: ColorScheme.LIGHT,
			// should be aligned with https://github.com/gitpod-io/gitpod-vscode-theme
			colors: {
				'statusBarItem.remoteBackground': '#FF8A00',
				'statusBarItem.remoteForeground': '#f9f9f9',
				'statusBar.background': '#F3F3F3',
				'statusBar.foreground': '#292524',
				'statusBar.noFolderBackground': '#FF8A00',
				'statusBar.debuggingBackground': '#FF8A00',
				'sideBar.background': '#fcfcfc',
				'sideBarSectionHeader.background': '#f9f9f9',
				'activityBar.background': '#f9f9f9',
				'activityBar.foreground': '#292524',
				'editor.background': '#ffffff',
				'button.background': '#FF8A00',
				'button.foreground': '#ffffff',
				'list.activeSelectionBackground': '#e7e5e4',
				'list.activeSelectionForeground': '#292524',
				'list.inactiveSelectionForeground': '#292524',
				'list.inactiveSelectionBackground': '#F9F9F9',
				'minimap.background': '#FCFCFC',
				'minimapSlider.activeBackground': '#F9F9F9',
				'tab.inactiveBackground': '#F9F9F9',
				'editor.selectionBackground': '#FFE4BC',
				'editor.inactiveSelectionBackground': '#FFE4BC',
				'textLink.foreground': '#ffb45b'
			}
		},
		configurationDefaults: {
			'workbench.colorTheme': 'Gitpod Light',
			'workbench.preferredLightColorTheme': 'Gitpod Light',
			'workbench.preferredDarkColorTheme': 'Gitpod Dark',
		},
		urlCallbackProvider: new LocalStorageURLCallbackProvider('/callback'),
		credentialsProvider,
		productConfiguration: {
			linkProtectionTrustedDomains: [
				...(product.linkProtectionTrustedDomains || []),
				gitpodDomain
			],
			'configurationSync.store': {
				url: syncStoreURL,
				stableUrl: syncStoreURL,
				insidersUrl: syncStoreURL,
				canSwitch: false,
				authenticationProviders: {
					gitpod: {
						scopes: ['function:accessCodeSyncStorage']
					}
				}
			},
			webEndpointUrlTemplate
		},
		settingsSyncOptions: {
			enabled: true,
			extensionsSyncStateVersion: info.instanceId,
			enablementHandler: enablement => {
				// TODO
			}
		},
		tunnelProvider,
		commands: [
			getTunnels,
			connectLocalApp,
			getLoggedInUser
		]
	}));
	return subscriptions;
}

if (devMode) {
	doStart();
} else {
	window.gitpod.ideService = {
		get state() {
			return _state;
		},
		get failureCause() {
			return _failureCause;
		},
		onDidChange: onDidChangeEmitter.event,
		start: () => start()
	};
}
