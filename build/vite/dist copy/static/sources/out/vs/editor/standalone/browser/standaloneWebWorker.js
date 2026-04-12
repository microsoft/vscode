/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorWorkerClient } from '../../browser/services/editorWorkerService.js';
/**
 * Create a new web worker that has model syncing capabilities built in.
 * Specify an AMD module to load that will `create` an object that will be proxied.
 */
export function createWebWorker(modelService, webWorkerService, opts) {
    return new MonacoWebWorkerImpl(modelService, webWorkerService, opts);
}
class MonacoWebWorkerImpl extends EditorWorkerClient {
    constructor(modelService, webWorkerService, opts) {
        super(opts.worker, opts.keepIdleModels || false, modelService, webWorkerService);
        this._foreignModuleHost = opts.host || null;
        this._foreignProxy = this._getProxy().then(proxy => {
            return new Proxy({}, {
                get(target, prop, receiver) {
                    if (prop === 'then') {
                        // Don't forward the call when the proxy is returned in an async function and the runtime tries to .then it.
                        return undefined;
                    }
                    if (typeof prop !== 'string') {
                        throw new Error(`Not supported`);
                    }
                    return (...args) => {
                        return proxy.$fmr(prop, args);
                    };
                }
            });
        });
    }
    // foreign host request
    fhr(method, args) {
        if (!this._foreignModuleHost || typeof this._foreignModuleHost[method] !== 'function') {
            return Promise.reject(new Error('Missing method ' + method + ' or missing main thread foreign host.'));
        }
        try {
            return Promise.resolve(this._foreignModuleHost[method].apply(this._foreignModuleHost, args));
        }
        catch (e) {
            return Promise.reject(e);
        }
    }
    getProxy() {
        return this._foreignProxy;
    }
    withSyncedResources(resources) {
        return this.workerWithSyncedResources(resources).then(_ => this.getProxy());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZVdlYldvcmtlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZVdlYldvcmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUduRjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsZUFBZSxDQUFtQixZQUEyQixFQUFFLGdCQUFtQyxFQUFFLElBQStCO0lBQ2xKLE9BQU8sSUFBSSxtQkFBbUIsQ0FBSSxZQUFZLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDekUsQ0FBQztBQXFDRCxNQUFNLG1CQUFzQyxTQUFRLGtCQUFrQjtJQUtyRSxZQUFZLFlBQTJCLEVBQUUsZ0JBQW1DLEVBQUUsSUFBK0I7UUFDNUcsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGNBQWMsSUFBSSxLQUFLLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDO1FBQzVDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNsRCxPQUFPLElBQUksS0FBSyxDQUFDLEVBQUUsRUFBRTtnQkFDcEIsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUTtvQkFDekIsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7d0JBQ3JCLDRHQUE0Rzt3QkFDNUcsT0FBTyxTQUFTLENBQUM7b0JBQ2xCLENBQUM7b0JBQ0QsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQzt3QkFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFDbEMsQ0FBQztvQkFDRCxPQUFPLENBQUMsR0FBRyxJQUFlLEVBQUUsRUFBRTt3QkFDN0IsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDL0IsQ0FBQyxDQUFDO2dCQUNILENBQUM7YUFDRCxDQUFNLENBQUM7UUFDVCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCx1QkFBdUI7SUFDUCxHQUFHLENBQUMsTUFBYyxFQUFFLElBQWU7UUFDbEQsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUN2RixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxHQUFHLHVDQUF1QyxDQUFDLENBQUMsQ0FBQztRQUN4RyxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDOUYsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7SUFFTSxRQUFRO1FBQ2QsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzNCLENBQUM7SUFFTSxtQkFBbUIsQ0FBQyxTQUFnQjtRQUMxQyxPQUFPLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM3RSxDQUFDO0NBQ0QifQ==