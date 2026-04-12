/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { setDisposableTracker } from '../../common/lifecycle.js';
class DisposableTracker {
    constructor() {
        this.allDisposables = [];
    }
    trackDisposable(x) {
        this.allDisposables.push([x, new Error().stack]);
    }
    setParent(child, parent) {
        for (let idx = 0; idx < this.allDisposables.length; idx++) {
            if (this.allDisposables[idx][0] === child) {
                this.allDisposables.splice(idx, 1);
                return;
            }
        }
    }
    markAsDisposed(x) {
        for (let idx = 0; idx < this.allDisposables.length; idx++) {
            if (this.allDisposables[idx][0] === x) {
                this.allDisposables.splice(idx, 1);
                return;
            }
        }
    }
    markAsSingleton(disposable) {
        // noop
    }
}
let currentTracker = null;
export function beginTrackingDisposables() {
    currentTracker = new DisposableTracker();
    setDisposableTracker(currentTracker);
}
export function endTrackingDisposables() {
    if (currentTracker) {
        setDisposableTracker(null);
        console.log(currentTracker.allDisposables.map(e => `${e[0]}\n${e[1]}`).join('\n\n'));
        currentTracker = null;
    }
}
export function beginLoggingFS(withStacks = false) {
    // eslint-disable-next-line local/code-no-any-casts
    self.beginLoggingFS?.(withStacks);
}
export function endLoggingFS() {
    // eslint-disable-next-line local/code-no-any-casts
    self.endLoggingFS?.();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJvdWJsZXNob290aW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi90cm91Ymxlc2hvb3RpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFtQyxvQkFBb0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRWxHLE1BQU0saUJBQWlCO0lBQXZCO1FBQ0MsbUJBQWMsR0FBNEIsRUFBRSxDQUFDO0lBdUI5QyxDQUFDO0lBdEJBLGVBQWUsQ0FBQyxDQUFjO1FBQzdCLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxFQUFFLENBQUMsS0FBTSxDQUFDLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBQ0QsU0FBUyxDQUFDLEtBQWtCLEVBQUUsTUFBbUI7UUFDaEQsS0FBSyxJQUFJLEdBQUcsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDM0QsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUMzQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ25DLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFDRCxjQUFjLENBQUMsQ0FBYztRQUM1QixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQztZQUMzRCxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbkMsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUNELGVBQWUsQ0FBQyxVQUF1QjtRQUN0QyxPQUFPO0lBQ1IsQ0FBQztDQUNEO0FBRUQsSUFBSSxjQUFjLEdBQTZCLElBQUksQ0FBQztBQUVwRCxNQUFNLFVBQVUsd0JBQXdCO0lBQ3ZDLGNBQWMsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7SUFDekMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVELE1BQU0sVUFBVSxzQkFBc0I7SUFDckMsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNwQixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNyRixjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQ3ZCLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxVQUFVLGNBQWMsQ0FBQyxhQUFzQixLQUFLO0lBQ3pELG1EQUFtRDtJQUM3QyxJQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVELE1BQU0sVUFBVSxZQUFZO0lBQzNCLG1EQUFtRDtJQUM3QyxJQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztBQUM5QixDQUFDIn0=