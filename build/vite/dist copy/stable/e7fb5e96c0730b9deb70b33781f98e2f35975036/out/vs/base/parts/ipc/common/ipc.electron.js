/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * The Electron `Protocol` leverages Electron style IPC communication (`ipcRenderer`, `ipcMain`)
 * for the implementation of the `IMessagePassingProtocol`. That style of API requires a channel
 * name for sending data.
 */
export class Protocol {
    constructor(sender, onMessage) {
        this.sender = sender;
        this.onMessage = onMessage;
    }
    send(message) {
        try {
            this.sender.send('vscode:message', message.buffer);
        }
        catch (e) {
            // systems are going down
        }
    }
    disconnect() {
        this.sender.send('vscode:disconnect', null);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLmVsZWN0cm9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5lbGVjdHJvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVVoRzs7OztHQUlHO0FBQ0gsTUFBTSxPQUFPLFFBQVE7SUFFcEIsWUFBb0IsTUFBYyxFQUFXLFNBQTBCO1FBQW5ELFdBQU0sR0FBTixNQUFNLENBQVE7UUFBVyxjQUFTLEdBQVQsU0FBUyxDQUFpQjtJQUFJLENBQUM7SUFFNUUsSUFBSSxDQUFDLE9BQWlCO1FBQ3JCLElBQUksQ0FBQztZQUNKLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLHlCQUF5QjtRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELFVBQVU7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0QifQ==