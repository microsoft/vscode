/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isNumber } from '../../../../base/common/types.js';
export const ITerminalService = createDecorator('terminalService');
export const ITerminalConfigurationService = createDecorator('terminalConfigurationService');
export const ITerminalEditorService = createDecorator('terminalEditorService');
export const ITerminalEditingService = createDecorator('terminalEditingService');
export const ITerminalGroupService = createDecorator('terminalGroupService');
export const ITerminalInstanceService = createDecorator('terminalInstanceService');
export const ITerminalChatService = createDecorator('terminalChatService');
export var Direction;
(function (Direction) {
    Direction[Direction["Left"] = 0] = "Left";
    Direction[Direction["Right"] = 1] = "Right";
    Direction[Direction["Up"] = 2] = "Up";
    Direction[Direction["Down"] = 3] = "Down";
})(Direction || (Direction = {}));
export var TerminalConnectionState;
(function (TerminalConnectionState) {
    TerminalConnectionState[TerminalConnectionState["Connecting"] = 0] = "Connecting";
    TerminalConnectionState[TerminalConnectionState["Connected"] = 1] = "Connected";
})(TerminalConnectionState || (TerminalConnectionState = {}));
export const isDetachedTerminalInstance = (t) => !isNumber(t.instanceId);
export class TerminalLinkQuickPickEvent extends MouseEvent {
}
export const terminalEditorId = 'terminalEditor';
export var XtermTerminalConstants;
(function (XtermTerminalConstants) {
    XtermTerminalConstants[XtermTerminalConstants["SearchHighlightLimit"] = 20000] = "SearchHighlightLimit";
})(XtermTerminalConstants || (XtermTerminalConstants = {}));
export var LinuxDistro;
(function (LinuxDistro) {
    LinuxDistro[LinuxDistro["Unknown"] = 1] = "Unknown";
    LinuxDistro[LinuxDistro["Fedora"] = 2] = "Fedora";
    LinuxDistro[LinuxDistro["Ubuntu"] = 3] = "Ubuntu";
})(LinuxDistro || (LinuxDistro = {}));
export var TerminalDataTransfers;
(function (TerminalDataTransfers) {
    TerminalDataTransfers["Terminals"] = "Terminals";
})(TerminalDataTransfers || (TerminalDataTransfers = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBU2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQXdCN0YsT0FBTyxFQUFFLFFBQVEsRUFBcUIsTUFBTSxrQ0FBa0MsQ0FBQztBQUUvRSxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxlQUFlLENBQW1CLGlCQUFpQixDQUFDLENBQUM7QUFDckYsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsZUFBZSxDQUFnQyw4QkFBOEIsQ0FBQyxDQUFDO0FBQzVILE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLGVBQWUsQ0FBeUIsdUJBQXVCLENBQUMsQ0FBQztBQUN2RyxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQTBCLHdCQUF3QixDQUFDLENBQUM7QUFDMUcsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsZUFBZSxDQUF3QixzQkFBc0IsQ0FBQyxDQUFDO0FBQ3BHLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGVBQWUsQ0FBMkIseUJBQXlCLENBQUMsQ0FBQztBQUM3RyxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQXVCLHFCQUFxQixDQUFDLENBQUM7QUFzUGpHLE1BQU0sQ0FBTixJQUFrQixTQUtqQjtBQUxELFdBQWtCLFNBQVM7SUFDMUIseUNBQVEsQ0FBQTtJQUNSLDJDQUFTLENBQUE7SUFDVCxxQ0FBTSxDQUFBO0lBQ04seUNBQVEsQ0FBQTtBQUNULENBQUMsRUFMaUIsU0FBUyxLQUFULFNBQVMsUUFLMUI7QUFzREQsTUFBTSxDQUFOLElBQWtCLHVCQUdqQjtBQUhELFdBQWtCLHVCQUF1QjtJQUN4QyxpRkFBVSxDQUFBO0lBQ1YsK0VBQVMsQ0FBQTtBQUNWLENBQUMsRUFIaUIsdUJBQXVCLEtBQXZCLHVCQUF1QixRQUd4QztBQXlGRCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxDQUFDLENBQWdELEVBQWtDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBRSxDQUF1QixDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBb0svSyxNQUFNLE9BQU8sMEJBQTJCLFNBQVEsVUFBVTtDQUV6RDtBQXdCRCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQztBQXlwQmpELE1BQU0sQ0FBTixJQUFrQixzQkFFakI7QUFGRCxXQUFrQixzQkFBc0I7SUFDdkMsdUdBQTRCLENBQUE7QUFDN0IsQ0FBQyxFQUZpQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBRXZDO0FBaVBELE1BQU0sQ0FBTixJQUFrQixXQUlqQjtBQUpELFdBQWtCLFdBQVc7SUFDNUIsbURBQVcsQ0FBQTtJQUNYLGlEQUFVLENBQUE7SUFDVixpREFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUppQixXQUFXLEtBQVgsV0FBVyxRQUk1QjtBQUVELE1BQU0sQ0FBTixJQUFrQixxQkFFakI7QUFGRCxXQUFrQixxQkFBcUI7SUFDdEMsZ0RBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUZpQixxQkFBcUIsS0FBckIscUJBQXFCLFFBRXRDIn0=