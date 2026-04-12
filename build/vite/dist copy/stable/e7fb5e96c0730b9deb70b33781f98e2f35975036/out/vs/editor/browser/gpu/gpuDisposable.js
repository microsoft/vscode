/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isFunction } from '../../../base/common/types.js';
export var GPULifecycle;
(function (GPULifecycle) {
    async function requestDevice(fallback) {
        try {
            if (!navigator.gpu) {
                throw new Error('This browser does not support WebGPU');
            }
            const adapter = (await navigator.gpu.requestAdapter());
            if (!adapter) {
                throw new Error('This browser supports WebGPU but it appears to be disabled');
            }
            return wrapDestroyableInDisposable(await adapter.requestDevice());
        }
        catch (e) {
            if (fallback) {
                fallback(e.message);
            }
            throw e;
        }
    }
    GPULifecycle.requestDevice = requestDevice;
    function createBuffer(device, descriptor, initialValues) {
        const buffer = device.createBuffer(descriptor);
        if (initialValues) {
            device.queue.writeBuffer(buffer, 0, (isFunction(initialValues) ? initialValues() : initialValues));
        }
        return wrapDestroyableInDisposable(buffer);
    }
    GPULifecycle.createBuffer = createBuffer;
    function createTexture(device, descriptor) {
        return wrapDestroyableInDisposable(device.createTexture(descriptor));
    }
    GPULifecycle.createTexture = createTexture;
})(GPULifecycle || (GPULifecycle = {}));
function wrapDestroyableInDisposable(value) {
    return {
        object: value,
        dispose: () => value.destroy()
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3B1RGlzcG9zYWJsZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2dwdS9ncHVEaXNwb3NhYmxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUzRCxNQUFNLEtBQVcsWUFBWSxDQThCNUI7QUE5QkQsV0FBaUIsWUFBWTtJQUNyQixLQUFLLFVBQVUsYUFBYSxDQUFDLFFBQW9DO1FBQ3ZFLElBQUksQ0FBQztZQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUM7Z0JBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBQ0QsTUFBTSxPQUFPLEdBQUcsQ0FBQyxNQUFNLFNBQVMsQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUUsQ0FBQztZQUN4RCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1lBQy9FLENBQUM7WUFDRCxPQUFPLDJCQUEyQixDQUFDLE1BQU0sT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckIsQ0FBQztZQUNELE1BQU0sQ0FBQyxDQUFDO1FBQ1QsQ0FBQztJQUNGLENBQUM7SUFoQnFCLDBCQUFhLGdCQWdCbEMsQ0FBQTtJQUVELFNBQWdCLFlBQVksQ0FBQyxNQUFpQixFQUFFLFVBQStCLEVBQUUsYUFBbUQ7UUFDbkksTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQyxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQThCLENBQUMsQ0FBQztRQUNqSSxDQUFDO1FBQ0QsT0FBTywyQkFBMkIsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBTmUseUJBQVksZUFNM0IsQ0FBQTtJQUVELFNBQWdCLGFBQWEsQ0FBQyxNQUFpQixFQUFFLFVBQWdDO1FBQ2hGLE9BQU8sMkJBQTJCLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFGZSwwQkFBYSxnQkFFNUIsQ0FBQTtBQUNGLENBQUMsRUE5QmdCLFlBQVksS0FBWixZQUFZLFFBOEI1QjtBQUVELFNBQVMsMkJBQTJCLENBQWdDLEtBQVE7SUFDM0UsT0FBTztRQUNOLE1BQU0sRUFBRSxLQUFLO1FBQ2IsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUU7S0FDOUIsQ0FBQztBQUNILENBQUMifQ==