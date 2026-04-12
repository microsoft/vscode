/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MainContext } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
export class ExtHostRelatedInformation {
    constructor(mainContext) {
        this._relatedInformationProviders = new Map();
        this._nextHandle = 0;
        this._proxy = mainContext.getProxy(MainContext.MainThreadAiRelatedInformation);
    }
    async $provideAiRelatedInformation(handle, query, token) {
        if (this._relatedInformationProviders.size === 0) {
            throw new Error('No related information providers registered');
        }
        const provider = this._relatedInformationProviders.get(handle);
        if (!provider) {
            throw new Error('related information provider not found');
        }
        const result = await provider.provideRelatedInformation(query, token) ?? [];
        return result;
    }
    getRelatedInformation(extension, query, types) {
        return this._proxy.$getAiRelatedInformation(query, types);
    }
    registerRelatedInformationProvider(extension, type, provider) {
        const handle = this._nextHandle;
        this._nextHandle++;
        this._relatedInformationProviders.set(handle, provider);
        this._proxy.$registerAiRelatedInformationProvider(handle, type);
        return new Disposable(() => {
            this._proxy.$unregisterAiRelatedInformationProvider(handle);
            this._relatedInformationProviders.delete(handle);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEFpUmVsYXRlZEluZm9ybWF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdEFpUmVsYXRlZEluZm9ybWF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBa0QsV0FBVyxFQUF1QyxNQUFNLHVCQUF1QixDQUFDO0FBRXpJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUUvQyxNQUFNLE9BQU8seUJBQXlCO0lBTXJDLFlBQVksV0FBeUI7UUFMN0IsaUNBQTRCLEdBQTRDLElBQUksR0FBRyxFQUFFLENBQUM7UUFDbEYsZ0JBQVcsR0FBRyxDQUFDLENBQUM7UUFLdkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFRCxLQUFLLENBQUMsNEJBQTRCLENBQUMsTUFBYyxFQUFFLEtBQWEsRUFBRSxLQUF3QjtRQUN6RixJQUFJLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbEQsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9ELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsd0NBQXdDLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM1RSxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxTQUFnQyxFQUFFLEtBQWEsRUFBRSxLQUErQjtRQUNyRyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxrQ0FBa0MsQ0FBQyxTQUFnQyxFQUFFLElBQTRCLEVBQUUsUUFBb0M7UUFDdEksTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNoQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxxQ0FBcUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEUsT0FBTyxJQUFJLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1Q0FBdUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM1RCxJQUFJLENBQUMsNEJBQTRCLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=