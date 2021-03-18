/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference types='@gitpod/gitpod-protocol/lib/typings/globals'/>

import type { IDEFrontendState } from '@gitpod/gitpod-protocol/lib/ide-frontend-service';
import { isStandalone } from 'vs/base/browser/browser';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { parseLogLevel } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { defaultWebSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { extractLocalHostUriMetaDataForPortMapping } from 'vs/platform/remote/common/tunnel';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { isFolderToOpen, isWorkspaceToOpen } from 'vs/platform/windows/common/windows';
import { commands, create, ICredentialsProvider, IHomeIndicator, IWorkspace, IWorkspaceProvider } from 'vs/workbench/workbench.web.api';

interface ICredential {
	service: string;
	account: string;
	password: string;
}

class LocalStorageCredentialsProvider implements ICredentialsProvider {

	static readonly CREDENTIALS_OPENED_KEY = 'credentials.provider';

	private _credentials: ICredential[] | undefined;
	private get credentials(): ICredential[] {
		if (!this._credentials) {
			try {
				const serializedCredentials = window.localStorage.getItem(LocalStorageCredentialsProvider.CREDENTIALS_OPENED_KEY);
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
		window.localStorage.setItem(LocalStorageCredentialsProvider.CREDENTIALS_OPENED_KEY, JSON.stringify(this.credentials));
	}

	async getPassword(service: string, account: string): Promise<string | null> {
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
		this.deletePassword(service, account);

		this.credentials.push({ service, account, password });

		this.save();
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
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

	async findPassword(_service: string): Promise<string | null> {
		return null;
	}

	async findCredentials(_service: string): Promise<Array<{ account: string, password: string }>> {
		return [];
	}

}

class WorkspaceProvider implements IWorkspaceProvider {

	static QUERY_PARAM_EMPTY_WINDOW = 'ew';
	static QUERY_PARAM_FOLDER = 'folder';
	static QUERY_PARAM_WORKSPACE = 'workspace';

	static QUERY_PARAM_PAYLOAD = 'payload';

	readonly trusted = true;

	constructor(
		public readonly workspace: IWorkspace,
		public readonly payload: object
	) { }

	async open(workspace: IWorkspace, options?: { reuse?: boolean, payload?: object }): Promise<void> {
		if (options?.reuse && !options.payload && this.isSame(this.workspace, workspace)) {
			return; // return early if workspace and environment is not changing and we are reusing window
		}

		const targetHref = this.createTargetUrl(workspace, options);
		if (targetHref) {
			if (options?.reuse) {
				window.location.href = targetHref;
			} else {
				if (isStandalone) {
					window.open(targetHref, '_blank', 'toolbar=no'); // ensures to open another 'standalone' window!
				} else {
					window.open(targetHref);
				}
			}
		}
	}

	private createTargetUrl(workspace: IWorkspace, options?: { reuse?: boolean, payload?: object }): string | undefined {

		// Empty
		let targetHref: string | undefined = undefined;
		if (!workspace) {
			targetHref = `${document.location.origin}${document.location.pathname}?${WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW}=true`;
		}

		// Folder
		else if (isFolderToOpen(workspace)) {
			targetHref = `${document.location.origin}${document.location.pathname}?${WorkspaceProvider.QUERY_PARAM_FOLDER}=${encodeURIComponent(workspace.folderUri.toString())}`;
		}

		// Workspace
		else if (isWorkspaceToOpen(workspace)) {
			targetHref = `${document.location.origin}${document.location.pathname}?${WorkspaceProvider.QUERY_PARAM_WORKSPACE}=${encodeURIComponent(workspace.workspaceUri.toString())}`;
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

	const info: {
		workspaceId: string
		instanceId: string
		checkoutLocation: string
		workspaceLocationFile?: string
		workspaceLocationFolder?: string
		userHome: string
		gitpodHost: string
		gitpodApi: {
			host: string
		}
		workspaceContextUrl: string
	} = await infoResponse.json();
	if (_state as any === 'terminated') {
		return Disposable.None;
	}

	const remotePort = location.protocol === 'https:' ? '443' : '80';
	const remoteAuthority = window.location.host + ':' + remotePort;

	const webWorkerExtensionHostEndpoint = new URL(document.baseURI);
	webWorkerExtensionHostEndpoint.host = 'extensions-' + webWorkerExtensionHostEndpoint.host;
	webWorkerExtensionHostEndpoint.pathname += (location.protocol === 'https:'
		? 'out/vs/workbench/services/extensions/worker/httpsWebWorkerExtensionHostIframe.html'
		: 'out/vs/workbench/services/extensions/worker/httpsWebWorkerExtensionHostIframe.html');
	webWorkerExtensionHostEndpoint.search = '';
	webWorkerExtensionHostEndpoint.hash = '';

	const webviewEndpoint = new URL(document.baseURI);
	webviewEndpoint.host = 'webview-' + webviewEndpoint.host;
	webviewEndpoint.pathname += 'out/vs/workbench/contrib/webview/browser/pre';
	webviewEndpoint.search = '';
	webviewEndpoint.hash = '';

	// Find workspace to open and payload
	let foundWorkspace = false;
	let workspace: IWorkspace;
	let payload = Object.create(null);
	let logLevel: string | undefined = undefined;

	const query = new URL(document.location.href).searchParams;
	query.forEach((value, key) => {
		switch (key) {

			// Folder
			case WorkspaceProvider.QUERY_PARAM_FOLDER:
				workspace = { folderUri: URI.parse(value) };
				foundWorkspace = true;
				break;

			// Workspace
			case WorkspaceProvider.QUERY_PARAM_WORKSPACE:
				workspace = { workspaceUri: URI.parse(value) };
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
					payload = JSON.parse(value);
				} catch (error) {
					console.error(error); // possible invalid JSON
				}
				break;

			// Log level
			case 'logLevel':
				logLevel = value;
				break;
		}
	});

	if (!foundWorkspace) {
		if (info.workspaceLocationFile) {
			workspace = {
				workspaceUri: URI.from({
					scheme: 'vscode-remote',
					authority: remoteAuthority,
					path: info.workspaceLocationFile
				})
			};
		} else if (info.workspaceLocationFolder) {
			workspace = {
				folderUri: URI.from({
					scheme: 'vscode-remote',
					authority: remoteAuthority,
					path: info.workspaceLocationFolder
				})
			};
		}
	}

	// Workspace Provider
	const workspaceProvider = new WorkspaceProvider(workspace, payload);

	const homeIndicator: IHomeIndicator = {
		href: info.gitpodHost,
		icon: 'code',
		title: localize('home', "Home")
	};

	const gitpodHostURL = new URL(info.gitpodHost);
	const gitpodDomain = gitpodHostURL.protocol + '//*.' + gitpodHostURL.host;
	const syncStoreURL = info.gitpodHost + '/code-sync';

	const credentialsProvider = new LocalStorageCredentialsProvider();
	interface GetTokenResponse {
		token: string
		user?: string
		scope?: string[]
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
		type AuthenticationSessionInfo = { readonly id: string, readonly accessToken: string, readonly providerId: string, readonly canSignOut?: boolean };
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

	return create(document.body, {
		remoteAuthority,
		webviewEndpoint: webviewEndpoint.toString(),
		webSocketFactory: {
			create: url => {
				const codeServerUrl = new URL(url);
				codeServerUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
				codeServerUrl.port = remotePort;
				return defaultWebSocketFactory.create(codeServerUrl.toString());
			}
		},
		workspaceProvider,
		resolveExternalUri: async (uri) => {
			const localhost = extractLocalHostUriMetaDataForPortMapping(uri);
			if (!localhost) {
				return uri;
			}
			const publicUrl = (await commands.executeCommand('gitpod.resolveExternalPort', localhost.port)) as any as string;
			return URI.parse(publicUrl);
		},
		homeIndicator,
		windowIndicator: {
			onDidChange: Event.None,
			label: `$(remote) Gitpod`,
			tooltip: 'Editing on Gitpod'
		},
		initialColorTheme: {
			themeType: ColorScheme.DARK
		},
		logLevel: logLevel ? parseLogLevel(logLevel) : undefined,
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
			}
		},
		defaultLayout: {
			views: [{
				id: 'terminal'
			}]
		},
		settingsSyncOptions: {
			enabled: true,
			enablementHandler: enablement => {
				// TODO
			}
		},
		_wrapWebWorkerExtHostInIframe: true,
		webWorkerExtensionHostIframeSrc: webWorkerExtensionHostEndpoint.toString()
	});
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
