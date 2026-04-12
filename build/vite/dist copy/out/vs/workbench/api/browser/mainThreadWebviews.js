/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MainThreadWebviews_1;
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { isWeb } from '../../../base/common/platform.js';
import { escape } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { deserializeWebviewMessage, serializeWebviewMessage } from '../common/extHostWebviewMessaging.js';
let MainThreadWebviews = class MainThreadWebviews extends Disposable {
    static { MainThreadWebviews_1 = this; }
    static { this.standardSupportedLinkSchemes = new Set([
        Schemas.http,
        Schemas.https,
        Schemas.mailto,
        Schemas.vscode,
        'vscode-insider',
    ]); }
    constructor(context, _openerService, _productService) {
        super();
        this._openerService = _openerService;
        this._productService = _productService;
        this._webviews = new Map();
        this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviews);
    }
    addWebview(handle, webview, options) {
        if (this._webviews.has(handle)) {
            throw new Error('Webview already registered');
        }
        this._webviews.set(handle, webview);
        this.hookupWebviewEventDelegate(handle, webview, options);
    }
    $setHtml(handle, value) {
        this.tryGetWebview(handle)?.setHtml(value);
    }
    $setOptions(handle, options) {
        const webview = this.tryGetWebview(handle);
        if (webview) {
            webview.contentOptions = reviveWebviewContentOptions(options);
        }
    }
    async $postMessage(handle, jsonMessage, ...buffers) {
        const webview = this.tryGetWebview(handle);
        if (!webview) {
            return false;
        }
        const { message, arrayBuffers } = deserializeWebviewMessage(jsonMessage, buffers);
        return webview.postMessage(message, arrayBuffers);
    }
    hookupWebviewEventDelegate(handle, webview, options) {
        const disposables = new DisposableStore();
        disposables.add(webview.onDidClickLink((uri) => this.onDidClickLink(handle, uri)));
        disposables.add(webview.onMessage((message) => {
            const serialized = serializeWebviewMessage(message.message, options);
            this._proxy.$onMessage(handle, serialized.message, new SerializableObjectWithBuffers(serialized.buffers));
        }));
        disposables.add(webview.onMissingCsp((extension) => this._proxy.$onMissingCsp(handle, extension.value)));
        disposables.add(webview.onDidDispose(() => {
            disposables.dispose();
            this._webviews.delete(handle);
        }));
    }
    onDidClickLink(handle, link) {
        const webview = this.getWebview(handle);
        if (this.isSupportedLink(webview, URI.parse(link))) {
            this._openerService.open(link, { fromUserGesture: true, allowContributedOpeners: true, allowCommands: Array.isArray(webview.contentOptions.enableCommandUris) || webview.contentOptions.enableCommandUris === true, fromWorkspace: true });
        }
    }
    isSupportedLink(webview, link) {
        if (MainThreadWebviews_1.standardSupportedLinkSchemes.has(link.scheme)) {
            return true;
        }
        if (!isWeb && this._productService.urlProtocol === link.scheme) {
            return true;
        }
        if (link.scheme === Schemas.command) {
            if (Array.isArray(webview.contentOptions.enableCommandUris)) {
                return webview.contentOptions.enableCommandUris.includes(link.path);
            }
            return webview.contentOptions.enableCommandUris === true;
        }
        return false;
    }
    tryGetWebview(handle) {
        return this._webviews.get(handle);
    }
    getWebview(handle) {
        const webview = this.tryGetWebview(handle);
        if (!webview) {
            throw new Error(`Unknown webview handle:${handle}`);
        }
        return webview;
    }
    getWebviewResolvedFailedContent(viewType) {
        return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body>${localize('errorMessage', "An error occurred while loading view: {0}", escape(viewType))}</body>
		</html>`;
    }
};
MainThreadWebviews = MainThreadWebviews_1 = __decorate([
    __param(1, IOpenerService),
    __param(2, IProductService)
], MainThreadWebviews);
export { MainThreadWebviews };
export function reviveWebviewExtension(extensionData) {
    return {
        id: extensionData.id,
        location: URI.revive(extensionData.location),
    };
}
export function reviveWebviewContentOptions(webviewOptions) {
    return {
        allowScripts: webviewOptions.enableScripts,
        allowForms: webviewOptions.enableForms,
        enableCommandUris: webviewOptions.enableCommandUris,
        localResourceRoots: Array.isArray(webviewOptions.localResourceRoots) ? webviewOptions.localResourceRoots.map(r => URI.revive(r)) : undefined,
        portMapping: webviewOptions.portMapping,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFdlYnZpZXdzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRXZWJ2aWV3cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFHckYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDcEcsT0FBTyxLQUFLLGVBQWUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVuRyxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7O2FBRXpCLGlDQUE0QixHQUFHLElBQUksR0FBRyxDQUFDO1FBQzlELE9BQU8sQ0FBQyxJQUFJO1FBQ1osT0FBTyxDQUFDLEtBQUs7UUFDYixPQUFPLENBQUMsTUFBTTtRQUNkLE9BQU8sQ0FBQyxNQUFNO1FBQ2QsZ0JBQWdCO0tBQ2hCLENBQUMsQUFOa0QsQ0FNakQ7SUFN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