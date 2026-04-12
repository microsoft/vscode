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
import { insert } from '../../../../base/common/arrays.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditSessionIdentityService } from '../../../../platform/workspace/common/editSessions.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
let EditSessionIdentityService = class EditSessionIdentityService {
    constructor(_extensionService, _logService) {
        this._extensionService = _extensionService;
        this._logService = _logService;
        this._editSessionIdentifierProviders = new Map();
        this._participants = [];
    }
    registerEditSessionIdentityProvider(provider) {
        if (this._editSessionIdentifierProviders.get(provider.scheme)) {
            throw new Error(`A provider has already been registered for scheme ${provider.scheme}`);
        }
        this._editSessionIdentifierProviders.set(provider.scheme, provider);
        return toDisposable(() => {
            this._editSessionIdentifierProviders.delete(provider.scheme);
        });
    }
    async getEditSessionIdentifier(workspaceFolder, token) {
        const { scheme } = workspaceFolder.uri;
        const provider = await this.activateProvider(scheme);
        this._logService.trace(`EditSessionIdentityProvider for scheme ${scheme} available: ${!!provider}`);
        return provider?.getEditSessionIdentifier(workspaceFolder, token);
    }
    async provideEditSessionIdentityMatch(workspaceFolder, identity1, identity2, cancellationToken) {
        const { scheme } = workspaceFolder.uri;
        const provider = await this.activateProvider(scheme);
        this._logService.trace(`EditSessionIdentityProvider for scheme ${scheme} available: ${!!provider}`);
        return provider?.provideEditSessionIdentityMatch?.(workspaceFolder, identity1, identity2, cancellationToken);
    }
    async onWillCreateEditSessionIdentity(workspaceFolder, cancellationToken) {
        this._logService.debug('Running onWillCreateEditSessionIdentity participants...');
        // TODO@joyceerhl show progress notification?
        for (const participant of this._participants) {
            await participant.participate(workspaceFolder, cancellationToken);
        }
        this._logService.debug(`Done running ${this._participants.length} onWillCreateEditSessionIdentity participants.`);
    }
    addEditSessionIdentityCreateParticipant(participant) {
        const dispose = insert(this._participants, participant);
        return toDisposable(() => dispose());
    }
    async activateProvider(scheme) {
        const transformedScheme = scheme === 'vscode-remote' ? 'file' : scheme;
        const provider = this._editSessionIdentifierProviders.get(scheme);
        if (provider) {
            return provider;
        }
        await this._extensionService.activateByEvent(`onEditSession:${transformedScheme}`);
        return this._editSessionIdentifierProviders.get(scheme);
    }
};
EditSessionIdentityService = __decorate([
    __param(0, IExtensionService),
    __param(1, ILogService)
], EditSessionIdentityService);
export { EditSessionIdentityService };
registerSingleton(IEditSessionIdentityService, EditSessionIdentityService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vZWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTNELE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBaUcsMkJBQTJCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVuTSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVuRSxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEwQjtJQUt0QyxZQUNvQixpQkFBcUQsRUFDM0QsV0FBeUM7UUFEbEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUMxQyxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUovQyxvQ0FBK0IsR0FBRyxJQUFJLEdBQUcsRUFBd0MsQ0FBQztRQStDbEYsa0JBQWEsR0FBNEMsRUFBRSxDQUFDO0lBMUNoRSxDQUFDO0lBRUwsbUNBQW1DLENBQUMsUUFBc0M7UUFDekUsSUFBSSxJQUFJLENBQUMsK0JBQStCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQy9ELE1BQU0sSUFBSSxLQUFLLENBQUMscURBQXFELFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLENBQUM7UUFFRCxJQUFJLENBQUMsK0JBQStC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