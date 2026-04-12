/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import * as DomUtils from './dom.js';
import { mainWindow } from './window.js';
import { memoize } from '../common/decorators.js';
import { Event as EventUtils } from '../common/event.js';
import { Disposable, markAsSingleton, toDisposable } from '../common/lifecycle.js';
import { LinkedList } from '../common/linkedList.js';
export var EventType;
(function (EventType) {
    EventType.Tap = '-monaco-gesturetap';
    EventType.Change = '-monaco-gesturechange';
    EventType.Start = '-monaco-gesturestart';
    EventType.End = '-monaco-gesturesend';
    EventType.Contextmenu = '-monaco-gesturecontextmenu';
})(EventType || (EventType = {}));
export class Gesture extends Disposable {
    static { this.SCROLL_FRICTION = -0.005; }
    static { this.HOLD_DELAY = 700; }
    static { this.CLEAR_TAP_COUNT_TIME = 400; } // ms
    constructor() {
        super();
        this.dispatched = false;
        this.targets = new LinkedList();
        this.ignoreTargets = new LinkedList();
        this.activeTouches = {};
        this.handle = null;
        this._lastSetTapCountTime = 0;
        this._register(EventUtils.runAndSubscribe(DomUtils.onDidRegisterWindow, ({ window, disposables }) => {
            disposables.add(DomUtils.addDisposableListener(window.document, 'touchstart', (e) => this.onTouchStart(e), { passive: false }));
            disposables.add(DomUtils.addDisposableListener(window.document, 'touchend', (e) => this.onTouchEnd(window, e)));
            disposables.add(DomUtils.addDisposableListener(window.document, 'touchmove', (e) => this.onTouchMove(e), { passive: false }));
        }, { window: mainWindow, disposables: this._store }));
    }
    static addTarget(element) {
        if (!Gesture.isTouchDevice()) {
            return Disposable.None;
        }
        if (!Gesture.INSTANCE) {
            Gesture.INSTANCE = markAsSingleton(new Gesture());
        }
        const remove = Gesture.INSTANCE.targets.push(element);
        return toDisposable(remove);
    }
    static ignoreTarget(element) {
        if (!Gesture.isTouchDevice()) {
            return Disposable.None;
        }
        if (!Gesture.INSTANCE) {
            Gesture.INSTANCE = markAsSingleton(new Gesture());
        }
        const remove = Gesture.INSTANCE.ignoreTargets.push(element);
        return toDisposable(remove);
    }
    /**
     * Whether the device is able to represent touch events.
     */
    static isTouchDevice() {
        // `'ontouchstart' in window` always evaluates to true with typescript's modern typings. This causes `window` to be
        // `never` later in `window.navigator`. That's why we need the explicit `window as Window` cast
        return 'ontouchstart' in mainWindow || navigator.maxTouchPoints > 0;
    }
    /**
     * Whether the device's primary input is able to hover.
     */
    static isHoverDevice() {
        return mainWindow.matchMedia('(hover: hover)').matches;
    }
    dispose() {
        if (this.handle) {
            this.handle.dispose();
            this.handle = null;
        }
        super.dispose();
    }
    onTouchStart(e) {
        const timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
        if (this.handle) {
            this.handle.dispose();
            this.handle = null;
        }
        for (let i = 0, len = e.targetTouches.length; i < len; i++) {
            const touch = e.targetTouches.item(i);
            this.activeTouches[touch.identifier] = {
                id: touch.identifier,
                initialTarget: touch.target,
                initialTimeStamp: timestamp,
                initialPageX: touch.pageX,
                initialPageY: touch.pageY,
                rollingTimestamps: [timestamp],
                rollingPageX: [touch.pageX],
                rollingPageY: [touch.pageY]
            };
            const evt = this.newGestureEvent(EventType.Start, touch.target);
            evt.pageX = touch.pageX;
            evt.pageY = touch.pageY;
            this.dispatchEvent(evt);
        }
        if (this.dispatched) {
            e.preventDefault();
            e.stopPropagation();
            this.dispatched = false;
        }
    }
    onTouchEnd(targetWindow, e) {
        const timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
        const activeTouchCount = Object.keys(this.activeTouches).length;
        for (let i = 0, len = e.changedTouches.length; i < len; i++) {
            const touch = e.changedTouches.item(i);
            if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
                console.warn('move of an UNKNOWN touch', touch);
                continue;
            }
            const data = this.activeTouches[touch.identifier], holdTime = Date.now() - data.initialTimeStamp;
            if (holdTime < Gesture.HOLD_DELAY
                && Math.abs(data.initialPageX - data.rollingPageX.at(-1)) < 30
                && Math.abs(data.initialPageY - data.rollingPageY.at(-1)) < 30) {
                const evt = this.newGestureEvent(EventType.Tap, data.initialTarget);
                evt.pageX = data.rollingPageX.at(-1);
                evt.pageY = data.rollingPageY.at(-1);
                this.dispatchEvent(evt);
            }
            else if (holdTime >= Gesture.HOLD_DELAY
                && Math.abs(data.initialPageX - data.rollingPageX.at(-1)) < 30
                && Math.abs(data.initialPageY - data.rollingPageY.at(-1)) < 30) {
                const evt = this.newGestureEvent(EventType.Contextmenu, data.initialTarget);
                evt.pageX = data.rollingPageX.at(-1);
                evt.pageY = data.rollingPageY.at(-1);
                this.dispatchEvent(evt);
            }
            else if (activeTouchCount === 1) {
                const finalX = data.rollingPageX.at(-1);
                const finalY = data.rollingPageY.at(-1);
                const deltaT = data.rollingTimestamps.at(-1) - data.rollingTimestamps[0];
                const deltaX = finalX - data.rollingPageX[0];
                const deltaY = finalY - data.rollingPageY[0];
                // We need to get all the dispatch targets on the start of the inertia event
                const dispatchTo = [...this.targets].filter(t => data.initialTarget instanceof Node && t.contains(data.initialTarget));
                this.inertia(targetWindow, dispatchTo, timestamp, // time now
                Math.abs(deltaX) / deltaT, // speed
                deltaX > 0 ? 1 : -1, // x direction
                finalX, // x now
                Math.abs(deltaY) / deltaT, // y speed
                deltaY > 0 ? 1 : -1, // y direction
                finalY // y now
                );
            }
            this.dispatchEvent(this.newGestureEvent(EventType.End, data.initialTarget));
            // forget about this touch
            delete this.activeTouches[touch.identifier];
        }
        if (this.dispatched) {
            e.preventDefault();
            e.stopPropagation();
            this.dispatched = false;
        }
    }
    newGestureEvent(type, initialTarget) {
        const event = document.createEvent('CustomEvent');
        event.initEvent(type, false, true);
        event.initialTarget = initialTarget;
        event.tapCount = 0;
        return event;
    }
    dispatchEvent(event) {
        if (event.type === EventType.Tap) {
            const currentTime = (new Date()).getTime();
            let setTapCount = 0;
            if (currentTime - this._lastSetTapCountTime > Gesture.CLEAR_TAP_COUNT_TIME) {
                setTapCount = 1;
            }
            else {
                setTapCount = 2;
            }
            this._lastSetTapCountTime = currentTime;
            event.tapCount = setTapCount;
        }
        else if (event.type === EventType.Change || event.type === EventType.Contextmenu) {
            // tap is canceled by scrolling or context menu
            this._lastSetTapCountTime = 0;
        }
        if (event.initialTarget instanceof Node) {
            for (const ignoreTarget of this.ignoreTargets) {
                if (ignoreTarget.contains(event.initialTarget)) {
                    return;
                }
            }
            const targets = [];
            for (const target of this.targets) {
                if (target.contains(event.initialTarget)) {
                    let depth = 0;
                    let now = event.initialTarget;
                    while (now && now !== target) {
                        depth++;
                        now = now.parentElement;
                    }
                    targets.push([depth, target]);
                }
            }
            targets.sort((a, b) => a[0] - b[0]);
            for (const [_, target] of targets) {
                target.dispatchEvent(event);
                this.dispatched = true;
            }
        }
    }
    inertia(targetWindow, dispatchTo, t1, vX, dirX, x, vY, dirY, y) {
        this.handle = DomUtils.scheduleAtNextAnimationFrame(targetWindow, () => {
            const now = Date.now();
            // velocity: old speed + accel_over_time
            const deltaT = now - t1;
            let delta_pos_x = 0, delta_pos_y = 0;
            let stopped = true;
            vX += Gesture.SCROLL_FRICTION * deltaT;
            vY += Gesture.SCROLL_FRICTION * deltaT;
            if (vX > 0) {
                stopped = false;
                delta_pos_x = dirX * vX * deltaT;
            }
            if (vY > 0) {
                stopped = false;
                delta_pos_y = dirY * vY * deltaT;
            }
            // dispatch translation event
            const evt = this.newGestureEvent(EventType.Change);
            evt.translationX = delta_pos_x;
            evt.translationY = delta_pos_y;
            dispatchTo.forEach(d => d.dispatchEvent(evt));
            if (!stopped) {
                this.inertia(targetWindow, dispatchTo, now, vX, dirX, x + delta_pos_x, vY, dirY, y + delta_pos_y);
            }
        });
    }
    onTouchMove(e) {
        const timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
        for (let i = 0, len = e.changedTouches.length; i < len; i++) {
            const touch = e.changedTouches.item(i);
            if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
                console.warn('end of an UNKNOWN touch', touch);
                continue;
            }
            const data = this.activeTouches[touch.identifier];
            const evt = this.newGestureEvent(EventType.Change, data.initialTarget);
            evt.translationX = touch.pageX - data.rollingPageX.at(-1);
            evt.translationY = touch.pageY - data.rollingPageY.at(-1);
            evt.pageX = touch.pageX;
            evt.pageY = touch.pageY;
            this.dispatchEvent(evt);
            // only keep a few data points, to average the final speed
            if (data.rollingPageX.length > 3) {
                data.rollingPageX.shift();
                data.rollingPageY.shift();
                data.rollingTimestamps.shift();
            }
            data.rollingPageX.push(touch.pageX);
            data.rollingPageY.push(touch.pageY);
            data.rollingTimestamps.push(timestamp);
        }
        if (this.dispatched) {
            e.preventDefault();
            e.stopPropagation();
            this.dispatched = false;
        }
    }
}
__decorate([
    memoize
], Gesture, "isTouchDevice", null);
__decorate([
    memoize
], Gesture, "isHoverDevice", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG91Y2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdG91Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLFFBQVEsTUFBTSxVQUFVLENBQUM7QUFDckMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDbEQsT0FBTyxFQUFFLEtBQUssSUFBSSxVQUFVLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFlLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFckQsTUFBTSxLQUFXLFNBQVMsQ0FNekI7QUFORCxXQUFpQixTQUFTO0lBQ1osYUFBRyxHQUFHLG9CQUFvQixDQUFDO0lBQzNCLGdCQUFNLEdBQUcsdUJBQXVCLENBQUM7SUFDakMsZUFBSyxHQUFHLHNCQUFzQixDQUFDO0lBQy9CLGFBQUcsR0FBRyxxQkFBcUIsQ0FBQztJQUM1QixxQkFBVyxHQUFHLDRCQUE0QixDQUFDO0FBQ3pELENBQUMsRUFOZ0IsU0FBUyxLQUFULFNBQVMsUUFNekI7QUFrREQsTUFBTSxPQUFPLE9BQVEsU0FBUSxVQUFVO2FBRWQsb0JBQWUsR0FBRyxDQUFDLEtBQUssQUFBVCxDQUFVO2FBRXpCLGVBQVUsR0FBRyxHQUFHLEFBQU4sQ0FBTzthQVdqQix5QkFBb0IsR0FBRyxHQUFHLEFBQU4sQ0FBTyxHQUFDLEtBQUs7SUFHekQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQWJELGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDVixZQUFPLEdBQUcsSUFBSSxVQUFVLEVBQWUsQ0FBQztRQUN4QyxrQkFBYSxHQUFHLElBQUksVUFBVSxFQUFlLENBQUM7UUFhOUQsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDbkIsSUFBSSxDQUFDLG9CQUFvQixHQUFHLENBQUMsQ0FBQztRQUU5QixJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRTtZQUNuRyxXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQWEsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUksV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFhLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1SCxXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQWEsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0ksQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRU0sTUFBTSxDQUFDLFNBQVMsQ0FBQyxPQUFvQjtRQUMzQyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUM7WUFDOUIsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQ3hCLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sQ0FBQyxRQUFRLEdBQUcsZUFBZSxDQUFDLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNuRCxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RELE9BQU8sWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFTSxNQUFNLENBQUMsWUFBWSxDQUFDLE9BQW9CO1FBQzlDLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQztZQUM5QixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDeEIsQ0FBQztRQUNELElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDdkIsT0FBTyxDQUFDLFFBQVEsR0FBRyxlQUFlLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUQsT0FBTyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVEOztPQUVHO0lBRUksQUFBUCxNQUFNLENBQUMsYUFBYTtRQUNuQixtSEFBbUg7UUFDbkgsK0ZBQStGO1FBQy9GLE9BQU8sY0FBYyxJQUFJLFVBQVUsSUFBSSxTQUFTLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRUQ7O09BRUc7SUFFSSxBQUFQLE1BQU0sQ0FBQyxhQUFhO1FBQ25CLE9BQU8sVUFBVSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUN4RCxDQUFDO0lBRWUsT0FBTztRQUN0QixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLENBQUM7UUFFRCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQztJQUVPLFlBQVksQ0FBQyxDQUFhO1FBQ2pDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLCtEQUErRDtRQUU3RixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqQixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLENBQUM7UUFFRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzVELE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXRDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFHO2dCQUN0QyxFQUFFLEVBQUUsS0FBSyxDQUFDLFVBQVU7Z0JBQ3BCLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTTtnQkFDM0IsZ0JBQWdCLEVBQUUsU0FBUztnQkFDM0IsWUFBWSxFQUFFLEtBQUssQ0FBQyxLQUFLO2dCQUN6QixZQUFZLEVBQUUsS0FBSyxDQUFDLEtBQUs7Z0JBQ3pCLGlCQUFpQixFQUFFLENBQUMsU0FBUyxDQUFDO2dCQUM5QixZQUFZLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO2dCQUMzQixZQUFZLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO2FBQzNCLENBQUM7WUFFRixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hFLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztZQUN4QixHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDeEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ25CLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQztJQUVPLFVBQVUsQ0FBQyxZQUFvQixFQUFFLENBQWE7UUFDckQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsK0RBQStEO1FBRTdGLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBRWhFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFFN0QsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNsRSxPQUFPLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNoRCxTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUNoRCxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztZQUUvQyxJQUFJLFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVTttQkFDN0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsR0FBRyxFQUFFO21CQUM1RCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO2dCQUVsRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUNwRSxHQUFHLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7Z0JBQ3RDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztnQkFDdEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUV6QixDQUFDO2lCQUFNLElBQUksUUFBUSxJQUFJLE9BQU8sQ0FBQyxVQUFVO21CQUNyQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxHQUFHLEVBQUU7bUJBQzVELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBRWxFLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQzVFLEdBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztnQkFDdEMsR0FBRyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDO2dCQUN0QyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXpCLENBQUM7aUJBQU0sSUFBSSxnQkFBZ0IsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztnQkFDekMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQztnQkFFekMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBRSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLE1BQU0sTUFBTSxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUU3Qyw0RUFBNEU7Z0JBQzVFLE1BQU0sVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsWUFBWSxJQUFJLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztnQkFDdkgsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxXQUFXO2dCQUM1RCxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLE1BQU0sRUFBTyxRQUFRO2dCQUN4QyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFRLGNBQWM7Z0JBQ3pDLE1BQU0sRUFBWSxRQUFRO2dCQUMxQixJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLE1BQU0sRUFBUSxVQUFVO2dCQUMzQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFRLGNBQWM7Z0JBQ3pDLE1BQU0sQ0FBVyxRQUFRO2lCQUN6QixDQUFDO1lBQ0gsQ0FBQztZQUdELElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQzVFLDBCQUEwQjtZQUMxQixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyQixDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDbkIsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLENBQUM7SUFDRixDQUFDO0lBRU8sZUFBZSxDQUFDLElBQVksRUFBRSxhQUEyQjtRQUNoRSxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBNEIsQ0FBQztRQUM3RSxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkMsS0FBSyxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7UUFDcEMsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRU8sYUFBYSxDQUFDLEtBQW1CO1FBQ3hDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDbEMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDM0MsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1lBQ3BCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxPQUFPLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztnQkFDNUUsV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNqQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsV0FBVyxHQUFHLENBQUMsQ0FBQztZQUNqQixDQUFDO1lBRUQsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFdBQVcsQ0FBQztZQUN4QyxLQUFLLENBQUMsUUFBUSxHQUFHLFdBQVcsQ0FBQztRQUM5QixDQUFDO2FBQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDcEYsK0NBQStDO1lBQy9DLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUVELElBQUksS0FBSyxDQUFDLGFBQWEsWUFBWSxJQUFJLEVBQUUsQ0FBQztZQUN6QyxLQUFLLE1BQU0sWUFBWSxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDL0MsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO29CQUNoRCxPQUFPO2dCQUNSLENBQUM7WUFDRixDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQTRCLEVBQUUsQ0FBQztZQUM1QyxLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO29CQUMxQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7b0JBQ2QsSUFBSSxHQUFHLEdBQWdCLEtBQUssQ0FBQyxhQUFhLENBQUM7b0JBQzNDLE9BQU8sR0FBRyxJQUFJLEdBQUcsS0FBSyxNQUFNLEVBQUUsQ0FBQzt3QkFDOUIsS0FBSyxFQUFFLENBQUM7d0JBQ1IsR0FBRyxHQUFHLEdBQUcsQ0FBQyxhQUFhLENBQUM7b0JBQ3pCLENBQUM7b0JBQ0QsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixDQUFDO1lBQ0YsQ0FBQztZQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEMsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUNuQyxNQUFNLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM1QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxPQUFPLENBQUMsWUFBb0IsRUFBRSxVQUFrQyxFQUFFLEVBQVUsRUFBRSxFQUFVLEVBQUUsSUFBWSxFQUFFLENBQVMsRUFBRSxFQUFVLEVBQUUsSUFBWSxFQUFFLENBQVM7UUFDN0osSUFBSSxDQUFDLE1BQU0sR0FBRyxRQUFRLENBQUMsNEJBQTRCLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtZQUN0RSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFFdkIsd0NBQXdDO1lBQ3hDLE1BQU0sTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDeEIsSUFBSSxXQUFXLEdBQUcsQ0FBQyxFQUFFLFdBQVcsR0FBRyxDQUFDLENBQUM7WUFDckMsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBRW5CLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxHQUFHLE1BQU0sQ0FBQztZQUN2QyxFQUFFLElBQUksT0FBTyxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUM7WUFFdkMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ1osT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDaEIsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQ2xDLENBQUM7WUFFRCxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDWixPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUNoQixXQUFXLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7WUFDbEMsQ0FBQztZQUVELDZCQUE2QjtZQUM3QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNuRCxHQUFHLENBQUMsWUFBWSxHQUFHLFdBQVcsQ0FBQztZQUMvQixHQUFHLENBQUMsWUFBWSxHQUFHLFdBQVcsQ0FBQztZQUMvQixVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTlDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZCxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxHQUFHLFdBQVcsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsQ0FBQztZQUNuRyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sV0FBVyxDQUFDLENBQWE7UUFDaEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsK0RBQStEO1FBRTdGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFFN0QsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNsRSxPQUFPLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMvQyxTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRWxELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDdkUsR0FBRyxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7WUFDM0QsR0FBRyxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7WUFDM0QsR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3hCLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztZQUN4QixJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXhCLDBEQUEwRDtZQUMxRCxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUMxQixJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDaEMsQ0FBQztZQUVELElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNwQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ25CLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQzs7QUE1UE07SUFETixPQUFPO2tDQUtQO0FBTU07SUFETixPQUFPO2tDQUdQIn0=