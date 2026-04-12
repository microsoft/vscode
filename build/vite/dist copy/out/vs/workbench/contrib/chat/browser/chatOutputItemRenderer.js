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
import { getWindow } from '../../../../base/browser/dom.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { matchesMimeType } from '../../../../base/common/dataTransfer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebviewService } from '../../../contrib/webview/browser/webview.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
export const IChatOutputRendererService = createDecorator('chatOutputRendererService');
let ChatOutputRendererService = class ChatOutputRendererService extends Disposable {
    constructor(_contextKeyService, _extensionService, _webviewService) {
        super();
        this._contextKeyService = _contextKeyService;
        this._extensionService = _extensionService;
        this._webviewService = _webviewService;
        this._contributions = new Map();
        this._renderers = new Map();
        this._register(chatOutputRenderContributionPoint.setHandler(extensions => {
            this.updateContributions(extensions);
        }));
    }
    registerRenderer(viewType, renderer, options) {
        this._renderers.set(viewType, { viewType, renderer, options });
        return {
            dispose: () => {
                this._renderers.delete(viewType);
            }
        };
    }
    async renderOutputPart(mime, data, parent, webviewOptions, token) {
        const rendererData = await this.getRenderer(mime, token);
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }
        if (!rendererData) {
            throw new Error(`No renderer registered found for mime type: ${mime}`);
        }
        const store = new DisposableStore();
        const webview = store.add(this._webviewService.createWebviewElement({
            title: '',
            origin: webviewOptions.origin ?? generateUuid(),
            providedViewType: rendererData.viewType,
            options: {
                enableFindWidget: false,
                purpose: "chatOutputItem" /* WebviewContentPurpose.ChatOutputItem */,
                tryRestoreScrollPosition: false,
            },
            contentOptions: {},
            extension: rendererData.options.extension ? rendererData.options.extension : undefined,
        }));
        webview.setContextKeyService(store.add(this._contextKeyService.createScoped(parent)));
        const onDidChangeHeight = store.add(new Emitter());
        store.add(autorun(reader => {
            const height = reader.readObservable(webview.intrinsicContentSize);
            if (height) {
                onDidChangeHeight.fire(height.height);
                parent.style.height = `${height.height}px`;
            }
        }));
        if (webviewOptions.webviewState) {
            webview.state = webviewOptions.webviewState;
        }
        webview.mountTo(parent, getWindow(parent));
        await rendererData.renderer.renderOutputPart(mime, data, webview, token);
        return {
            get webview() { return webview; },
            onDidChangeHeight: onDidChangeHeight.event,
            dispose: () => {
                store.dispose();
            },
            reinitialize: () => {
                webview.reinitializeAfterDismount();
            },
        };
    }
    async getRenderer(mime, token) {
        await raceCancellationError(this._extensionService.whenInstalledExtensionsRegistered(), token);
        for (const [id, value] of this._contributions) {
            if (value.mimes.some(m => matchesMimeType(m, [mime]))) {
                await raceCancellationError(this._extensionService.activateByEvent(`onChatOutputRenderer:${id}`), token);
                const rendererData = this._renderers.get(id);
                if (rendererData) {
                    return rendererData;
                }
            }
        }
        return undefined;
    }
    updateContributions(extensions) {
        this._contributions.clear();
        for (const extension of extensions) {
            if (!isProposedApiEnabled(extension.description, 'chatOutputRenderer')) {
                continue;
            }
            for (const contribution of extension.value) {
                if (this._contributions.has(contribution.viewType)) {
                    extension.collector.error(`Chat output renderer with view type '${contribution.viewType}' already registered`);
                    continue;
                }
                this._contributions.set(contribution.viewType, {
                    mimes: contribution.mimeTypes,
                });
            }
        }
    }
};
ChatOutputRendererService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IExtensionService),
    __param(2, IWebviewService)
], ChatOutputRendererService);
export { ChatOutputRendererService };
const chatOutputRendererContributionSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['viewType', 'mimeTypes'],
    properties: {
        viewType: {
            type: 'string',
            description: nls.localize('chatOutputRenderer.viewType', 'Unique identifier for the renderer.'),
        },
        mimeTypes: {
            type: 'array',
            description: nls.localize('chatOutputRenderer.mimeTypes', 'MIME types that this renderer can handle'),
            items: {
                type: 'string'
            }
        }
    }
};
const chatOutputRenderContributionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'chatOutputRenderers',
    activationEventsGenerator: function* (contributions) {
        for (const contrib of contributions) {
            yield `onChatOutputRenderer:${contrib.viewType}`;
        }
    },
    jsonSchema: {
        description: nls.localize('vscode.extension.contributes.chatOutputRenderer', 'Contributes a renderer for specific MIME types in chat outputs'),
        type: 'array',
        items: chatOutputRendererContributionSchema,
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE91dHB1dEl0ZW1SZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0T3V0cHV0SXRlbVJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQVksZUFBZSxFQUF5QixNQUFNLDZDQUE2QyxDQUFDO0FBQy9HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsTUFBTSwyREFBMkQsQ0FBQztBQWFwSCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxlQUFlLENBQTZCLDJC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