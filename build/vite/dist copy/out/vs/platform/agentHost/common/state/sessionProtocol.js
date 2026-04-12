/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export { ContentEncoding, ReconnectResultType } from './protocol/commands.js';
// Error codes
export { AhpErrorCodes, JsonRpcErrorCodes } from './protocol/errors.js';
// ---- Backward-compatible error code aliases ---------------------------------
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INTERNAL_ERROR = -32603;
export const AHP_SESSION_NOT_FOUND = -32001;
export const AHP_PROVIDER_NOT_FOUND = -32002;
export const AHP_SESSION_ALREADY_EXISTS = -32003;
export const AHP_TURN_IN_PROGRESS = -32004;
export const AHP_UNSUPPORTED_PROTOCOL_VERSION = -32005;
export const AHP_CONTENT_NOT_FOUND = -32006;
export const AHP_AUTH_REQUIRED = -32007;
export function isJsonRpcRequest(msg) {
    return 'method' in msg && 'id' in msg;
}
export function isJsonRpcNotification(msg) {
    return 'method' in msg && !('id' in msg);
}
export function isJsonRpcResponse(msg) {
    return 'id' in msg && !('method' in msg);
}
// ---- VS Code-specific types ------------------------------------------------
/**
 * Error with a JSON-RPC error code for protocol-level failures.
 * Optionally carries a `data` payload for structured error details.
 */
export class ProtocolError extends Error {
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblByb3RvY29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFvRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUU5RSxjQUFjO0FBQ2QsT0FBTyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBTXhFLGdGQUFnRjtBQUVoRixNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUNwRCxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUN2RCxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUNyRCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUN0RCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUMxRCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUNwRCxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUNoRSxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQUNyRCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLEtBQWMsQ0FBQztBQU1qRCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsR0FBcUI7SUFDckQsT0FBTyxRQUFRLElBQUksR0FBRyxJQUFJLElBQUksSUFBSSxHQUFHLENBQUM7QUFDdkMsQ0FBQztBQUVELE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxHQUFxQjtJQUMxRCxPQUFPLFFBQVEsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQztBQUMxQyxDQUFDO0FBRUQsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEdBQXFCO0lBQ3RELE9BQU8sSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsUUFBUSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLENBQUM7QUFFRCwrRUFBK0U7QUFFL0U7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLGFBQWMsU0FBUSxLQUFLO0lBQ3ZDLFlBQXFCLElBQVksRUFBRSxPQUFlLEVBQVcsSUFBYztRQUMxRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFESyxTQUFJLEdBQUosSUFBSSxDQUFRO1FBQTRCLFNBQUksR0FBSixJQUFJLENBQVU7SUFFM0UsQ0FBQztDQUNEIn0=