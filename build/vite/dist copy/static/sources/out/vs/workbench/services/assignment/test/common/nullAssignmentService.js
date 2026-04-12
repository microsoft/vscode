/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../base/common/event.js';
export class NullWorkbenchAssignmentService {
    constructor() {
        this.onDidRefetchAssignments = Event.None;
    }
    async getCurrentExperiments() {
        return [];
    }
    async getTreatment(name) {
        return undefined;
    }
    addTelemetryAssignmentFilter(filter) { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUc1RCxNQUFNLE9BQU8sOEJBQThCO0lBQTNDO1FBR1UsNEJBQXVCLEdBQWdCLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFXNUQsQ0FBQztJQVRBLEtBQUssQ0FBQyxxQkFBcUI7UUFDMUIsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBc0MsSUFBWTtRQUNuRSxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsNEJBQTRCLENBQUMsTUFBeUIsSUFBVSxDQUFDO0NBQ2pFIn0=