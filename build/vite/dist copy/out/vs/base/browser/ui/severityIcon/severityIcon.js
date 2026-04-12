/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/severityIcon.css';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import Severity from '../../../common/severity.js';
export var SeverityIcon;
(function (SeverityIcon) {
    function className(severity) {
        switch (severity) {
            case Severity.Ignore:
                return 'severity-ignore ' + ThemeIcon.asClassName(Codicon.info);
            case Severity.Info:
                return ThemeIcon.asClassName(Codicon.info);
            case Severity.Warning:
                return ThemeIcon.asClassName(Codicon.warning);
            case Severity.Error:
                return ThemeIcon.asClassName(Codicon.error);
            default:
                return '';
        }
    }
    SeverityIcon.className = className;
})(SeverityIcon || (SeverityIcon = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V2ZXJpdHlJY29uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTywwQkFBMEIsQ0FBQztBQUNsQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3pELE9BQU8sUUFBUSxNQUFNLDZCQUE2QixDQUFDO0FBRW5ELE1BQU0sS0FBVyxZQUFZLENBZ0I1QjtBQWhCRCxXQUFpQixZQUFZO0lBRTVCLFNBQWdCLFNBQVMsQ0FBQyxRQUFrQjtRQUMzQyxRQUFRLFFBQVEsRUFBRSxDQUFDO1lBQ2xCLEtBQUssUUFBUSxDQUFDLE1BQU07Z0JBQ25CLE9BQU8sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakUsS0FBSyxRQUFRLENBQUMsSUFBSTtnQkFDakIsT0FBTyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QyxLQUFLLFFBQVEsQ0FBQyxPQUFPO2dCQUNwQixPQUFPLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQy9DLEtBQUssUUFBUSxDQUFDLEtBQUs7Z0JBQ2xCLE9BQU8sU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0M7Z0JBQ0MsT0FBTyxFQUFFLENBQUM7UUFDWixDQUFDO0lBQ0YsQ0FBQztJQWJlLHNCQUFTLFlBYXhCLENBQUE7QUFDRixDQUFDLEVBaEJnQixZQUFZLEtBQVosWUFBWSxRQWdCNUIifQ==