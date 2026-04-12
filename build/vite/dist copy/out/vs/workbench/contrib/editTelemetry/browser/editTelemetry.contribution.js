/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditTelemetryContribution } from './editTelemetryContribution.js';
import { EDIT_TELEMETRY_SETTING_ID, AI_STATS_SETTING_ID } from './settingIds.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { EDIT_TELEMETRY_DETAILS_SETTING_ID, EDIT_TELEMETRY_SHOW_DECORATIONS, EDIT_TELEMETRY_SHOW_STATUS_BAR } from './settings.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAiEditTelemetryService } from './telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { AiEditTelemetryServiceImpl } from './telemetry/aiEditTelemetry/aiEditTelemetryServiceImpl.js';
import { IRandomService, RandomService } from './randomService.js';
registerWorkbenchContribution2('EditTelemetryContribution', EditTelemetryContribution, 3 /* WorkbenchPhase.AfterRestored */);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'task',
    order: 100,
    title: localize('editTelemetry', "Edit Telemetry"),
    type: 'object',
    properties: {
        [EDIT_TELEMETRY_SETTING_ID]: {
            markdownDescription: localize('telemetry.editStats.enabled', "Controls whether to enable telemetry for edit statistics (only sends statistics if general telemetry is enabled)."),
            type: 'boolean',
            default: true,
            tags: ['experimental'],
        },
        [AI_STATS_SETTING_ID]: {
            markdownDescription: localize('editor.aiStats.enabled', "Controls whether to enable AI statistics in the editor. The gauge shows the average AI rate across 5-minute sessions, where each session's rate is calculated as AI-inserted characters divided by total inserted characters."),
            type: 'boolean',
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [EDIT_TELEMETRY_DETAILS_SETTING_ID]: {
            markdownDescription: localize('telemetry.editStats.detailed.enabled', "Controls whether to enable telemetry for detailed edit statistics (only sends statistics if general telemetry is enabled)."),
            type: 'boolean',
            default: false,
            tags: ['experimental'],
            experiment: {
                mode: 'auto'
            }
        },
        [EDIT_TELEMETRY_SHOW_STATUS_BAR]: {
            markdownDescription: localize('telemetry.editStats.showStatusBar', "Controls whether to show the status bar for edit telemetry."),
            type: 'boolean',
            default: false,
            tags: ['experimental'],
        },
        [EDIT_TELEMETRY_SHOW_DECORATIONS]: {
            markdownDescription: localize('telemetry.editStats.showDecorations', "Controls whether to show decorations for edit telemetry."),
            type: 'boolean',
            default: false,
            tags: ['experimental'],
        },
    }
});
registerSingleton(IAiEditTelemetryService, AiEditTelemetryServiceImpl, 1 /* InstantiationType.Delayed */);
registerSingleton(IRandomService, RandomService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFRlbGVtZXRyeS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvZWRpdFRlbGVtZXRyeS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLElBQUksdUJBQXVCLEVBQTBCLE1BQU0sb0VBQW9FLENBQUM7QUFDbkosT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSwrQkFBK0IsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNuSSxPQUFPLEVBQUUsOEJBQThCLEVBQWtCLE1BQU0sa0NBQWtDLENBQUM7QUFDbEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbkUsOEJBQThCLENBQUMsMkJBQTJCLEVBQUUseUJBQXlCLHVDQUErQixDQUFDO0FBRXJILE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDekcscUJBQXFCLENBQUMscUJBQXFCLENBQUM7SUFDM0MsRUFBRSxFQUFFLE1BQU07SUFDVixLQUFLLEVBQUUsR0FBRztJQUNWLEtBQUssRUFBRSxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDO0lBQ2xELElBQUksRUFBRSxRQUFRO0lBQ2QsVUFBVSxFQUFFO1FBQ1gsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFO1lBQzVCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxtSEFBbUgsQ0FBQztZQUNqTCxJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxJQUFJO1lBQ2IsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO1NBQ3RCO1FBQ0QsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO1lBQ3RCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSwrTkFBK04sQ0FBQztZQUN4UixJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxLQUFLO1lBQ2QsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO1lBQ3RCLFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsTUFBTTthQUNaO1NBQ0Q7UUFDRCxDQUFDLGlDQUFpQyxDQUFDLEVBQUU7WUFDcEMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLDRIQUE0SCxDQUFDO1lBQ25NLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLEtBQUs7WUFDZCxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7WUFDdEIsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxNQUFNO2FBQ1o7U0FDRDtRQUNELENBQUMsOEJBQThCLENBQUMsRUFBRTtZQUNqQyxtQkFBbUIsRUFBRSxRQUFRLENBQUMsbUNBQW1DLEVBQUUsNkRBQTZELENBQUM7WUFDakksSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsS0FBSztZQUNkLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztTQUN0QjtRQUNELENBQUMsK0JBQStCLENBQUMsRUFBRTtZQUNsQyxtQkFBbUIsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsMERBQTBELENBQUM7WUFDaEksSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsS0FBSztZQUNkLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztTQUN0QjtLQUNEO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsaUJBQWlCLENBQUMsdUJBQXVCLEVBQUUsMEJBQTBCLG9DQUE0QixDQUFDO0FBQ2xHLGlCQUFpQixDQUFDLGNBQWMsRUFBRSxhQUFhLG9DQUE0QixDQUFDIn0=