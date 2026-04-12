/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MainContext } from './extHost.protocol.js';
import { Emitter } from '../../../base/common/event.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export class ExtHostSecretState {
    constructor(mainContext) {
        this._onDidChangePassword = new Emitter();
        this.onDidChangePassword = this._onDidChangePassword.event;
        this._proxy = mainContext.getProxy(MainContext.MainThreadSecretState);
    }
    async $onDidChangePassword(e) {
        this._onDidChangePassword.fire(e);
    }
    get(extensionId, key) {
        return this._proxy.$getPassword(extensionId, key);
    }
    store(extensionId, key, value) {
        return this._proxy.$setPassword(extensionId, key, value);
    }
    delete(extensionId, key) {
        return this._proxy.$deletePassword(extensionId, key);
    }
    keys(extensionId) {
        return this._proxy.$getKeys(extensionId);
    }
}
export const IExtHostSecretState = createDecorator('IExtHostSecretState');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFNlY3JldFN0YXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFNlY3JldFN0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBMkIsV0FBVyxFQUE4QixNQUFNLHVCQUF1QixDQUFDO0FBQ3pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFMUYsTUFBTSxPQUFPLGtCQUFrQjtJQUs5QixZQUFZLFdBQStCO1FBSG5DLHlCQUFvQixHQUFHLElBQUksT0FBTyxFQUF3QyxDQUFDO1FBQzFFLHdCQUFtQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUM7UUFHOUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBdUM7UUFDakUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsR0FBRyxDQUFDLFdBQW1CLEVBQUUsR0FBVztRQUNuQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQW1CLEVBQUUsR0FBVyxFQUFFLEtBQWE7UUFDcEQsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFRCxNQUFNLENBQUMsV0FBbUIsRUFBRSxHQUFXO1FBQ3RDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxJQUFJLENBQUMsV0FBbUI7UUFDdkIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMxQyxDQUFDO0NBQ0Q7QUFHRCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLHFCQUFxQixDQUFDLENBQUMifQ==