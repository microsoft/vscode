/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../nls.js';
import { OS } from '../../../base/common/platform.js';
import { Extensions as ConfigExtensions } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
export var DispatchConfig;
(function (DispatchConfig) {
    DispatchConfig[DispatchConfig["Code"] = 0] = "Code";
    DispatchConfig[DispatchConfig["KeyCode"] = 1] = "KeyCode";
})(DispatchConfig || (DispatchConfig = {}));
export function readKeyboardConfig(configurationService) {
    const keyboard = configurationService.getValue('keyboard');
    const dispatch = (keyboard?.dispatch === 'keyCode' ? 1 /* DispatchConfig.KeyCode */ : 0 /* DispatchConfig.Code */);
    const mapAltGrToCtrlAlt = Boolean(keyboard?.mapAltGrToCtrlAlt);
    return { dispatch, mapAltGrToCtrlAlt };
}
const configurationRegistry = Registry.as(ConfigExtensions.Configuration);
const keyboardConfiguration = {
    'id': 'keyboard',
    'order': 15,
    'type': 'object',
    'title': nls.localize('keyboardConfigurationTitle', "Keyboard"),
    'properties': {
        'keyboard.dispatch': {
            scope: 1 /* ConfigurationScope.APPLICATION */,
            type: 'string',
            enum: ['code', 'keyCode'],
            default: 'code',
            markdownDescription: nls.localize('dispatch', "Controls the dispatching logic for key presses to use either `code` (recommended) or `keyCode`."),
            included: OS === 2 /* OperatingSystem.Macintosh */ || OS === 3 /* OperatingSystem.Linux */
        },
        'keyboard.mapAltGrToCtrlAlt': {
            scope: 1 /* ConfigurationScope.APPLICATION */,
            type: 'boolean',
            default: false,
            markdownDescription: nls.localize('mapAltGrToCtrlAlt', "Controls if the AltGraph+ modifier should be treated as Ctrl+Alt+."),
            included: OS === 1 /* OperatingSystem.Windows */
        }
    }
};
configurationRegistry.registerConfiguration(keyboardConfiguration);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Ym9hcmRDb25maWcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRDb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUV2QyxPQUFPLEVBQUUsRUFBRSxFQUFtQixNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBc0IsVUFBVSxJQUFJLGdCQUFnQixFQUE4QyxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JLLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxNQUFNLENBQU4sSUFBa0IsY0FHakI7QUFIRCxXQUFrQixjQUFjO0lBQy9CLG1EQUFJLENBQUE7SUFDSix5REFBTyxDQUFBO0FBQ1IsQ0FBQyxFQUhpQixjQUFjLEtBQWQsY0FBYyxRQUcvQjtBQU9ELE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxvQkFBMkM7SUFDN0UsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUErRCxVQUFVLENBQUMsQ0FBQztJQUN6SCxNQUFNLFFBQVEsR0FBRyxDQUFDLFFBQVEsRUFBRSxRQUFRLEtBQUssU0FBUyxDQUFDLENBQUMsZ0NBQXdCLENBQUMsNEJBQW9CLENBQUMsQ0FBQztJQUNuRyxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixFQUFFLENBQUM7QUFDeEMsQ0FBQztBQUVELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDbEcsTUFBTSxxQkFBcUIsR0FBdUI7SUFDakQsSUFBSSxFQUFFLFVBQVU7SUFDaEIsT0FBTyxFQUFFLEVBQUU7SUFDWCxNQUFNLEVBQUUsUUFBUTtJQUNoQixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxVQUFVLENBQUM7SUFDL0QsWUFBWSxFQUFFO1FBQ2IsbUJBQW1CLEVBQUU7WUFDcEIsS0FBSyx3Q0FBZ0M7WUFDckMsSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDO1lBQ3pCLE9BQU8sRUFBRSxNQUFNO1lBQ2YsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsaUdBQWlHLENBQUM7WUFDaEosUUFBUSxFQUFFLEVBQUUsc0NBQThCLElBQUksRUFBRSxrQ0FBMEI7U0FDMUU7UUFDRCw0QkFBNEIsRUFBRTtZQUM3QixLQUFLLHdDQUFnQztZQUNyQyxJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxLQUFLO1lBQ2QsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxvRUFBb0UsQ0FBQztZQUM1SCxRQUFRLEVBQUUsRUFBRSxvQ0FBNEI7U0FDeEM7S0FDRDtDQUNELENBQUM7QUFFRixxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDIn0=