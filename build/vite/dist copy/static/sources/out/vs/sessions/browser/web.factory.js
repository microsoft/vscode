/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SessionsBrowserMain } from './web.main.js';
import { toDisposable } from '../../base/common/lifecycle.js';
import { mark } from '../../base/common/performance.js';
import { DeferredPromise } from '../../base/common/async.js';
const workbenchPromise = new DeferredPromise();
/**
 * Creates the Sessions workbench with the provided options in the provided container.
 */
export function create(domElement, options) {
    mark('code/didLoadWorkbenchMain');
    let instantiatedWorkbench = undefined;
    new SessionsBrowserMain(domElement, options).open().then(workbench => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLmZhY3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9icm93c2VyL3dlYi5mYWN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNwRCxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUU3RCxNQUFNLGdCQUFnQixHQUFHLElBQUksZUFBZSxFQUFjLENBQUM7QUFFM0Q7O0dBRUc7QUFDSCxNQUFNLFVBQVUsTUFBTSxDQUFDLFVBQXVCLEVBQUUsT0FBc0M7SUFFckYsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7SUFFbEMsSUFBSSxxQkFBcUIsR0FBMkIsU0FBUyxDQUFDO0lBQzlELElBQUksbUJBQW1CLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRTtRQUNwRSxxQkFBcUIsR0FBRyxTQUFTLENBQUM7UUFDbEMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1FBQ3hCLElBQUkscUJBQXFCLEVBQUUsQ0FBQztZQUMzQixxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsQyxDQUFDO2FBQU0sQ0FBQztZQUNQLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUM1QyxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDIn0=