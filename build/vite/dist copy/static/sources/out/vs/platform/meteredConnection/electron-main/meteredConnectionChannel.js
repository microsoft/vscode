/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MeteredConnectionCommand } from '../common/meteredConnectionIpc.js';
/**
 * IPC channel implementation for the metered connection service.
 */
export class MeteredConnectionChannel {
    constructor(service) {
        this.service = service;
    }
    listen(_, event) {
        switch (event) {
            case MeteredConnectionCommand.OnDidChangeIsConnectionMetered:
                return this.service.onDidChangeIsConnectionMetered;
            default:
                throw new Error(`Event not found: ${event}`);
        }
    }
    async call(_, command, arg) {
        switch (command) {
            case MeteredConnectionCommand.IsConnectionMetered:
                return this.service.isConnectionMetered;
            case MeteredConnectionCommand.SetIsBrowserConnectionMetered:
                this.service.setIsBrowserConnectionMetered(arg);
                break;
            default:
                throw new Error(`Call not found: ${command}`);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0ZXJlZENvbm5lY3Rpb25DaGFubmVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vZWxlY3Ryb24tbWFpbi9tZXRlcmVkQ29ubmVjdGlvbkNoYW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHN0U7O0dBRUc7QUFDSCxNQUFNLE9BQU8sd0JBQXdCO0lBQ3BDLFlBQTZCLE9BQXFDO1FBQXJDLFlBQU8sR0FBUCxPQUFPLENBQThCO0lBQUksQ0FBQztJQUVoRSxNQUFNLENBQUMsQ0FBVSxFQUFFLEtBQVU7UUFDbkMsUUFBUSxLQUFLLEVBQUUsQ0FBQztZQUNmLEtBQUssd0JBQXdCLENBQUMsOEJBQThCO2dCQUMzRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsOEJBQThCLENBQUM7WUFDcEQ7Z0JBQ0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUMvQyxDQUFDO0lBQ0YsQ0FBQztJQUVNLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBVSxFQUFFLE9BQWUsRUFBRSxHQUFTO1FBQ3ZELFFBQVEsT0FBTyxFQUFFLENBQUM7WUFDakIsS0FBSyx3QkFBd0IsQ0FBQyxtQkFBbUI7Z0JBQ2hELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQztZQUN6QyxLQUFLLHdCQUF3QixDQUFDLDZCQUE2QjtnQkFDMUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDaEQsTUFBTTtZQUNQO2dCQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9