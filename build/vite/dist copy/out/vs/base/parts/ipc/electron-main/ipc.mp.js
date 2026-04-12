/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { validatedIpcMain } from './ipcMain.js';
import { Event } from '../../../common/event.js';
import { generateUuid } from '../../../common/uuid.js';
import { Client as MessagePortClient } from '../common/ipc.mp.js';
/**
 * An implementation of a `IPCClient` on top of Electron `MessagePortMain`.
 */
export class Client extends MessagePortClient {
    /**
     * @param clientId a way to uniquely identify this client among
     * other clients. this is important for routing because every
     * client can also be a server
     */
    constructor(port, clientId) {
        super({
            addEventListener: (type, listener) => port.addListener(type, listener),
            removeEventListener: (type, listener) => port.removeListener(type, listener),
            postMessage: message => port.postMessage(message),
            start: () => port.start(),
            close: () => port.close()
        }, clientId);
    }
}
/**
 * This method opens a message channel connection
 * in the target window. The target window needs
 * to use the `Server` from `electron-browser/ipc.mp`.
 */
export async function connect(window) {
    // Assert healthy window to talk to
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
        throw new Error('ipc.mp#connect: Cannot talk to window because it is closed or destroyed');
    }
    // Ask to create message channel inside the window
    // and send over a UUID to correlate the response
    const nonce = generateUuid();
    window.webContents.send('vscode:createMessageChannel', nonce);
    // Wait until the window has returned the `MessagePort`
    // We need to filter by the `nonce` to ensure we listen
    // to the right response.
    const onMessageChannelResult = Event.fromNodeEventEmitter(validatedIpcMain, 'vscode:createMessageChannelResult', (e, nonce) => ({ nonce, port: e.ports[0] }));
    const { port } = await Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => e.nonce === nonce)));
    return port;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLm1wLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9wYXJ0cy9pcGMvZWxlY3Ryb24tbWFpbi9pcGMubXAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ2hELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVqRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkQsT0FBTyxFQUFFLE1BQU0sSUFBSSxpQkFBaUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRWxFOztHQUVHO0FBQ0gsTUFBTSxPQUFPLE1BQU8sU0FBUSxpQkFBaUI7SUFFNUM7Ozs7T0FJRztJQUNILFlBQVksSUFBcUIsRUFBRSxRQUFnQjtRQUNsRCxLQUFLLENBQUM7WUFDTCxnQkFBZ0IsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQztZQUN0RSxtQkFBbUIsRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQztZQUM1RSxXQUFXLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQztZQUNqRCxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUN6QixLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtTQUN6QixFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2QsQ0FBQztDQUNEO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsT0FBTyxDQUFDLE1BQXFCO0lBRWxELG1DQUFtQztJQUNuQyxJQUFJLE1BQU0sQ0FBQyxXQUFXLEVBQUUsSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7UUFDOUQsTUFBTSxJQUFJLEtBQUssQ0FBQyx5RUFBeUUsQ0FBQyxDQUFDO0lBQzVGLENBQUM7SUFFRCxrREFBa0Q7SUFDbEQsaURBQWlEO0lBQ2pELE1BQU0sS0FBSyxHQUFHLFlBQVksRUFBRSxDQUFDO0lBQzdCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRTlELHVEQUF1RDtJQUN2RCx1REFBdUQ7SUFDdkQseUJBQXlCO0lBQ3pCLE1BQU0sc0JBQXNCLEdBQUcsS0FBSyxDQUFDLG9CQUFvQixDQUEyQyxnQkFBZ0IsRUFBRSxtQ0FBbUMsRUFBRSxDQUFDLENBQWUsRUFBRSxLQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDOU4sTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVqSCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUMifQ==