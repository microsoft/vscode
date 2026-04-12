/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MainContext } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
import { Progress } from '../../../platform/progress/common/progress.js';
import { AiSettingsSearch } from './extHostTypeConverters.js';
export class ExtHostAiSettingsSearch {
    constructor(mainContext) {
        this._settingsSearchProviders = new Map();
        this._nextHandle = 0;
        this._proxy = mainContext.getProxy(MainContext.MainThreadAiSettingsSearch);
    }
    async $startSearch(handle, query, option, token) {
        if (this._settingsSearchProviders.size === 0) {
            throw new Error('No related information providers registered');
        }
        const provider = this._settingsSearchProviders.get(handle);
        if (!provider) {
            throw new Error('Settings search provider not found');
        }
        const progressReporter = new Progress((data) => {
            this._proxy.$handleSearchResult(handle, AiSettingsSearch.fromSettingsSearchResult(data));
        });
        return provider.provideSettingsSearchResults(query, option, progressReporter, token);
    }
    registerSettingsSearchProvider(extension, provider) {
        const handle = this._nextHandle;
        this._nextHandle++;
        this._settingsSearchProviders.set(handle, provider);
        this._proxy.$registerAiSettingsSearchProvider(handle);
        return new Disposable(() => {
            this._proxy.$unregisterAiSettingsSearchProvider(handle);
            this._settingsSearchProviders.delete(handle);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEFpU2V0dGluZ3NTZWFyY2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0QWlTZXR0aW5nc1NlYXJjaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEVBQThDLFdBQVcsRUFBbUMsTUFBTSx1QkFBdUIsQ0FBQztBQUNqSSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDL0MsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTlELE1BQU0sT0FBTyx1QkFBdUI7SUFNbkMsWUFBWSxXQUF5QjtRQUw3Qiw2QkFBd0IsR0FBd0MsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUMxRSxnQkFBVyxHQUFHLENBQUMsQ0FBQztRQUt2QixJQUFJLENBQUMsTUFBTSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBYyxFQUFFLEtBQWEsRUFBRSxNQUF1QyxFQUFFLEtBQXdCO1FBQ2xILElBQUksSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM5QyxNQUFNLElBQUksS0FBSyxDQUFDLDZDQUE2QyxDQUFDLENBQUM7UUFDaEUsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxNQUFNLGdCQUFnQixHQUFHLElBQUksUUFBUSxDQUF1QixDQUFDLElBQUksRUFBRSxFQUFFO1lBQ3BFLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDMUYsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFFRCw4QkFBOEIsQ0FBQyxTQUFnQyxFQUFFLFFBQWdDO1FBQ2hHLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDaEMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25CLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxNQUFNLENBQUMsaUNBQWlDLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEQsT0FBTyxJQUFJLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQ0FBbUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=