/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SimpleTypedRpcConnection } from './rpc.js';
export function registerDebugChannel(channelId, createClient) {
    // eslint-disable-next-line local/code-no-any-casts
    const g = globalThis;
    let queuedNotifications = [];
    let curHost = undefined;
    const { channel, handler } = createChannelFactoryFromDebugChannel({
        sendNotification: (data) => {
            if (curHost) {
                curHost.sendNotification(data);
            }
            else {
                queuedNotifications.push(data);
            }
        },
    });
    let curClient = undefined;
    (g.$$debugValueEditor_debugChannels ?? (g.$$debugValueEditor_debugChannels = {}))[channelId] = (host) => {
        curClient = createClient();
        curHost = host;
        for (const n of queuedNotifications) {
            host.sendNotification(n);
        }
        queuedNotifications = [];
        return handler;
    };
    return SimpleTypedRpcConnection.createClient(channel, () => {
        if (!curClient) {
            throw new Error('Not supported');
        }
        return curClient;
    });
}
function createChannelFactoryFromDebugChannel(host) {
    let h;
    const channel = (handler) => {
        h = handler;
        return {
            sendNotification: data => {
                host.sendNotification(data);
            },
            sendRequest: data => {
                throw new Error('not supported');
            },
        };
    };
    return {
        channel: channel,
        handler: {
            handleRequest: (data) => {
                if (data.type === 'notification') {
                    return h?.handleNotification(data.data);
                }
                else {
                    return h?.handleRequest(data.data);
                }
            },
        },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdnZXJScGMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvbG9nZ2luZy9kZWJ1Z2dlci9kZWJ1Z2dlclJwYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQXdDLHdCQUF3QixFQUFpQixNQUFNLFVBQVUsQ0FBQztBQUV6RyxNQUFNLFVBQVUsb0JBQW9CLENBQ25DLFNBQXlCLEVBQ3pCLFlBQStCO0lBRS9CLG1EQUFtRDtJQUNuRCxNQUFNLENBQUMsR0FBRyxVQUE4QixDQUFDO0lBRXpDLElBQUksbUJBQW1CLEdBQWMsRUFBRSxDQUFDO0lBQ3hDLElBQUksT0FBTyxHQUFzQixTQUFTLENBQUM7SUFFM0MsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsR0FBRyxvQ0FBb0MsQ0FBQztRQUNqRSxnQkFBZ0IsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQzFCLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUM7S0FDRCxDQUFDLENBQUM7SUFFSCxJQUFJLFNBQVMsR0FBNEIsU0FBUyxDQUFDO0lBRW5ELENBQUMsQ0FBQyxDQUFDLGdDQUFnQyxJQUFJLENBQUMsQ0FBQyxDQUFDLGdDQUFnQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUN2RyxTQUFTLEdBQUcsWUFBWSxFQUFFLENBQUM7UUFDM0IsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNmLEtBQUssTUFBTSxDQUFDLElBQUksbUJBQW1CLEVBQUUsQ0FBQztZQUNyQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUIsQ0FBQztRQUNELG1CQUFtQixHQUFHLEVBQUUsQ0FBQztRQUN6QixPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDLENBQUM7SUFFRixPQUFPLHdCQUF3QixDQUFDLFlBQVksQ0FBSSxPQUFPLEVBQUUsR0FBRyxFQUFFO1FBQzdELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7UUFBQyxDQUFDO1FBQ3JELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQVVELFNBQVMsb0NBQW9DLENBQUMsSUFBVztJQUN4RCxJQUFJLENBQThCLENBQUM7SUFDbkMsTUFBTSxPQUFPLEdBQW1CLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDM0MsQ0FBQyxHQUFHLE9BQU8sQ0FBQztRQUNaLE9BQU87WUFDTixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsRUFBRTtnQkFDeEIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzdCLENBQUM7WUFDRCxXQUFXLEVBQUUsSUFBSSxDQUFDLEVBQUU7Z0JBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDbEMsQ0FBQztTQUNELENBQUM7SUFDSCxDQUFDLENBQUM7SUFDRixPQUFPO1FBQ04sT0FBTyxFQUFFLE9BQU87UUFDaEIsT0FBTyxFQUFFO1lBQ1IsYUFBYSxFQUFFLENBQUMsSUFBUyxFQUFFLEVBQUU7Z0JBQzVCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxjQUFjLEVBQUUsQ0FBQztvQkFDbEMsT0FBTyxDQUFDLEVBQUUsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN6QyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxDQUFDLEVBQUUsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDcEMsQ0FBQztZQUNGLENBQUM7U0FDRDtLQUNELENBQUM7QUFDSCxDQUFDIn0=