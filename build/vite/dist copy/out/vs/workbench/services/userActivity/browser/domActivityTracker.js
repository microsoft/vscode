/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
/**
 * This uses a time interval and checks whether there's any activity in that
 * interval. A naive approach might be to use a debounce whenever an event
 * happens, but this has some scheduling overhead. Instead, the tracker counts
 * how many intervals have elapsed since any activity happened.
 *
 * If there's more than `MIN_INTERVALS_WITHOUT_ACTIVITY`, then say the user is
 * inactive. Therefore the maximum time before an inactive user is detected
 * is `CHECK_INTERVAL * (MIN_INTERVALS_WITHOUT_ACTIVITY + 1)`.
 */
const CHECK_INTERVAL = 30_000;
/** See {@link CHECK_INTERVAL} */
const MIN_INTERVALS_WITHOUT_ACTIVITY = 2;
const eventListenerOptions = {
    passive: true, /** does not preventDefault() */
    capture: true, /** should dispatch first (before anyone stopPropagation()) */
};
export class DomActivityTracker extends Disposable {
    constructor(userActivityService) {
        super();
        let intervalsWithoutActivity = MIN_INTERVALS_WITHOUT_ACTIVITY;
        const intervalTimer = this._register(new dom.WindowIntervalTimer());
        const activeMutex = this._register(new MutableDisposable());
        activeMutex.value = userActivityService.markActive();
        const onInterval = () => {
            if (++intervalsWithoutActivity === MIN_INTERVALS_WITHOUT_ACTIVITY) {
                activeMutex.clear();
                intervalTimer.cancel();
            }
        };
        const onActivity = (targetWindow) => {
            // if was inactive, they've now returned
            if (intervalsWithoutActivity === MIN_INTERVALS_WITHOUT_ACTIVITY) {
                activeMutex.value = userActivityService.markActive();
                intervalTimer.cancelAndSet(onInterval, CHECK_INTERVAL, targetWindow);
            }
            intervalsWithoutActivity = 0;
        };
        this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => {
            disposables.add(dom.addDisposableListener(window.document, 'touchstart', () => onActivity(window), eventListenerOptions));
            disposables.add(dom.addDisposableListener(window.document, 'mousedown', () => onActivity(window), eventListenerOptions));
            disposables.add(dom.addDisposableListener(window.document, 'keydown', () => onActivity(window), eventListenerOptions));
        }, { window: mainWindow, disposables: this._store }));
        onActivity(mainWindow);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tQWN0aXZpdHlUcmFja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJBY3Rpdml0eS9icm93c2VyL2RvbUFjdGl2aXR5VHJhY2tlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR3JGOzs7Ozs7Ozs7R0FTRztBQUNILE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQztBQUU5QixpQ0FBaUM7QUFDakMsTUFBTSw4QkFBOEIsR0FBRyxDQUFDLENBQUM7QUFFekMsTUFBTSxvQkFBb0IsR0FBNEI7SUFDckQsT0FBTyxFQUFFLElBQUksRUFBRSxnQ0FBZ0M7SUFDL0MsT0FBTyxFQUFFLElBQUksRUFBRSw4REFBOEQ7Q0FDN0UsQ0FBQztBQUVGLE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxVQUFVO0lBQ2pELFlBQVksbUJBQXlDO1FBQ3BELEtBQUssRUFBRSxDQUFDO1FBRVIsSUFBSSx3QkFBd0IsR0FBRyw4QkFBOEIsQ0FBQztRQUM5RCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksR0FBRyxDQUFDLG1CQUFtQixFQUFFLENBQUMsQ0FBQztRQUNwRSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQzVELFdBQVcsQ0FBQyxLQUFLLEdBQUcsbUJBQW1CLENBQUMsVUFBVSxFQUFFLENBQUM7UUFFckQsTUFBTSxVQUFVLEdBQUcsR0FBRyxFQUFFO1lBQ3ZCLElBQUksRUFBRSx3QkFBd0IsS0FBSyw4QkFBOEIsRUFBRSxDQUFDO2dCQUNuRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3BCLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsTUFBTSxVQUFVLEdBQUcsQ0FBQyxZQUF3QyxFQUFFLEVBQUU7WUFDL0Qsd0NBQXdDO1lBQ3hDLElBQUksd0JBQXdCLEtBQUssOEJBQThCLEVBQUUsQ0FBQztnQkFDakUsV0FBVyxDQUFDLEtBQUssR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDckQsYUFBYSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQ3RFLENBQUM7WUFFRCx3QkFBd0IsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUU7WUFDekYsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQztZQUMxSCxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFdBQVcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1lBQ3pILFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDeEgsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV0RCxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEIsQ0FBQztDQUNEIn0=