/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { WebWorkerServer } from './webWorker.js';
let initialized = false;
export function initialize(factory) {
    if (initialized) {
        throw new Error('WebWorker already initialized!');
    }
    initialized = true;
    const webWorkerServer = new WebWorkerServer(msg => globalThis.postMessage(msg), (workerServer) => factory(workerServer));
    globalThis.onmessage = (e) => {
        webWorkerServer.onmessage(e.data);
    };
    return webWorkerServer;
}
export function bootstrapWebWorker(factory) {
    globalThis.onmessage = (_e) => {
        // Ignore first message in this case and initialize if not yet initialized
        if (!initialized) {
            initialize(factory);
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViV29ya2VyQm9vdHN0cmFwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vd29ya2VyL3dlYldvcmtlckJvb3RzdHJhcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQXlFLGVBQWUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBV3hILElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztBQUV4QixNQUFNLFVBQVUsVUFBVSxDQUEyQyxPQUFpRDtJQUNySCxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsV0FBVyxHQUFHLElBQUksQ0FBQztJQUVuQixNQUFNLGVBQWUsR0FBRyxJQUFJLGVBQWUsQ0FDMUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUNsQyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUN2QyxDQUFDO0lBRUYsVUFBVSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQWUsRUFBRSxFQUFFO1FBQzFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQztJQUVGLE9BQU8sZUFBZSxDQUFDO0FBQ3hCLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsT0FBbUQ7SUFDckYsVUFBVSxDQUFDLFNBQVMsR0FBRyxDQUFDLEVBQWdCLEVBQUUsRUFBRTtRQUMzQywwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xCLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyQixDQUFDO0lBQ0YsQ0FBQyxDQUFDO0FBQ0gsQ0FBQyJ9