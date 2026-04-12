/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { observableValue } from '../../../base/common/observable.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export const IRenameSymbolTrackerService = createDecorator('renameSymbolTrackerService');
export class NullRenameSymbolTrackerService {
    constructor() {
        this._trackedWord = observableValue(this, undefined);
        this.trackedWord = this._trackedWord;
        this._trackedWord.set(undefined, undefined);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lU3ltYm9sVHJhY2tlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFJbEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTFGLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGVBQWUsQ0FBOEIsNEJBQTRCLENBQUMsQ0FBQztBQXlDdEgsTUFBTSxPQUFPLDhCQUE4QjtJQUsxQztRQUZpQixpQkFBWSxHQUFHLGVBQWUsQ0FBMkIsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNFLGdCQUFXLEdBQTBDLElBQUksQ0FBQyxZQUFZLENBQUM7UUFFdEYsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzdDLENBQUM7Q0FDRCJ9