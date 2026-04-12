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
var OutputLinkProvider_1;
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { OUTPUT_MODE_ID, LOG_MODE_ID } from '../../../services/output/common/output.js';
import { dispose, Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { WorkerTextModelSyncClient } from '../../../../editor/common/services/textModelSync/textModelSync.impl.js';
import { FileAccess } from '../../../../base/common/network.js';
let OutputLinkProvider = class OutputLinkProvider extends Disposable {
    static { OutputLinkProvider_1 = this; }
    static { this.DISPOSE_WORKER_TIME = 3 * 60 * 1000; } // dispose worker after 3 minutes of inactivity
    constructor(contextService, modelService, languageFeaturesService, webWorkerService) {
        super();
        this.contextService = contextService;
        this.modelService = modelService;
        this.languageFeaturesService = languageFeaturesService;
        this.webWorkerService = webWorkerService;
        this.disposeWorkerScheduler = this._register(new RunOnceScheduler(() => this.disposeWorker(), OutputLinkProvider_1.DISPOSE_WORKER_TIME));
        this.registerListeners();
        this.updateLinkProviderWorker();
    }
    registerListeners() {
        this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateLinkProviderWorker()));
    }
    updateLinkProviderWorker() {
        // Setup link provider depending on folders being opened or not
        const folders = this.contextService.getWorkspace().folders;
        if (folders.length > 0) {
            if (!this.linkProviderRegistration) {
                this.linkProviderRegistration = this.languageFeaturesService.linkProvider.register([{ language: OUTPUT_MODE_ID, scheme: '*' }, { language: LOG_MODE_ID, scheme: '*' }], {
                    provideLinks: async (model) => {
                        const links = await this.provideLinks(model.uri);
                        return links && { links };
                    }
                });
            }
        }
        else {
            dispose(this.linkProviderRegistration);
            this.linkProviderRegistration = undefined;
        }
        // Dispose worker to recreate with folders on next provideLinks request
        this.disposeWorker();
        this.disposeWorkerScheduler.cancel();
    }
    getOrCreateWorker() {
        this.disposeWorkerScheduler.schedule();
        if (!this.worker) {
            this.worker = new OutputLinkWorkerClient(this.contextService, this.modelService, this.webWorkerService);
        }
        return this.worker;
    }
    async provideLinks(modelUri) {
        return this.getOrCreateWorker().provideLinks(modelUri);
    }
    disposeWorker() {
        if (this.worker) {
            this.worker.dispose();
            this.worker = undefined;
        }
    }
};
OutputLinkProvider = OutputLinkProvider_1 = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IModelService),
    __param(2, ILanguageFeaturesService),
    __param(3, IWebWorkerService)
], OutputLinkProvider);
export { OutputLinkProvider };
let OutputLinkWorkerClient = class OutputLinkWorkerClient extends Disposable {
    constructor(contextService, modelService, webWorkerService) {
        super();
        this.contextService = contextService;
        this._workerClient = this._register(webWorkerService.createWorkerClient(new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/contrib/output/common/outputLinkComputerMain.js'),
            label: 'OutputLinkDetectionWorker'
        })));
        this._workerTextModelSyncClient = this._register(WorkerTextModelSyncClient.create(this._workerClient, modelService));
        this._initializeBarrier = this._ensureWorkspaceFolders();
    }
    async _ensureWorkspaceFolders() {
        await this._workerClient.proxy.$setWorkspaceFolders(this.contextService.getWorkspace().folders.map(folder => folder.uri.toString()));
    }
    async provideLinks(modelUri) {
        await this._initializeBarrier;
        this._workerTextModelSyncClient.ensureSyncedResources([modelUri]);
        return this._workerClient.proxy.$computeLinks(modelUri.toString());
    }
};
OutputLinkWorkerClient = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IModelService),
    __param(2, IWebWorkerService)
], OutputLinkWorkerClient);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0TGlua1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvb3V0cHV0L2Jyb3dzZXIvb3V0cHV0TGlua1Byb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFNUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUV4RixPQUFPLEVBQWUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRS9GLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUV6RCxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7O2FBRXpCLHdCQUFtQixHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxBQUFoQixDQUFpQixHQUFDLCtDQUErQztJQU01RyxZQUM0QyxjQUF3QyxFQUNuRCxZQUEyQixFQUNoQix1QkFBaUQsRUFDeEQsZ0JBQW1DO1FBRXZFLEtBQUssRUFBRSxDQUFDO1FBTG1DLG1CQUFjLEdBQWQsY0FBYyxDQUEwQjtR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