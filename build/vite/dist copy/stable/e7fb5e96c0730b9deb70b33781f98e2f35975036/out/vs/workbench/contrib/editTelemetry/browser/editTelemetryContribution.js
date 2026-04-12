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
import { autorun, derived } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService, telemetryLevelEnabled } from '../../../../platform/telemetry/common/telemetry.js';
import { AnnotatedDocuments } from './helpers/annotatedDocuments.js';
import { EditTrackingFeature } from './telemetry/editSourceTrackingFeature.js';
import { VSCodeWorkspace } from './helpers/vscodeObservableWorkspace.js';
import { AiStatsFeature } from './editStats/aiStatsFeature.js';
import { AI_STATS_SETTING_ID, EDIT_TELEMETRY_SETTING_ID } from './settingIds.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { AiContributionFeature } from './aiContributionFeature.js';
let EditTelemetryContribution = class EditTelemetryContribution extends Disposable {
    constructor(instantiationService, configurationService, telemetryService, chatEntitlementService) {
        super();
        const workspace = derived(reader => reader.store.add(instantiationService.createInstance(VSCodeWorkspace)));
        const annotatedDocuments = derived(reader => reader.store.add(instantiationService.createInstance(AnnotatedDocuments, workspace.read(reader))));
        const editSourceTrackingEnabled = observableConfigValue(EDIT_TELEMETRY_SETTING_ID, true, configurationService);
        this._register(autorun(r => {
            const enabled = editSourceTrackingEnabled.read(r);
            if (!enabled || !telemetryLevelEnabled(telemetryService, 3 /* TelemetryLevel.USAGE */)) {
                return;
            }
            r.store.add(instantiationService.createInstance(EditTrackingFeature, workspace.read(r), annotatedDocuments.read(r)));
        }));
        const aiStatsEnabled = observableConfigValue(AI_STATS_SETTING_ID, true, configurationService);
        this._register(autorun(r => {
            const enabled = aiStatsEnabled.read(r);
            const aiDisabled = chatEntitlementService.sentimentObs.read(r).hidden;
            if (!enabled || aiDisabled) {
                return;
            }
            r.store.add(instantiationService.createInstance(AiStatsFeature, annotatedDocuments.read(r)));
        }));
        // Register no-op fallbacks so that extensions can always call these
        // commands even when AiContributionFeature is not active.
        // AiContributionFeature overrides these with real implementations
        // when active, and the no-ops restore when it is disposed.
        this._register(CommandsRegistry.registerCommand('_aiEdits.hasAiContributions', () => false));
        this._register(CommandsRegistry.registerCommand('_aiEdits.clearAiContributions', () => { }));
        this._register(CommandsRegistry.registerCommand('_aiEdits.clearAllAiContributions', () => { }));
        const addAICoAuthor = observableConfigValue('git.addAICoAuthor', 'off', configurationService);
        this._register(autorun(r => {
            if (addAICoAuthor.read(r) === 'off') {
                return;
            }
            r.store.add(instantiationService.createInstance(AiContributionFeature, annotatedDocuments.read(r)));
        }));
    }
};
EditTelemetryContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, IConfigurationService),
    __param(2, ITelemetryService),
    __param(3, IChatEntitlementService)
], EditTelemetryContribution);
export { EditTelemetryContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci9lZGl0VGVsZW1ldHJ5Q29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IscUJBQXFCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTVE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