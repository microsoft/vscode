/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IStatusbarService = createDecorator('statusbarService');
export var StatusbarAlignment;
(function (StatusbarAlignment) {
    StatusbarAlignment[StatusbarAlignment["LEFT"] = 0] = "LEFT";
    StatusbarAlignment[StatusbarAlignment["RIGHT"] = 1] = "RIGHT";
})(StatusbarAlignment || (StatusbarAlignment = {}));
export function isStatusbarEntryLocation(thing) {
    const candidate = thing;
    return typeof candidate?.location?.id === 'string' && typeof candidate.alignment === 'number';
}
export function isStatusbarEntryPriority(thing) {
    const candidate = thing;
    return (typeof candidate?.primary === 'number' || isStatusbarEntryLocation(candidate?.primary)) && typeof candidate?.secondary === 'number';
}
export const ShowTooltipCommand = {
    id: 'statusBar.entry.showTooltip',
    title: ''
};
export const StatusbarEntryKinds = ['standard', 'warning', 'error', 'prominent', 'remote', 'offline'];
export function isTooltipWithCommands(thing) {
    const candidate = thing;
    return !!candidate?.content && Array.isArray(candidate?.commands);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzYmFyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUF5QixNQUFNLDREQUE0RCxDQUFDO0FBU3BILE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBb0Isa0JBQWtCLENBQUMsQ0FBQztBQXVCeEYsTUFBTSxDQUFOLElBQWtCLGtCQUdqQjtBQUhELFdBQWtCLGtCQUFrQjtJQUNuQywyREFBSSxDQUFBO0lBQ0osNkRBQUssQ0FBQTtBQUNOLENBQUMsRUFIaUIsa0JBQWtCLEtBQWxCLGtCQUFrQixRQUduQztBQTRCRCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsS0FBYztJQUN0RCxNQUFNLFNBQVMsR0FBRyxLQUE0QyxDQUFDO0lBRS9ELE9BQU8sT0FBTyxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxRQUFRLElBQUksT0FBTyxTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUMvRixDQUFDO0FBeUJELE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxLQUFjO0lBQ3RELE1BQU0sU0FBUyxHQUFHLEtBQTRDLENBQUM7SUFFL0QsT0FBTyxDQUFDLE9BQU8sU0FBUyxFQUFFLE9BQU8sS0FBSyxRQUFRLElBQUksd0JBQXdCLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksT0FBTyxTQUFTLEVBQUUsU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUM3SSxDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQVk7SUFDMUMsRUFBRSxFQUFFLDZCQUE2QjtJQUNqQyxLQUFLLEVBQUUsRUFBRTtDQUNULENBQUM7QUFVRixNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBeUIsQ0FBQyxVQUFVLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBUzVILE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxLQUFjO0lBQ25ELE1BQU0sU0FBUyxHQUFHLEtBQXlDLENBQUM7SUFFNUQsT0FBTyxDQUFDLENBQUMsU0FBUyxFQUFFLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUNuRSxDQUFDIn0=