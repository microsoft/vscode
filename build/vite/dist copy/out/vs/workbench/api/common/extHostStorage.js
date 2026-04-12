/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MainContext } from './extHost.protocol.js';
import { Emitter } from '../../../base/common/event.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export class ExtHostStorage {
    constructor(mainContext, _logService) {
        this._logService = _logService;
        this._onDidChangeStorage = new Emitter();
        this.onDidChangeStorage = this._onDidChangeStorage.event;
        this._proxy = mainContext.getProxy(MainContext.MainThreadStorage);
    }
    registerExtensionStorageKeysToSync(extension, keys) {
        this._proxy.$registerExtensionStorageKeysToSync(extension, keys);
    }
    async initializeExtensionStorage(shared, key, defaultValue) {
        const value = await this._proxy.$initializeExtensionStorage(shared, key);
        let parsedValue;
        if (value) {
            parsedValue = this.safeParseValue(shared, key, value);
        }
        return parsedValue || defaultValue;
    }
    setValue(shared, key, value) {
        return this._proxy.$setValue(shared, key, value);
    }
    $acceptValue(shared, key, value) {
        const parsedValue = this.safeParseValue(shared, key, value);
        if (parsedValue) {
            this._onDidChangeStorage.fire({ shared, key, value: parsedValue });
        }
    }
    safeParseValue(shared, key, value) {
        try {
            return JSON.parse(value);
        }
        catch (error) {
            // Do not fail this call but log it for diagnostics
            // https://github.com/microsoft/vscode/issues/132777
            this._logService.error(`[extHostStorage] unexpected error parsing storage contents (extensionId: ${key}, global: ${shared}): ${error}`);
        }
        return undefined;
    }
}
export const IExtHostStorage = createDecorator('IExtHostStorage');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFN0b3JhZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0U3RvcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUErQyxNQUFNLHVCQUF1QixDQUFDO0FBQ2pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFVMUYsTUFBTSxPQUFPLGNBQWM7SUFTMUIsWUFDQyxXQUErQixFQUNkLFdBQXdCO1FBQXhCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBTHpCLHdCQUFtQixHQUFHLElBQUksT0FBTyxFQUF1QixDQUFDO1FBQ2pFLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFNNUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxrQ0FBa0MsQ0FBQyxTQUFrQyxFQUFFLElBQWM7UUFDcEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQ0FBbUMsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxNQUFlLEVBQUUsR0FBVyxFQUFFLFlBQXFCO1FBQ25GLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQywyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFekUsSUFBSSxXQUErQixDQUFDO1FBQ3BDLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxPQUFPLFdBQVcsSUFBSSxZQUFZLENBQUM7SUFDcEMsQ0FBQztJQUVELFFBQVEsQ0FBQyxNQUFlLEVBQUUsR0FBVyxFQUFFLEtBQWE7UUFDbkQsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxZQUFZLENBQUMsTUFBZSxFQUFFLEdBQVcsRUFBRSxLQUFhO1FBQ3ZELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RCxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLENBQUM7SUFDRixDQUFDO0lBRU8sY0FBYyxDQUFDLE1BQWUsRUFBRSxHQUFXLEVBQUUsS0FBYTtRQUNqRSxJQUFJLENBQUM7WUFDSixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsbURBQW1EO1lBQ25ELG9EQUFvRDtZQUNwRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyw0RUFBNEUsR0FBRyxhQUFhLE1BQU0sTUFBTSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3pJLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0NBQ0Q7QUFHRCxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFrQixpQkFBaUIsQ0FBQyxDQUFDIn0=