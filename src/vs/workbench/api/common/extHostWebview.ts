/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import * as objects from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { normalizeVersion, parseVersion } from '../../../platform/extensions/common/extensionValidator.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostApiDeprecationService } from './extHostApiDeprecationService.js';
import { deserializeWebviewMessage, serializeWebviewMessage } from './extHostWebviewMessaging.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { WebviewRemoteInfo, asWebviewUri, webviewGenericCspSource } from '../../contrib/webview/common/webview.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import type * as vscode from 'vscode';
import * as extHostProtocol from './extHost.protocol.js';

export class ExtHostWebview implements vscode.Webview {

	readonly #handle: extHostProtocol.WebviewHandle;
	readonly #proxy: extHostProtocol.MainThreadWebviewsShape;
	readonly #deprecationService: IExtHostApiDeprecationService;

	readonly #remoteInfo: WebviewRemoteInfo;
	readonly #workspace: IExtHostWorkspace | undefined;
	readonly #extension: IExtensionDescription;

	#html: string = '';
	#options: vscode.WebviewOptions;
	#isDisposed: boolean = false;
	#hasCalledAsWebviewUri = false;

	#serializeBuffersForPostMessage: boolean;
	#shouldRewriteOldResourceUris: boolean;

	constructor(
		handle: extHostProtocol.WebviewHandle,
		proxy: extHostProtocol.MainThreadWebviewsShape,
		options: vscode.WebviewOptions,
		remoteInfo: WebviewRemoteInfo,
		workspace: IExtHostWorkspace | undefined,
		extension: IExtensionDescription,
		deprecationService: IExtHostApiDeprecationService,
	) {
		this.#handle = handle;
		this.#proxy = proxy;
		this.#options = options;
		this.#remoteInfo = remoteInfo;
		this.#workspace = workspace;
		this.#extension = extension;
		this.#serializeBuffersForPostMessage = shouldSerializeBuffersForPostMessage(extension);
		this.#shouldRewriteOldResourceUris = shouldTryRewritingOldResourceUris(extension);
		this.#deprecationService = deprecationService;
	}

	/* internal */ readonly _onMessageEmitter = new Emitter<any>();
	public readonly onDidReceiveMessage: Event<any> = this._onMessageEmitter.event;

	readonly #onDidDisposeEmitter = new Emitter<void>();
	/* internal */ readonly _onDidDispose: Event<void> = this.#onDidDisposeEmitter.event;

	public dispose() {
		this.#isDisposed = true;

		this.#onDidDisposeEmitter.fire();

		this.#onDidDisposeEmitter.dispose();
		this._onMessageEmitter.dispose();
	}

	public asWebviewUri(resource: vscode.Uri): vscode.Uri {
		this.#hasCalledAsWebviewUri = true;
		return asWebviewUri(resource, this.#remoteInfo);
	}

	public get cspSource(): string {
		const extensionLocation = this.#extension.extensionLocation;
		if (extensionLocation.scheme === Schemas.https || extensionLocation.scheme === Schemas.http) {
			// The extension is being served up from a CDN.
			// Also include the CDN in the default csp.
			let extensionCspRule = extensionLocation.toString();
			if (!extensionCspRule.endsWith('/')) {
				// Always treat the location as a directory so that we allow all content under it
				extensionCspRule += '/';
			}
			return extensionCspRule + ' ' + webviewGenericCspSource;
		}
		return webviewGenericCspSource;
	}

	public get html(): string {
		this.assertNotDisposed();
		return this.#html;
	}

	public set html(value: string) {
		this.assertNotDisposed();
		if (this.#html !== value) {
			this.#html = value;
			if (this.#shouldRewriteOldResourceUris && !this.#hasCalledAsWebviewUri && /(["'])vscode-resource:([^\s'"]+?)(["'])/i.test(value)) {
				this.#hasCalledAsWebviewUri = true;
				this.#deprecationService.report('Webview vscode-resource: uris', this.#extension,
					`Please migrate to use the 'webview.asWebviewUri' api instead: https://aka.ms/vscode-webview-use-aswebviewuri`);
			}
			this.#proxy.$setHtml(this.#handle, this.rewriteOldResourceUrlsIfNeeded(value));
		}
	}

	public get options(): vscode.WebviewOptions {
		this.assertNotDisposed();
		return this.#options;
	}

	public set options(newOptions: vscode.WebviewOptions) {
		this.assertNotDisposed();

		if (!objects.equals(this.#options, newOptions)) {
			this.#proxy.$setOptions(this.#handle, serializeWebviewOptions(this.#extension, this.#workspace, newOptions));
		}

		this.#options = newOptions;
	}

	public async postMessage(message: any): Promise<boolean> {
		if (this.#isDisposed) {
			return false;
		}
		const serialized = serializeWebviewMessage(message, { serializeBuffersForPostMessage: this.#serializeBuffersForPostMessage });
		return this.#proxy.$postMessage(this.#handle, serialized.message, ...serialized.buffers);
	}

	private assertNotDisposed() {
		if (this.#isDisposed) {
			throw new Error('Webview is disposed');
		}
	}

	private rewriteOldResourceUrlsIfNeeded(value: string): string {
		if (!this.#shouldRewriteOldResourceUris) {
			return value;
		}

		const isRemote = this.#extension.extensionLocation?.scheme === Schemas.vscodeRemote;
		const remoteAuthority = this.#extension.extensionLocation.scheme === Schemas.vscodeRemote ? this.#extension.extensionLocation.authority : undefined;
		return value
			.replace(/(["'])(?:vscode-resource):(\/\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, startQuote, _1, scheme, path, endQuote) => {
				const uri = URI.from({
					scheme: scheme || 'file',
					path: decodeURIComponent(path),
				});
				const webviewUri = asWebviewUri(uri, { isRemote, authority: remoteAuthority }).toString();
				return `${startQuote}${webviewUri}${endQuote}`;
			})
			.replace(/(["'])(?:vscode-webview-resource):(\/\/[^\s\/'"]+\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, startQuote, _1, scheme, path, endQuote) => {
				const uri = URI.from({
					scheme: scheme || 'file',
					path: decodeURIComponent(path),
				});
				const webviewUri = asWebviewUri(uri, { isRemote, authority: remoteAuthority }).toString();
				return `${startQuote}${webviewUri}${endQuote}`;
			});
	}
}

export function shouldSerializeBuffersForPostMessage(extension: IExtensionDescription): boolean {
	try {
		const version = normalizeVersion(parseVersion(extension.engines.vscode));
		return !!version && version.majorBase >= 1 && version.minorBase >= 57;
	} catch {
		return false;
	}
}

function shouldTryRewritingOldResourceUris(extension: IExtensionDescription): boolean {
	try {
		const version = normalizeVersion(parseVersion(extension.engines.vscode));
		if (!version) {
			return false;
		}

		return version.majorBase < 1 || (version.majorBase === 1 && version.minorBase < 60);
	} catch {
		return false;
	}
}

export class ExtHostWebviews extends Disposable implements extHostProtocol.ExtHostWebviewsShape {

	private readonly _webviewProxy: extHostProtocol.MainThreadWebviewsShape;

	private readonly _webviews = new Map<extHostProtocol.WebviewHandle, ExtHostWebview>();

	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly remoteInfo: WebviewRemoteInfo,
		private readonly workspace: IExtHostWorkspace | undefined,
		private readonly _logService: ILogService,
		private readonly _deprecationService: IExtHostApiDeprecationService,
	) {
		super();
		this._webviewProxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadWebviews);
	}

	public override dispose(): void {
		super.dispose();

		for (const webview of this._webviews.values()) {
			webview.dispose();
		}
		this._webviews.clear();
	}

	public $onMessage(
		handle: extHostProtocol.WebviewHandle,
		jsonMessage: string,
		buffers: SerializableObjectWithBuffers<VSBuffer[]>
	): void {
		const webview = this.getWebview(handle);
		if (webview) {
			const { message } = deserializeWebviewMessage(jsonMessage, buffers.value);
			webview._onMessageEmitter.fire(message);
		}
	}

	public $onMissingCsp(
		_handle: extHostProtocol.WebviewHandle,
		extensionId: string
	): void {
		this._logService.warn(`${extensionId} created a webview without a content security policy: https://aka.ms/vscode-webview-missing-csp`);
	}

	public createNewWebview(handle: string, options: extHostProtocol.IWebviewContentOptions, extension: IExtensionDescription): ExtHostWebview {
		const webview = new ExtHostWebview(handle, this._webviewProxy, reviveOptions(options), this.remoteInfo, this.workspace, extension, this._deprecationService);
		this._webviews.set(handle, webview);

		const sub = webview._onDidDispose(() => {
			sub.dispose();
			this.deleteWebview(handle);
		});

		return webview;
	}

	public deleteWebview(handle: string) {
		this._webviews.delete(handle);
	}

	private getWebview(handle: extHostProtocol.WebviewHandle): ExtHostWebview | undefined {
		return this._webviews.get(handle);
	}
}

export function toExtensionData(extension: IExtensionDescription): extHostProtocol.WebviewExtensionDescription {
	return { id: extension.identifier, location: extension.extensionLocation };
}

export function serializeWebviewOptions(
	extension: IExtensionDescription,
	workspace: IExtHostWorkspace | undefined,
	options: vscode.WebviewOptions,
): extHostProtocol.IWebviewContentOptions {
	return {
		enableCommandUris: options.enableCommandUris,
		enableScripts: options.enableScripts,
		enableForms: options.enableForms,
		portMapping: options.portMapping,
		localResourceRoots: options.localResourceRoots || getDefaultLocalResourceRoots(extension, workspace)
	};
}

function reviveOptions(options: extHostProtocol.IWebviewContentOptions): vscode.WebviewOptions {
	return {
		enableCommandUris: options.enableCommandUris,
		enableScripts: options.enableScripts,
		enableForms: options.enableForms,
		portMapping: options.portMapping,
		localResourceRoots: options.localResourceRoots?.map(components => URI.from(components)),
	};
}

function getDefaultLocalResourceRoots(
	extension: IExtensionDescription,
	workspace: IExtHostWorkspace | undefined,
): URI[] {
	return [
		...(workspace?.getWorkspaceFolders() || []).map(x => x.uri),
		extension.extensionLocation,
	];
}
