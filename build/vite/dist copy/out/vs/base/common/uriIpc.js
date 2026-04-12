/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from './buffer.js';
import { URI } from './uri.js';
function toJSON(uri) {
    return uri.toJSON();
}
export class URITransformer {
    constructor(uriTransformer) {
        this._uriTransformer = uriTransformer;
    }
    transformIncoming(uri) {
        const result = this._uriTransformer.transformIncoming(uri);
        return (result === uri ? uri : toJSON(URI.from(result)));
    }
    transformOutgoing(uri) {
        const result = this._uriTransformer.transformOutgoing(uri);
        return (result === uri ? uri : toJSON(URI.from(result)));
    }
    transformOutgoingURI(uri) {
        const result = this._uriTransformer.transformOutgoing(uri);
        return (result === uri ? uri : URI.from(result));
    }
    transformOutgoingScheme(scheme) {
        return this._uriTransformer.transformOutgoingScheme(scheme);
    }
}
export const DefaultURITransformer = new class {
    transformIncoming(uri) {
        return uri;
    }
    transformOutgoing(uri) {
        return uri;
    }
    transformOutgoingURI(uri) {
        return uri;
    }
    transformOutgoingScheme(scheme) {
        return scheme;
    }
};
function _transformOutgoingURIs(obj, transformer, depth) {
    if (!obj || depth > 200) {
        return null;
    }
    if (typeof obj === 'object') {
        if (obj instanceof URI) {
            return transformer.transformOutgoing(obj);
        }
        // walk object (or array)
        for (const key in obj) {
            if (Object.hasOwnProperty.call(obj, key)) {
                const r = _transformOutgoingURIs(obj[key], transformer, depth + 1);
                if (r !== null) {
                    obj[key] = r;
                }
            }
        }
    }
    return null;
}
export function transformOutgoingURIs(obj, transformer) {
    const result = _transformOutgoingURIs(obj, transformer, 0);
    if (result === null) {
        // no change
        return obj;
    }
    return result;
}
function _transformIncomingURIs(obj, transformer, revive, depth) {
    if (!obj || depth > 200) {
        return null;
    }
    if (typeof obj === 'object') {
        if (obj.$mid === 1 /* MarshalledId.Uri */) {
            return revive ? URI.revive(transformer.transformIncoming(obj)) : transformer.transformIncoming(obj);
        }
        if (obj instanceof VSBuffer) {
            return null;
        }
        // walk object (or array)
        for (const key in obj) {
            if (Object.hasOwnProperty.call(obj, key)) {
                const r = _transformIncomingURIs(obj[key], transformer, revive, depth + 1);
                if (r !== null) {
                    obj[key] = r;
                }
            }
        }
    }
    return null;
}
export function transformIncomingURIs(obj, transformer) {
    const result = _transformIncomingURIs(obj, transformer, false, 0);
    if (result === null) {
        // no change
        return obj;
    }
    return result;
}
export function transformAndReviveIncomingURIs(obj, transformer) {
    const result = _transformIncomingURIs(obj, transformer, true, 0);
    if (result === null) {
        // no change
        return obj;
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vdXJpSXBjLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFHdkMsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxVQUFVLENBQUM7QUF1QjlDLFNBQVMsTUFBTSxDQUFDLEdBQVE7SUFDdkIsT0FBTyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDckIsQ0FBQztBQUVELE1BQU0sT0FBTyxjQUFjO0lBSTFCLFlBQVksY0FBa0M7UUFDN0MsSUFBSSxDQUFDLGVBQWUsR0FBRyxjQUFjLENBQUM7SUFDdkMsQ0FBQztJQUVNLGlCQUFpQixDQUFDLEdBQWtCO1FBQzFDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDM0QsT0FBTyxDQUFDLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFTSxpQkFBaUIsQ0FBQyxHQUFrQjtRQUMxQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNELE9BQU8sQ0FBQyxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRU0sb0JBQW9CLENBQUMsR0FBUTtRQUNuQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENB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