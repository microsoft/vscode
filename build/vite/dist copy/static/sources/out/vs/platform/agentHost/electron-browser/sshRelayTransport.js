/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
/**
 * A protocol transport that relays messages through the shared process
 * SSH tunnel via IPC, instead of using a direct WebSocket connection.
 *
 * The shared process manages the actual WebSocket-over-SSH connection
 * and forwards messages bidirectionally through this IPC channel.
 */
export class SSHRelayTransport extends Disposable {
    constructor(_connectionId, _sshService) {
        super();
        this._connectionId = _connectionId;
        this._sshService = _sshService;
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onClose = this._register(new Emitter());
        this.onClose = this._onClose.event;
        // Listen for relay messages from the shared process
        this._register(this._sshService.onDidRelayMessage((msg) => {
            if (msg.connectionId === this._connectionId) {
                try {
                    const parsed = JSON.parse(msg.data);
                    this._onMessage.fire(parsed);
                }
                catch {
                    // Malformed message — drop
                }
            }
        }));
        // Listen for relay close
        this._register(this._sshService.onDidRelayClose((closedId) => {
            if (closedId === this._connectionId) {
                this._onClose.fire();
            }
        }));
    }
    send(message) {
        this._sshService.relaySend(this._connectionId, JSON.stringify(message)).catch(() => {
            // Send failed — connection probably closed
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NoUmVsYXlUcmFuc3BvcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tYnJvd3Nlci9zc2hSZWxheVRyYW5zcG9ydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSy9EOzs7Ozs7R0FNRztBQUNILE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxVQUFVO0lBUWhELFlBQ2tCLGFBQXFCLEVBQ3JCLFdBQTJDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBSFMsa0JBQWEsR0FBYixhQUFhLENBQVE7UUFDckIsZ0JBQVcsR0FBWCxXQUFXLENBQWdDO1FBUjVDLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFvQixDQUFDLENBQUM7UUFDckUsY0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO1FBRTFCLGFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN2RCxZQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFRdEMsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEdBQXFCLEVBQUUsRUFBRTtZQUMzRSxJQUFJLEdBQUcsQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUM3QyxJQUFJLENBQUM7b0JBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFxQixDQUFDO29CQUN4RCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDOUIsQ0FBQztnQkFBQyxNQUFNLENBQUM7b0JBQ1IsMkJBQTJCO2dCQUM1QixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSix5QkFBeUI7UUFDekIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQWdCLEVBQUUsRUFBRTtZQUNwRSxJQUFJLFFBQVEsS0FBSyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3JDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsSUFBSSxDQUFDLE9BQXFFO1FBQ3pFLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7WUFDbEYsMkNBQTJDO1FBQzVDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=