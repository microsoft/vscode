/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var ExtHostConnectionType;
(function (ExtHostConnectionType) {
    ExtHostConnectionType[ExtHostConnectionType["IPC"] = 1] = "IPC";
    ExtHostConnectionType[ExtHostConnectionType["Socket"] = 2] = "Socket";
    ExtHostConnectionType[ExtHostConnectionType["MessagePort"] = 3] = "MessagePort";
})(ExtHostConnectionType || (ExtHostConnectionType = {}));
/**
 * The extension host will connect via named pipe / domain socket to its renderer.
 */
export class IPCExtHostConnection {
    static { this.ENV_KEY = 'VSCODE_EXTHOST_IPC_HOOK'; }
    constructor(pipeName) {
        this.pipeName = pipeName;
        this.type = 1 /* ExtHostConnectionType.IPC */;
    }
    serialize(env) {
        env[IPCExtHostConnection.ENV_KEY] = this.pipeName;
    }
}
/**
 * The extension host will receive via nodejs IPC the socket to its renderer.
 */
export class SocketExtHostConnection {
    constructor() {
        this.type = 2 /* ExtHostConnectionType.Socket */;
    }
    static { this.ENV_KEY = 'VSCODE_EXTHOST_WILL_SEND_SOCKET'; }
    serialize(env) {
        env[SocketExtHostConnection.ENV_KEY] = '1';
    }
}
/**
 * The extension host will receive via nodejs IPC the MessagePort to its renderer.
 */
export class MessagePortExtHostConnection {
    constructor() {
        this.type = 3 /* ExtHostConnectionType.MessagePort */;
    }
    static { this.ENV_KEY = 'VSCODE_WILL_SEND_MESSAGE_PORT'; }
    serialize(env) {
        env[MessagePortExtHostConnection.ENV_KEY] = '1';
    }
}
function clean(env) {
    delete env[IPCExtHostConnection.ENV_KEY];
    delete env[SocketExtHostConnection.ENV_KEY];
    delete env[MessagePortExtHostConnection.ENV_KEY];
}
/**
 * Write `connection` into `env` and clean up `env`.
 */
export function writeExtHostConnection(connection, env) {
    // Avoid having two different keys that might introduce amiguity or problems.
    clean(env);
    connection.serialize(env);
}
/**
 * Read `connection` from `env` and clean up `env`.
 */
export function readExtHostConnection(env) {
    if (env[IPCExtHostConnection.ENV_KEY]) {
        return cleanAndReturn(env, new IPCExtHostConnection(env[IPCExtHostConnection.ENV_KEY]));
    }
    if (env[SocketExtHostConnection.ENV_KEY]) {
        return cleanAndReturn(env, new SocketExtHostConnection());
    }
    if (env[MessagePortExtHostConnection.ENV_KEY]) {
        return cleanAndReturn(env, new MessagePortExtHostConnection());
    }
    throw new Error(`No connection information defined in environment!`);
}
function cleanAndReturn(env, result) {
    clean(env);
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdEVudi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0RW52LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE1BQU0sQ0FBTixJQUFrQixxQkFJakI7QUFKRCxXQUFrQixxQkFBcUI7SUFDdEMsK0RBQU8sQ0FBQTtJQUNQLHFFQUFVLENBQUE7SUFDViwrRUFBZSxDQUFBO0FBQ2hCLENBQUMsRUFKaUIscUJBQXFCLEtBQXJCLHFCQUFxQixRQUl0QztBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLG9CQUFvQjthQUNsQixZQUFPLEdBQUcseUJBQXlCLEFBQTVCLENBQTZCO0lBSWxELFlBQ2lCLFFBQWdCO1FBQWhCLGFBQVEsR0FBUixRQUFRLENBQVE7UUFIakIsU0FBSSxxQ0FBNkI7SUFJN0MsQ0FBQztJQUVFLFNBQVMsQ0FBQyxHQUF3QjtRQUN4QyxHQUFHLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUNuRCxDQUFDOztBQUdGOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHVCQUF1QjtJQUFwQztRQUdpQixTQUFJLHdDQUFnQztJQUtyRCxDQUFDO2FBUGMsWUFBTyxHQUFHLGlDQUFpQyxBQUFwQyxDQUFxQztJQUluRCxTQUFTLENBQUMsR0FBd0I7UUFDeEMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUM1QyxDQUFDOztBQUdGOztHQUVHO0FBQ0gsTUFBTSxPQUFPLDRCQUE0QjtJQUF6QztRQUdpQixTQUFJLDZDQUFxQztJQUsxRCxDQUFDO2FBUGMsWUFBTyxHQUFHLCtCQUErQixBQUFsQyxDQUFtQztJQUlqRCxTQUFTLENBQUMsR0FBd0I7UUFDeEMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUNqRCxDQUFDOztBQUtGLFNBQVMsS0FBSyxDQUFDLEdBQXdCO0lBQ3RDLE9BQU8sR0FBRyxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3pDLE9BQU8sR0FBRyxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVDLE9BQU8sR0FBRyxDQUFDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ2xELENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxVQUE2QixFQUFFLEdBQXdCO0lBQzdGLDZFQUE2RTtJQUM3RSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDWCxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzNCLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxHQUF3QjtJQUM3RCxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ3ZDLE9BQU8sY0FBYyxDQUFDLEdBQUcsRUFBRSxJQUFJLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUYsQ0FBQztJQUNELElBQUksR0FBRyxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDMUMsT0FBTyxjQUFjLENBQUMsR0FBRyxFQUFFLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFDRCxJQUFJLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQy9DLE9BQU8sY0FBYyxDQUFDLEdBQUcsRUFBRSxJQUFJLDRCQUE0QixFQUFFLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxtREFBbUQsQ0FBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxHQUF3QixFQUFFLE1BQXlCO0lBQzFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNYLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQyJ9