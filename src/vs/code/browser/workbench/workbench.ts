/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference types='@gitpod/gitpod-protocol/lib/typings/globals'/>

import { isStandalone } from 'vs/base/browser/browser';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { isFolderToOpen, isWorkspaceToOpen } from 'vs/platform/windows/common/windows';
import { commands, create, IHomeIndicator, IWorkspace, IWorkspaceProvider } from 'vs/workbench/workbench.web.api';
import { defaultWebSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { join } from 'vs/base/common/path';
import product from 'vs/platform/product/common/product';
import { extractLocalHostUriMetaDataForPortMapping } from 'vs/platform/remote/common/tunnel';
import type { IDEState } from '@gitpod/gitpod-protocol/lib/ide-service';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { parseLogLevel } from 'vs/platform/log/common/log';

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

let _state: IDEState = 'init';
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
	if (_state === 'terminated') {
		return Disposable.None;
	}

	const info: {
		workspaceLocationFile?: string
		workspaceLocationFolder?: string
		userHome: string
	} = await infoResponse.json();


	const remotePort = location.protocol === 'https:' ? '443' : '80';
	const remoteAuthority = window.location.host + ':' + remotePort;
	const remoteUserDataElement = document.getElementById('vscode-remote-user-data-uri');
	if (remoteUserDataElement) {
		remoteUserDataElement.setAttribute('data-settings', JSON.stringify({
			scheme: 'vscode-remote',
			authority: remoteAuthority,
			path: join(info.userHome, product.dataFolderName)
		}));
	}

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
		href: 'https://gitpod.io',
		icon: 'code',
		title: localize('home', "Home")
	};

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
		logLevel: logLevel ? parseLogLevel(logLevel) : undefined
	});
}

if (devMode) {
	doStart();
} else {
	window.gitpod.ideService = {
		get state() {
			return _state;
		},
		onDidChange: onDidChangeEmitter.event,
		start: () => start()
	};
}
