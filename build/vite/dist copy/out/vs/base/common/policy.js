/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../nls.js';
/**
 * System-wide policy file path for Linux systems.
 */
export const LINUX_SYSTEM_POLICY_FILE_PATH = '/etc/vscode/policy.json';
export var PolicyCategory;
(function (PolicyCategory) {
    PolicyCategory["Extensions"] = "Extensions";
    PolicyCategory["IntegratedTerminal"] = "IntegratedTerminal";
    PolicyCategory["InteractiveSession"] = "InteractiveSession";
    PolicyCategory["Telemetry"] = "Telemetry";
    PolicyCategory["Update"] = "Update";
})(PolicyCategory || (PolicyCategory = {}));
export const PolicyCategoryData = {
    [PolicyCategory.Extensions]: {
        name: {
            key: 'extensionsConfigurationTitle', value: localize('extensionsConfigurationTitle', "Extensions"),
        }
    },
    [PolicyCategory.IntegratedTerminal]: {
        name: {
            key: 'terminalIntegratedConfigurationTitle', value: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
        }
    },
    [PolicyCategory.InteractiveSession]: {
        name: {
            key: 'interactiveSessionConfigurationTitle', value: localize('interactiveSessionConfigurationTitle', "Chat"),
        }
    },
    [PolicyCategory.Telemetry]: {
        name: {
            key: 'telemetryConfigurationTitle', value: localize('telemetryConfigurationTitle', "Telemetry"),
        }
    },
    [PolicyCategory.Update]: {
        name: {
            key: 'updateConfigurationTitle', value: localize('updateConfigurationTitle', "Update"),
        }
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWN5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vcG9saWN5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFHeEM7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBRyx5QkFBeUIsQ0FBQztBQVF2RSxNQUFNLENBQU4sSUFBWSxjQU1YO0FBTkQsV0FBWSxjQUFjO0lBQ3pCLDJDQUF5QixDQUFBO0lBQ3pCLDJEQUF5QyxDQUFBO0lBQ3pDLDJEQUF5QyxDQUFBO0lBQ3pDLHlDQUF1QixDQUFBO0lBQ3ZCLG1DQUFpQixDQUFBO0FBQ2xCLENBQUMsRUFOVyxjQUFjLEtBQWQsY0FBYyxRQU16QjtBQUVELE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUUzQjtJQUNILENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQzVCLElBQUksRUFBRTtZQUNMLEdBQUcsRUFBRSw4QkFBOEIsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLFlBQVksQ0FBQztTQUNsRztLQUNEO0lBQ0QsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsRUFBRTtRQUNwQyxJQUFJLEVBQUU7WUFDTCxHQUFHLEVBQUUsc0NBQXNDLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxxQkFBcUIsQ0FBQztTQUMzSDtLQUNEO0lBQ0QsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsRUFBRTtRQUNwQyxJQUFJLEVBQUU7WUFDTCxHQUFHLEVBQUUsc0NBQXNDLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxNQUFNLENBQUM7U0FDNUc7S0FDRDtJQUNELENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1FBQzNCLElBQUksRUFBRTtZQUNMLEdBQUcsRUFBRSw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLFdBQVcsQ0FBQztTQUMvRjtLQUNEO0lBQ0QsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUU7UUFDeEIsSUFBSSxFQUFFO1lBQ0wsR0FBRyxFQUFFLDBCQUEwQixFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsUUFBUSxDQUFDO1NBQ3RGO0tBQ0Q7Q0FDRCxDQUFDIn0=