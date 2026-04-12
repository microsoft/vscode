/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { METERED_CONNECTION_SETTING_KEY } from '../../../../platform/meteredConnection/common/meteredConnection.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { MeteredConnectionStatusContribution } from './meteredConnectionStatus.js';
import '../../../../platform/meteredConnection/common/meteredConnection.config.contribution.js';
registerWorkbenchContribution2(MeteredConnectionStatusContribution.ID, MeteredConnectionStatusContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerAction2(class ConfigureMeteredConnectionAction extends Action2 {
    static { this.ID = 'workbench.action.configureMeteredConnection'; }
    constructor() {
        super({
            id: ConfigureMeteredConnectionAction.ID,
            title: localize2('configureMeteredConnection', 'Configure Metered Connection'),
            f1: true
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const configurationService = accessor.get(IConfigurationService);
        const currentValue = configurationService.getValue(METERED_CONNECTION_SETTING_KEY);
        const picks = [
            {
                value: 'auto',
                label: localize('meteredConnection.auto', "Auto"),
                description: localize('meteredConnection.auto.description', "Detect metered connections automatically"),
                picked: currentValue === 'auto'
            },
            {
                value: 'on',
                label: localize('meteredConnection.on', "On"),
                description: localize('meteredConnection.on.description', "Always treat the connection as metered"),
                picked: currentValue === 'on'
            },
            {
                value: 'off',
                label: localize('meteredConnection.off', "Off"),
                description: localize('meteredConnection.off.description', "Never treat the connection as metered"),
                picked: currentValue === 'off'
            }
        ];
        const pick = await quickInputService.pick(picks, {
            placeHolder: localize('meteredConnection.placeholder', "Select Metered Connection Mode"),
            activeItem: picks.find(p => p.picked)
        });
        if (pick) {
            await configurationService.updateValue(METERED_CONNECTION_SETTING_KEY, pick.value);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb24uY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWV0ZXJlZENvbm5lY3Rpb24vYnJvd3Nlci9tZXRlcmVkQ29ubmVjdGlvbi5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSw4QkFBOEIsRUFBaUMsTUFBTSxvRUFBb0UsQ0FBQztBQUNuSixPQUFPLEVBQUUsa0JBQWtCLEVBQWtCLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLDhCQUE4QixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRW5GLE9BQU8sd0ZBQXdGLENBQUM7QUFFaEcsOEJBQThCLENBQUMsbUNBQW1DLENBQUMsRUFBRSxFQUFFLG1DQUFtQyx1Q0FBK0IsQ0FBQztBQUUxSSxlQUFlLENBQUMsTUFBTSxnQ0FBaUMsU0FBUSxPQUFPO2FBRXJELE9BQUUsR0FBRyw2Q0FBNkMsQ0FBQztJQUVuRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxnQ0FBZ0MsQ0FBQyxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxTQUFTLENBQUMsNEJBQTRCLEVBQUUsOEJBQThCLENBQUM7WUFDOUUsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUM1QyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUVqRSxNQUFNLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQWdDLDhCQUE4QixDQUFDLENBQUM7UUFFbEgsTUFBTSxLQUFLLEdBQWtFO1lBQzVFO2dCQUNDLEtBQUssRUFBRSxNQUFNO2dCQUNiLEtBQUssRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsTUFBTSxDQUFDO2dCQUNqRCxXQUFXLEVBQUUsUUFBUSxDQUFDLG9DQUFvQyxFQUFFLDBDQUEwQyxDQUFDO2dCQUN2RyxNQUFNLEVBQUUsWUFBWSxLQUFLLE1BQU07YUFDL0I7WUFDRDtnQkFDQyxLQUFLLEVBQUUsSUFBSTtnQkFDWCxLQUFLLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQztnQkFDN0MsV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSx3Q0FBd0MsQ0FBQztnQkFDbkcsTUFBTSxFQUFFLFlBQVksS0FBSyxJQUFJO2FBQzdCO1lBQ0Q7Z0JBQ0MsS0FBSyxFQUFFLEtBQUs7Z0JBQ1osS0FBSyxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLENBQUM7Z0JBQy9DLFdBQVcsRUFBRSxRQUFRLENBQUMsbUNBQW1DLEVBQUUsdUNBQXVDLENBQUM7Z0JBQ25HLE1BQU0sRUFBRSxZQUFZLEtBQUssS0FBSzthQUM5QjtTQUNELENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDaEQsV0FBVyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxnQ0FBZ0MsQ0FBQztZQUN4RixVQUFVLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLE1BQU0sb0JBQW9CLENBQUMsV0FBVyxDQUFDLDhCQUE4QixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwRixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQyJ9