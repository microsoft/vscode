/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getMonacoEnvironment } from '../../../../base/browser/browser.js';
import { WebWorkerService } from '../../../../platform/webWorker/browser/webWorkerServiceImpl.js';
export class StandaloneWebWorkerService extends WebWorkerService {
    _createWorker(descriptor) {
        const monacoEnvironment = getMonacoEnvironment();
        if (monacoEnvironment) {
            if (typeof monacoEnvironment.getWorker === 'function') {
                const worker = monacoEnvironment.getWorker('workerMain.js', descriptor.label);
                if (worker !== undefined) {
                    return Promise.resolve(worker);
                }
            }
        }
        return super._createWorker(descriptor);
    }
    _getWorkerLoadingFailedErrorMessage(descriptor) {
        const examplePath = '\'...?esm\''; // Broken up to avoid detection by bundler plugin
        return `Failed to load worker script for label: ${descriptor.label}.
Ensure your bundler properly bundles modules referenced by "new URL(${examplePath}, import.meta.url)".`;
    }
    getWorkerUrl(descriptor) {
        const monacoEnvironment = getMonacoEnvironment();
        if (monacoEnvironment) {
            if (typeof monacoEnvironment.getWorkerUrl === 'function') {
                const workerUrl = monacoEnvironment.getWorkerUrl('workerMain.js', descriptor.label);
                if (workerUrl !== undefined) {
                    const absoluteUrl = new URL(workerUrl, document.baseURI).toString();
                    return absoluteUrl;
                }
            }
        }
        if (!descriptor.esmModuleLocationBundler) {
            throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker for the worker label: ${descriptor.label}`);
        }
        const url = typeof descriptor.esmModuleLocationBundler === 'function' ? descriptor.esmModuleLocationBundler() : descriptor.esmModuleLocationBundler;
        const urlStr = url.toString();
        return urlStr;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZVdlYldvcmtlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3Ivc3RhbmRhbG9uZS9icm93c2VyL3NlcnZpY2VzL3N0YW5kYWxvbmVXZWJXb3JrZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBRWxHLE1BQU0sT0FBTywwQkFBMkIsU0FBUSxnQkFBZ0I7SUFDNUMsYUFBYSxDQUFDLFVBQStCO1FBQy9ELE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLEVBQUUsQ0FBQztRQUNqRCxJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFDdkIsSUFBSSxPQUFPLGlCQUFpQixDQUFDLFNBQVMsS0FBSyxVQUFVLEVBQUUsQ0FBQztnQkFDdkQsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzlFLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUMxQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2hDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRWtCLG1DQUFtQyxDQUFDLFVBQStCO1FBQ3JGLE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxDQUFDLGlEQUFpRDtRQUNwRixPQUFPLDJDQUEyQyxVQUFVLENBQUMsS0FBSztzRUFDRSxXQUFXLHNCQUFzQixDQUFDO0lBQ3ZHLENBQUM7SUFFUSxZQUFZLENBQUMsVUFBK0I7UUFDcEQsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsRUFBRSxDQUFDO1FBQ2pELElBQUksaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixJQUFJLE9BQU8saUJBQWlCLENBQUMsWUFBWSxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUMxRCxNQUFNLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEYsSUFBSSxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQzdCLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ3BFLE9BQU8sV0FBVyxDQUFDO2dCQUNwQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDMUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxrSEFBa0gsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDdkosQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLE9BQU8sVUFBVSxDQUFDLHdCQUF3QixLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQztRQUNwSixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDOUIsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0QifQ==