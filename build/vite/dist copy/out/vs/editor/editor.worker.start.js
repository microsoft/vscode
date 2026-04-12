/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { initialize } from '../base/common/worker/webWorkerBootstrap.js';
import { EditorWorker } from './common/services/editorWebWorker.js';
import { EditorWorkerHost } from './common/services/editorWorkerHost.js';
/**
 * Used by `monaco-editor` to hook up web worker rpc.
 * @skipMangle
 * @internal
 */
export function start(createClient) {
    let client;
    const webWorkerServer = initialize((workerServer) => {
        const editorWorkerHost = EditorWorkerHost.getChannel(workerServer);
        const host = new Proxy({}, {
            get(target, prop, receiver) {
                if (prop === 'then') {
                    // Don't forward the call when the proxy is returned in an async function and the runtime tries to .then it.
                    return undefined;
                }
                if (typeof prop !== 'string') {
                    throw new Error(`Not supported`);
                }
                return (...args) => {
                    return editorWorkerHost.$fhr(prop, args);
                };
            }
        });
        const ctx = {
            host: host,
            getMirrorModels: () => {
                return webWorkerServer.requestHandler.getModels();
            }
        };
        client = createClient(ctx);
        return new EditorWorker(client);
    });
    return client;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLndvcmtlci5zdGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9lZGl0b3Iud29ya2VyLnN0YXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsWUFBWSxFQUFrQixNQUFNLHNDQUFzQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXpFOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsS0FBSyxDQUErQyxZQUFxRDtJQUN4SCxJQUFJLE1BQTJCLENBQUM7SUFDaEMsTUFBTSxlQUFlLEdBQUcsVUFBVSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7UUFDbkQsTUFBTSxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFbkUsTUFBTSxJQUFJLEdBQUcsSUFBSSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQzFCLEdBQUcsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVE7Z0JBQ3pCLElBQUksSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO29CQUNyQiw0R0FBNEc7b0JBQzVHLE9BQU8sU0FBUyxDQUFDO2dCQUNsQixDQUFDO2dCQUNELElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ2xDLENBQUM7Z0JBQ0QsT0FBTyxDQUFDLEdBQUcsSUFBZSxFQUFFLEVBQUU7b0JBQzdCLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDMUMsQ0FBQyxDQUFDO1lBQ0gsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sR0FBRyxHQUEwQjtZQUNsQyxJQUFJLEVBQUUsSUFBYTtZQUNuQixlQUFlLEVBQUUsR0FBRyxFQUFFO2dCQUNyQixPQUFPLGVBQWUsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDbkQsQ0FBQztTQUNELENBQUM7UUFFRixNQUFNLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTNCLE9BQU8sSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDakMsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU8sQ0FBQztBQUNoQixDQUFDIn0=