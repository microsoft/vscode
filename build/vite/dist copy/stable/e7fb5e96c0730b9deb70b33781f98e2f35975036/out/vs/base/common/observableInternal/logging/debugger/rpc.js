/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class SimpleTypedRpcConnection {
    static createHost(channelFactory, getHandler) {
        return new SimpleTypedRpcConnection(channelFactory, getHandler);
    }
    static createClient(channelFactory, getHandler) {
        return new SimpleTypedRpcConnection(channelFactory, getHandler);
    }
    constructor(_channelFactory, _getHandler) {
        this._channelFactory = _channelFactory;
        this._getHandler = _getHandler;
        this._channel = this._channelFactory({
            handleNotification: (notificationData) => {
                const m = notificationData;
                const fn = this._getHandler().notifications[m[0]];
                if (!fn) {
                    throw new Error(`Unknown notification "${m[0]}"!`);
                }
                fn(...m[1]);
            },
            handleRequest: (requestData) => {
                const m = requestData;
                try {
                    const result = this._getHandler().requests[m[0]](...m[1]);
                    return { type: 'result', value: result };
                }
                catch (e) {
                    return { type: 'error', value: e };
                }
            },
        });
        const requests = new Proxy({}, {
            get: (target, key) => {
                return async (...args) => {
                    const result = await this._channel.sendRequest([key, args]);
                    if (result.type === 'error') {
                        throw result.value;
                    }
                    else {
                        return result.value;
                    }
                };
            }
        });
        const notifications = new Proxy({}, {
            get: (target, key) => {
                return (...args) => {
                    this._channel.sendNotification([key, args]);
                };
            }
        });
        // eslint-disable-next-line local/code-no-any-casts
        this.api = { notifications: notifications, requests: requests };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZUludGVybmFsL2xvZ2dpbmcvZGVidWdnZXIvcnBjLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBaUNoRyxNQUFNLE9BQU8sd0JBQXdCO0lBQzdCLE1BQU0sQ0FBQyxVQUFVLENBQWdCLGNBQThCLEVBQUUsVUFBMkI7UUFDbEcsT0FBTyxJQUFJLHdCQUF3QixDQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRU0sTUFBTSxDQUFDLFlBQVksQ0FBZ0IsY0FBOEIsRUFBRSxVQUE2QjtRQUN0RyxPQUFPLElBQUksd0JBQXdCLENBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFLRCxZQUNrQixlQUErQixFQUMvQixXQUF1QjtRQUR2QixvQkFBZSxHQUFmLGVBQWUsQ0FBZ0I7UUFDL0IsZ0JBQVcsR0FBWCxXQUFXLENBQVk7UUFFeEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBQ3BDLGtCQUFrQixFQUFFLENBQUMsZ0JBQWdCLEVBQUUsRUFBRTtnQkFDeEMsTUFBTSxDQUFDLEdBQUcsZ0JBQW1DLENBQUM7Z0JBQzlDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDVCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNwRCxDQUFDO2dCQUNELEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQztZQUNELGFBQWEsRUFBRSxDQUFDLFdBQVcsRUFBRSxFQUFFO2dCQUM5QixNQUFNLENBQUMsR0FBRyxXQUE4QixDQUFDO2dCQUN6QyxJQUFJLENBQUM7b0JBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxRCxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7Z0JBQzFDLENBQUM7Z0JBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDWixPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQzlCLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxHQUFXLEVBQUUsRUFBRTtnQkFDNUIsT0FBTyxLQUFLLEVBQUUsR0FBRyxJQUFlLEVBQUUsRUFBRTtvQkFDbkMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQTJCLENBQUMsQ0FBQztvQkFDdEYsSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO3dCQUM3QixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUM7b0JBQ3BCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUM7b0JBQ3JCLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDO1lBQ0gsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sYUFBYSxHQUFHLElBQUksS0FBSyxDQUFDLEVBQUUsRUFBRTtZQUNuQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLEVBQUUsR0FBVyxFQUFFLEVBQUU7Z0JBQzVCLE9BQU8sQ0FBQyxHQUFHLElBQWUsRUFBRSxFQUFFO29CQUM3QixJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBMkIsQ0FBQyxDQUFDO2dCQUN2RSxDQUFDLENBQUM7WUFDSCxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsbURBQW1EO1FBQ25ELElBQUksQ0FBQyxHQUFHLEdBQUcsRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQVMsQ0FBQztJQUN4RSxDQUFDO0NBQ0QifQ==