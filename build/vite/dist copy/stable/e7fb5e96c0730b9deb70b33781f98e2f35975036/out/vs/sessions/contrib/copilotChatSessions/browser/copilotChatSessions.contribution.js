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
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CopilotChatSessionsProvider, COPILOT_MULTI_CHAT_SETTING } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'sessions',
    properties: {
        [COPILOT_MULTI_CHAT_SETTING]: {
            type: 'boolean',
            default: false,
            tags: ['preview'],
            description: localize('sessions.github.copilot.multiChatSessions', "Whether to enable multiple chats within a single session in the Copilot Chat sessions provider."),
        },
    },
});
/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider.
 */
let DefaultSessionsProviderContribution = class DefaultSessionsProviderContribution extends Disposable {
    static { this.ID = 'sessions.defaultSessionsProvider'; }
    constructor(instantiationService, sessionsProvidersService) {
        super();
        const provider = this._register(instantiationService.createInstance(CopilotChatSessionsProvider));
        this._register(sessionsProvidersService.registerProvider(provider));
    }
};
DefaultSessionsProviderContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, ISessionsProvidersService)
], DefaultSessionsProviderContribution);
registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdENoYXRTZXNzaW9ucy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9jb3BpbG90Q2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUMzSSxPQUFPLGlFQUFpRSxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxRQUFRLENBQUMsRUFBRSxDQUF5Qix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztJQUNoRyxFQUFFLEVBQUUsVUFBVTtJQUNkLFVBQVUsRUFBRTtRQUNYLENBQUMsMEJBQTBCLENBQUMsRUFBRTtZQUM3QixJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxLQUFLO1lBQ2QsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDO1lBQ2pCLFdBQVcsRUFBRSxRQUFRLENBQUMsMkNBQTJDLEVBQUUsaUdBQWlHLENBQUM7U0FDcks7S0FDRDtDQUNELENBQUMsQ0FBQztBQUVIOztHQUVHO0FBQ0gsSUFBTSxtQ0FBbUMsR0FBekMsTUFBTSxtQ0FBb0MsU0FBUSxVQUFVO2FBQzNDLE9BQUUsR0FBRyxrQ0FBa0MsQUFBckMsQ0FBc0M7SUFFeEQsWUFDd0Isb0JBQTJDLEVBQ3ZDLHdCQUFtRDtRQUU5RSxLQUFLLEVBQUUsQ0FBQztRQUNSLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUNsRyxJQUFJLENBQUMsU0FBUyxDQUFDLHdCQUF3QixDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQzs7QUFWSSxtQ0FBbUM7SUFJdEMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHlCQUF5QixDQUFBO0dBTHRCLG1DQUFtQyxDQVd4QztBQUVELDhCQUE4QixDQUFDLG1DQUFtQyxDQUFDLEVBQUUsRUFBRSxtQ0FBbUMsdUNBQStCLENBQUMifQ==