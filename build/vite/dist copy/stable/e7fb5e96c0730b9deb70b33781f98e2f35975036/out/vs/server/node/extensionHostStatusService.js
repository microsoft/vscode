/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
export const IExtensionHostStatusService = createDecorator('extensionHostStatusService');
export class ExtensionHostStatusService {
    constructor() {
        this._exitInfo = new Map();
    }
    setExitInfo(reconnectionToken, info) {
        this._exitInfo.set(reconnectionToken, info);
    }
    getExitInfo(reconnectionToken) {
        return this._exitInfo.get(reconnectionToken) || null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdFN0YXR1c1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXJ2ZXIvbm9kZS9leHRlbnNpb25Ib3N0U3RhdHVzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHdkYsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsZUFBZSxDQUE4Qiw0QkFBNEIsQ0FBQyxDQUFDO0FBU3RILE1BQU0sT0FBTywwQkFBMEI7SUFBdkM7UUFHa0IsY0FBUyxHQUFHLElBQUksR0FBRyxFQUFrQyxDQUFDO0lBU3hFLENBQUM7SUFQQSxXQUFXLENBQUMsaUJBQXlCLEVBQUUsSUFBNEI7UUFDbEUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELFdBQVcsQ0FBQyxpQkFBeUI7UUFDcEMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLElBQUksQ0FBQztJQUN0RCxDQUFDO0NBQ0QifQ==