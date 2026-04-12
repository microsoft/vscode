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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { AgentHostFileSystemProvider } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
/**
 * Scheme used for the in-memory plugin filesystem backing synced customizations.
 *
 * URIs under this scheme are served by a registered {@link InMemoryFileSystemProvider}
 * and are reachable by the agent host via `fetchContent`.
 */
export const SYNCED_CUSTOMIZATION_SCHEME = 'vscode-synced-customization';
export const IAgentHostFileSystemService = createDecorator('agentHostFileSystemService');
let AgentHostFileSystemService = class AgentHostFileSystemService extends Disposable {
    constructor(_fileService, labelService) {
        super();
        this._fileService = _fileService;
        this._syncedCustomizationProviderRegistered = false;
        this._fsProvider = this._register(new AgentHostFileSystemProvider());
        this._register(_fileService.registerProvider(AGENT_HOST_SCHEME, this._fsProvider));
        this._register(labelService.registerFormatter(AGENT_HOST_LABEL_FORMATTER));
    }
    registerAuthority(authority, connection) {
        return this._fsProvider.registerAuthority(authority, connection);
    }
    ensureSyncedCustomizationProvider() {
        if (!this._syncedCustomizationProviderRegistered) {
            this._syncedCustomizationProviderRegistered = true;
            const provider = this._register(new InMemoryFileSystemProvider());
            this._register(this._fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, provider));
        }
    }
};
AgentHostFileSystemService = __decorate([
    __param(0, IFileService),
    __param(1, ILabelService)
], AgentHostFileSystemService);
registerSingleton(IAgentHostFileSystemService, AgentHostFileSystemService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLDJCQUEyQixFQUFvQyxNQUFNLHNFQUFzRSxDQUFDO0FBQ3JKLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUzRTs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLDZCQUE2QixDQUFDO0FBRXpFLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGVBQWUsQ0FBOEIsNEJBQTRCLENBQUMsQ0FBQztBQW1CdEgsSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMkIsU0FBUSxVQUFVO0lBTWxELFlBQ2UsWUFBMkMsRUFDMUMsWUFBMkI7UUFFMUMsS0FBSyxFQUFFLENBQUM7UUFIdUIsaUJBQVksR0FBWixZQUFZLENBQWM7UUFIbEQsMkNBQXNDLEdBQUcsS0FBSyxDQUFDO1FBUXRELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLDJCQUEyQixFQUFFLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVELGlCQUFpQixDQUFDLFNBQWlCLEVBQUUsVUFBdUM7UUFDM0UsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsaUNBQWlDO1FBQ2hDLElBQUksQ0FBQyxJQUFJLENBQUMsc0NBQXNDLEVBQUUsQ0FBQztZQUNsRCxJQUFJLENBQUMsc0NBQXNDLEdBQUcsSUFBSSxDQUFDO1lBQ25ELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7WUFDbEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDM0YsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBNUJLLDBCQUEwQjtJQU83QixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsYUFBYSxDQUFBO0dBUlYsMEJBQTBCLENBNEIvQjtBQUVELGlCQUFpQixDQUFDLDJCQUEyQixFQUFFLDBCQUEwQixvQ0FBNEIsQ0FBQyJ9