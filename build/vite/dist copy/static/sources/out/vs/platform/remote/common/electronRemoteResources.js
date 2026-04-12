/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const NODE_REMOTE_RESOURCE_IPC_METHOD_NAME = 'request';
export const NODE_REMOTE_RESOURCE_CHANNEL_NAME = 'remoteResourceHandler';
export class NodeRemoteResourceRouter {
    async routeCall(hub, command, arg) {
        if (command !== NODE_REMOTE_RESOURCE_IPC_METHOD_NAME) {
            throw new Error(`Call not found: ${command}`);
        }
        const uri = Array.isArray(arg) ? arg[0] : undefined;
        if (uri?.authority) {
            const connection = hub.connections.find(c => c.ctx === uri.authority);
            if (connection) {
                return connection;
            }
        }
        throw new Error(`Caller not found`);
    }
    routeEvent(_, event) {
        throw new Error(`Event not found: ${event}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb25SZW1vdGVSZXNvdXJjZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL2VsZWN0cm9uUmVtb3RlUmVzb3VyY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE1BQU0sQ0FBQyxNQUFNLG9DQUFvQyxHQUFHLFNBQVMsQ0FBQztBQUU5RCxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyx1QkFBdUIsQ0FBQztBQUl6RSxNQUFNLE9BQU8sd0JBQXdCO0lBQ3BDLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBMkIsRUFBRSxPQUFlLEVBQUUsR0FBYTtRQUMxRSxJQUFJLE9BQU8sS0FBSyxvQ0FBb0MsRUFBRSxDQUFDO1lBQ3RELE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQWdDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNuRixJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsQ0FBQztZQUNwQixNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3RFLElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLE9BQU8sVUFBVSxDQUFDO1lBQ25CLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxVQUFVLENBQUMsQ0FBeUIsRUFBRSxLQUFhO1FBQ2xELE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztDQUNEIn0=