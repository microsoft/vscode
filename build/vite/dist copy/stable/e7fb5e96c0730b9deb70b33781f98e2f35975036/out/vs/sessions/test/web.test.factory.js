/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TestSessionsBrowserMain } from './web.test.js';
import { toDisposable } from '../../base/common/lifecycle.js';
import { mark } from '../../base/common/performance.js';
import { DeferredPromise } from '../../base/common/async.js';
const workbenchPromise = new DeferredPromise();
/**
 * Creates the Sessions workbench with mock services for E2E testing.
 */
export function create(domElement, options) {
    mark('code/didLoadWorkbenchMain');
    let instantiatedWorkbench = undefined;
    new TestSessionsBrowserMain(domElement, options).open().then(workbench => {
        instantiatedWorkbench = workbench;
        workbenchPromise.complete(workbench);
    });
    return toDisposable(() => {
        if (instantiatedWorkbench) {
            instantiatedWorkbench.shutdown();
        }
        else {
            workbenchPromise.p.then(w => w.shutdown());
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLnRlc3QuZmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL3Rlc3Qvd2ViLnRlc3QuZmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDeEQsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFN0QsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGVBQWUsRUFBYyxDQUFDO0FBRTNEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLE1BQU0sQ0FBQyxVQUF1QixFQUFFLE9BQXNDO0lBRXJGLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0lBRWxDLElBQUkscUJBQXFCLEdBQTJCLFNBQVMsQ0FBQztJQUM5RCxJQUFJLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUU7UUFDeEUscUJBQXFCLEdBQUcsU0FBUyxDQUFDO1FBQ2xDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU8sWUFBWSxDQUFDLEdBQUcsRUFBRTtRQUN4QixJQUFJLHFCQUFxQixFQUFFLENBQUM7WUFDM0IscUJBQXFCLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsQ0FBQzthQUFNLENBQUM7WUFDUCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDNUMsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9