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
var ThreadedBackgroundTokenizerFactory_1;
import { canASAR } from '../../../../../amdX.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess, nodeModulesAsarPath, nodeModulesPath } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TextMateWorkerHost } from './worker/textMateWorkerHost.js';
import { TextMateWorkerTokenizerController } from './textMateWorkerTokenizerController.js';
import { WebWorkerDescriptor } from '../../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../../platform/webWorker/browser/webWorkerService.js';
let ThreadedBackgroundTokenizerFactory = class ThreadedBackgroundTokenizerFactory {
    static { ThreadedBackgroundTokenizerFactory_1 = this; }
    static { this._reportedMismatchingTokens = false; }
    constructor(_reportTokenizationTime, _shouldTokenizeAsync, _extensionResourceLoaderService, _configurationService, _languageService, _environmentService, _notificationService, _telemetryService, _webWorkerService) {
        this._reportTokenizationTime = _reportTokenizationTime;
        this._shouldTokenizeAsync = _shouldTokenizeAsync;
        this._extensionResourceLoaderService = _extensionResourceLoaderService;
        this._configurationService = _configurationService;
        this._languageService = _languageService;
        this._environmentService = _environmentService;
        this._notificationService = _notificationService;
        this._telemetryService = _telemetryService;
        this._webWorkerService = _webWorkerService;
        this._workerProxyPromise = null;
        this._worker = null;
        this._workerProxy = null;
        this._workerTokenizerControllers = new Map();
        this._currentTheme = null;
        this._currentTokenColorMap = null;
        this._grammarDefinitions = [];
    }
    dispose() {
        this._disposeWorker();
    }
    // Will be recreated after worker is disposed (because tokenizer is re-registered when languages change)
    createBackgroundTokenizer(textModel, tokenStore, maxTokenizationLineLength) {
        // fallback to default sync background tokenizer
        if (!this._shouldTokenizeAsync() || textModel.isTooLargeForSyncing()) {
            return undefined;
        }
        const store = new DisposableStore();
        const controllerContainer = this._getWorkerProxy().then((workerProxy) => {
            if (store.isDisposed || !workerProxy) {
                return undefined;
            }
            const controllerContainer = { controller: undefined, worker: this._worker };
            store.add(keepAliveWhenAttached(textModel, () => {
                const controller = new TextMateWorkerTokenizerController(textModel, workerProxy, this._languageService.languageIdCodec, tokenStore, this._configurationService, maxTokenizationLineLength);
                controllerContainer.controller = controller;
                this._workerTokenizerControllers.set(controller.controllerId, controller);
                return toDisposable(() => {
                    controllerContainer.controller = undefined;
                    this._workerTokenizerControllers.delete(controller.controllerId);
                    controller.dispose();
                });
            }));
            return controllerContainer;
        });
        return {
            dispose() {
                store.dispose();
            },
            requestTokens: async (startLineNumber, endLineNumberExclusive) => {
                const container = await controllerContainer;
                // If there is no controller, the model has been detached in the meantime.
                // Only request the proxy object if the worker is the same!
                if (container?.controller && container.worker === this._worker) {
                    container.controller.requestTokens(startLineNumber, endLineNumberExclusive);
                }
            },
            reportMismatchingTokens: (lineNumber) => {
                if (ThreadedBackgroundTokenizerFactory_1._reportedMismatchingTokens) {
                    return;
                }
                ThreadedBackgroundTokenizerFactory_1._reportedMismatchingTokens = true;
                this._notificationService.error({
                    message: 'Async Tokenization Token Mismatch in line ' + lineNumber,
                    name: 'Async Tokenization Token Mismatch',
                });
                this._telemetryService.publicLog2('asyncTokenizationMismatchingTokens', {});
            },
        };
    }
    setGrammarDefinitions(grammarDefinitions) {
        this._grammarDefinitions = grammarDefinitions;
        this._disposeWorker();
    }
    acceptTheme(theme, colorMap) {
        this._currentTheme = theme;
        this._currentTokenColorMap = colorMap;
        if (this._currentTheme && this._currentTokenColorMap && this._workerProxy) {
            this._workerProxy.$acceptTheme(this._currentTheme, this._currentTokenColorMap);
        }
    }
    _getWorkerProxy() {
        if (!this._workerProxyPromise) {
            this._workerProxyPromise = this._createWorkerProxy();
        }
        return this._workerProxyPromise;
    }
    async _createWorkerProxy() {
        const onigurumaModuleLocation = `${nodeModulesPath}/vscode-oniguruma`;
        const onigurumaModuleLocationAsar = `${nodeModulesAsarPath}/vscode-oniguruma`;
        const useAsar = canASAR && this._environmentService.isBuilt && !isWeb;
        const onigurumaLocation = useAsar ? onigurumaModuleLocationAsar : onigurumaModuleLocation;
        const onigurumaWASM = `${onigurumaLocation}/release/onig.wasm`;
        const createData = {
            grammarDefinitions: this._grammarDefinitions,
            onigurumaWASMUri: FileAccess.asBrowserUri(onigurumaWASM).toString(true),
        };
        const worker = this._worker = this._webWorkerService.createWorkerClient(new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain.js'),
            label: 'TextMateWorker'
        }));
        TextMateWorkerHost.setChannel(worker, {
            $readFile: async (_resource) => {
                const resource = URI.revive(_resource);
                return this._extensionResourceLoaderService.readExtensionResource(resource);
            },
            $setTokensAndStates: async (controllerId, versionId, tokens, fontTokens, lineEndStateDeltas) => {
                const controller = this._workerTokenizerControllers.get(controllerId);
                // When a model detaches, it is removed synchronously from the map.
                // However, the worker might still be sending tokens for that model,
                // so we ignore the event when there is no controller.
                if (controller) {
                    controller.setTokensAndStates(controllerId, versionId, tokens, fontTokens, lineEndStateDeltas);
                }
            },
            $reportTokenizationTime: (timeMs, languageId, sourceExtensionId, lineLength, isRandomSample) => {
                this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, isRandomSample);
            }
        });
        await worker.proxy.$init(createData);
        if (this._worker !== worker) {
            // disposed in the meantime
            return null;
        }
        this._workerProxy = worker.proxy;
        if (this._currentTheme && this._currentTokenColorMap) {
            this._workerProxy.$acceptTheme(this._currentTheme, this._currentTokenColorMap);
        }
        return worker.proxy;
    }
    _disposeWorker() {
        for (const controller of this._workerTokenizerControllers.values()) {
            controller.dispose();
        }
        this._workerTokenizerControllers.clear();
        if (this._worker) {
            this._worker.dispose();
            this._worker = null;
        }
        this._workerProxy = null;
        this._workerProxyPromise = null;
    }
};
ThreadedBackgroundTokenizerFactory = ThreadedBackgroundTokenizerFactory_1 = __decorate([
    __param(2, IExtensionResourceLoaderService),
    __param(3, IConfigurationService),
    __param(4, ILanguageService),
    __param(5, IEnvironmentService),
    __param(6, INotificationService),
    __param(7, ITelemetryService),
    __param(8, IWebWorkerService)
], ThreadedBackgroundTokenizerFactory);
export { ThreadedBackgroundTokenizerFactory };
function keepAliveWhenAttached(textModel, factory) {
    const disposableStore = new DisposableStore();
    const subStore = disposableStore.add(new DisposableStore());
    function checkAttached() {
        if (textModel.isAttachedToEditor()) {
            subStore.add(factory());
        }
        else {
            subStore.clear();
        }
    }
    checkAttached();
    disposableStore.add(textModel.onDidChangeAttached(() => {
        checkAttached();
    }));
    return disposableStore;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9icm93c2VyL2JhY2tncm91bmRUb2tlbml6YXRpb24vdGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFtQixVQUFVLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFMUgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sbUNBQW1DLENBQUM7QUFFdkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sbUZBQW1GLENBQUM7QUFDcEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFMUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHM0YsT0FBTyxFQUFF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