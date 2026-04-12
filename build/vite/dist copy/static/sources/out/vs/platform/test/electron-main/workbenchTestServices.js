/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Promises } from '../../../base/common/async.js';
import { Event, Emitter } from '../../../base/common/event.js';
export class TestLifecycleMainService {
    constructor() {
        this.onBeforeShutdown = Event.None;
        this._onWillShutdown = new Emitter();
        this.onWillShutdown = this._onWillShutdown.event;
        this.onWillLoadWindow = Event.None;
        this.onBeforeCloseWindow = Event.None;
        this.wasRestarted = false;
        this.quitRequested = false;
        this.phase = 2 /* LifecycleMainPhase.Ready */;
    }
    async fireOnWillShutdown() {
        const joiners = [];
        this._onWillShutdown.fire({
            reason: 1 /* ShutdownReason.QUIT */,
            join(id, promise) {
                joiners.push(promise);
            }
        });
        await Promises.settled(joiners);
    }
    registerWindow(window) { }
    registerAuxWindow(auxWindow) { }
    async reload(window, cli) { }
    async unload(window, reason) { return true; }
    setRelaunchHandler(handler) { }
    async relaunch(options) { }
    async quit(willRestart) { return true; }
    async kill(code) { }
    async when(phase) { }
}
export class InMemoryTestStateMainService {
    constructor() {
        this.data = new Map();
    }
    setItem(key, data) {
        this.data.set(key, data);
    }
    setItems(items) {
        for (const { key, data } of items) {
            this.data.set(key, data);
        }
    }
    getItem(key) {
        return this.data.get(key);
    }
    removeItem(key) {
        this.data.delete(key);
    }
    async close() { }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVzdC9lbGVjdHJvbi1tYWluL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQU8vRCxNQUFNLE9BQU8sd0JBQXdCO0lBQXJDO1FBSUMscUJBQWdCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUViLG9CQUFlLEdBQUcsSUFBSSxPQUFPLEVBQWlCLENBQUM7UUFDdkQsbUJBQWMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQztRQWVyRCxxQkFBZ0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzlCLHdCQUFtQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFFakMsaUJBQVksR0FBRyxLQUFLLENBQUM7UUFDckIsa0JBQWEsR0FBRyxLQUFLLENBQUM7UUFFdEIsVUFBSyxvQ0FBNEI7SUFXbEMsQ0FBQztJQTlCQSxLQUFLLENBQUMsa0JBQWtCO1FBQ3ZCLE1BQU0sT0FBTyxHQUFvQixFQUFFLENBQUM7UUFFcEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUM7WUFDekIsTUFBTSw2QkFBcUI7WUFDM0IsSUFBSSxDQUFDLEVBQUUsRUFBRSxPQUFPO2dCQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdkIsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBVUQsY0FBYyxDQUFDLE1BQW1CLElBQVUsQ0FBQztJQUM3QyxpQkFBaUIsQ0FBQyxTQUEyQixJQUFVLENBQUM7SUFDeEQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFtQixFQUFFLEdBQXNCLElBQW1CLENBQUM7SUFDNUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFtQixFQUFFLE1BQW9CLElBQXNCLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUMxRixrQkFBa0IsQ0FBQyxPQUF5QixJQUFVLENBQUM7SUFDdkQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUErRSxJQUFtQixDQUFDO0lBQ2xILEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBcUIsSUFBc0IsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBYSxJQUFtQixDQUFDO0lBQzVDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBeUIsSUFBbUIsQ0FBQztDQUN4RDtBQUVELE1BQU0sT0FBTyw0QkFBNEI7SUFBekM7UUFJa0IsU0FBSSxHQUFHLElBQUksR0FBRyxFQUFpRSxDQUFDO0lBcUJsRyxDQUFDO0lBbkJBLE9BQU8sQ0FBQyxHQUFXLEVBQUUsSUFBNEQ7UUFDaEYsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFFRCxRQUFRLENBQUMsS0FBK0Y7UUFDdkcsS0FBSyxNQUFNLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sQ0FBSSxHQUFXO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFrQixDQUFDO0lBQzVDLENBQUM7SUFFRCxVQUFVLENBQUMsR0FBVztRQUNyQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN2QixDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUssS0FBb0IsQ0FBQztDQUNoQyJ9