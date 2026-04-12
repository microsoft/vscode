/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { validatedIpcMain } from './ipcMain.js';
import { VSBuffer } from '../../../common/buffer.js';
import { Emitter, Event } from '../../../common/event.js';
import { toDisposable } from '../../../common/lifecycle.js';
import { IPCServer } from '../common/ipc.js';
import { Protocol as ElectronProtocol } from '../common/ipc.electron.js';
function createScopedOnMessageEvent(senderId, eventName) {
    const onMessage = Event.fromNodeEventEmitter(validatedIpcMain, eventName, (event, message) => ({ event, message }));
    const onMessageFromSender = Event.filter(onMessage, ({ event }) => event.sender.id === senderId);
    return Event.map(onMessageFromSender, ({ message }) => message ? VSBuffer.wrap(message) : message);
}
/**
 * An implementation of `IPCServer` on top of Electron `ipcMain` API.
 */
export class Server extends IPCServer {
    static { this.Clients = new Map(); }
    static getOnDidClientConnect() {
        const onHello = Event.fromNodeEventEmitter(validatedIpcMain, 'vscode:hello', ({ sender }) => sender);
        return Event.map(onHello, webContents => {
            const id = webContents.id;
            const client = Server.Clients.get(id);
            client?.dispose();
            const onDidClientReconnect = new Emitter();
            Server.Clients.set(id, toDisposable(() => onDidClientReconnect.fire()));
            const onMessage = createScopedOnMessageEvent(id, 'vscode:message');
            const onDidClientDisconnect = Event.any(Event.signal(createScopedOnMessageEvent(id, 'vscode:disconnect')), onDidClientReconnect.event);
            const protocol = new ElectronProtocol(webContents, onMessage);
            return { protocol, onDidClientDisconnect };
        });
    }
    constructor() {
        super(Server.getOnDidClientConnect());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLmVsZWN0cm9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9wYXJ0cy9pcGMvZWxlY3Ryb24tbWFpbi9pcGMuZWxlY3Ryb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ2hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RSxPQUFPLEVBQXlCLFNBQVMsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLElBQUksZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQU96RSxTQUFTLDBCQUEwQixDQUFDLFFBQWdCLEVBQUUsU0FBaUI7SUFDdEUsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLG9CQUFvQixDQUFZLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9ILE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsQ0FBQztJQUVqRyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ3BHLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyxNQUFPLFNBQVEsU0FBUzthQUVaLFlBQU8sR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztJQUV6RCxNQUFNLENBQUMscUJBQXFCO1FBQ25DLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxvQkFBb0IsQ0FBYyxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVsSCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxFQUFFO1lBQ3ZDLE1BQU0sRUFBRSxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDMUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdEMsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBRWxCLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxPQUFPLEVBQVEsQ0FBQztZQUNqRCxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV4RSxNQUFNLFNBQVMsR0FBRywwQkFBMEIsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLENBQW9CLENBQUM7WUFDdEYsTUFBTSxxQkFBcUIsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsMEJBQTBCLENBQUMsRUFBRSxFQUFFLG1CQUFtQixDQUFDLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2SSxNQUFNLFFBQVEsR0FBRyxJQUFJLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUU5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixFQUFFLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQ7UUFDQyxLQUFLLENBQUMsTUFBTSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQztJQUN2QyxDQUFDIn0=