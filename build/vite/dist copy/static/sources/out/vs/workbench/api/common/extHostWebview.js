/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import * as objects from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { normalizeVersion, parseVersion } from '../../../platform/extensions/common/extensionValidator.js';
import { deserializeWebviewMessage, serializeWebviewMessage } from './extHostWebviewMessaging.js';
import { asWebviewUri, webviewGenericCspSource } from '../../contrib/webview/common/webview.js';
import * as extHostProtocol from './extHost.protocol.js';
export class ExtHostWebview {
    #handle;
    #proxy;
    #deprecationService;
    #remoteInfo;
    #workspace;
    #extension;
    #html;
    #options;
    #isDisposed;
    #hasCalledAsWebviewUri;
    #serializeBuffersForPostMessage;
    #shouldRewriteOldResourceUris;
    constructor(handle, proxy, options, remoteInfo, workspace, extension, deprecationService) {
        this.#html = '';
        this.#isDisposed = false;
        this.#hasCalledAsWebviewUri = false;
        /* internal */ this._onMessageEmitter = new Emitter();
        this.onDidReceiveMessage = this._onMessageEmitter.event;
        this.#onDidDisposeEmitter = new Emitter();
        /* internal */ this._onDidDispose = this.#onDidDisposeEmitter.event;
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
    #onDidDisposeEmitter;
    dispose() {
        this.#isDisposed = true;
        this.#onDidDisposeEmitter.fire();
        this.#onDidDisposeEmitter.dispose();
        this._onMessageEmitter.dispose();
    }
    asWebviewUri(resource) {
        this.#hasCalledAsWebviewUri = true;
        return asWebviewUri(resource, this.#remoteInfo);
    }
    get cspSource() {
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
    get html() {
        this.assertNotDisposed();
        return this.#html;
    }
    set html(value) {
        this.assertNotDisposed();
        if (this.#html !== value) {
            this.#html = value;
            if (this.#shouldRewriteOldResourceUris && !this.#hasCalledAsWebviewUri && /(["'])vscode-resource:([^\s'"]+?)(["'])/i.test(value)) {
                this.#hasCalledAsWebviewUri = true;
                this.#deprecationService.report('Webview vscode-resource: uris', this.#extension, `Please migrate to use the 'webview.asWebviewUri' api instead: https://aka.ms/vscode-webview-use-aswebviewuri`);
            }
            this.#proxy.$setHtml(this.#handle, this.rewriteOldResourceUrlsIfNeeded(value));
        }
    }
    get options() {
        this.assertNotDisposed();
        return this.#options;
    }
    set options(newOptions) {
        this.assertNotDisposed();
        if (!objects.equals(this.#options, newOptions)) {
            this.#proxy.$setOptions(this.#handle, serializeWebviewOptions(this.#extension, this.#workspace, newOptions));
        }
        this.#options = newOptions;
    }
    async postMessage(message) {
        if (this.#isDisposed) {
            return false;
        }
        const serialized = serializeWebviewMessage(message, { serializeBuffersForPostMessage: this.#serializeBuffersForPostMessage });
        return this.#proxy.$postMessage(this.#handle, serialized.message, ...serialized.buffers);
    }
    assertNotDisposed() {
        if (this.#isDisposed) {
            throw new Error('Webview is disposed');
        }
    }
    rewriteOldResourceUrlsIfNeeded(value) {
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
export function shouldSerializeBuffersForPostMessage(extension) {
    try {
        const version = normalizeVersion(parseVersion(extension.engines.vscode));
        return !!version && version.majorBase >= 1 && version.minorBase >= 57;
    }
    catch {
        return false;
    }
}
function shouldTryRewritingOldResourceUris(extension) {
    try {
        const version = normalizeVersion(parseVersion(extension.engines.vscode));
        if (!version) {
            return false;
        }
        return version.majorBase < 1 || (version.majorBase === 1 && version.minorBase < 60);
    }
    catch {
        return false;
    }
}
export class ExtHostWebviews extends Disposable {
    constructor(mainContext, remoteInfo, workspace, _logService, _deprecationService) {
        super();
        this.remoteInfo = remoteInfo;
        this.workspace = workspace;
        this._logService = _logService;
        this._deprecationService = _deprecationService;
        this._webviews = new Map();
        this._webviewProxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadWebviews);
    }
    dispose() {
        super.dispose();
        for (const webview of this._webviews.values()) {
            webview.dispose();
        }
        this._webviews.clear();
    }
    $onMessage(handle, jsonMessage, buffers) {
        const webview = this.getWebview(handle);
        if (webview) {
            const { message } = deserializeWebviewMessage(jsonMessage, buffers.value);
            webview._onMessageEmitter.fire(message);
        }
    }
    $onMissingCsp(_handle, extensionId) {
        this._logService.warn(`${extensionId} created a webview without a content security policy: https://aka.ms/vscode-webview-missing-csp`);
    }
    createNewWebview(handle, options, extension) {
        const webview = new ExtHostWebview(handle, this._webviewProxy, reviveOptions(options), this.remoteInfo, this.workspace, extension, this._deprecationService);
        this._webviews.set(handle, webview);
        const sub = webview._onDidDispose(() => {
            sub.dispose();
            this.deleteWebview(handle);
        });
        return webview;
    }
    deleteWebview(handle) {
        this._webviews.delete(handle);
    }
    getWebview(handle) {
        return this._webviews.get(handle);
    }
}
export function toExtensionData(extension) {
    return { id: extension.identifier, location: extension.extensionLocation };
}
export function serializeWebviewOptions(extension, workspace, options) {
    return {
        enableCommandUris: options.enableCommandUris,
        enableScripts: options.enableScripts,
        enableForms: options.enableForms,
        portMapping: options.portMapping,
        localResourceRoots: options.localResourceRoots || getDefaultLocalResourceRoots(extension, workspace)
    };
}
function reviveOptions(options) {
    return {
        enableCommandUris: options.enableCommandUris,
        enableScripts: options.enableScripts,
        enableForms: options.enableForms,
        portMapping: options.portMapping,
        localResourceRoots: options.localResourceRoots?.map(components => URI.from(components)),
    };
}
function getDefaultLocalResourceRoots(extension, workspace) {
    return [
        ...(workspace?.getWorkspaceFolders() || []).map(x => x.uri),
        extension.extensionLocation,
    ];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFdlYnZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0V2Vidmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFJM0csT0FBTyxFQUFFLHlCQUF5QixFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFbEcsT0FBTyxFQUFxQixZQUFZLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUduSCxPQUFPLEtBQUssZUFBZSxNQUFNLHVCQUF1QixDQUFDO0FBRXpELE1BQU0sT0FBTyxjQUFjO0lBRWpCLE9BQU8sQ0FBZ0M7SUFDdkMsTUFBTSxDQUEwQztJQUNoRCxtQkFBbUIsQ0FBZ0M7SUFFbkQsV0FBVyxDQUFvQjtJQUMvQixVQUFVLENBQWdDO0lBQzFDLFVBQVUsQ0FBd0I7SUFFM0MsS0FBSyxDQUFjO0lBQ25CLFFBQVEsQ0FBd0I7SUFDaEMsV0FBVyxDQUFrQjtJQUM3QixzQkFBc0IsQ0FBUztJQUUvQiwrQkFBK0IsQ0FBVTtJQUN6Qyw2QkFBNkIsQ0FBVTtJQUV2QyxZQUNDLE1BQXFDLEVBQ3JDLEtBQThDLEVBQzlDLE9BQThCLEVBQzlCLFVBQTZCLEVBQzdCLFNBQXdDLEVB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