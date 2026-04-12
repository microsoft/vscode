/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isThenable } from '../../../../base/common/async.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { parseJsonAndRestoreBufferRefs, stringifyJsonWithBufferRefs } from '../../../services/extensions/common/rpcProtocol.js';
export function SingleProxyRPCProtocol(thing) {
    return {
        _serviceBrand: undefined,
        remoteAuthority: null,
        getProxy() {
            return thing;
        },
        set(identifier, value) {
            return value;
        },
        dispose: undefined,
        assertRegistered: undefined,
        drain: undefined,
        extensionHostKind: 1 /* ExtensionHostKind.LocalProcess */
    };
}
/** Makes a fake {@link SingleProxyRPCProtocol} on which any method can be called */
export function AnyCallRPCProtocol(useCalls) {
    return SingleProxyRPCProtocol(new Proxy({}, {
        get(_target, prop) {
            if (useCalls && prop in useCalls) {
                // eslint-disable-next-line local/code-no-any-casts
                return useCalls[prop];
            }
            return () => Promise.resolve(undefined);
        }
    }));
}
export class TestRPCProtocol {
    constructor() {
        this.remoteAuthority = null;
        this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
        this._callCountValue = 0;
        this._locals = Object.create(null);
        this._proxies = Object.create(null);
    }
    drain() {
        return Promise.resolve();
    }
    get _callCount() {
        return this._callCountValue;
    }
    set _callCount(value) {
        this._callCountValue = value;
        if (this._callCountValue === 0) {
            this._completeIdle?.();
            this._idle = undefined;
        }
    }
    sync() {
        return new Promise((c) => {
            setTimeout(c, 0);
        }).then(() => {
            if (this._callCount === 0) {
                return undefined;
            }
            if (!this._idle) {
                this._idle = new Promise((c, e) => {
                    this._completeIdle = c;
                });
            }
            return this._idle;
        });
    }
    getProxy(identifier) {
        if (!this._proxies[identifier.sid]) {
            this._proxies[identifier.sid] = this._createProxy(identifier.sid);
        }
        return this._proxies[identifier.sid];
    }
    _createProxy(proxyId) {
        const handler = {
            get: (target, name) => {
                if (typeof name === 'string' && !target[name] && name.charCodeAt(0) === 36 /* CharCode.DollarSign */) {
                    target[name] = (...myArgs) => {
                        return this._remoteCall(proxyId, name, myArgs);
                    };
                }
                return target[name];
            }
        };
        return new Proxy(Object.create(null), handler);
    }
    set(identifier, value) {
        this._locals[identifier.sid] = value;
        return value;
    }
    _remoteCall(proxyId, path, args) {
        this._callCount++;
        return new Promise((c) => {
            setTimeout(c, 0);
        }).then(() => {
            const instance = this._locals[proxyId];
            // pretend the args went over the wire... (invoke .toJSON on objects...)
            const wireArgs = simulateWireTransfer(args);
            let p;
            try {
                const result = instance[path].apply(instance, wireArgs);
                p = isThenable(result) ? result : Promise.resolve(result);
            }
            catch (err) {
                p = Promise.reject(err);
            }
            return p.then(result => {
                this._callCount--;
                // pretend the result went over the wire... (invoke .toJSON on objects...)
                const wireResult = simulateWireTransfer(result);
                return wireResult;
            }, err => {
                this._callCount--;
                return Promise.reject(err);
            });
        });
    }
    dispose() { }
    assertRegistered(identifiers) {
        throw new Error('Not implemented!');
    }
}
function simulateWireTransfer(obj) {
    if (!obj) {
        return obj;
    }
    if (Array.isArray(obj)) {
        // eslint-disable-next-line local/code-no-any-casts
        return obj.map(simulateWireTransfer);
    }
    if (obj instanceof SerializableObjectWithBuffers) {
        const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(obj);
        return parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null);
    }
    else {
        return JSON.parse(JSON.stringify(obj));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJQQ1Byb3RvY29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBSzlELE9BQU8sRUFBNEIsNkJBQTZCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNqSSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVoSSxNQUFNLFVBQVUsc0JBQXNCLENBQUMsS0FBVTtJQUNoRCxPQUFPO1FBQ04sYUFBYSxFQUFFLFNBQVM7UUFDeEIsZUFBZSxFQUFFLElBQUs7UUFDdEIsUUFBUTtZQUNQLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELEdBQUcsQ0FBaUIsVUFBOEIsRUFBRSxLQUFRO1lBQzNELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sRUFBRSxTQUFVO1FBQ25CLGdCQUFnQixFQUFFLFNBQVU7UUFDNUIsS0FBSyxFQUFFLFNBQVU7UUFDakIsaUJBQWlCLHdDQUFnQztLQUNqRCxDQUFDO0FBQ0gsQ0FBQztBQUVELG9GQUFvRjtBQUNwRixNQUFNLFVBQVUsa0JBQWtCLENBQUksUUFBbUM7SUFDeEUsT0FBTyxzQkFBc0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLEVBQUU7UUFDM0MsR0FBRyxDQUFDLE9BQU8sRUFBRSxJQUFZO1lBQ3hCLElBQUksUUFBUSxJQUFJLElBQUksSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDbEMsbURBQW1EO2dCQUNuRCxPQUFRLFFBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEMsQ0FBQztZQUNELE9BQU8sR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxDQUFDO0tBQ0QsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsTUFBTSxPQUFPLGVBQWU7SUFhM0I7UUFWTyxvQkFBZSxHQUFHLElBQUssQ0FBQztRQUN4QixzQkFBaUIsMENBQWtDO1FBRWxELG9CQUFlLEdBQVcsQ0FBQyxDQUFDO1FBUW5DLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRUQsSUFBWSxVQUFVO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztJQUM3QixDQUFDO0lBRUQsSUFBWSxVQUFVLENBQUMsS0FBYTtRQUNuQyxJQUFJLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQztRQUM3QixJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUM7UUFDeEIsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJO1FBQ0gsT0FBTyxJQUFJLE9BQU8sQ0FBTSxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQzdCLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNaLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDM0IsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUNELElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2pCLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxPQUFPLENBQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQ3RDLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDO2dCQUN4QixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU0sUUFBUSxDQUFJLFVBQThCO1FBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25FLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFTyxZQUFZLENBQUksT0FBZTtRQUN0QyxNQUFNLE9BQU8sR0FBRztZQUNmLEdBQUcsRUFBRSxDQUFDLE1BQVcsRUFBRSxJQUFpQixFQUFFLEVBQUU7Z0JBQ3ZDLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLGlDQUF3QixFQUFFLENBQUM7b0JBQzdGLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBYSxFQUFFLEVBQUU7d0JBQ25DLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUNoRCxDQUFDLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQixDQUFDO1NBQ0QsQ0FBQztRQUNGLE9BQU8sSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU0sR0FBRyxDQUFpQixVQUE4QixFQUFFLEtBQVE7UUFDbEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3JDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVTLFdBQVcsQ0FBQyxPQUFlLEVBQUUsSUFBWSxFQUFFLElBQVc7UUFDL0QsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRWxCLE9BQU8sSUFBSSxPQUFPLENBQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUM3QixVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDWixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZDLHdFQUF3RTtZQUN4RSxNQUFNLFFBQVEsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQWUsQ0FBQztZQUNwQixJQUFJLENBQUM7Z0JBQ0osTUFBTSxNQUFNLEdBQWMsUUFBUSxDQUFDLElBQUksQ0FBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3BFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzRCxDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN6QixDQUFDO1lBRUQsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUN0QixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2xCLDBFQUEwRTtnQkFDMUUsTUFBTSxVQUFVLEdBQUcsb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2hELE9BQU8sVUFBVSxDQUFDO1lBQ25CLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtnQkFDUixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2xCLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM1QixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVNLE9BQU8sS0FBSyxDQUFDO0lBRWIsZ0JBQWdCLENBQUMsV0FBbUM7UUFDMUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRDtBQUVELFNBQVMsb0JBQW9CLENBQUksR0FBTTtJQUN0QyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDVixPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN4QixtREFBbUQ7UUFDbkQsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFRLENBQUM7SUFDN0MsQ0FBQztJQUVELElBQUksR0FBRyxZQUFZLDZCQUE2QixFQUFFLENBQUM7UUFDbEQsTUFBTSxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNFLE9BQU8sNkJBQTZCLENBQUMsVUFBVSxFQUFFLGlCQUFpQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzNFLENBQUM7U0FBTSxDQUFDO1FBQ1AsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDO0FBQ0YsQ0FBQyJ9