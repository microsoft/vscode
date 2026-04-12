/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class ProxyIdentifier {
    static { this.count = 0; }
    constructor(sid) {
        this._proxyIdentifierBrand = undefined;
        this.sid = sid;
        this.nid = (++ProxyIdentifier.count);
    }
}
const identifiers = [];
export function createProxyIdentifier(identifier) {
    const result = new ProxyIdentifier(identifier);
    identifiers[result.nid] = result;
    return result;
}
export function getStringIdentifierForProxy(nid) {
    return identifiers[nid].sid;
}
/**
 * Marks the object as containing buffers that should be serialized more efficiently.
 */
export class SerializableObjectWithBuffers {
    constructor(value) {
        this.value = value;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJveHlJZGVudGlmaWVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQTZCaEcsTUFBTSxPQUFPLGVBQWU7YUFDYixVQUFLLEdBQUcsQ0FBQyxBQUFKLENBQUs7SUFNeEIsWUFBWSxHQUFXO1FBTHZCLDBCQUFxQixHQUFTLFNBQVMsQ0FBQztRQU12QyxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDOztBQUdGLE1BQU0sV0FBVyxHQUErQixFQUFFLENBQUM7QUFFbkQsTUFBTSxVQUFVLHFCQUFxQixDQUFJLFVBQWtCO0lBQzFELE1BQU0sTUFBTSxHQUFHLElBQUksZUFBZSxDQUFJLFVBQVUsQ0FBQyxDQUFDO0lBQ2xELFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDO0lBQ2pDLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQXNCRCxNQUFNLFVBQVUsMkJBQTJCLENBQUMsR0FBVztJQUN0RCxPQUFPLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDN0IsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLDZCQUE2QjtJQUN6QyxZQUNpQixLQUFRO1FBQVIsVUFBSyxHQUFMLEtBQUssQ0FBRztJQUNyQixDQUFDO0NBQ0wifQ==