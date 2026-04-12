/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IMeteredConnectionService = createDecorator('meteredConnectionService');
export const METERED_CONNECTION_SETTING_KEY = 'network.meteredConnection';
/**
 * Check if the current network connection is metered according to the Network Information API.
 */
export function getIsBrowserConnectionMetered() {
    const connection = navigator.connection;
    if (!connection) {
        return false;
    }
    if (connection.saveData || connection.metered) {
        return true;
    }
    const effectiveType = connection.effectiveType;
    return effectiveType === '2g' || effectiveType === 'slow-2g';
}
/**
 * Abstract base class for metered connection services.
 */
export class AbstractMeteredConnectionService extends Disposable {
    constructor(configurationService, isBrowserConnectionMetered) {
        super();
        this._onDidChangeIsConnectionMetered = this._register(new Emitter());
        this.onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;
        this._isBrowserConnectionMetered = isBrowserConnectionMetered;
        this._meteredConnectionSetting = configurationService.getValue(METERED_CONNECTION_SETTING_KEY);
        this._isConnectionMetered = this._meteredConnectionSetting === 'on' || (this._meteredConnectionSetting !== 'off' && this._isBrowserConnectionMetered);
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(METERED_CONNECTION_SETTING_KEY)) {
                const value = configurationService.getValue(METERED_CONNECTION_SETTING_KEY);
                if (value !== this._meteredConnectionSetting) {
                    this._meteredConnectionSetting = value;
                    this.onUpdated();
                }
            }
        }));
    }
    get isConnectionMetered() {
        return this._isConnectionMetered;
    }
    get isBrowserConnectionMetered() {
        return this._isBrowserConnectionMetered;
    }
    setIsBrowserConnectionMetered(value) {
        if (value !== this._isBrowserConnectionMetered) {
            this._isBrowserConnectionMetered = value;
            this.onChangeBrowserConnection();
        }
    }
    onChangeBrowserConnection() {
        this.onUpdated();
    }
    onUpdated() {
        const value = this._meteredConnectionSetting === 'on' || (this._meteredConnectionSetting !== 'off' && this._isBrowserConnectionMetered);
        if (value !== this._isConnectionMetered) {
            this._isConnectionMetered = value;
            this.onChangeIsConnectionMetered();
        }
    }
    onChangeIsConnectionMetered() {
        this._onDidChangeIsConnectionMetered.fire(this._isConnectionMetered);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUE0QiwwQkFBMEIsQ0FBQyxDQUFDO0FBcUJoSCxNQUFNLENBQUMsTUFBTSw4QkFBOEIsR0FBRywyQkFBMkIsQ0FBQztBQXVCMUU7O0dBRUc7QUFDSCxNQUFNLFVBQVUsNkJBQTZCO0lBQzVDLE1BQU0sVUFBVSxHQUFJLFNBQXFDLENBQUMsVUFBVSxDQUFDO0lBQ3JFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJLFVBQVUsQ0FBQyxRQUFRLElBQUksVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQy9DLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxhQUFhLENBQUM7SUFDL0MsT0FBTyxhQUFhLEtBQUssSUFBSSxJQUFJLGFBQWEsS0FBSyxTQUFTLENBQUM7QUFDOUQsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFnQixnQ0FBaUMsU0FBUSxVQUFVO0lBVXhFLFlBQVksb0JBQTJDLEVBQUUsMEJBQW1DO1FBQzNGLEtBQUssRUFBRSxDQUFDO1FBUlEsb0NBQStCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBVyxDQUFDLENBQUM7UUFDMUUsbUNBQThCLEdBQUcsSUFBSSxDQUFDLCtCQUErQixDQUFDLEtBQUssQ0FBQztRQVMzRixJQUFJLENBQUMsMkJBQTJCLEdBQUcsMEJBQTBCLENBQUM7UUFDOUQsSUFBSSxDQUFDLHlCQUF5QixHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBZ0MsOEJBQThCLENBQUMsQ0FBQztRQUM5SCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsS0FBSyxLQUFLLElBQUksSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFFdEosSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoRSxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUM7Z0JBQzVELE1BQU0sS0FBSyxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBZ0MsOEJBQThCLENBQUMsQ0FBQztnQkFDM0csSUFBSSxLQUFLLEtBQUssSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7b0JBQzlDLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxLQUFLLENBQUM7b0JBQ3ZDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDbEIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELElBQVcsbUJBQW1CO1FBQzdCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDO0lBQ2xDLENBQUM7SUFFRCxJQUFjLDBCQUEwQjtRQUN2QyxPQUFPLElBQUksQ0FBQywyQkFBMkIsQ0FBQztJQUN6QyxDQUFDO0lBRU0sNkJBQTZCLENBQUMsS0FBYztRQUNsRCxJQUFJLEtBQUssS0FBSyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztZQUNoRCxJQUFJLENBQUMsMkJBQTJCLEdBQUcsS0FBSyxDQUFDO1lBQ3pDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ2xDLENBQUM7SUFDRixDQUFDO0lBRVMseUJBQXlCO1FBQ2xDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNsQixDQUFDO0lBRVMsU0FBUztRQUNsQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMseUJBQXlCLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLHlCQUF5QixLQUFLLEtBQUssSUFBSSxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUN4SSxJQUFJLEtBQUssS0FBSyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUN6QyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0lBRVMsMkJBQTJCO1FBQ3BDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDdEUsQ0FBQztDQUNEIn0=