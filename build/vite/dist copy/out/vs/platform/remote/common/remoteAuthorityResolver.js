/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ErrorNoTelemetry } from '../../../base/common/errors.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IRemoteAuthorityResolverService = createDecorator('remoteAuthorityResolverService');
export var RemoteConnectionType;
(function (RemoteConnectionType) {
    RemoteConnectionType[RemoteConnectionType["WebSocket"] = 0] = "WebSocket";
    RemoteConnectionType[RemoteConnectionType["Managed"] = 1] = "Managed";
})(RemoteConnectionType || (RemoteConnectionType = {}));
export class ManagedRemoteConnection {
    constructor(id) {
        this.id = id;
        this.type = 1 /* RemoteConnectionType.Managed */;
    }
    toString() {
        return `Managed(${this.id})`;
    }
}
export class WebSocketRemoteConnection {
    constructor(host, port) {
        this.host = host;
        this.port = port;
        this.type = 0 /* RemoteConnectionType.WebSocket */;
    }
    toString() {
        return `WebSocket(${this.host}:${this.port})`;
    }
}
export var RemoteAuthorityResolverErrorCode;
(function (RemoteAuthorityResolverErrorCode) {
    RemoteAuthorityResolverErrorCode["Unknown"] = "Unknown";
    RemoteAuthorityResolverErrorCode["NotAvailable"] = "NotAvailable";
    RemoteAuthorityResolverErrorCode["TemporarilyNotAvailable"] = "TemporarilyNotAvailable";
    RemoteAuthorityResolverErrorCode["NoResolverFound"] = "NoResolverFound";
    RemoteAuthorityResolverErrorCode["InvalidAuthority"] = "InvalidAuthority";
})(RemoteAuthorityResolverErrorCode || (RemoteAuthorityResolverErrorCode = {}));
export class RemoteAuthorityResolverError extends ErrorNoTelemetry {
    static isNotAvailable(err) {
        return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.NotAvailable;
    }
    static isTemporarilyNotAvailable(err) {
        return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable;
    }
    static isNoResolverFound(err) {
        return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.NoResolverFound;
    }
    static isInvalidAuthority(err) {
        return (err instanceof RemoteAuthorityResolverError) && err._code === RemoteAuthorityResolverErrorCode.InvalidAuthority;
    }
    static isHandled(err) {
        return (err instanceof RemoteAuthorityResolverError) && err.isHandled;
    }
    constructor(message, code = RemoteAuthorityResolverErrorCode.Unknown, detail) {
        super(message);
        this._message = message;
        this._code = code;
        this._detail = detail;
        this.isHandled = (code === RemoteAuthorityResolverErrorCode.NotAvailable) && detail === true;
        // workaround when extending builtin objects and when compiling to ES5, see:
        // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
        Object.setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
    }
}
export function getRemoteAuthorityPrefix(remoteAuthority) {
    const plusIndex = remoteAuthority.indexOf('+');
    if (plusIndex === -1) {
        return remoteAuthority;
    }
    return remoteAuthority.substring(0, plusIndex);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxlQUFlLENBQWtDLGdDQUFnQyxDQUFDLENBQUM7QUFFbEksTUFBTSxDQUFOLElBQWtCLG9CQUdqQjtBQUhELFdBQWtCLG9CQUFvQjtJQUNyQyx5RUFBUyxDQUFBO0lBQ1QscUVBQU8sQ0FBQTtBQUNSLENBQUMsRUFIaUIsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUdyQztBQUVELE1BQU0sT0FBTyx1QkFBdUI7SUFHbkMsWUFDaUIsRUFBVTtRQUFWLE9BQUUsR0FBRixFQUFFLENBQVE7UUFIWCxTQUFJLHdDQUFnQztJQUloRCxDQUFDO0lBRUUsUUFBUTtRQUNkLE9BQU8sV0FBVyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUM7SUFDOUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHlCQUF5QjtJQUdyQyxZQUNpQixJQUFZLEVBQ1osSUFBWTtRQURaLFNBQUksR0FBSixJQUFJLENBQVE7UUFDWixTQUFJLEdBQUosSUFBSSxDQUFRO1FBSmIsU0FBSSwwQ0FBa0M7SUFLbEQsQ0FBQztJQUVFLFFBQVE7UUFDZCxPQUFPLGFBQWEsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUM7SUFDL0MsQ0FBQztDQUNEO0FBa0RELE1BQU0sQ0FBTixJQUFZLGdDQU1YO0FBTkQsV0FBWSxnQ0FBZ0M7SUFDM0MsdURBQW1CLENBQUE7SUFDbkIsaUVBQTZCLENBQUE7SUFDN0IsdUZBQW1ELENBQUE7SUFDbkQsdUVBQW1DLENBQUE7SUFDbkMseUVBQXFDLENBQUE7QUFDdEMsQ0FBQyxFQU5XLGdDQUFnQyxLQUFoQyxnQ0FBZ0MsUUFNM0M7QUFFRCxNQUFNLE9BQU8sNEJBQTZCLFNBQVEsZ0JBQWdCO0lBRTFELE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBUTtRQUNwQyxPQUFPLENBQUMsR0FBRyxZQUFZLDRCQUE0QixDQUFDLElBQUksR0FBRyxDQUFDLEtBQUssS0FBSyxnQ0FBZ0MsQ0FBQyxZQUFZLENBQUM7SUFDckgsQ0FBQztJQUVNLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxHQUFRO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLFlBQVksNEJBQTRCLENBQUMsSUFBSSxHQUFHLENBQUMsS0FBSyxLQUFLLGdDQUFnQyxDQUFDLHVCQUF1QixDQUFDO0lBQ2hJLENBQUM7SUFFTSxNQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBUTtRQUN2QyxPQUFPLENBQUMsR0FBRyxZQUFZLDRCQUE0QixDQUFDLElBQUksR0FBRyxDQUFDLEtBQUssS0FBSyxnQ0FBZ0MsQ0FBQyxlQUFlLENBQUM7SUFDeEgsQ0FBQztJQUVNLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFRO1FBQ3hDLE9BQU8sQ0FBQyxHQUFHLFlBQVksNEJBQTRCLENBQUMsSUFBSSxHQUFHLENBQUMsS0FBSyxLQUFLLGdDQUFnQyxDQUFDLGdCQUFnQixDQUFDO0lBQ3pILENBQUM7SUFFTSxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQVE7UUFDL0IsT0FBTyxDQUFDLEdBQUcsWUFBWSw0QkFBNEIsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUM7SUFDdkUsQ0FBQztJQVFELFlBQVksT0FBZ0IsRUFBRSxPQUF5QyxnQ0FBZ0MsQ0FBQyxPQUFPLEVBQUUsTUFBZ0I7UUFDaEksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWYsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFFdEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLElBQUksS0FBSyxnQ0FBZ0MsQ0FBQyxZQUFZLENBQUMsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDO1FBRTdGLDRFQUE0RTtRQUM1RSwrSUFBK0k7UUFDL0ksTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsNEJBQTRCLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDckUsQ0FBQztDQUNEO0FBMEJELE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxlQUF1QjtJQUMvRCxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9DLElBQUksU0FBUyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDdEIsT0FBTyxlQUFlLENBQUM7SUFDeEIsQ0FBQztJQUNELE9BQU8sZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDaEQsQ0FBQyJ9